export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: {
    name: string;
    email: string;
  };
  date: string;
  timestamp: number;
  message: string;
  summary: string;
  body: string;
  refs: string[];
  isWip?: boolean;
}

export type RouteType = 'direct' | 'branch' | 'merge' | 'pass-through';

export interface GraphRoute {
  fromLane: number;
  toLane: number;
  type: RouteType;
  color: string;
}

export interface GraphNode {
  commit: Commit;
  lane: number;
  color: string;
  routes: GraphRoute[];
  passingLanes: number[];
}

export type GitFileState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface FileStatus {
  path: string;
  oldPath?: string;
  status: GitFileState;
  staged: boolean;
  insertions?: number;
  deletions?: number;
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  rawHunk: string;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isBinary: boolean;
  hunks: DiffHunk[];
  rawDiff: string;
}

export interface Branch {
  name: string;
  current: boolean;
  isRemote: boolean;
  remoteName?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  targetHash: string;
}

export interface Tag {
  name: string;
  targetHash: string;
  message?: string;
}

export interface Stash {
  index: number;
  name: string;
  message: string;
  hash: string;
  date: string;
}

export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface RepositoryState {
  path: string;
  name: string;
  currentBranch: string;
  isDetached: boolean;
  isClean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  isRebasing?: boolean;
  isMerging?: boolean;
}

export interface AIExplanation {
  summary: string;
  keyChanges: string[];
  riskAssessment: 'low' | 'medium' | 'high';
  riskReasoning?: string;
  suggestedAction?: string;
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  suggestedCommand?: string;
  suggestedAction?: () => void;
  isLoading?: boolean;
}

export interface BlameLine {
  lineNumber: number;
  code: string;
  commitHash: string;
  shortHash: string;
  author: string;
  date: string;
  summary: string;
  agePercent: number; // 0 to 1 for heatmap
}

export interface FileCommitHistory {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  summary: string;
}

export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  isBare: boolean;
  isCurrent: boolean;
}

export interface Submodule {
  name: string;
  path: string;
  commitHash: string;
  branch?: string;
}

export type RebaseActionType = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop';

export interface RebaseCommitItem {
  hash: string;
  shortHash: string;
  author: string;
  summary: string;
  action: RebaseActionType;
  newSummary?: string;
}

export interface GitConfig {
  userName?: string;
  userEmail?: string;
  signingKey?: string;
  gpgSign?: boolean;
  gpgFormat?: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  author: {
    login: string;
    avatarUrl?: string;
  };
  headRefName: string;
  baseRefName: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  mergeable?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}
