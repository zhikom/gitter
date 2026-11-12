// Parsers for git's machine-readable output. Every command that produces one of
// these formats is run with -z or the separators below, so paths with spaces,
// quotes or non-ASCII characters come through unquoted.
import type { ChangedFile, DiffHunk, FileDiff, FileStatus, GitFileState } from '../shared/types/git';

/** Field and record separators for `--format`: `%x1f` between fields, `%x1e` after each record. */
export const FIELD = '%x1f';
export const RECORD = '%x1e';

export function format(...placeholders: string[]): string {
  return `--format=${placeholders.join(FIELD)}${RECORD}`;
}

/** The same separators for `git for-each-ref --format`, which writes bytes as %1f rather than %x1f. */
export function refFormat(...atoms: string[]): string {
  return `--format=${atoms.join('%1f')}%1e`;
}

/** Splits output of a command run with `format(...)` or `refFormat(...)` into rows of fields. */
export function records(output: string): string[][] {
  return output
    .split('\x1e')
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.length > 0)
    .map((r) => r.split('\x1f'));
}

export interface StatusEntry {
  /** Index (staged) state, from porcelain v1's X column. */
  x: string;
  /** Working-tree state, from porcelain v1's Y column. */
  y: string;
  path: string;
  oldPath?: string;
}

/** Arguments that produce what `parseStatus` reads. */
export const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '-uall'];

export function parseStatus(output: string): StatusEntry[] {
  const parts = output.split('\0');
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length < 4) continue;
    const entry: StatusEntry = { x: part[0], y: part[1], path: part.slice(3) };
    // Renames and copies are followed by the original path as its own field.
    if (entry.x === 'R' || entry.x === 'C') entry.oldPath = parts[++i];
    entries.push(entry);
  }
  return entries;
}

export function isConflict({ x, y }: StatusEntry): boolean {
  return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

function stateOf(code: string): GitFileState {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
    case 'C':
      return 'renamed';
    case '?':
      return 'untracked';
    default:
      return 'modified';
  }
}

/** One row per side: a file with staged and unstaged changes appears twice. */
export function toFileStatuses(entries: StatusEntry[]): FileStatus[] {
  const statuses: FileStatus[] = [];
  for (const entry of entries) {
    if (isConflict(entry)) {
      statuses.push({ path: entry.path, status: 'conflicted', staged: false });
      continue;
    }
    if (entry.x !== ' ' && entry.x !== '?') {
      statuses.push({ path: entry.path, oldPath: entry.oldPath, status: stateOf(entry.x), staged: true });
    }
    if (entry.y !== ' ') {
      statuses.push({ path: entry.path, oldPath: entry.oldPath, status: stateOf(entry.y), staged: false });
    }
  }
  return statuses;
}

export interface FileChangeCount {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}

/** Parses `--numstat -z`. Binary files report "-" and count as 0. */
export function parseNumstat(output: string): FileChangeCount[] {
  const parts = output.split('\0');
  const files: FileChangeCount[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].replace(/^\n/, '');
    if (!part) continue;
    const [adds, dels, path] = part.split('\t');
    const counts = { additions: Number(adds) || 0, deletions: Number(dels) || 0 };
    // A rename has an empty path here, then the old and new paths as fields.
    if (path === '') {
      files.push({ ...counts, oldPath: parts[i + 1], path: parts[i + 2] });
      i += 2;
    } else {
      files.push({ ...counts, path });
    }
  }
  return files;
}

export interface NameStatus {
  /** A, M, D, R, C, T or U; the similarity score of R and C is dropped. */
  status: string;
  path: string;
  oldPath?: string;
}

/** Parses `--name-status -z`. */
export function parseNameStatus(output: string): NameStatus[] {
  const parts = output.split('\0');
  const files: NameStatus[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].replace(/^\n/, '');
    if (!code) continue;
    const status = code[0];
    if (status === 'R' || status === 'C') {
      files.push({ status, oldPath: parts[i + 1], path: parts[i + 2] });
      i += 2;
    } else {
      files.push({ status, path: parts[++i] });
    }
  }
  return files;
}

