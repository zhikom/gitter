import {
  AIExplanation,
  AIMessage,
  Branch,
  Commit,
  FileDiff,
  FileStatus,
  Remote,
  RepositoryState,
  Stash,
  Tag,
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

  getDiff: (path: string, file: string, staged: boolean): Promise<FileDiff[]> =>
    fetchJson(`/repo/diff?path=${encodeURIComponent(path)}&file=${encodeURIComponent(file)}&staged=${staged}`),

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

  dropStash: (path: string, index = 0) =>
    fetchJson('/repo/stash/drop', { method: 'POST', body: JSON.stringify({ path, index }) }),

  // Tags
  getTags: (path: string): Promise<Tag[]> =>
    fetchJson(`/repo/tags?path=${encodeURIComponent(path)}`),

  createTag: (path: string, name: string, commitHash = 'HEAD', message?: string) =>
    fetchJson('/repo/tag/create', { method: 'POST', body: JSON.stringify({ path, name, commitHash, message }) }),

  deleteTag: (path: string, name: string) =>
    fetchJson('/repo/tag/delete', { method: 'POST', body: JSON.stringify({ path, name }) }),

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
