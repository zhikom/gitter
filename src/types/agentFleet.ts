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
