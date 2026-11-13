import type { Branch, RebaseCommitItem, Tag } from '../shared/types/git';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { git, gitSucceeds } from './git';
import { format, records, refFormat, STATUS_ARGS } from './gitParse';
import { inRepo, UserError } from './http';
import { worktreeGitDir } from './repoStore';

async function branches(repo: string): Promise<Branch[]> {
  const out = await git(repo, [
    'for-each-ref', 'refs/heads', 'refs/remotes',
    refFormat('%(refname)', '%(HEAD)', '%(upstream:short)', '%(upstream:track)', '%(objectname:short)', '%(symref)'),
  ]);
  return records(out)
    .filter(([, , , , , symref]) => !symref) // refs/remotes/<remote>/HEAD only points at another branch
    .map(([ref, head, upstream, track, targetHash]) => {
      const remote = ref.match(/^refs\/remotes\/([^/]+)\/(.+)$/);
      return {
        name: remote ? `${remote[1]}/${remote[2]}` : ref.replace(/^refs\/heads\//, ''),
        current: head === '*',
        isRemote: Boolean(remote),
        remoteName: remote?.[1],
        upstream: upstream || undefined,
        ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
        behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
        targetHash,
      };
    });
}

async function tags(repo: string): Promise<Tag[]> {
  // Annotated tags point at a tag object; %(*objectname) is the commit behind it.
  const out = await git(repo, [
    'for-each-ref', 'refs/tags',
    refFormat('%(refname:short)', '%(if)%(*objectname)%(then)%(*objectname:short)%(else)%(objectname:short)%(end)', '%(contents:subject)'),
  ]);
  return records(out).map(([name, targetHash, message]) => ({ name, targetHash, message: message || undefined }));
}

async function requireCleanTree(repo: string, action: string): Promise<void> {
  if ((await git(repo, STATUS_ARGS)).length > 0) {
    throw new UserError(`Commit or stash your changes before ${action}.`);
  }
}

// What undoing the latest reflog entry means depends on what that entry did.
async function undo(repo: string): Promise<string> {
  const [latest] = records(await git(repo, ['reflog', '-n1', format('%gs')]));
  if (!latest) throw new UserError('Nothing to undo.');
  const [action] = latest;

  const checkout = action.match(/^checkout: moving from (.+) to .+$/);
  if (checkout) {
    await git(repo, ['checkout', '--end-of-options', checkout[1]]);
    return `Switched back to ${checkout[1]}.`;
  }

  // A commit (also an amend or a concluded merge) is taken back with its changes left staged.
  const commit = action.match(/^commit(?: \(([^)]*)\))?: (.*)$/);
  if (commit) {
    // The first commit has no previous position: the branch becomes unborn again.
    if (commit[1] === 'initial') await git(repo, ['update-ref', '-d', 'HEAD']);
    else await git(repo, ['reset', '--soft', 'HEAD@{1}']);
    return `Undid the commit "${commit[2]}". Its changes are staged.`;
  }

  // A finished rebase's last entries all point at the rewritten commits; ORIG_HEAD is where the branch was.
  if (action.startsWith('rebase')) {
    await git(repo, ['reset', '--keep', 'ORIG_HEAD']);
    return 'Undid the rebase.';
  }

  // Resets, merges, pulls, cherry-picks: go back to the previous position. After a
  // soft reset the index already holds that commit's content, so only the branch moves;
  // otherwise --keep updates the files and refuses to overwrite uncommitted changes.
  if (await gitSucceeds(repo, ['diff', '--cached', '--quiet', 'HEAD@{1}'])) {
    await git(repo, ['reset', '--soft', 'HEAD@{1}']);
  } else {
    try {
      await git(repo, ['reset', '--keep', 'HEAD@{1}']);
    } catch (e) {
      // After a mixed reset the files already hold that commit's content, unstaged,
      // and --keep refuses them; moving the branch and index back is the undo.
      if (!action.startsWith('reset:')) throw e;
      await git(repo, ['reset', '--mixed', 'HEAD@{1}']);
    }
  }
  return `Undid "${action}".`;
}

