import fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import type { RepositoryState } from '../shared/types/git';
import { git } from './git';
import { format, isConflict, parseStatus, records, STATUS_ARGS } from './gitParse';
import { inRepo, UserError } from './http';
import * as os from './osIntegration';
import { worktreeGitDir } from './repoStore';
import type { OpenInApp } from '../shared/types/openIn';

export interface ScannedRepo {
  name: string;
  path: string;
  currentBranch: string;
  isClean: boolean;
  lastCommit: string;
}

async function currentBranch(repo: string): Promise<{ name: string; detached: boolean }> {
  const name = (await git(repo, ['branch', '--show-current'])).trim();
  if (name) return { name, detached: false };
  const sha = (await git(repo, ['rev-parse', '--short', 'HEAD'])).trim();
  return { name: `HEAD (${sha})`, detached: true };
}

async function repoState(repo: string): Promise<RepositoryState> {
  const root = (await git(repo, ['rev-parse', '--show-toplevel'])).trim();
  const [branch, status] = await Promise.all([currentBranch(root), git(root, STATUS_ARGS)]);
  const counts = { stagedCount: 0, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0 };
  for (const entry of parseStatus(status)) {
    if (isConflict(entry)) counts.conflictedCount++;
    else if (entry.x === '?') counts.untrackedCount++;
    else {
      if (entry.x !== ' ') counts.stagedCount++;
      if (entry.y !== ' ') counts.unstagedCount++;
    }
  }
  const gitDir = worktreeGitDir(root);
  return {
    path: root,
    name: path.basename(root),
    currentBranch: branch.name,
    isDetached: branch.detached,
    isClean: Object.values(counts).every((n) => n === 0),
    ...counts,
    isRebasing: fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply')),
    isMerging: fs.existsSync(path.join(gitDir, 'MERGE_HEAD')),
  };
}

// Folders that hold build output or dependencies, never repositories worth listing.
const SKIPPED_FOLDERS = new Set([
  'node_modules', 'target', 'dist', 'build', 'vendor', '.git', '.cache', '.vscode', '.idea',
  'AppData', 'bin', 'obj', 'venv', '.venv', 'env', '__pycache__',
]);
const SCAN_DEPTH = 3;

async function describeRepo(dir: string, name: string): Promise<ScannedRepo> {
  const [branch, status, last] = await Promise.all([
    currentBranch(dir).then((b) => b.name, () => 'unknown'),
    git(dir, STATUS_ARGS).then((s) => s.length === 0, () => true),
    // A repository without commits has no log; that is not an error here.
    git(dir, ['log', '-1', format('%s', '%cr')]).then((out) => records(out)[0], () => undefined),
  ]);
  return {
    name,
    path: dir.replace(/\\/g, '/'),
    currentBranch: branch,
    isClean: status,
    lastCommit: last ? `${last[0]} (${last[1]})` : '',
  };
}

/** Finds git repositories in a folder and up to three levels below it. */
async function scan(folder: string): Promise<ScannedRepo[]> {
  const root = path.resolve(folder.replace(/^["']|["']$/g, '').trim());
  if (!fs.existsSync(root)) throw new UserError(`${root} does not exist.`);
  if (fs.existsSync(path.join(root, '.git'))) return [await describeRepo(root, path.basename(root))];

  const found: Array<{ dir: string; name: string }> = [];
  const visit = async (dir: string, prefix: string, depth: number): Promise<void> => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !SKIPPED_FOLDERS.has(e.name) && !e.name.startsWith('.'))
        .map(async (e) => {
          const child = path.join(dir, e.name);
          const name = prefix ? `${prefix}/${e.name}` : e.name;
          if (fs.existsSync(path.join(child, '.git'))) found.push({ dir: child, name });
          else if (depth < SCAN_DEPTH) await visit(child, name, depth + 1);
        })
    );
  };
  await visit(root, '', 1);
  const repos = await Promise.all(found.map((r) => describeRepo(r.dir, r.name)));
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export const repositoryHandlers = {
  repoState: inRepo((repo) => repoState(repo)),

  scanRepositories: ({ folder }: { folder: string }) => scan(folder),

  initRepo: async ({ folder }: { folder: string }) => {
    await fs.promises.mkdir(folder, { recursive: true });
    await git(folder, ['init']);
  },

  cloneRepo: async ({ url, folder, githubAuth = false }: { url: string; folder: string; githubAuth?: boolean }) => {
    const expanded = folder === '~' ? homedir() : /^~[\\/]/.test(folder) ? path.join(homedir(), folder.slice(2)) : folder;
    const target = path.resolve(expanded);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    let githubHttps = false;
    try { const remote = new URL(url); githubHttps = remote.protocol === 'https:' && remote.hostname === 'github.com' && !remote.username && !remote.password && (!remote.port || remote.port === '443'); } catch { /* SSH and local remotes */ }
    const credentials = githubAuth && githubHttps ? ['-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential'] : [];
    await git(path.dirname(target), [...credentials, 'clone', '--end-of-options', url, target], { env: { GH_PROMPT_DISABLED: '1' } });
    return target.replace(/\\/g, '/');
  },

  revealInFileManager: inRepo((repo, { file }: { file?: string }) =>
    os.revealInFileManager(file ? path.join(repo, file) : repo)
  ),

  openInEditor: inRepo((repo, { file }: { file?: string }) => os.openInEditor(file ? path.join(repo, file) : repo)),

  openCodingApp: inRepo((repo, { app }: { app: 'codex' | 'claude' }) => os.openCodingApp(repo, app)),

  openInApplication: inRepo((repo, { app }: { app: OpenInApp }) => os.openInApplication(repo, app)),

  openTerminal: inRepo((repo) => os.openTerminal(repo)),
};
