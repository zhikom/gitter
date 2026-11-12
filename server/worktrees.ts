import path from 'path';
import type { Submodule, Worktree } from '../shared/types/git';
import { git, gitSucceeds } from './git';
import { inRepo } from './http';

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return process.platform === 'win32' ? norm(a) === norm(b) : path.resolve(a) === path.resolve(b);
}

export async function worktrees(repo: string): Promise<Worktree[]> {
  const root = (await git(repo, ['rev-parse', '--show-toplevel'])).trim();
  const out = await git(repo, ['worktree', 'list', '--porcelain', '-z']);
  // -z: attributes end with NUL, worktrees with an extra NUL.
  return out
    .split('\0\0')
    .filter(Boolean)
    .map((block) => {
      const attrs = block.split('\0');
      const value = (key: string) => attrs.find((a) => a.startsWith(`${key} `))?.slice(key.length + 1);
      const wtPath = value('worktree') ?? '';
      return {
        path: wtPath.replace(/\\/g, '/'),
        head: value('HEAD') ?? '',
        branch: value('branch')?.replace(/^refs\/heads\//, ''),
        isBare: attrs.includes('bare'),
        isCurrent: samePath(wtPath, root),
      };
    });
}

export const worktreeHandlers = {
  worktrees: inRepo((repo) => worktrees(repo)),

  /** Checks out `branch` in a new folder; a branch that exists nowhere yet is created from HEAD. */
  addWorktree: inRepo(async (repo, { folder, branch }: { folder: string; branch: string }) => {
    const local = await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    // git itself creates a tracking branch when exactly one remote has the name.
    const remote = !local && (await git(repo, ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`])).trim() !== '';
    const create = local || remote ? [] : ['-b', branch];
    await git(repo, ['worktree', 'add', ...create, '--end-of-options', folder, ...(create.length ? ['HEAD'] : [branch])]);
  }),

  removeWorktree: inRepo(async (repo, { folder }: { folder: string }) => {
    await git(repo, ['worktree', 'remove', '--end-of-options', folder]);
  }),

  submodules: inRepo(async (repo): Promise<Submodule[]> => {
    const out = await git(repo, ['submodule', 'status']);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [, commitHash, subPath, branch] = line.match(/^.(\S+) (\S+)(?: \((.+)\))?/) ?? [];
        return { name: path.basename(subPath ?? ''), path: subPath ?? '', commitHash: commitHash ?? '', branch };
      });
  }),

  updateSubmodules: inRepo((repo) => git(repo, ['submodule', 'update', '--init', '--recursive'])),
};
