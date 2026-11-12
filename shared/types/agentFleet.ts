import type { ChangedFile } from './git';

export type AgentHarness = 'claude-code' | 'antigravity' | 'codex' | 'grok' | 'cursor' | 'aider' | 'custom';

/** Derived from what the agent does: `running` while it recently changed files, `completed` once merged. */
export type AgentStatus = 'running' | 'idle' | 'completed';

export interface AgentInstance {
  id: string;
  name: string;
  harness: AgentHarness;
  status: AgentStatus;
  branchName: string;
  /** What the agent's branch started from; its changes are measured against this. */
  baseRef: string;
  worktreePath?: string;
  taskDescription: string;
  claimedFiles: string[];
  modifiedFiles: string[];
  /** Newest commit on the agent's branch or file edit in its worktree (ms since epoch). */
  lastActivity: number;
  /** Why the agent's work could not be read, e.g. its branch was deleted. */
  problem?: string;
}

export interface FileCollision {
  filePath: string;
  agentIds: string[];
  /** `overlap`: several agents changed the file. `claim`: one changed a file another claimed. */
  kind: 'overlap' | 'claim';
}

export interface AgentFleetState {
  agents: AgentInstance[];
  collisions: FileCollision[];
  /** A .git/index.lock old enough that no running git command can own it. */
  staleIndexLock: boolean;
}

export interface AgentActivityEvent {
  id: string;
  agentId: string;
  kind: 'commit' | 'uncommitted';
  /** Commit hash for commits; undefined for live working-tree changes */
  hash?: string;
  subject: string;
  timestamp: number;
  files: ChangedFile[];
}

export interface AgentFileOwnership {
  filePath: string;
  agentIds: string[];
  additions: number;
  deletions: number;
}

export interface AgentActivityState {
  events: AgentActivityEvent[];
  fileOwnership: AgentFileOwnership[];
}
