import React from 'react';
import { Bot, Inbox, Plus, Radio } from 'lucide-react';
import type { AgentReviewItem } from '../../../shared/types/agentReview';
import { AgentAvatar } from './agentUi';

interface AgentRailProps {
  reviews: AgentReviewItem[];
  connected: boolean;
  selectedAgentId: string | null;
  onOpenInbox: () => void;
  onOpenFleet: () => void;
  onSpawn: () => void;
  onSelectAgent: (agentId: string) => void;
}

export const AgentRail: React.FC<AgentRailProps> = ({
  reviews: items,
  connected,
  selectedAgentId,
  onOpenInbox,
  onOpenFleet,
  onSpawn,
  onSelectAgent,
}) => {
  const needsReview = items.filter((item) => item.status === 'needs-review').length;

  return (
    <nav
      aria-label="Agent rail"
      className="w-14 flex-shrink-0 bg-[#10141b] border-r border-[#2a3447] flex flex-col items-center py-2 gap-1.5 z-20"
    >
      <button
        onClick={onOpenFleet}
        title="Open Agent Fleet"
        className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500/25 to-sky-500/20 ring-1 ring-inset ring-teal-400/30 flex items-center justify-center text-teal-200 hover:ring-teal-300/60 transition"
      >
        <Bot className="w-4 h-4" />
        {connected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#10141b]" />
        )}
      </button>

      <button
        onClick={onOpenInbox}
        title={`Review Inbox${needsReview > 0 ? ` · ${needsReview} ready` : ''}`}
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition ${
          needsReview > 0
            ? 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/40 hover:bg-amber-400/25'
            : 'bg-white/[0.04] text-slate-400 ring-1 ring-inset ring-white/[0.06] hover:text-slate-200'
        }`}
      >
        <Inbox className="w-4 h-4" />
        {needsReview > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">
            {needsReview > 9 ? '9+' : needsReview}
          </span>
        )}
      </button>

      <button
        onClick={onSpawn}
        title="Spawn agent sandbox"
        className="w-9 h-9 rounded-lg bg-white/[0.03] text-slate-500 ring-1 ring-inset ring-white/[0.06] hover:text-teal-300 hover:ring-teal-400/30 transition flex items-center justify-center"
      >
        <Plus className="w-4 h-4" />
      </button>

      <div className="w-6 h-px bg-white/[0.08] my-1" />

      <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-1.5 px-1">
        {items.map((item) => {
          const hasCollision = item.collisions.length > 0;
          return (
            <button
              key={item.agentId}
              onClick={() => onSelectAgent(item.agentId)}
              title={`${item.agentName} · ${item.status.replace('-', ' ')}${hasCollision ? ' · collision' : ''}`}
              className={`relative p-0.5 rounded-lg transition ${
                selectedAgentId === item.agentId
                  ? 'ring-2 ring-teal-400/70 bg-teal-400/10'
                  : 'ring-1 ring-transparent hover:ring-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <AgentAvatar
                name={item.agentName}
                harness={item.harness}
                status={item.agentStatus}
                size="sm"
              />
              {hasCollision && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#10141b]" />
              )}
              {item.status === 'needs-review' && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-300 ring-2 ring-[#10141b]" />
              )}
            </button>
          );
        })}
        {items.length === 0 && (
          <span className="text-[8px] uppercase tracking-widest text-slate-700 [writing-mode:vertical-rl] py-2">No agents</span>
        )}
      </div>

      <div className="w-6 h-px bg-white/[0.08] my-1" />
      <span
        title={connected ? 'Live stream connected' : 'Reconnecting to live stream…'}
        className={`w-9 h-7 rounded-md flex items-center justify-center ${
          connected ? 'text-emerald-400' : 'text-slate-600'
        }`}
      >
        <Radio className="w-3.5 h-3.5" />
      </span>
    </nav>
  );
};
