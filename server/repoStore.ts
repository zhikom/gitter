// Gitter's own per-repository data lives in JSON documents under the repo's
// common git directory (`<git-common-dir>/gitter/<name>.json`), so all linked
// worktrees of one repository share it and nothing lands in the working tree.
import fs from 'fs';
import path from 'path';

/**
 * The git directory of one working tree. In a linked worktree `.git` is a file
 * containing `gitdir: <path>`. Per-worktree state (MERGE_HEAD, rebase-merge,
 * index.lock) lives here.
 */
export function worktreeGitDir(worktree: string): string {
  const dotGit = path.join(worktree, '.git');
  const stat = fs.statSync(dotGit, { throwIfNoEntry: false });
  if (!stat) throw new Error(`${worktree} is not a git repository.`);
  if (stat.isDirectory()) return dotGit;
  const target = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1].trim();
  if (!target) throw new Error(`${dotGit} does not point to a git directory.`);
  return path.resolve(worktree, target);
}

/** The git directory shared by every worktree of the repository. */
export function commonGitDir(worktree: string): string {
  const own = worktreeGitDir(worktree);
  const commondir = path.join(own, 'commondir');
  return fs.existsSync(commondir) ? path.resolve(own, fs.readFileSync(commondir, 'utf8').trim()) : own;
}

export function gitterDir(repo: string): string {
  return path.join(commonGitDir(repo), 'gitter');
}

function docPath(repo: string, name: string): string {
  return path.join(gitterDir(repo), `${name}.json`);
}

export async function readDoc<T>(repo: string, name: string, defaults: T): Promise<T> {
  try {
    const stored = JSON.parse(await fs.promises.readFile(docPath(repo, name), 'utf8'));
    return isPlainObject(defaults) && isPlainObject(stored) ? { ...defaults, ...stored } : stored;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return defaults;
    throw new Error(`Could not read ${docPath(repo, name)}: ${e.message}`);
  }
}

// Writes to one document run one after another, so two requests that each read,
// change and write the same document cannot lose each other's changes.
const queues = new Map<string, Promise<unknown>>();

export function updateDoc<T>(repo: string, name: string, defaults: T, change: (doc: T) => T): Promise<T> {
  const file = docPath(repo, name);
  const next = (queues.get(file) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const updated = change(await readDoc(repo, name, defaults));
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(updated, null, 2), 'utf8');
    await fs.promises.rename(temp, file);
    return updated;
  });
  queues.set(file, next);
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
