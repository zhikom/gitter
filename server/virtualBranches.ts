// Virtual branches ("lanes") split one working tree's changes across several
// branches without switching between them.
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { VirtualBranch } from '../shared/types/virtualBranch';
import { git, gitSucceeds } from './git';
import { inRepo, UserError } from './http';
import { readDoc, updateDoc } from './repoStore';

const laneRef = (laneId: string) => `refs/gitter/lanes/${laneId.replace(/[^\w-]/g, '-')}`;

/**
 * Commits the working-tree content of `files` onto `branch` without checking it
 * out: the commit is built in a temporary index on top of the branch's tree, so
 * the working tree and the real index stay as they are.
 */
async function commitToBranch(repo: string, branch: string, files: string[], message: string): Promise<string> {
  const current = (await git(repo, ['branch', '--show-current'])).trim();
  if (branch === current) {
    await git(repo, ['add', '--', ...files]);
    await git(repo, ['commit', '-F', '-', '--', ...files], { input: message });
    return (await git(repo, ['rev-parse', 'HEAD'])).trim();
  }

  const ref = `refs/heads/${branch}`;
  const exists = await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', ref]);
  const parent = (await git(repo, ['rev-parse', exists ? ref : 'HEAD'])).trim();
  const index = path.join(os.tmpdir(), `gitter-index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(repo, ['read-tree', parent], { env });
    await git(repo, ['add', '--', ...files], { env });
    const tree = (await git(repo, ['write-tree'], { env })).trim();
    const commit = (await git(repo, ['commit-tree', tree, '-p', parent, '-F', '-'], { input: message })).trim();
    // The old value makes the update fail if the branch moved in the meantime.
    await git(repo, ['update-ref', ref, commit, exists ? parent : '']);
    return commit;
  } finally {
    await fs.promises.rm(index, { force: true });
  }
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
      const commitHash = await commitToBranch(repo, input.branchName, input.files, message);
      // The commit stands even if the push fails, so a push failure is reported, not thrown.
      let pushError: string | undefined;
      if (input.pushUpstream) {
        await git(repo, ['push', '-u', 'origin', '--end-of-options', input.branchName]).catch((e) => {
          pushError = e.message;
        });
      }
      return { commitHash, branchName: input.branchName, pushError };
    }
  ),

  /** Moves a lane's changes out of the working tree, keeping them under a ref of their own. */
  stashLane: inRepo(async (repo, { laneId, files }: { laneId: string; files: string[] }) => {
    if (files.length === 0) return;
    await git(repo, ['stash', 'push', '-u', '-m', `gitter lane ${laneId}`, '--', ...files]);
    const stash = (await git(repo, ['rev-parse', 'stash@{0}'])).trim();
    await git(repo, ['update-ref', laneRef(laneId), stash]);
    await git(repo, ['stash', 'drop', 'stash@{0}']);
  }),

  /** Puts a stashed lane's changes back into the working tree. */
  unstashLane: inRepo(async (repo, { laneId }: { laneId: string }) => {
    const ref = laneRef(laneId);
    if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', ref]))) return;
    await git(repo, ['stash', 'apply', ref]);
    await git(repo, ['update-ref', '-d', ref]);
  }),
};
