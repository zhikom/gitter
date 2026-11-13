import type { BlameLine, Commit, FileCommitHistory } from '../shared/types/git';
import { git, gitSucceeds } from './git';
import { changedFiles, format, parseDiff, records } from './gitParse';
import { inRepo, UserError } from './http';

export interface ReflogEntry {
  hash: string;
  selector: string;
  message: string;
  date: string;
}

async function commits(repo: string, limit: number): Promise<Commit[]> {
  if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', 'HEAD']))) return [];
  // Branches, tags and remotes only: other tools keep commits under their own
  // refs (checkpoints, stashes), and --all would put those in the graph.
  const out = await git(repo, [
    'log', '--branches', '--tags', '--remotes', 'HEAD', '--topo-order', `-n${limit}`, '--date=iso',
    format('%H', '%h', '%P', '%an', '%ae', '%ad', '%at', '%s', '%b', '%D'),
  ]);
  return records(out).map(([hash, shortHash, parents, name, email, date, at, summary, body, refs]) => ({
    hash,
    shortHash,
    parents: parents ? parents.split(' ') : [],
    author: { name, email },
    date,
    timestamp: Number(at) * 1000,
    summary,
    body: body.trim(),
    message: body.trim() ? `${summary}\n\n${body.trim()}` : summary,
    refs: refs ? refs.split(',').map((r) => r.trim()).filter(Boolean) : [],
  }));
}

function blame(output: string): BlameLine[] {
  const lines: Array<Omit<BlameLine, 'agePercent'> & { time: number }> = [];
  const commits = new Map<string, { author: string; time: number; summary: string }>();
  let hash = '';
  let lineNumber = 0;
  for (const line of output.split('\n')) {
    const header = line.match(/^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)/);
    if (header) {
      hash = header[1];
      lineNumber = Number(header[2]);
      if (!commits.has(hash)) commits.set(hash, { author: '', time: 0, summary: '' });
    } else if (line.startsWith('author ')) commits.get(hash)!.author = line.slice(7);
    else if (line.startsWith('author-time ')) commits.get(hash)!.time = Number(line.slice(12)) * 1000;
    else if (line.startsWith('summary ')) commits.get(hash)!.summary = line.slice(8);
    else if (line.startsWith('\t')) {
      const c = commits.get(hash)!;
      lines.push({
        lineNumber,
        code: line.slice(1),
        commitHash: hash,
        shortHash: hash.slice(0, 7),
        author: c.author,
        date: new Date(c.time).toISOString().slice(0, 10),
        summary: c.summary,
        time: c.time,
      });
    }
  }
  // Heatmap: 0.1 for the oldest line, 1 for the newest.
  // reduce rather than Math.min(...times): spreading a 200k-line file overflows the stack.
  const oldest = lines.reduce((min, l) => Math.min(min, l.time), Infinity);
  const range = lines.reduce((max, l) => Math.max(max, l.time), -Infinity) - oldest || 1;
  return lines.map(({ time, ...line }) => ({ ...line, agePercent: Math.max(0.1, (time - oldest) / range) }));
}

export const historyHandlers = {
  commits: inRepo((repo, { limit = 300 }: { limit?: number }) => commits(repo, limit)),

  /** Extend the graph to include a branch tip without changing the checkout. */
  commitsThrough: inRepo(async (repo, { hash }: { hash: string }) => {
    if (!/^[a-f\d]{40,64}$/i.test(hash)) throw new UserError('Invalid branch commit.');
    const hashes = (await git(repo, ['rev-list', '--topo-order', '--branches', '--tags', '--remotes', 'HEAD'])).trim().split('\n');
    const index = hashes.indexOf(hash);
    if (index < 0) throw new UserError('The branch commit is not in the current graph. Refresh the repository.');
    return commits(repo, index + 1);
  }),

  /** A commit's changes; merges are shown against their first parent. */
  commitDiff: inRepo(async (repo, { hash }: { hash: string }) =>
    parseDiff(await git(repo, ['show', '--format=', '--diff-merges=first-parent', '--end-of-options', hash]))
  ),

  /** `fromForkPoint`: compare from where `target` left `base` (what a pull request would show). */
  compareCommits: inRepo(async (repo, { base, target, fromForkPoint = false }: { base: string; target: string; fromForkPoint?: boolean }) => {
    const from = fromForkPoint ? (await git(repo, ['merge-base', '--end-of-options', base, target])).trim() : base;
    const range = ['--end-of-options', from, target];
    const [names, counts] = await Promise.all([
      git(repo, ['diff', '--name-status', '-z', ...range]),
      git(repo, ['diff', '--numstat', '-z', ...range]),
    ]);
    return changedFiles(names, counts);
  }),

  compareFileDiff: inRepo(async (repo, { base, target, file }: { base: string; target: string; file: string }) =>
    parseDiff(await git(repo, ['diff', '--end-of-options', base, target, '--', file]))
  ),

  blame: inRepo(async (repo, { file, revision }: { file: string; revision?: string }) => {
    if (revision && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)) throw new UserError('Invalid commit ID.');
    return blame(await git(repo, ['blame', '--line-porcelain', ...(revision ? [revision] : []), '--', file]));
  }),

  fileHistory: inRepo(async (repo, { file, revision }: { file: string; revision?: string }): Promise<FileCommitHistory[]> => {
    if (revision && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)) throw new UserError('Invalid commit ID.');
    // --name-only adds the file's path in each commit, which --follow tracks across renames.
    const out = await git(repo, ['log', '--follow', '--date=short', '--name-only', '--format=%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s', ...(revision ? ['--end-of-options', revision] : []), '--', file]);
    return out
      .split('\x1e')
      .filter((chunk) => chunk.trim())
      .map((chunk) => {
        const [header, ...names] = chunk.split('\n');
        const [hash, shortHash, author, date, summary] = header.split('\x1f');
        return { hash, shortHash, author, date, summary, path: names.filter(Boolean).pop() ?? file };
      });
  }),

  fileCommitDiff: inRepo(async (repo, { hash, file }: { hash: string; file: string }) =>
    parseDiff(await git(repo, ['show', '--format=', '--end-of-options', hash, '--', file]))
  ),

  reflog: inRepo(async (repo, { limit = 50 }: { limit?: number }): Promise<ReflogEntry[]> => {
    const out = await git(repo, ['reflog', `-n${limit}`, format('%H', '%gD', '%gs', '%ci')]);
    return records(out).map(([hash, selector, message, date]) => ({ hash, selector, message, date }));
  }),

  formatPatch: inRepo((repo, { hash }: { hash: string }) => git(repo, ['format-patch', '-1', '--stdout', '--end-of-options', hash])),
};