/** Joins numstat counts onto name-status rows: the shape the UI's file lists use. */
export function changedFiles(nameStatus: string, numstat: string): ChangedFile[] {
  const counts = new Map(parseNumstat(numstat).map((c) => [c.path, c]));
  return parseNameStatus(nameStatus).map((f) => ({
    path: f.path,
    oldPath: f.oldPath,
    status: f.status,
    additions: counts.get(f.path)?.additions ?? 0,
    deletions: counts.get(f.path)?.deletions ?? 0,
  }));
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function diffPath(field: string, prefix: string): string | undefined {
  const value = field.replace(/\t.*$/, '');
  if (value === '/dev/null') return undefined;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/** Parses unified diff output (`git diff`, `git show`, `git stash show -p`) into files and hunks. */
export function parseDiff(output: string): FileDiff[] {
  return output
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith('diff --git '))
    .map(parseFileDiff);
}

function parseFileDiff(text: string): FileDiff {
  const lines = text.replace(/\n$/, '').split('\n');
  let oldPath: string | undefined;
  let newPath: string | undefined;
  let isNew = false;
  let isDeleted = false;
  let mode: string | undefined;
  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | null = null;
  let raw: string[] = [];
  let oldNo = 0;
  let newNo = 0;

  const finishHunk = () => {
    if (hunk) hunks.push({ ...hunk, rawHunk: raw.join('\n') });
  };

  for (const line of lines) {
    const header = line.match(HUNK_HEADER);
    if (header) {
      finishHunk();
      oldNo = Number(header[1]);
      newNo = Number(header[3]);
      hunk = {
        header: line,
        oldStart: oldNo,
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: newNo,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
        rawHunk: '',
      };
      raw = [line];
      continue;
    }
    if (!hunk) {
      if (line.startsWith('--- ')) {
        oldPath = diffPath(line.slice(4), 'a/');
        isNew = oldPath === undefined;
      } else if (line.startsWith('+++ ')) {
        newPath = diffPath(line.slice(4), 'b/');
        isDeleted = newPath === undefined;
      } else if (line.startsWith('new file mode ')) {
        isNew = true;
        mode = line.slice('new file mode '.length);
      } else if (line.startsWith('deleted file mode ')) {
        isDeleted = true;
        mode = line.slice('deleted file mode '.length);
      }
      else if (line.startsWith('rename from ')) oldPath = line.slice('rename from '.length);
      else if (line.startsWith('rename to ')) newPath = line.slice('rename to '.length);
      continue;
    }
    raw.push(line);
    if (line.startsWith('+')) hunk.lines.push({ type: 'add', text: line.slice(1), newLineNumber: newNo++ });
    else if (line.startsWith('-')) hunk.lines.push({ type: 'delete', text: line.slice(1), oldLineNumber: oldNo++ });
    else if (line.startsWith(' ')) {
      hunk.lines.push({ type: 'context', text: line.slice(1), oldLineNumber: oldNo++, newLineNumber: newNo++ });
    } else if (line.startsWith('\\') && hunk.lines.length > 0) {
      hunk.lines[hunk.lines.length - 1].noNewline = true;
    }
  }
  finishHunk();

  // Binary and mode-only changes have no ---/+++ lines; the header names the file.
  // `diff --git a/P b/P` with equal paths splits evenly even when P has spaces.
  if (!oldPath && !newPath) {
    const rest = lines[0].slice('diff --git '.length);
    newPath = rest.slice(2, (rest.length - 1) / 2);
  }
  const path = (newPath ?? oldPath)!;
  return {
    path,
    oldPath: oldPath && oldPath !== path ? oldPath : undefined,
    isBinary: /^(Binary files |GIT binary patch)/m.test(text),
    isNew,
    isDeleted,
    mode,
    hunks,
    rawDiff: text,
  };
}
