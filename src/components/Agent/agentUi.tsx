import React from 'react';
import { AgentStatus } from '../../types/agentFleet';
import { AgentReviewStatus } from '../../types/agentReview';
import { HARNESS_REGISTRY, harnessColor } from '../../utils/agentFleet';

export const REVIEW_STATUS_META: Record<
  AgentReviewStatus,
  { label: string; box: string; dot: string }
> = {
  queued: { label: 'Queued', box: 'bg-white/[0.04] text-slate-400 ring-white/10', dot: 'bg-slate-500' },
  running: { label: 'Running', box: 'bg-sky-400/10 text-sky-300 ring-sky-400/25', dot: 'bg-sky-400 animate-pulse' },
  'needs-review': { label: 'Needs review', box: 'bg-amber-400/10 text-amber-200 ring-amber-400/30', dot: 'bg-amber-400 animate-pulse' },
  'changes-requested': { label: 'Changes requested', box: 'bg-violet-400/10 text-violet-200 ring-violet-400/25', dot: 'bg-violet-400' },
  approved: { label: 'Approved', box: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25', dot: 'bg-emerald-400' },
  merged: { label: 'Merged', box: 'bg-teal-400/10 text-teal-300 ring-teal-400/25', dot: 'bg-teal-400' },
  failed: { label: 'Stalled', box: 'bg-rose-400/10 text-rose-300 ring-rose-400/25', dot: 'bg-rose-400' },
};

export const AgentAvatar: React.FC<{
  name: string;
  harness: keyof typeof HARNESS_REGISTRY;
  color?: string;
  status?: AgentStatus;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}> = ({ name, harness, color, status, size = 'md', title }) => {
  const meta = HARNESS_REGISTRY[harness] ?? HARNESS_REGISTRY.custom;
  const tint = color || harnessColor(harness);
  const initials = name
    .replace(/\(.*\)/, '')
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || meta.label.slice(0, 2).toUpperCase();

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
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#131821] ${
            status === 'running'
              ? 'bg-sky-400 animate-pulse'
              : status === 'stalled'
              ? 'bg-rose-400'
              : status === 'completed'
              ? 'bg-emerald-400'
              : 'bg-slate-500'
          }`}
        />
      )}
    </span>
  );
};

export const ReviewStatusBadge: React.FC<{ status: AgentReviewStatus; className?: string }> = ({
  status,
  className = '',
}) => {
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

export const HarnessTag: React.FC<{ harness: keyof typeof HARNESS_REGISTRY; className?: string }> = ({
  harness,
  className = '',
}) => {
  const meta = HARNESS_REGISTRY[harness] ?? HARNESS_REGISTRY.custom;
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
