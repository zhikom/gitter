import { AgentHarness, AgentInstance, FileCollision } from '../types/agentFleet';

export interface HarnessMeta {
  id: AgentHarness;
  label: string;
  sublabel: string;
  color: string;
}

// Single source of truth for harness identity. Server and client both read this.
export const HARNESS_REGISTRY: Record<AgentHarness, HarnessMeta> = {
  'claude-code': { id: 'claude-code', label: 'Claude Code', sublabel: 'Anthropic Terminal Agent', color: '#c084fc' },
  antigravity: { id: 'antigravity', label: 'Antigravity', sublabel: 'Google DeepMind CLI & IDE', color: '#34d399' },
  codex: { id: 'codex', label: 'Codex / Canvas', sublabel: 'OpenAI Autonomous Agent', color: '#60a5fa' },
  grok: { id: 'grok', label: 'Grok Build', sublabel: 'xAI Coding Engine', color: '#fb923c' },
  cursor: { id: 'cursor', label: 'Cursor Background', sublabel: 'Cursor Composer Subagent', color: '#22d3ee' },
  aider: { id: 'aider', label: 'Aider', sublabel: 'Git-Paired Terminal AI', color: '#f472b6' },
  custom: { id: 'custom', label: 'Custom Agent', sublabel: 'Any other harness', color: '#eab308' },
};

export const AGENT_BRANCH_PREFIX = 'agent/';

// Matches the longest harness id first, so `claude-code-foo` resolves to claude-code, not claude.
export function harnessFromBranch(branchName: string): AgentHarness {
  const slug = branchName.startsWith(AGENT_BRANCH_PREFIX)
    ? branchName.slice(AGENT_BRANCH_PREFIX.length)
    : branchName;
  const ids = (Object.keys(HARNESS_REGISTRY) as AgentHarness[])
    .filter((id) => id !== 'custom')
    .sort((a, b) => b.length - a.length);
  return ids.find((id) => slug === id || slug.startsWith(`${id}-`)) ?? 'custom';
}

export function harnessColor(harness: AgentHarness): string {
  return HARNESS_REGISTRY[harness]?.color ?? HARNESS_REGISTRY.custom.color;
}

export function detectCollisions(agents: AgentInstance[]): FileCollision[] {
  type Contender = { agentId: string; name: string; isMod: boolean; isClaim: boolean };
  const contenders = new Map<string, Contender[]>();

  const touch = (file: string, agent: AgentInstance, kind: 'isMod' | 'isClaim') => {
    const list = contenders.get(file) ?? [];
    const existing = list.find((c) => c.agentId === agent.id);
    if (existing) {
      existing[kind] = true;
    } else {
      list.push({ agentId: agent.id, name: agent.name, isMod: kind === 'isMod', isClaim: kind === 'isClaim' });
    }
    contenders.set(file, list);
  };

  for (const agent of agents) {
    if (agent.status === 'completed') continue;
    agent.modifiedFiles.forEach((f) => touch(f, agent, 'isMod'));
    agent.claimedFiles.forEach((f) => touch(f, agent, 'isClaim'));
  }

  const collisions: FileCollision[] = [];
  for (const [filePath, list] of contenders) {
    if (list.length < 2) continue;
    const modCount = list.filter((c) => c.isMod).length;
    const names = list.map((c) => c.name);

    if (modCount > 1) {
      collisions.push({
        filePath,
        contendingAgents: names,
        collisionType: 'direct_overlap',
        severity: 'high',
        details: `Concurrent edits detected! ${names.join(' and ')} are modifying '${filePath}' simultaneously. High risk of overwrite or merge conflict.`,
        suggestedAction: 'Isolate tasks into dedicated Git worktrees or partition file modifications into distinct commits before merging.',
      });
    } else {
      collisions.push({
        filePath,
        contendingAgents: names,
        collisionType: 'claim_contention',
        severity: 'medium',
        details: `Territory claim contention: '${filePath}' is claimed by one agent while touched by ${names.join(' & ')}.`,
        suggestedAction: 'Review agent file assignments in the Fleet Orchestrator to ensure clean domain boundaries.',
      });
    }
  }
  return collisions;
}
