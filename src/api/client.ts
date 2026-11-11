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
import { VirtualBranch, VirtualBranchCommitPayload } from '../types/virtualBranch';
import { AgentActivityState, AgentFleetState, AgentHarness, AgentInstance } from '../types/agentFleet';
import {
  AgentDiffResponse,
  AgentReviewSnapshot,
  AgentReviewState,
} from '../types/agentReview';

// Desktop/Electron global extensions
declare global {
  interface Window {
    electronAPI?: {
      openDirectoryDialog: () => Promise<string | null>;
    };
  }
}

let cachedWorkingBase: string | null = null;

function getCandidateBases(): string[] {
  if (typeof window === 'undefined') return ['http://127.0.0.1:3001/api', 'http://localhost:3001/api'];

  const custom = localStorage.getItem('gitter_api_url');
  if (custom) return [custom.replace(/\/$/, '') + '/api'];

  const { hostname, port } = window.location;
  const candidates: string[] = [];

  if (cachedWorkingBase) {
    candidates.push(cachedWorkingBase);
  }

  // If already served directly by Express on port 3001, /api is preferred
  if (port === '3001') {
    candidates.push('/api');
  }

  // Host-matching candidate (prevents Private Network Access / PNA blocks in Edge/Chrome)
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    candidates.push(`http://${hostname}:3001/api`);
  }

  candidates.push('http://127.0.0.1:3001/api');
  candidates.push('http://localhost:3001/api');
  candidates.push('/api');

  // Return unique candidates preserving priority order
  return Array.from(new Set(candidates));
}

export function getApiBases(): string[] {
  return getCandidateBases();
}

