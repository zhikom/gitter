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
