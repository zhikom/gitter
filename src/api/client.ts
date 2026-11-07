import {
  AIExplanation,
  AIMessage,
  BlameLine,
  Branch,
  Commit,
  FileCommitHistory,
  FileDiff,
  FileStatus,
  GitConfig,
  GitHubUser,
  PullRequest,
  RebaseCommitItem,
  Remote,
  RepositoryState,
  Stash,
  Submodule,
  Tag,
  Worktree,
} from '../types/git';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Repository
  getRepoState: (path: string): Promise<RepositoryState> =>
    fetchJson(`/repo/state?path=${encodeURIComponent(path)}`),

  getFileStatuses: (path: string): Promise<FileStatus[]> =>
    fetchJson(`/repo/statuses?path=${encodeURIComponent(path)}`),

  getCommits: (path: string, limit = 300): Promise<Commit[]> =>
    fetchJson(`/repo/commits?path=${encodeURIComponent(path)}&limit=${limit}`),

  getDiff: (path: string, file: string, staged: boolean, ignoreWhitespace = false): Promise<FileDiff[]> =>
    fetchJson(`/repo/diff?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}&staged=${staged}&ignoreWhitespace=${ignoreWhitespace}`),

  getCommitDiff: (path: string, hash: string): Promise<{ files: string[]; rawDiff: string }> =>
    fetchJson(`/repo/commit-diff?path=${encodeURIComponent(path)}&hash=${hash}`),

  // Staging
  stageFile: (path: string, file: string) =>
    fetchJson('/repo/stage', { method: 'POST', body: JSON.stringify({ path, file }) }),

  unstageFile: (path: string, file: string) =>
    fetchJson('/repo/unstage', { method: 'POST', body: JSON.stringify({ path, file }) }),

  stageAll: (path: string) =>
    fetchJson('/repo/stage-all', { method: 'POST', body: JSON.stringify({ path }) }),

  unstageAll: (path: string) =>
    fetchJson('/repo/unstage-all', { method: 'POST', body: JSON.stringify({ path }) }),

  discardFile: (path: string, file: string) =>
    fetchJson('/repo/discard', { method: 'POST', body: JSON.stringify({ path, file }) }),

  discardAll: (path: string) =>
    fetchJson('/repo/discard-all', { method: 'POST', body: JSON.stringify({ path }) }),

  commit: (path: string, summary: string, description: string, amend: boolean) =>
    fetchJson<{ success: boolean; output: string }>('/repo/commit', {
      method: 'POST',
      body: JSON.stringify({ path, summary, description, amend }),
    }),

  // Branches
  getBranches: (path: string): Promise<Branch[]> =>
    fetchJson(`/repo/branches?path=${encodeURIComponent(path)}`),

  createBranch: (path: string, name: string, startPoint = 'HEAD') =>
    fetchJson('/repo/branch/create', { method: 'POST', body: JSON.stringify({ path, name, startPoint }) }),

  checkoutBranch: (path: string, name: string) =>
    fetchJson('/repo/branch/checkout', { method: 'POST', body: JSON.stringify({ path, name }) }),

  deleteBranch: (path: string, name: string, force = false) =>
    fetchJson('/repo/branch/delete', { method: 'POST', body: JSON.stringify({ path, name, force }) }),

  renameBranch: (path: string, oldName: string, newName: string) =>
    fetchJson('/repo/branch/rename', { method: 'POST', body: JSON.stringify({ path, oldName, newName }) }),

  revealInExplorer: (path: string, file?: string) =>
    fetchJson<{ success: boolean; error?: string }>('/repo/reveal', { method: 'POST', body: JSON.stringify({ path, file }) }),

  openInVsCode: (path: string, file?: string) =>
    fetchJson<{ success: boolean; error?: string }>('/repo/open-vscode', { method: 'POST', body: JSON.stringify({ path, file }) }),

  openInTerminal: (path: string) =>
    fetchJson<{ success: boolean; error?: string }>('/repo/open-terminal', { method: 'POST', body: JSON.stringify({ path }) }),

  openExternalDiff: (path: string, file: string, staged = false, customCmd?: string) =>
    fetchJson<{ success: boolean; error?: string }>('/repo/external-diff', { method: 'POST', body: JSON.stringify({ path, file, staged, customCmd }) }),

  getReflog: (path: string, limit = 50) =>
    fetchJson<Array<{ hash: string; selector: string; action: string; message: string; date: string }>>(
      `/repo/reflog?path=${encodeURIComponent(path)}&limit=${limit}`
    ),

  createPatch: (path: string, hash: string) =>
    fetchJson<{ success: boolean; patch: string }>('/repo/create-patch', { method: 'POST', body: JSON.stringify({ path, hash }) }),

  // Line & Hunk Patch Operations
  stagePatch: (path: string, patch: string) =>
    fetchJson<{ success: boolean }>('/repo/patch/stage', { method: 'POST', body: JSON.stringify({ path, patch }) }),

  unstagePatch: (path: string, patch: string) =>
    fetchJson<{ success: boolean }>('/repo/patch/unstage', { method: 'POST', body: JSON.stringify({ path, patch }) }),

  discardPatch: (path: string, patch: string) =>
    fetchJson<{ success: boolean }>('/repo/patch/discard', { method: 'POST', body: JSON.stringify({ path, patch }) }),

  // Commit Comparison / Range Diff
  compareCommits: (path: string, base: string, target: string) =>
    fetchJson<{
      files: Array<{ path: string; status: string; additions: number; deletions: number }>;
      summary: string;
    }>(`/repo/compare?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`),

  getComparisonFileDiff: (path: string, base: string, target: string, file: string): Promise<FileDiff[]> =>
    fetchJson(`/repo/compare/file?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}&file=${encodeURIComponent(file)}`),

  // File content at git ref
  getFileAtRef: (path: string, ref: string, file: string) =>
    fetchJson<{ content: string }>(`/repo/file/ref?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}&file=${encodeURIComponent(file)}`),

  // Conflict manual resolution
  saveConflictResolution: (path: string, file: string, content: string, stage = true) =>
    fetchJson<{ success: boolean }>('/repo/conflict/resolve-manual', { method: 'POST', body: JSON.stringify({ path, file, content, stage }) }),

  // 1-Click Undo
  undoLastAction: (path: string) =>
    fetchJson<{ success: boolean; message: string; action: string }>('/repo/undo', { method: 'POST', body: JSON.stringify({ path }) }),

  // Remotes
  getRemotes: (path: string): Promise<Remote[]> =>
    fetchJson(`/repo/remotes?path=${encodeURIComponent(path)}`),

  fetchRepo: (path: string, remote = 'origin') =>
    fetchJson<{ success: boolean; output: string }>('/repo/fetch', { method: 'POST', body: JSON.stringify({ path, remote }) }),

  pull: (path: string, remote = 'origin', branch = '', rebase = false) =>
    fetchJson<{ success: boolean; output: string }>('/repo/pull', { method: 'POST', body: JSON.stringify({ path, remote, branch, rebase }) }),

  push: (path: string, remote = 'origin', branch = '', forceWithLease = false) =>
    fetchJson<{ success: boolean; output: string }>('/repo/push', { method: 'POST', body: JSON.stringify({ path, remote, branch, forceWithLease }) }),

  // Stashes
  getStashes: (path: string): Promise<Stash[]> =>
    fetchJson(`/repo/stashes?path=${encodeURIComponent(path)}`),

  saveStash: (path: string, message: string, includeUntracked = true) =>
    fetchJson('/repo/stash/save', { method: 'POST', body: JSON.stringify({ path, message, includeUntracked }) }),

  popStash: (path: string, index = 0) =>
    fetchJson('/repo/stash/pop', { method: 'POST', body: JSON.stringify({ path, index }) }),

  applyStash: (path: string, index = 0) =>
    fetchJson<{ success: boolean; output: string }>('/repo/stash/apply', { method: 'POST', body: JSON.stringify({ path, index }) }),

  dropStash: (path: string, index = 0) =>
    fetchJson('/repo/stash/drop', { method: 'POST', body: JSON.stringify({ path, index }) }),

  // Tags
  getTags: (path: string): Promise<Tag[]> =>
    fetchJson(`/repo/tags?path=${encodeURIComponent(path)}`),

  createTag: (path: string, name: string, commitHash = 'HEAD', message?: string) =>
    fetchJson('/repo/tag/create', { method: 'POST', body: JSON.stringify({ path, name, commitHash, message }) }),

  deleteTag: (path: string, name: string) =>
    fetchJson('/repo/tag/delete', { method: 'POST', body: JSON.stringify({ path, name }) }),

  pushTag: (path: string, tag: string, remote = 'origin') =>
    fetchJson<{ success: boolean; output: string }>('/repo/tag/push', { method: 'POST', body: JSON.stringify({ path, tag, remote }) }),

  // History
  revert: (path: string, hash: string) =>
    fetchJson('/repo/revert', { method: 'POST', body: JSON.stringify({ path, hash }) }),

  reset: (path: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    fetchJson('/repo/reset', { method: 'POST', body: JSON.stringify({ path, hash, mode }) }),

  cherryPick: (path: string, hash: string) =>
    fetchJson('/repo/cherry-pick', { method: 'POST', body: JSON.stringify({ path, hash }) }),

  merge: (path: string, branch: string) =>
    fetchJson<{ success: boolean; output: string }>('/repo/merge', { method: 'POST', body: JSON.stringify({ path, branch }) }),

  rebase: (path: string, upstream: string) =>
    fetchJson<{ success: boolean; output: string }>('/repo/rebase', { method: 'POST', body: JSON.stringify({ path, upstream }) }),

  initRepo: (path: string) =>
    fetchJson('/repo/init', { method: 'POST', body: JSON.stringify({ path }) }),

  cloneRepo: (url: string, targetPath: string) =>
    fetchJson('/repo/clone', { method: 'POST', body: JSON.stringify({ url, targetPath }) }),

  // Blame & File History
  getBlame: (path: string, file: string): Promise<BlameLine[]> =>
    fetchJson(`/repo/blame?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}`),

  getFileHistory: (path: string, file: string): Promise<FileCommitHistory[]> =>
    fetchJson(`/repo/file-history?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}`),

  // Worktrees
  getWorktrees: (path: string): Promise<Worktree[]> =>
    fetchJson(`/repo/worktrees?path=${encodeURIComponent(path)}`),

  addWorktree: (path: string, targetPath: string, branch: string) =>
    fetchJson('/repo/worktree/add', { method: 'POST', body: JSON.stringify({ path, targetPath, branch }) }),

  removeWorktree: (path: string, targetPath: string) =>
    fetchJson('/repo/worktree/remove', { method: 'POST', body: JSON.stringify({ path, targetPath }) }),

  // Submodules
  getSubmodules: (path: string): Promise<Submodule[]> =>
    fetchJson(`/repo/submodules?path=${encodeURIComponent(path)}`),

  updateSubmodules: (path: string) =>
    fetchJson<{ success: boolean; output: string }>('/repo/submodule/update', { method: 'POST', body: JSON.stringify({ path }) }),

  // Interactive Rebase
  getRebaseCommits: (path: string, base: string): Promise<RebaseCommitItem[]> =>
    fetchJson(`/repo/rebase/commits?path=${encodeURIComponent(path)}&base=${encodeURIComponent(base)}`),

  executeRebase: (path: string, baseHash: string, plan: RebaseCommitItem[]) =>
    fetchJson<{ success: boolean; output: string }>('/repo/rebase/execute', {
      method: 'POST',
      body: JSON.stringify({ path, baseHash, plan }),
    }),

  // Git Config & Signing
  getGitConfig: (path: string): Promise<GitConfig> =>
    fetchJson(`/repo/config?path=${encodeURIComponent(path)}`),

  setGitConfig: (path: string, key: string, value: string) =>
    fetchJson('/repo/config', { method: 'POST', body: JSON.stringify({ path, key, value }) }),

  // GitHub
  getGithubStatus: (): Promise<GitHubUser> => fetchJson('/github/status'),

  getPullRequests: (path: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> =>
    fetchJson(`/github/prs?path=${encodeURIComponent(path)}&state=${state}`),

  getPullRequestDetails: (path: string, number: number): Promise<PullRequest | null> =>
    fetchJson(`/github/pr-details?path=${encodeURIComponent(path)}&number=${number}`),

  createPullRequest: (path: string, title: string, body: string, head: string, base = 'main', isDraft = false) =>
    fetchJson<{ url: string; number: number }>('/github/pr/create', {
      method: 'POST',
      body: JSON.stringify({ path, title, body, head, base, isDraft }),
    }),

  checkoutPullRequest: (path: string, number: number) =>
    fetchJson<{ success: boolean; output: string }>('/github/pr/checkout', {
      method: 'POST',
      body: JSON.stringify({ path, number }),
    }),

  generatePrDescription: (commits: string[], diffSummary: string) =>
    fetchJson<{ title: string; body: string }>('/ai/pr-description', {
      method: 'POST',
      body: JSON.stringify({ commits, diffSummary }),
    }),

  // AI
  generateCommitMessage: (diffText: string, stagedFiles: string[]) =>
    fetchJson<{ summary: string; description: string }>('/ai/commit-message', {
      method: 'POST',
      body: JSON.stringify({ diffText, stagedFiles }),
    }),

  explainChanges: (diffText: string, contextTitle: string): Promise<AIExplanation> =>
    fetchJson('/ai/explain', {
      method: 'POST',
      body: JSON.stringify({ diffText, contextTitle }),
    }),

  resolveConflict: (fileContent: string, filePath: string) =>
    fetchJson<{ suggestion: string; rationale: string }>('/ai/conflict-resolve', {
      method: 'POST',
      body: JSON.stringify({ fileContent, filePath }),
    }),

  chatWithAgent: (message: string, repoContext: any) =>
    fetchJson<{ reply: string; suggestedCommand?: string }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, repoContext }),
    }),

  getAiConfig: () => fetchJson<any>('/ai/config'),
  saveAiConfig: (config: any) => fetchJson('/ai/config', { method: 'POST', body: JSON.stringify(config) }),
};
