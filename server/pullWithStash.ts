import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { git } from './git';
import { format, records, STATUS_ARGS } from './gitParse';
import { UserError } from './http';
import { worktreeGitDir } from './repoStore';

export interface PullWithStashResult {
  output: string;
  /** The backup is deliberately retained even when restoration succeeds. */
  backup?: string;
}

const activePulls = new Set<string>();
// Do not let a submodule's ignore setting hide work that stash cannot save.
const PULL_STATUS_ARGS = [...STATUS_ARGS, '--ignore-submodules=none'];

/** Avoid two Gitter pulls acting on the same worktree at the same time. */
export async function withPullGuard<T>(repo: string, action: (root: string) => Promise<T>): Promise<T> {
  const root = (await git(repo, ['rev-parse', '--show-toplevel'])).trim();
  let key: string;
  try { key = fs.realpathSync.native(root); } catch { key = path.resolve(root); }
  if (process.platform === 'win32') key = key.toLowerCase();
  if (activePulls.has(key)) throw new UserError('Another pull is already running in this worktree.');
  activePulls.add(key);
  try { return await action(root); } finally { activePulls.delete(key); }
}

function description(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).trim().slice(0, 2000);
}

function operationInProgress(root: string): boolean {
  const dir = worktreeGitDir(root);
  return ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some((name) => fs.existsSync(path.join(dir, name)));
}

/** Locate our uniquely named stash; another worktree may have added a newer one. */
async function backupHash(root: string, marker: string): Promise<string | undefined> {
  const output = await git(root, ['stash', 'list', format('%H', '%gs')]);
  const entries = records(output).filter(([, message]) => message?.endsWith(`: ${marker}`));
  if (entries.length > 1) throw new UserError('More than one pull backup has the same identity. Check Stashes before continuing.');
  return entries[0]?.[0];
}

/**
 * Preserve staged, unstaged and untracked changes across a pull. Git stashes
 * are shared by worktrees, so restoration uses the captured commit ID, never
 * stash@{0}. We retain the backup after success: deleting by a changing stash
 * index could otherwise delete another worktree's stash.
 */
export async function pullWithStash(repo: string, pull: (root: string) => Promise<string>): Promise<PullWithStashResult> {
  return withPullGuard(repo, (root) => stashAndPull(root, pull));
}

async function stashAndPull(root: string, pull: (root: string) => Promise<string>): Promise<PullWithStashResult> {
  if (operationInProgress(root)) throw new UserError('Finish or abort the current merge, rebase, cherry-pick, or revert before pulling.');
  const beforeHead = (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim();
  const beforeStatus = await git(root, PULL_STATUS_ARGS);
  const marker = `Gitter pull backup ${randomUUID()}`;
  let stashOutput: string;
  try {
    // Git stash uses internal pathspec magic when cleaning untracked files.
    // Literal pathspecs make that cleanup silently skip those files.
    stashOutput = await git(root, ['stash', 'push', '--include-untracked', '--message', marker], { env: { LC_ALL: 'C', LANG: 'C', GIT_LITERAL_PATHSPECS: '0' } });
  } catch (error) {
    const backup = await backupHash(root, marker).catch(() => undefined);
    const saved = backup ? ` A backup was created (${backup.slice(0, 12)}); find it in Stashes before retrying.` : '';
    throw new UserError(`Could not stash changes before pulling: ${description(error)}.${saved}`);
  }
  let backup: string | undefined;
  let afterStatus: string;
  try {
    backup = await backupHash(root, marker);
    afterStatus = await git(root, PULL_STATUS_ARGS);
  } catch (error) {
    throw new UserError(`Could not inspect the pull backup: ${description(error)}. Pull was not started; check Stashes for ${marker}.`);
  }
  if (afterStatus) {
    const saved = backup ? ` Backup ${backup.slice(0, 12)} remains in Stashes.` : '';
    throw new UserError(`Some changes could not be stashed, possibly in a submodule or nested repository. Pull was not started.${saved}`);
  }
  if (!backup && (beforeStatus || !stashOutput.includes('No local changes to save'))) {
    throw new UserError('Could not identify the pull backup. Pull was not started; check the working tree and Stashes.');
  }

  let output: string;
  try {
    output = await pull(root);
  } catch (error) {
    if (!backup) throw error;
    // A network failure usually leaves HEAD and the tree untouched. Restore in
    // that case; never apply over an unfinished merge/rebase or concurrent edits.
    let safe = false;
    try {
      const [head, status] = await Promise.all([git(root, ['rev-parse', '--verify', 'HEAD']), git(root, PULL_STATUS_ARGS)]);
      safe = head.trim() === beforeHead && !status && !operationInProgress(root);
    } catch { /* Leave the saved backup for manual recovery. */ }
    if (safe) {
      try {
        await git(root, ['stash', 'apply', '--index', backup]);
        throw new UserError(`Pull failed: ${description(error)}. Your changes were restored; backup ${backup.slice(0, 12)} remains in Stashes.`);
      } catch (restoreError) {
        if (restoreError instanceof UserError) throw restoreError;
        throw new UserError(`Pull failed: ${description(error)}. Automatic restoration failed: ${description(restoreError)}. Backup ${backup.slice(0, 12)} remains in Stashes.`);
      }
    }
    throw new UserError(`Pull failed: ${description(error)}. Backup ${backup.slice(0, 12)} remains in Stashes; resolve or abort the pull before restoring it.`);
  }

  if (backup) {
    try {
      if (operationInProgress(root) || await git(root, PULL_STATUS_ARGS)) {
        throw new UserError(`Pull succeeded, but new changes or an unfinished operation appeared. Backup ${backup.slice(0, 12)} remains in Stashes; inspect the working tree before restoring it.`);
      }
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Pull succeeded, but the working tree could not be checked: ${description(error)}. Backup ${backup.slice(0, 12)} remains in Stashes.`);
    }
    try { await git(root, ['stash', 'apply', '--index', backup]); }
    catch (error) {
      throw new UserError(`Pull succeeded, but restoring changes failed: ${description(error)}. Backup ${backup.slice(0, 12)} remains in Stashes; inspect conflicts before applying it again.`);
    }
  }
  return { output, backup };
}
