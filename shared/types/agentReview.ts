import type { ChangedFile, FileDiff } from './git';
import type { AgentFleetState, AgentHarness, AgentStatus } from './agentFleet';

export type AgentReviewStatus = 'queued' | 'running' | 'needs-review' | 'changes-requested' | 'approved' | 'merged';

export interface AgentCheckpoint {
  id: string;
  createdAt: number;
  /** The agent branch's HEAD when the checkpoint was taken. */
  head: string;
  /** A `git stash create` commit holding uncommitted files, when there were any. */
  worktreeStash?: string;
  label: string;
}

export interface AgentReviewItem {
  agentId: string;
  agentName: string;
  harness: AgentHarness;
  branchName: string;
  baseRef: string;
  worktreePath?: string;
  taskDescription: string;
  /** Review lifecycle state, separate from whether the agent is working. */
  status: AgentReviewStatus;
  agentStatus: AgentStatus;
  files: ChangedFile[];
  additions: number;
  deletions: number;
  commitsAhead: number;
  /** Files this agent shares with another agent. */
  collisions: string[];
  checkpoint?: AgentCheckpoint;
  feedback?: string;
  updatedAt: number;
  lastActivity: number;
}

export interface AgentReviewSnapshot {
  fleet: AgentFleetState;
  reviews: AgentReviewItem[];
}

export interface AgentDiff {
  agentId: string;
  baseRef: string;
  files: ChangedFile[];
  diffs: FileDiff[];
}
