// Virtual branches ("lanes") split one working tree's changes across several
// branches without switching between them.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { VirtualBranch } from '../shared/types/virtualBranch';
import { git, gitSucceeds } from './git';
import { inRepo, UserError } from './http';
import { readDoc, updateDoc } from './repoStore';
import { worktrees } from './worktrees';

const laneRef = (laneId: string) => `refs/gitter/lanes/${laneId.replace(/[^\w-]/g, '-')}`;

/**
 * Commits the working-tree content of `files` onto `branch` without checking it
 * out. A temporary linked worktree supplies a separate HEAD and index, while
 * Git sees the original working directory. This lets a real `git commit` run
 * the repository's hooks and signing configuration without changing the user's
 * checked-out branch or index. Hooks can themselves change working files.
 */
async function commitToBranch(repo: string, branch: string, files: string[], message: string): Promise<{ commitHash: string; cleanupWarning?: string }> {
  const current = (await git(repo, ['branch', '--show-current'])).trim();
  if (branch === current) {
    await git(repo, ['add', '--', ...files]);
    await git(repo, ['commit', '-F', '-', '--', ...files], { input: message });
    return { commitHash: (await git(repo, ['rev-parse', 'HEAD'])).trim() };
  }

  // update-ref would move a branch another worktree (an agent's) has checked out, under its files.
  const elsewhere = (await worktrees(repo)).find((w) => w.branch === branch && !w.isCurrent);
  if (elsewhere) throw new UserError(`${branch} is checked out in ${elsewhere.path}; commit there instead.`);
  const ref = `refs/heads/${branch}`;
  await git(repo, ['check-ref-format', ref]);
  const exists = await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', ref]);
  const parent = (await git(repo, ['rev-parse', exists ? ref : 'HEAD'])).trim();
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitter-lane-'));
  const location = path.join(temp, 'worktree');
  let added = false;
  let committed = false;
  let commitHash: string | undefined;
  let failure: unknown;
  const cleanup: string[] = [];
  try {
    // Registering the target branch also makes Git refuse another normal
    // checkout of it while this commit is in progress.
    await git(repo, exists
      ? ['worktree', 'add', '--no-checkout', '--', location, branch]
      : ['worktree', 'add', '--no-checkout', '-b', branch, '--', location, parent]);
    added = true;
    const gitDir = (await git(location, ['rev-parse', '--absolute-git-dir'])).trim();
    const env = { GIT_DIR: gitDir, GIT_WORK_TREE: repo };
    await git(repo, ['read-tree', parent], { env });
    await git(repo, ['add', '--', ...files], { env });
    if ((await git(repo, ['rev-parse', 'HEAD'], { env })).trim() !== parent) {
      throw new UserError(`${branch} moved while preparing the lane commit. Please try again.`);
    }
    await git(repo, ['commit', '--allow-empty', '-F', '-'], { env, input: message });
    committed = true;
    commitHash = (await git(repo, ['rev-parse', 'HEAD'], { env })).trim();
  } catch (error) {
    failure = error;
  } finally {
    let removed = !added;
    if (added) {
      try { await git(repo, ['worktree', 'remove', '--force', '--', location]); removed = true; }
      catch (error) { cleanup.push(`The temporary worktree remains at ${location}: ${(error as Error).message}`); }
      // Remove only a branch we created and only if it still points at the
      // original parent. A hook or another process may have moved it.
      if (removed && !exists && !committed) {
        try { await git(repo, ['update-ref', '-d', ref, parent]); }
        catch { cleanup.push(`The new branch ${branch} was kept because it could not be safely removed.`); }
      }
    }
    if (removed) {
      try { await fs.promises.rm(temp, { recursive: true, force: true }); }
      catch (error) { cleanup.push(`Could not remove temporary files at ${temp}: ${(error as Error).message}`); }
    }
  }
  const cleanupWarning = cleanup.join(' ') || undefined;
  if (failure || !commitHash) {
    const message = failure instanceof Error ? failure.message : String(failure ?? 'Could not read the commit.');
    if (committed) throw new UserError(`Git created the commit on ${branch}, but Gitter could not read its hash: ${message}${cleanupWarning ? ` ${cleanupWarning}` : ''}`);
    if (cleanupWarning) throw new UserError(`${message} ${cleanupWarning}`);
    throw failure ?? new UserError(message);
  }
  return { commitHash, cleanupWarning };
}

