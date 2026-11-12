import fs from 'fs';
import path from 'path';
import type { Stash } from '../shared/types/git';
import { git, gitSucceeds } from './git';
import { changedFiles, format, parseDiff, records } from './gitParse';
import { inRepo, UserError } from './http';
import { worktreeGitDir } from './repoStore';

function stashRef(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new UserError(`No stash number ${index}.`);
  return `stash@{${index}}`;
}

// Another git process (an IDE, a terminal, an agent) may briefly hold the index
// lock. A stash that also re-applies itself must not fail between its two steps.
async function waitForIndexLock(repo: string): Promise<void> {
  const lock = path.join(worktreeGitDir(repo), 'index.lock');
  for (let waited = 0; fs.existsSync(lock); waited += 100) {
    if (waited >= 5000) throw new UserError('Another git process is holding the index lock. Try again in a moment.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Runs `git stash push` and returns the new stash's commit, or null when there
 * was nothing to stash (git then exits 0 without creating one, and stash@{0}
 * is still an older, unrelated stash).
 */
export async function pushStash(repo: string, args: string[]): Promise<string | null> {
  const tip = () => git(repo, ['rev-parse', '--verify', '--quiet', 'refs/stash']).then((s) => s.trim(), () => '');
  const before = await tip();
  await git(repo, ['stash', 'push', ...args]);
  const after = await tip();
  return after && after !== before ? after : null;
}

interface SaveStashInput {
  message?: string;
  includeUntracked?: boolean;
  /** Paths to stash; all changes when omitted. */
  files?: string[];
  /** Re-apply right away, keeping the changes in the working tree (a snapshot). */
  keepWorkingChanges?: boolean;
}

export const stashHandlers = {
  stashes: inRepo(async (repo): Promise<Stash[]> => {
    const out = await git(repo, ['stash', 'list', format('%gd', '%gs', '%H', '%ci')]);
    return records(out).map(([name, message, hash, date], index) => ({ index, name, message, hash, date }));
  }),

  saveStash: inRepo(async (repo, { message, includeUntracked = true, files, keepWorkingChanges = false }: SaveStashInput) => {
    await waitForIndexLock(repo);
    const stash = await pushStash(repo, [
      ...(includeUntracked ? ['-u'] : []),
      ...(message ? ['-m', message] : []),
      ...(files?.length ? ['--', ...files] : []),
    ]);
    if (!stash) throw new UserError('There were no changes to stash.');
    if (!keepWorkingChanges) return;
    await waitForIndexLock(repo);
    try {
      await git(repo, ['stash', 'apply', '--index', stash]);
    } catch (e: any) {
      throw new UserError(`The stash was saved, but restoring your files failed: ${e.message}\nApply stash@{0} to get them back.`);
    }
  }),

  popStash: inRepo((repo, { index }: { index: number }) => git(repo, ['stash', 'pop', stashRef(index)])),
  applyStash: inRepo((repo, { index }: { index: number }) => git(repo, ['stash', 'apply', stashRef(index)])),
  dropStash: inRepo((repo, { index }: { index: number }) => git(repo, ['stash', 'drop', stashRef(index)])),

  /** Files in a stash, including untracked files saved with -u. */
  stashFiles: inRepo(async (repo, { index }: { index: number }) => {
    const ref = stashRef(index);
    const [names, counts] = await Promise.all([
      git(repo, ['stash', 'show', '--include-untracked', '--name-status', '-z', ref]),
      git(repo, ['stash', 'show', '--include-untracked', '--numstat', '-z', ref]),
    ]);
    return changedFiles(names, counts);
  }),

  stashFileDiff: inRepo(async (repo, { index, file }: { index: number; file: string }) => {
    const ref = stashRef(index);
    // `stash show` takes no pathspec, so diff the stash commit against its base.
    const tracked = parseDiff(await git(repo, ['diff', `${ref}^1`, ref, '--', file]));
    if (tracked.length > 0) return tracked;
    // Untracked files are in the stash's third parent, a commit with no parent of its own.
    if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', `${ref}^3`]))) return [];
    return parseDiff(await git(repo, ['show', '--format=', `${ref}^3`, '--', file]));
  }),
};
