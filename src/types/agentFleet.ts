export type AgentHarness =
  | 'claude-code'
  | 'antigravity'
  | 'codex'
  | 'grok'
  | 'cursor'
  | 'aider'
  | 'custom';

export type AgentStatus = 'idle' | 'running' | 'stalled' | 'completed';

export interface AgentInstance {
  id: string;
  name: string;
  harness: AgentHarness;
  status: AgentStatus;
  branchName: string;
  worktreePath?: string;
  taskDescription: string;
  claimedFiles: string[];
  modifiedFiles: string[];
  lastHeartbeat: number;
  color: string;
}

export interface FileCollision {
  filePath: string;
  contendingAgents: string[];
  collisionType: 'direct_overlap' | 'claim_contention' | 'parallel_branch_divergence';
  details: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction: string;
}

export interface AgentFleetState {
  agents: AgentInstance[];
  collisions: FileCollision[];
  activeWorktrees: string[];
  indexLockDetected: boolean;
}

export interface AgentFileChange {
  path: string;
  additions: number;
  deletions: number;
  /** 'M' modified, 'A' added, 'D' deleted, 'R' renamed, '?' untracked */
  status: string;
}

export interface AgentActivityEvent {
  id: string;
  agentId: string;
  agentName: string;
  harness: AgentHarness;
  color: string;
  kind: 'commit' | 'uncommitted';
  /** Commit hash for commits; undefined for live working-tree changes */
  hash?: string;
  subject: string;
  timestamp: number;
  files: AgentFileChange[];
}

export interface AgentFileOwnership {
  filePath: string;
  agentIds: string[];
  additions: number;
  deletions: number;
}

export interface AgentActivityState {
  generatedAt: number;
  events: AgentActivityEvent[];
  fileOwnership: AgentFileOwnership[];
}
