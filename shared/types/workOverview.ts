import type { FileStatus, Stash, Worktree } from './git';

export interface WorktreeState extends Worktree {
  files: FileStatus[] | null;
  problem?: string;
  rebase: boolean;
  merge: boolean;
  /** Detached HEAD commits absent from the last-fetched origin refs. */
  absentFromOrigin?: number | null;
}

export interface TrackingState {
  name?: string;
  state: 'none' | 'known' | 'gone' | 'unknown';
  ahead?: number;
  behind?: number;
}

export interface WorkBranch {
  name: string;
  /** Set for a remote-tracking ref; local branches have no remoteName. */
  remoteName?: string;
  head: string;
  subject: string;
  lastCommit: number;
  upstream: TrackingState;
  push: TrackingState;
  /** Commits absent from every locally known origin branch; null means unknown. */
  absentFromOrigin: number | null;
  worktrees: WorktreeState[];
}

export interface WorkOverview {
  root: string;
  commonDir: string;
  name: string;
  checkedAt: number;
  origin: 'known' | 'no-remote' | 'not-fetched';
  /** A locally known origin default branch, when it can be determined. */
  comparisonBase?: string;
  branches: WorkBranch[];
  remoteBranches: WorkBranch[];
  detached: WorktreeState[];
  /** Stashes belong to the repository, not to a particular worktree. */
  stashes: Stash[];
  warnings: string[];
}

export interface WorkSession {
  id: string;
  provider: 'codex' | 'claude';
  title: string;
  cwd: string;
  branch?: string;
  updatedAt: number;
  /** The discovery source, not a claim that the session is running. */
  source: string;
}

export interface WorkSessionLink {
  repo: string;
  branch: string;
  worktree: string;
  provider: 'codex' | 'claude';
  id: string;
}

export interface WorkSessions {
  sessions: WorkSession[];
  warnings: string[];
}

export interface WorkSummary {
  completed: string[];
  remaining: string[];
  nextSteps: string[];
  uncertainties: string[];
  evidence: string[];
  includedConversation: boolean;
  truncated: boolean;
}
