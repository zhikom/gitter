// Rules about agents that the backend and the UI must agree on: which harnesses
// exist, how agent branches are named, how review states order, and when two
// agents collide. Presentation (colors, labels, wording) lives in the UI.
import type { AgentHarness, AgentInstance, FileCollision } from './types/agentFleet';
import type { AgentReviewStatus } from './types/agentReview';

export const HARNESSES: readonly AgentHarness[] = ['claude-code', 'antigravity', 'codex', 'grok', 'cursor', 'aider', 'custom'];

export const AGENT_BRANCH_PREFIX = 'agent/';

/** `agent/<harness>-<task slug>`: the harness is recoverable from the branch name. */
export function agentBranchName(harness: AgentHarness, task: string): string {
  const slug = task.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
  return `${AGENT_BRANCH_PREFIX}${harness}-${slug}`;
}

// The longest id wins, so `claude-code-x` is claude-code and not a shorter id.
export function harnessFromBranch(branch: string): AgentHarness {
  const slug = branch.startsWith(AGENT_BRANCH_PREFIX) ? branch.slice(AGENT_BRANCH_PREFIX.length) : branch;
  const ids = HARNESSES.filter((id) => id !== 'custom').sort((a, b) => b.length - a.length);
  return ids.find((id) => slug === id || slug.startsWith(`${id}-`)) ?? 'custom';
}

/** Trailers on commits Gitter makes for an agent, so the history records which agent wrote them. */
export const HARNESS_TRAILER = 'Agent-Harness';

export function agentTrailers(agent: Pick<AgentInstance, 'harness' | 'branchName'>): string {
  return `${HARNESS_TRAILER}: ${agent.harness}\nAgent-Branch: ${agent.branchName}`;
}

/** Review states in the order the inbox lists them: what needs a person first. */
export const REVIEW_ORDER: readonly AgentReviewStatus[] = [
  'needs-review',
  'changes-requested',
  'running',
  'approved',
  'merged',
  'queued',
];

/** An agent with work in progress counts as running while it changed something this recently. */
export const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

/** Files that more than one active agent changed or claimed. */
export function detectCollisions(agents: AgentInstance[]): FileCollision[] {
  const byFile = new Map<string, Map<string, { modified: boolean; claimed: boolean }>>();
  const touch = (file: string, agentId: string, kind: 'modified' | 'claimed') => {
    const agentsOnFile = byFile.get(file) ?? new Map();
    const entry = agentsOnFile.get(agentId) ?? { modified: false, claimed: false };
    entry[kind] = true;
    agentsOnFile.set(agentId, entry);
    byFile.set(file, agentsOnFile);
  };
  for (const agent of agents) {
    if (agent.status === 'completed') continue;
    agent.modifiedFiles.forEach((f) => touch(f, agent.id, 'modified'));
    agent.claimedFiles.forEach((f) => touch(f, agent.id, 'claimed'));
  }
  const collisions: FileCollision[] = [];
  for (const [filePath, agentsOnFile] of byFile) {
    if (agentsOnFile.size < 2) continue;
    const modifiers = [...agentsOnFile.values()].filter((e) => e.modified).length;
    collisions.push({
      filePath,
      agentIds: [...agentsOnFile.keys()],
      // Two agents editing one file will conflict; an edit inside another's claim may.
      kind: modifiers > 1 ? 'overlap' : 'claim',
    });
  }
  return collisions;
}