function getAgentEventUrls(path: string): string[] {
  const query = `agent-events?path=${encodeURIComponent(path)}`;
  const bases = getCandidateBases();
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    bases.unshift('/api');
  }
  return Array.from(new Set(bases.map((base) => `${base.replace(/\/$/, '')}/${query}`)));
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const candidates = getCandidateBases();
  let lastError: Error | null = null;

  for (const base of candidates) {
    try {
      const fullUrl = `${base}${url}`;
      const res = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      const contentType = res.headers.get('content-type') || '';

      // If an endpoint returned HTML (e.g. Vite SPA index.html fallback when proxying times out or drops),
      // DO NOT accept it as valid API data - skip to the next candidate (direct port 3001)!
      if (!contentType.includes('application/json')) {
        const rawText = await res.text();
        if (rawText.includes('<!DOCTYPE') || rawText.includes('<html') || rawText.includes('<head>')) {
          lastError = new Error(`Candidate '${base}' returned SPA HTML fallback instead of JSON (Status ${res.status}).`);
          continue;
        }

        try {
          const parsed = JSON.parse(rawText);
          cachedWorkingBase = base;
          return parsed;
        } catch {
          lastError = new Error(`Candidate '${base}' returned non-JSON text (${res.status}): ${rawText.slice(0, 100)}`);
          continue;
        }
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `HTTP error ${res.status}`);
      }

      cachedWorkingBase = base;
      return await res.json();
    } catch (err: any) {
      lastError = err;
      // If error was an explicit API business-logic error (e.g. invalid git branch, rebase conflict),
      // re-throw immediately rather than attempting unrelated candidates
      if (
        err.message &&
        !err.message.includes('Failed to fetch') &&
        !err.message.includes('NetworkError') &&
        !err.message.includes('SPA HTML fallback') &&
        !err.message.includes('Load failed') &&
        !err.message.includes('non-JSON')
      ) {
        throw err;
      }
    }
  }

  throw new Error(
    `Cannot connect to Gitter backend daemon on port 3001. Please ensure 'npm run server' is running. (${lastError?.message || 'Connection failed'})`
  );
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

  // Virtual Branches (GitButler Innovation)
  getVirtualBranches: (path: string): Promise<VirtualBranch[]> =>
    fetchJson(`/repo/virtual-branches?path=${encodeURIComponent(path)}`),

  saveVirtualBranches: (path: string, branches: VirtualBranch[]) =>
    fetchJson<{ success: boolean }>('/repo/virtual-branches', { method: 'POST', body: JSON.stringify({ path, branches }) }),

  commitVirtualBranch: (path: string, payload: VirtualBranchCommitPayload) =>
    fetchJson<{ success: boolean; commitHash: string; branchName: string }>('/repo/virtual-branch/commit', {
      method: 'POST',
      body: JSON.stringify({ path, payload }),
    }),

  stashVirtualBranch: (path: string, files: string[]) =>
    fetchJson<{ success: boolean; patch: string }>('/repo/virtual-branch/stash', {
      method: 'POST',
      body: JSON.stringify({ path, files }),
    }),

  applyVirtualBranch: (path: string, patch: string) =>
    fetchJson<{ success: boolean }>('/repo/virtual-branch/apply', {
      method: 'POST',
      body: JSON.stringify({ path, patch }),
    }),

  // Stash Inspector
  getStashFiles: (path: string, index = 0) =>
    fetchJson<{
      files: Array<{ path: string; status: string; additions: number; deletions: number }>;
      summary: string;
    }>(`/repo/stash/inspect?path=${encodeURIComponent(path)}&index=${index}`),

  getStashFileDiff: (path: string, index: number, file: string): Promise<FileDiff[]> =>
    fetchJson(`/repo/stash/inspect/diff?path=${encodeURIComponent(path)}&index=${index}&file=${encodeURIComponent(file)}`),

  // File Commit Diff (for File History Timeline)
  getFileCommitDiff: (path: string, hash: string, file: string): Promise<FileDiff[]> =>
    fetchJson(`/repo/file-history/diff?path=${encodeURIComponent(path)}&hash=${encodeURIComponent(hash)}&file=${encodeURIComponent(file)}`),

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

  saveStash: (
    path: string,
    message: string,
    includeUntracked = true,
    files?: string[],
    keepWorkingChanges = false
  ) =>
    fetchJson('/repo/stash/save', {
      method: 'POST',
      body: JSON.stringify({ path, message, includeUntracked, files, keepWorkingChanges }),
    }),

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

  // Scan folder for Git repositories
  scanRepositories: (folderPath: string) =>
    fetchJson<Array<{
      name: string;
      path: string;
      currentBranch: string;
      isClean: boolean;
      lastCommit?: string;
      lastCommitDate?: string;
    }>>(`/repo/scan?path=${encodeURIComponent(folderPath)}`),

  // Native OS folder picker dialog
  pickNativeFolder: async (): Promise<{ path: string | null }> => {
    // 1. In Electron desktop runtime:
    if (typeof window !== 'undefined' && window.electronAPI?.openDirectoryDialog) {
      try {
        const electronDir = await window.electronAPI.openDirectoryDialog();
        if (electronDir) {
          return { path: electronDir.replace(/\\/g, '/') };
        }
      } catch (e) {
        console.warn('Electron directory picker error:', e);
      }
    }

    // 2. Fall back to backend native dialog (PowerShell on Windows, osascript on macOS, zenity on Linux)
    try {
      return await fetchJson<{ path: string | null }>('/dialog/pick-folder', { method: 'POST' });
    } catch (e: any) {
      console.warn('Backend pick-folder failed:', e);
      return { path: null };
    }
  },

  // Per-Repository Configuration
  getRepoConfig: (path: string) =>
    fetchJson<any>(`/repo/config?path=${encodeURIComponent(path)}`),

  saveRepoConfig: (path: string, config: any) =>
    fetchJson<{ success: boolean }>('/repo/config', {
      method: 'POST',
      body: JSON.stringify({ path, config }),
    }),

  // Gitflow Integration
  getGitflowStatus: (path: string) =>
    fetchJson<{
      initialized: boolean;
      config: any;
      currentBranch: string;
      features: string[];
      releases: string[];
      hotfixes: string[];
    }>(`/repo/gitflow?path=${encodeURIComponent(path)}`),

  gitflowInit: (path: string, config: any) =>
    fetchJson<{ success: boolean }>('/repo/gitflow/init', {
      method: 'POST',
      body: JSON.stringify({ path, config }),
    }),

  gitflowStart: (path: string, type: 'feature' | 'release' | 'hotfix', name: string) =>
    fetchJson<{ success: boolean; branch: string }>('/repo/gitflow/start', {
      method: 'POST',
      body: JSON.stringify({ path, type, name }),
    }),

  gitflowFinish: (path: string, type: 'feature' | 'release' | 'hotfix', name: string) =>
    fetchJson<{ success: boolean; message: string }>('/repo/gitflow/finish', {
      method: 'POST',
      body: JSON.stringify({ path, type, name }),
    }),

  // Multi-Agent Fleet Orchestrator & Collision Radar
  getAgentFleet: (path: string): Promise<AgentFleetState> =>
    fetchJson(`/agent-fleet?path=${encodeURIComponent(path)}`),

  getAgentActivity: (path: string): Promise<AgentActivityState> =>
    fetchJson(`/agent-activity?path=${encodeURIComponent(path)}`),

  registerAgent: (path: string, agent: Partial<AgentInstance>): Promise<AgentInstance> =>
    fetchJson('/agent-fleet/register', {
      method: 'POST',
      body: JSON.stringify({ path, agent }),
    }),

  spawnAgentWorktree: (
    path: string,
    harness: AgentHarness,
    taskName: string,
    baseBranch = 'HEAD'
  ): Promise<{ agent: AgentInstance; worktreePath: string }> =>
    fetchJson('/agent-fleet/spawn-worktree', {
      method: 'POST',
      body: JSON.stringify({ path, harness, taskName, baseBranch }),
    }),

  claimAgentFiles: (path: string, agentId: string, files: string[]): Promise<AgentFleetState> =>
    fetchJson('/agent-fleet/claim', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, files }),
    }),

  releaseAgent: (path: string, agentId: string, removeWorktree = false): Promise<{ success: boolean }> =>
    fetchJson('/agent-fleet/release', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, removeWorktree }),
    }),

  clearGitIndexLock: (path: string): Promise<{ success: boolean; cleared: boolean }> =>
    fetchJson('/agent-fleet/clear-lock', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  runAgentCommand: (path: string, command: string): Promise<{ success: boolean; output: string }> =>
    fetchJson('/agent-fleet/run-command', {
      method: 'POST',
      body: JSON.stringify({ path, command }),
    }),

  // Agent Review Inbox, checkpoints, and the review last mile
  getAgentReview: (path: string): Promise<AgentReviewState> =>
    fetchJson(`/agent-review?path=${encodeURIComponent(path)}`),

  getAgentReviewDiff: (path: string, agentId: string, file?: string): Promise<AgentDiffResponse> =>
    fetchJson(
      `/agent-review/diff?path=${encodeURIComponent(path)}&agentId=${encodeURIComponent(agentId)}${
        file ? `&file=${encodeURIComponent(file)}` : ''
      }`
    ),

  checkpointAgent: (path: string, agentId: string, label?: string): Promise<AgentReviewState> =>
    fetchJson('/agent-review/checkpoint', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, label }),
    }),

  rollbackAgent: (path: string, agentId: string, checkpointId?: string): Promise<AgentReviewState> =>
    fetchJson('/agent-review/rollback', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, checkpointId }),
    }),

  approveAgentChanges: (
    path: string,
    agentId: string,
    message: string,
    mode: 'commit' | 'merge' = 'commit'
  ): Promise<{
    review: AgentReviewState;
    committed: boolean;
    merged: boolean;
    commitHash?: string;
    message: string;
  }> =>
    fetchJson('/agent-review/approve', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, message, mode }),
    }),

  requestAgentChanges: (path: string, agentId: string, feedback: string): Promise<AgentReviewState> =>
    fetchJson('/agent-review/request-changes', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, feedback }),
    }),

  discardAgentChanges: (path: string, agentId: string): Promise<AgentReviewState> =>
    fetchJson('/agent-review/discard', {
      method: 'POST',
      body: JSON.stringify({ path, agentId }),
    }),

  rejectAgentHunk: (path: string, agentId: string, patch: string): Promise<AgentDiffResponse> =>
    fetchJson('/agent-review/hunk', {
      method: 'POST',
      body: JSON.stringify({ path, agentId, patch, action: 'reject' }),
    }),

  // Live fleet + review state over Server-Sent Events, with URL failover.
  subscribeAgentEvents: (
    path: string,
    onSnapshot: (snapshot: AgentReviewSnapshot) => void,
    onConnectionChange?: (connected: boolean) => void
  ): (() => void) => {
    const urls = getAgentEventUrls(path);
    let source: EventSource | null = null;
    let index = 0;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!closed) retry = setTimeout(connect, 1500);
    };

    const connect = () => {
      if (closed) return;
      const url = urls[index % urls.length];
      try {
        source = new EventSource(url);
      } catch {
        index += 1;
        schedule();
        return;
      }
      source.onopen = () => onConnectionChange?.(true);
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'state' && data.fleet && data.review) {
            onSnapshot({ fleet: data.fleet, review: data.review });
          }
        } catch {
          // Ignore malformed events and wait for the next snapshot.
        }
      };
      source.onerror = () => {
        onConnectionChange?.(false);
        source?.close();
        index += 1;
        schedule();
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  },

  // Zero-Friction In-Place Software Updater
  inPlaceUpdate: (targetVersion: string, downloadUrl?: string, assetName?: string) =>
    fetchJson<{ success: boolean; method: string; message: string }>('/app/in-place-update', {
      method: 'POST',
      body: JSON.stringify({ targetVersion, downloadUrl, assetName }),
    }),

  // OS Native URL Opener (Opens in default web browser without sandboxed webview blocks)
  openExternalUrl: async (url: string): Promise<{ success: boolean }> => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternalUrl) {
      try {
        await (window as any).electronAPI.openExternalUrl(url);
        return { success: true };
      } catch (e) {
        console.warn('Electron openExternalUrl error:', e);
      }
    }
    return fetchJson<{ success: boolean }>('/open-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },
};
