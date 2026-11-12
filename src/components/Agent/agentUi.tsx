// How agents look in the UI: harness names and colors, review state badges,
// and the wording of collisions and attention items. The rules behind them
// (branch names, collision detection, review order) live in shared/agents.ts.
import React from 'react';
import type { AgentFleetState, AgentHarness, AgentInstance, AgentStatus, FileCollision } from '../../../shared/types/agentFleet';
import type { AgentReviewItem, AgentReviewStatus } from '../../../shared/types/agentReview';

export const HARNESS_META: Record<AgentHarness, { label: string; sublabel: string; color: string }> = {
  'claude-code': { label: 'Claude Code', sublabel: 'Anthropic terminal agent', color: '#c084fc' },
  antigravity: { label: 'Antigravity', sublabel: 'Google DeepMind CLI & IDE', color: '#34d399' },
  codex: { label: 'Codex', sublabel: 'OpenAI coding agent', color: '#60a5fa' },
  grok: { label: 'Grok Build', sublabel: 'xAI coding agent', color: '#fb923c' },
  cursor: { label: 'Cursor', sublabel: 'Cursor background agent', color: '#22d3ee' },
  aider: { label: 'Aider', sublabel: 'Git-paired terminal AI', color: '#f472b6' },
  custom: { label: 'Custom agent', sublabel: 'Any other harness', color: '#eab308' },
};

export const harnessColor = (harness: AgentHarness) => (HARNESS_META[harness] ?? HARNESS_META.custom).color;

