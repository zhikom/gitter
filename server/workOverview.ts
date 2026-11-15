// A read-only view of local and remote-tracking branches and linked worktrees.
// Remote counts use local remote-tracking refs: this never fetches or checks out.
import fs from 'node:fs';
import path from 'node:path';
import type { TrackingState, WorkBranch, WorkOverview, WorktreeState } from '../shared/types/workOverview';
import { git } from './git';
import { format, parseStatus, records, refFormat, STATUS_ARGS, toFileStatuses } from './gitParse';
import { inRepo } from './http';
import { worktreeGitDir } from './repoStore';
import { worktrees } from './worktrees';

function tracking(name: string, value: string): TrackingState {
  if (!name) return { state: 'none' };
  if (value.includes('[gone]')) return { name, state: 'gone' };
  if (value && !/^\[(?:ahead \d+|behind \d+)(?:, (?:ahead \d+|behind \d+))?\]$/.test(value)) return { name, state: 'unknown' };
  return {
    name,
    state: 'known',
    ahead: Number(value.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(value.match(/behind (\d+)/)?.[1] ?? 0),
  };
}

async function inspectWorktree(tree: Awaited<ReturnType<typeof worktrees>>[number]): Promise<WorktreeState> {
  const base = { ...tree, files: null, rebase: false, merge: false };
  if (tree.isBare) return base;
  try {
    const entries = parseStatus(await git(tree.path, STATUS_ARGS));
    const gitDir = worktreeGitDir(tree.path);
    return {
      ...base,
      files: toFileStatuses(entries),
      rebase: fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')),
      merge: fs.existsSync(path.join(gitDir, 'MERGE_HEAD')),
    };
  } catch (error: any) {
    return { ...base, problem: String(error?.message || error) };
  }
}

/** Limit the number of git processes even when a repository has many branches. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const next = index++;
        results[next] = await fn(items[next]);
      }
    }),
  );
  return results;
}

export async function inspectOverview(repo: string): Promise<WorkOverview> {
  const [commonDir, trees, remotes, originRefs, rawBranches, rawRemoteBranches, rawStashes] = await Promise.all([
    git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    worktrees(repo),
    git(repo, ['remote']),
    git(repo, ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/']),
    git(repo, [
      'for-each-ref',
      'refs/heads',
      refFormat(
        '%(refname)',
        '%(objectname)',
        '%(upstream:short)',
        '%(upstream:track)',
        '%(push:short)',
        '%(push:track)',
        '%(committerdate:unix)',
        '%(subject)',
      ),
    ]),
    git(repo, [
      'for-each-ref',
      'refs/remotes',
      refFormat('%(refname)', '%(objectname)', '%(symref)', '%(committerdate:unix)', '%(subject)'),
    ]),
    git(repo, ['stash', 'list', format('%gd', '%gs', '%H', '%ci')]),
  ]);
  const normalizedCommon = path.resolve(commonDir.trim());
  // A bare repository can own linked working trees; use an accessible checkout
  // as the API entry point rather than its bare administrative directory.
  const root = trees.find((tree) => !tree.isBare && fs.existsSync(tree.path))?.path || repo;
  const origin: WorkOverview['origin'] = !remotes.split('\n').includes('origin')
    ? 'no-remote'
    : originRefs.trim()
      ? 'known'
      : 'not-fetched';
  const originNames = originRefs.split('\n').filter(Boolean);
  const defaultRef =
    origin === 'known' ? (await git(repo, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).catch(() => '')).trim() : '';
  const comparisonBase = originNames.includes(defaultRef)
    ? defaultRef
    : ['refs/remotes/origin/main', 'refs/remotes/origin/master'].find((name) => originNames.includes(name));
  const inspected = await mapLimited(trees, 4, inspectWorktree);
  const warnings: string[] = [];
  await mapLimited(
    inspected.filter((tree) => !tree.branch && !tree.isBare),
    4,
    async (tree) => {
      tree.absentFromOrigin = null;
      if (origin === 'known' && /^[0-9a-f]{40,64}$/i.test(tree.head)) {
        try {
          tree.absentFromOrigin = Number((await git(repo, ['rev-list', '--count', tree.head, '--not', '--remotes=origin'])).trim());
        } catch {
          warnings.push(`Could not compare detached worktree ${tree.path} with the locally known origin refs.`);
        }
      }
    },
  );
  const branches = await mapLimited(
    records(rawBranches),
    4,
    async ([ref, head, upstream, upstreamTrack, push, pushTrack, at, subject]): Promise<WorkBranch> => {
      const name = ref.replace(/^refs\/heads\//, '');
      let absentFromOrigin: number | null = null;
      if (origin === 'known') {
        try {
          absentFromOrigin = Number((await git(repo, ['rev-list', '--count', ref, '--not', '--remotes=origin'])).trim());
        } catch {
          warnings.push(`Could not compare ${name} with the locally known origin refs.`);
        }
      }
      return {
        name,
        head,
        subject,
        lastCommit: (Number(at) || 0) * 1000,
        upstream: tracking(upstream, upstreamTrack),
        push: tracking(push, pushTrack),
        absentFromOrigin,
        worktrees: inspected.filter((tree) => tree.branch === name),
      };
    },
  );
  // A brand-new repository has an unborn branch, not a ref in for-each-ref.
  for (const tree of inspected)
    if (tree.branch && !branches.some((branch) => branch.name === tree.branch)) {
      branches.push({
        name: tree.branch,
        head: tree.head,
        subject: '',
        lastCommit: 0,
        upstream: { state: 'none' },
        push: { state: 'none' },
        absentFromOrigin: null,
        worktrees: inspected.filter((entry) => entry.branch === tree.branch),
      });
    }
  const remoteNames = remotes
    .split('\n')
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const remoteBranches = records(rawRemoteBranches).flatMap<WorkBranch>(([ref, head, symref, at, subject]) => {
    if (symref) return []; // origin/HEAD is an alias, not a separate branch.
    const name = ref.replace(/^refs\/remotes\//, '');
    const remoteName = remoteNames.find((remote) => name.startsWith(`${remote}/`)) || name.split('/')[0];
    return [
      {
        name,
        remoteName,
        head,
        subject,
        lastCommit: (Number(at) || 0) * 1000,
        upstream: { state: 'none' },
        push: { state: 'none' },
        absentFromOrigin: remoteName === 'origin' && origin === 'known' ? 0 : null,
        worktrees: [],
      },
    ];
  });
  return {
    root,
    commonDir: normalizedCommon,
    name: path.basename(root),
    checkedAt: Date.now(),
    origin,
    comparisonBase,
    branches,
    remoteBranches,
    detached: inspected.filter((tree) => !tree.branch && !tree.isBare),
    stashes: records(rawStashes).map(([name, message, hash, date], index) => ({ index, name, message, hash, date })),
    warnings,
  };
}

export const workOverviewHandlers = {
  workOverview: inRepo((repo) => inspectOverview(repo)),
};