export const virtualBranchHandlers = {
  virtualBranches: inRepo((repo) => readDoc<VirtualBranch[]>(repo, 'virtual-branches', [])),

  saveVirtualBranches: inRepo(async (repo, { branches }: { branches: VirtualBranch[] }) => {
    await updateDoc<VirtualBranch[]>(repo, 'virtual-branches', [], () => branches);
  }),

  commitVirtualBranch: inRepo(
    async (repo, input: { branchName: string; files: string[]; summary: string; description?: string; pushUpstream?: boolean }) => {
      if (input.files.length === 0) throw new UserError('This lane has no files to commit.');
      const message = input.description ? `${input.summary}\n\n${input.description}` : input.summary;
      const { commitHash, cleanupWarning } = await commitToBranch(repo, input.branchName, input.files, message);
      // The commit stands even if the push fails, so a push failure is reported, not thrown.
      let pushError: string | undefined;
      if (input.pushUpstream) {
        await git(repo, ['push', '-u', 'origin', '--end-of-options', input.branchName]).catch((e) => {
          pushError = e.message;
        });
      }
      return { commitHash, branchName: input.branchName, pushError, cleanupWarning };
    }
  ),

  /** Moves a lane's changes out of the working tree, keeping them under a ref of their own. */
  stashLane: inRepo(async (repo, { laneId, files }: { laneId: string; files: string[] }) => {
    if (files.length === 0) return;
    const ref = laneRef(laneId);
    if (await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', ref])) throw new UserError('This lane is already put away. Restore it first.');
    const marker = `gitter lane ${randomUUID()}`;
    await git(repo, ['stash', 'push', '-u', '-m', marker, '--', ...files]);
    // Another tool may create a stash concurrently, so identify ours by its
    // unique message rather than assuming stash@{0} still belongs to us.
    const entries = (await git(repo, ['stash', 'list', '--format=%H%x1f%gs'])).split('\n');
    const saved = entries.find((line) => line.endsWith(marker))?.split('\x1f')[0];
    if (!saved) throw new UserError('The lane has no changes to put away.');
    await git(repo, ['update-ref', ref, saved, '0'.repeat(saved.length)]);
    // Retain the stash as a recovery copy; never drop a different process's stash.
  }),

  /** Puts a stashed lane's changes back into the working tree. */
  unstashLane: inRepo(async (repo, { laneId }: { laneId: string }) => {
    const ref = laneRef(laneId);
    if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', ref]))) return;
    const [tracked, untracked] = await Promise.all([
      git(repo, ['diff', '--no-renames', '--name-only', '-z', `${ref}^1`, ref]),
      git(repo, ['ls-tree', '-r', '--name-only', '-z', `${ref}^3`]).catch(() => ''),
    ]);
    const paths = [...new Set([...tracked.split('\0'), ...untracked.split('\0')].filter(Boolean))];
    await git(repo, ['stash', 'apply', ref]);
    if (paths.length) {
      const [savedIndex, currentIndex] = await Promise.all([
        git(repo, ['ls-tree', '-r', '--name-only', '-z', `${ref}^2`, '--', ...paths]),
        git(repo, ['ls-files', '-z', '--', ...paths]),
      ]);
      const indexed = [...new Set([...savedIndex.split('\0'), ...currentIndex.split('\0')].filter(Boolean))];
      if (indexed.length) {
        try { await git(repo, ['restore', `--source=${ref}^2`, '--staged', '--', ...indexed]); }
        catch (e: any) { throw new UserError(`Files were restored, but their staged state could not be restored. The lane backup remains saved: ${e.message}`); }
      }
    }
    await git(repo, ['update-ref', '-d', ref]);
  }),
};