export const REVIEW_STATUS_META: Record<AgentReviewStatus, { label: string; box: string; dot: string }> = {
  queued: { label: 'Queued', box: 'bg-white/[0.04] text-slate-400 ring-white/10', dot: 'bg-slate-500' },
  running: { label: 'Running', box: 'bg-sky-400/10 text-sky-300 ring-sky-400/25', dot: 'bg-sky-400 animate-pulse' },
  'needs-review': { label: 'Needs review', box: 'bg-amber-400/10 text-amber-200 ring-amber-400/30', dot: 'bg-amber-400 animate-pulse' },
  'changes-requested': { label: 'Changes requested', box: 'bg-violet-400/10 text-violet-200 ring-violet-400/25', dot: 'bg-violet-400' },
  approved: { label: 'Approved', box: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', dot: 'bg-emerald-400' },
  merged: { label: 'Merged', box: 'bg-teal-400/10 text-teal-300 ring-teal-400/25', dot: 'bg-teal-400' },
};

const AGENT_STATUS_DOT: Record<AgentStatus, string> = {
  running: 'bg-sky-400 animate-pulse',
  idle: 'bg-slate-500',
  completed: 'bg-emerald-400',
};

export const AgentAvatar: React.FC<{
  name: string;
  harness: AgentHarness;
  status?: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}> = ({ name, harness, status, size = 'md', title }) => {
  const tint = harnessColor(harness);
  const initials =
    name
      .replace(/\(.*\)/, '')
      .split(/[\s\-_]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || HARNESS_META[harness].label.slice(0, 2).toUpperCase();
  const dimensions = size === 'sm' ? 'w-6 h-6 text-[9px]' : size === 'lg' ? 'w-10 h-10 text-xs' : 'w-8 h-8 text-[10px]';

  return (
    <span className="relative inline-flex flex-shrink-0" title={title || name}>
      <span
        className={`${dimensions} rounded-lg flex items-center justify-center font-bold tracking-wide ring-1 ring-inset ring-white/10`}
        style={{ backgroundColor: `${tint}1f`, color: tint }}
      >
        {initials}
      </span>
      {status && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#131821] ${AGENT_STATUS_DOT[status]}`} />
      )}
    </span>
  );
};

export const ReviewStatusBadge: React.FC<{ status: AgentReviewStatus; className?: string }> = ({ status, className = '' }) => {
  const meta = REVIEW_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ring-inset ${meta.box} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

export const HarnessTag: React.FC<{ harness: AgentHarness; className?: string }> = ({ harness, className = '' }) => {
  const meta = HARNESS_META[harness] ?? HARNESS_META.custom;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-white/10 ${className}`}
      style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
};

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatSigned(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`;
}

const AI_CO_AUTHORS: Array<[RegExp, AgentHarness]> = [
  [/claude/i, 'claude-code'],
  [/codex|openai/i, 'codex'],
  [/gemini|antigravity/i, 'antigravity'],
  [/grok/i, 'grok'],
  [/cursor/i, 'cursor'],
  [/aider/i, 'aider'],
];

/** Which AI agent wrote a commit, by its Agent-Harness or Co-authored-by trailer. */
export function aiAuthorOf(body: string): AgentHarness | null {
  const harness = body.match(/^Agent-Harness:\s*(\S+)/im)?.[1];
  if (harness && harness in HARNESS_META) return harness as AgentHarness;
  for (const line of body.match(/^Co-authored-by:.*$/gim) ?? []) {
    const match = AI_CO_AUTHORS.find(([pattern]) => pattern.test(line));
    if (match) return match[1];
  }
  return null;
}

/** Display names of the agents in a collision, for agents still in the fleet. */
export function collisionAgents(collision: FileCollision, agents: AgentInstance[]): string[] {
  return collision.agentIds.map((id) => agents.find((a) => a.id === id)?.name ?? id);
}

export const COLLISION_TEXT: Record<FileCollision['kind'], { label: string; advice: string }> = {
  overlap: {
    label: 'Both editing',
    advice: 'These edits will likely conflict. Let one agent finish, or split the work so each owns different files.',
  },
  claim: {
    label: 'Claimed file',
    advice: 'One agent changed a file another agent claimed. Check that the change belongs to the claiming agent\'s task.',
  },
};

export interface AttentionItem {
  id: string;
  kind: 'review' | 'collision' | 'index-lock' | 'problem';
  /** High interrupts with an error toast; medium with an info toast. */
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  agentId?: string;
}

/** What in the fleet needs a person: reviews to make, collisions, a stuck index lock, unreadable agents. */
export function attentionItems(fleet: AgentFleetState, reviews: AgentReviewItem[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const review of reviews) {
    if (review.status === 'needs-review') {
      const count = review.files.length;
      items.push({
        id: `review:${review.agentId}`,
        kind: 'review',
        severity: 'high',
        title: `${review.agentName} is ready for review`,
        detail: `${count} file${count === 1 ? '' : 's'} · ${formatSigned(review.additions, review.deletions)}`,
        agentId: review.agentId,
      });
    } else if (review.status === 'changes-requested') {
      items.push({
        id: `changes:${review.agentId}`,
        kind: 'review',
        severity: 'medium',
        title: `Changes requested from ${review.agentName}`,
        detail: review.feedback || 'Waiting for the agent to address your feedback.',
        agentId: review.agentId,
      });
    }
  }
  for (const agent of fleet.agents) {
    if (agent.problem) {
      items.push({ id: `problem:${agent.id}`, kind: 'problem', severity: 'high', title: `Can't read ${agent.name}`, detail: agent.problem, agentId: agent.id });
    }
  }
  for (const collision of fleet.collisions) {
    items.push({
      id: `collision:${collision.filePath}`,
      kind: 'collision',
      severity: collision.kind === 'overlap' ? 'high' : 'medium',
      title: `${collisionAgents(collision, fleet.agents).join(' and ')} on ${collision.filePath}`,
      detail: COLLISION_TEXT[collision.kind].advice,
    });
  }
  if (fleet.staleIndexLock) {
    items.push({
      id: 'index-lock',
      kind: 'index-lock',
      severity: 'high',
      title: 'Stale .git/index.lock',
      detail: 'A git process that is no longer running left the index locked. Clear the lock to continue.',
    });
  }
  return items;
}
