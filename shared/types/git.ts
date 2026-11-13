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
  /** A newer commit above continues into this one in its lane. */
  incoming: boolean;
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
  /** The file has no newline after this line ("\ No newline at end of file"). */
  noNewline?: boolean;
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
  /** The path before a rename. */
  oldPath?: string;
  isBinary: boolean;
  /** The file does not exist on the diff's old side. */
  isNew: boolean;
  /** The file does not exist on the diff's new side. */
  isDeleted: boolean;
  /** The file mode git reports for a created or deleted file, e.g. 100644. */
  mode?: string;
  hunks: DiffHunk[];
  rawDiff: string;
}

/** One file in a list of changes: a commit, a comparison, a stash, an agent's work. */
export interface ChangedFile {
  path: string;
  /** The path before a rename or copy. */
  oldPath?: string;
  /** Git's one-letter code: M modified, A added, D deleted, R renamed, C copied, T type change; ? untracked. */
  status: string;
  additions: number;
  deletions: number;
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
  /** The file's path in this commit; it differs from today's path before a rename. */
  path: string;
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