/**
 * Cherry-picks a commit and reports whether it brought anything: a commit
 * whose change is already there (it would come out empty) is skipped. With
 * `noCommit` the change is only staged.
 */
async function pick(repo: string, hash: string, noCommit = false): Promise<boolean> {
  try {
    await git(repo, ['cherry-pick', ...(noCommit ? ['-n'] : []), '--end-of-options', hash]);
  } catch (e) {
    const empty = fs.existsSync(path.join(worktreeGitDir(repo), 'CHERRY_PICK_HEAD')) && (await git(repo, STATUS_ARGS)).length === 0;
    if (!empty) throw e;
    await git(repo, ['cherry-pick', '--skip']);
    return false;
  }
  return noCommit ? !(await gitSucceeds(repo, ['diff', '--cached', '--quiet'])) : true;
}

const fullMessage = async (repo: string, hash: string) => (await git(repo, ['log', '-1', '--format=%B', '--end-of-options', hash])).trim();

async function runRebasePlan(repo: string, base: string, plan: RebaseCommitItem[]): Promise<string> {
  const first = plan.find((item) => item.action !== 'drop');
  if (!first) throw new UserError('At least one commit has to stay.');
  if (first.action === 'squash' || first.action === 'fixup') throw new UserError('The first kept commit has nothing to fold into.');
  await requireCleanTree(repo, 'an interactive rebase');
  const branch = (await git(repo, ['branch', '--show-current'])).trim();
  if (!branch) throw new UserError('Check out a branch before an interactive rebase.');
  const start = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  const baseCommit = (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`])).trim();
  const expected = (await git(repo, ['rev-list', '--no-merges', '--end-of-options', `${baseCommit}..${start}`])).trim().split('\n').filter(Boolean);
  const allowed = new Set(['pick', 'reword', 'squash', 'fixup', 'drop']);
  const actual = plan.map((item) => item.hash);
  if (plan.some((item) => !allowed.has(item.action)) || actual.length !== expected.length ||
      new Set(actual).size !== expected.length || actual.some((hash) => !expected.includes(hash))) {
    throw new UserError('The rebase plan must contain each selected commit exactly once. Reload the plan and try again.');
  }
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitter-rebase-'));
  let added = false;
  try {
    // Replaying history in a detached worktree leaves the user's checkout and
    // index untouched if a pick, hook or commit fails.
    await git(repo, ['worktree', 'add', '--detach', '--', temporary, baseCommit]);
    added = true;
    // Squash and fixup amend the previous commit of the plan; while none has been
    // made (the first picks were empty), amending would rewrite `base` itself.
    let made = 0;
    for (const item of plan) {
      if (item.action === 'drop') continue;
      if (item.action === 'pick') {
        if (await pick(temporary, item.hash)) made++;
      } else if (item.action === 'reword') {
        // A new summary replaces the first line; the body stays.
        const [, ...body] = (await fullMessage(temporary, item.hash)).split('\n');
        if (await pick(temporary, item.hash)) {
          made++;
          await git(temporary, ['commit', '--amend', '-F', '-'], { input: [item.newSummary?.trim() || item.summary, ...body].join('\n') });
        }
      } else {
        // squash: like git, both messages, the squashed one possibly reworded; fixup: the previous message only.
        const message = item.action === 'squash' ? item.newSummary?.trim() || (await fullMessage(temporary, item.hash)) : await fullMessage(temporary, item.hash);
        const staged = await pick(temporary, item.hash, true);
        if (made > 0) {
          const amended = item.action === 'squash' ? `${await fullMessage(temporary, 'HEAD')}\n\n${message}` : await fullMessage(temporary, 'HEAD');
          await git(temporary, ['commit', '--amend', '--allow-empty', '-F', '-'], { input: amended });
        } else if (staged) {
          await git(temporary, ['commit', '-F', '-'], { input: message });
          made++;
        }
      }
    }
    const rewritten = (await git(temporary, ['rev-parse', 'HEAD'])).trim();
    if ((await git(repo, ['branch', '--show-current'])).trim() !== branch || (await git(repo, ['rev-parse', 'HEAD'])).trim() !== start) {
      throw new UserError('The checked-out branch changed while rewriting. Reload and try again.');
    }
    // Refuse to overwrite edits made while the temporary worktree was running.
    await git(repo, ['reset', '--keep', '--end-of-options', rewritten]);
    return `Rewrote ${branch} onto ${base.slice(0, 7)}.`;
  } catch (e: any) {
    throw new UserError(`Interactive rebase stopped; the original worktree was preserved: ${e.message}`);
  } finally {
    if (added) await git(repo, ['worktree', 'remove', '--force', '--', temporary]).catch(() => undefined);
    else await fs.promises.rm(temporary, { recursive: true, force: true });
  }
}

export const branchHandlers = {
  branches: inRepo((repo) => branches(repo)),

  createBranch: inRepo(async (repo, { name, startPoint = 'HEAD' }: { name: string; startPoint?: string }) => {
    await git(repo, ['branch', '--end-of-options', name, startPoint]);
  }),

  /** Checks out a branch, tag or commit. */
  checkout: inRepo(async (repo, { target }: { target: string }) => {
    await git(repo, ['checkout', '--end-of-options', target]);
  }),

  deleteBranch: inRepo(async (repo, { name, force = false }: { name: string; force?: boolean }) => {
    await git(repo, ['branch', force ? '-D' : '-d', '--end-of-options', name]);
  }),

  renameBranch: inRepo(async (repo, { from, to }: { from: string; to: string }) => {
    await git(repo, ['branch', '-m', '--end-of-options', from, to]);
  }),

  tags: inRepo((repo) => tags(repo)),

  createTag: inRepo(async (repo, { name, target = 'HEAD', message }: { name: string; target?: string; message?: string }) => {
    if (message) await git(repo, ['tag', '-a', '-F', '-', '--end-of-options', name, target], { input: message });
    else await git(repo, ['tag', '--end-of-options', name, target]);
  }),

  deleteTag: inRepo(async (repo, { name }: { name: string }) => {
    await git(repo, ['tag', '-d', '--end-of-options', name]);
  }),

  pushTag: inRepo((repo, { name, remote = 'origin' }: { name: string; remote?: string }) =>
    git(repo, ['push', '--end-of-options', remote, `refs/tags/${name}`])
  ),

  merge: inRepo((repo, { branch }: { branch: string }) => git(repo, ['merge', '--end-of-options', branch])),
  rebase: inRepo((repo, { onto }: { onto: string }) => git(repo, ['rebase', '--end-of-options', onto])),
  cherryPick: inRepo((repo, { hash }: { hash: string }) => git(repo, ['cherry-pick', '--end-of-options', hash])),
  revert: inRepo((repo, { hash }: { hash: string }) => git(repo, ['revert', '--no-edit', '--end-of-options', hash])),

  reset: inRepo(async (repo, { hash, mode }: { hash: string; mode: 'soft' | 'mixed' | 'hard' }) => {
    if (!['soft', 'mixed', 'hard'].includes(mode)) throw new UserError(`Unknown reset mode "${mode}".`);
    await git(repo, ['reset', `--${mode}`, '--end-of-options', hash]);
  }),

  undo: inRepo((repo) => undo(repo)),

  /** Commits after `base` on the current branch, oldest first, for the interactive rebase editor. */
  /** Commits on `head` (HEAD by default) that `base` lacks, oldest first. */
  rebaseCommits: inRepo(async (repo, { base, head = 'HEAD' }: { base: string; head?: string }): Promise<RebaseCommitItem[]> => {
    // Merge commits are left out: like `git rebase`, the rewrite replays the commits merged in instead.
    const out = await git(repo, ['log', '--reverse', '--no-merges', format('%H', '%h', '%an', '%s'), '--end-of-options', `${base}..${head}`]);
    return records(out).map(([hash, shortHash, author, summary]) => ({ hash, shortHash, author, summary, action: 'pick' }));
  }),

  runRebasePlan: inRepo((repo, { base, plan }: { base: string; plan: RebaseCommitItem[] }) => runRebasePlan(repo, base, plan)),
};
