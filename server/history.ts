import path from 'node:path';
import type { BlameLine, Commit, FileCommitHistory, SelectionHistoryRevision } from '../shared/types/git';
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

/** A literal, repository-relative file path; never allow a revision expression or traversal. */
function historyPath(file: unknown): string {
  if (typeof file !== 'string' || !file || file.includes('\0') || path.isAbsolute(file) || path.win32.isAbsolute(file) || file.split(/[\\/]/).some((part) => part === '..' || part === '.')) {
    throw new UserError('Choose a file inside the repository.');
  }
  return file;
}

async function committedFile(repo: string, file: string, revision?: string): Promise<{ revision: string; lines: string[] }> {
  historyPath(file);
  if (revision && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)) throw new UserError('Invalid commit ID.');
  const hash = (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${revision || 'HEAD'}^{commit}`])).trim();
  const object = `${hash}:${file}`;
  const size = Number((await git(repo, ['cat-file', '-s', object])).trim());
  if (!Number.isFinite(size) || size > 2_000_000) throw new UserError('Selection history supports files up to 2 MB.');
  const text = await git(repo, ['show', '--end-of-options', object]);
  if (text.includes('\0')) throw new UserError('Selection history is available for text files.');
  const lines = text ? text.split('\n') : [];
  if (text.endsWith('\n')) lines.pop();
  if (lines.length > 20_000) throw new UserError('Selection history supports files with up to 20,000 lines.');
  return { revision: hash, lines };
}

export const historyHandlers = {
  commits: inRepo((repo, { limit = 300 }: { limit?: number }) => commits(repo, limit)),

  /** Search changed lines as a literal string, optionally inside a directory. */
  searchHistory: inRepo(async (repo, { text = '', directory = '' }: { text?: string; directory?: string }): Promise<FileCommitHistory[]> => {
    if (typeof text !== 'string' || text.length > 200 || /[\0\r\n]/.test(text)) throw new UserError('Enter one line of search text (up to 200 characters).');
    if (directory) historyPath(directory);
    if (!text && !directory) throw new UserError('Enter text or a directory to search.');
    // -G matches additions and removals, including replacements where the number
    // of occurrences is unchanged. Escape POSIX extended-regex metacharacters.
    const literal = text.replace(/[\\.\[\]{}()*+?^$|]/g, '\\$&');
    const out = await git(repo, ['log', '--branches', '--tags', '--remotes', 'HEAD', '--date=short', '-n300', '--format=%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s', ...(text ? [`-G${literal}`] : []), '--', ...(directory ? [directory] : [])]);
    return out.split('\x1e').filter((chunk) => chunk.trim()).map((chunk) => {
      const [hash, shortHash, author, date, summary] = chunk.trim().split('\x1f');
      return { hash, shortHash, author, date, summary, path: directory };
    });
  }),

  /** A branch timeline follows the selected tip without checking it out. */
  branchHistory: inRepo(async (repo, { hash }: { hash: string }): Promise<Commit[]> => {
    if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(hash)) throw new UserError('Invalid branch commit.');
    const out = await git(repo, ['log', '--topo-order', '-n100', '--date=iso', format('%H', '%h', '%P', '%an', '%ae', '%ad', '%at', '%s', '%b', '%D'), '--end-of-options', hash]);
    return records(out).map(([id, shortHash, parents, name, email, date, at, summary, body, refs]) => ({
      hash: id, shortHash, parents: parents ? parents.split(' ') : [], author: { name, email }, date, timestamp: Number(at) * 1000,
      summary, body: body.trim(), message: body.trim() ? `${summary}\n\n${body.trim()}` : summary,
      refs: refs ? refs.split(',').map((r) => r.trim()).filter(Boolean) : [],
    }));
  }),

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

  /** Show committed source so a line selection has unambiguous revision coordinates. */
  selectionSource: inRepo(async (repo, { file, revision }: { file: string; revision?: string }) => committedFile(repo, file, revision)),

  /** Trace the chosen lines back from exactly the revision displayed in the picker. */
  selectionHistory: inRepo(async (repo, { file, revision, start, end }: { file: string; revision: string; start: number; end: number }): Promise<SelectionHistoryRevision[]> => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new UserError('Select a valid range of lines.');
    const source = await committedFile(repo, file, revision);
    if (end > source.lines.length) throw new UserError('The selected lines do not exist in that revision.');
    const out = await git(repo, ['log', '--date=short', '--format=%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s', `-L${start},${end}:${file}`, '--end-of-options', source.revision]);
    return out.split('\x1e').filter((chunk) => chunk.trim()).map((chunk) => {
      const newline = chunk.indexOf('\n');
      const [hash, shortHash, author, date, summary] = chunk.slice(0, newline).split('\x1f');
      const diff = parseDiff(chunk.slice(newline + 1))[0];
      return { hash, shortHash, author, date, summary, path: diff?.path ?? file, diff };
    });
  }),

  fileCommitDiff: inRepo(async (repo, { hash, file }: { hash: string; file: string }) =>
    parseDiff(await git(repo, ['show', '--format=', '--end-of-options', hash, '--', file]))
  ),

  /** Compare a historical file to staged and unstaged changes in the working tree. */
  compareFileWithWorking: inRepo(async (repo, { hash, file, historicalPath }: { hash: string; file: string; historicalPath: string }) => {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(hash)) throw new UserError('Invalid commit ID.');
    historyPath(file); historyPath(historicalPath);
    const paths = [...new Set([historicalPath, file])];
    return parseDiff(await git(repo, ['diff', '--find-renames', '--end-of-options', hash, '--', ...paths]));
  }),

  reflog: inRepo(async (repo, { limit = 50 }: { limit?: number }): Promise<ReflogEntry[]> => {
    const out = await git(repo, ['reflog', `-n${limit}`, format('%H', '%gD', '%gs', '%ci')]);
    return records(out).map(([hash, selector, message, date]) => ({ hash, selector, message, date }));
  }),

  formatPatch: inRepo((repo, { hash }: { hash: string }) => git(repo, ['format-patch', '-1', '--stdout', '--end-of-options', hash])),
};
