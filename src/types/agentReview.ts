import { AgentFileChange, AgentFleetState, AgentHarness, AgentStatus } from './agentFleet';

export type AgentReviewStatus =
  | 'queued'
  | 'running'
  | 'needs-review'
  | 'changes-requested'
  | 'approved'
  | 'merged'
  | 'failed';

export interface AgentCheckpoint {
  id: string;
  agentId: string;
  createdAt: number;
  /** Branch HEAD captured before the agent run started. */
  head: string;
  /** `git stash create` commit for dirty files, when present. */
  worktreeHead?: string;
  baseBranch: string;
  label: string;
}

export interface AgentReviewItem {
  id: string;
  agentId: string;
  agentName: string;
  harness: AgentHarness;
  color: string;
  branchName: string;
  worktreePath?: string;
  taskDescription: string;
  /** Review lifecycle state, independent from the harness process state. */
  status: AgentReviewStatus;
  /** Process state reported by the fleet. */
  agentStatus: AgentStatus;
  files: AgentFileChange[];
  additions: number;
  deletions: number;
  commitsAhead: number;
  collisions: string[];
  checkpoint?: AgentCheckpoint;
  feedback?: string;
  createdAt: number;
  updatedAt: number;
  lastHeartbeat: number;
}

export type AgentAttentionKind =
  | 'review'
  | 'collision'
  | 'error'
  | 'index-lock'
  | 'stalled'
  | 'completed';

export interface AgentAttentionItem {
  id: string;
  kind: AgentAttentionKind;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  agentId?: string;
  createdAt: number;
}

export interface AgentReviewState {
  generatedAt: number;
  baseBranch: string;
  items: AgentReviewItem[];
  attention: AgentAttentionItem[];
}

export interface AgentReviewSnapshot {
  fleet: AgentFleetState;
  review: AgentReviewState;
}

export interface AgentDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface AgentDiffResponse {
  agentId: string;
  baseBranch: string;
  files: AgentDiffFile[];
  rawDiff: string;
}
