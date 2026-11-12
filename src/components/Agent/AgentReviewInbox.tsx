// Agents' work in the order it needs you: ready for review first. Decisions are
// made in the run drawer; the inbox is for triage.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Columns2, Eye, Inbox, RefreshCw, X } from 'lucide-react';
import type { AgentReviewItem, AgentReviewStatus } from '../../../shared/types/agentReview';
import type { AgentActions } from '../../hooks/useAgentActions';
import { useEscape } from '../ui/useEscape';
import { AgentAvatar, formatSigned, HarnessTag, ReviewStatusBadge, timeAgo } from './agentUi';

type InboxFilter = 'all' | 'waiting' | 'working' | 'done';

const FILTERS: Array<{ id: InboxFilter; label: string; statuses?: AgentReviewStatus[] }> = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting for you', statuses: ['needs-review'] },
  { id: 'working', label: 'Working', statuses: ['running', 'queued', 'changes-requested'] },
  { id: 'done', label: 'Done', statuses: ['approved', 'merged'] },
];

interface AgentReviewInboxProps {
  reviews: AgentReviewItem[];
  actions: AgentActions;
  onClose: () => void;
  onRefresh: () => void;
  onOpenAgent: (agentId: string) => void;
  onOpenLens: (agentId: string) => void;
  onOpenFleet: () => void;
}

const kbd = 'px-1 py-0.5 rounded bg-white/[0.06] text-slate-400';

export const AgentReviewInbox: React.FC<AgentReviewInboxProps> = ({ reviews, actions, onClose, onRefresh, onOpenAgent, onOpenLens, onOpenFleet }) => {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const statuses = FILTERS.find((f) => f.id === filter)?.statuses;
    return statuses ? reviews.filter((r) => statuses.includes(r.status)) : reviews;
  }, [reviews, filter]);
  const waiting = reviews.filter((r) => r.status === 'needs-review').length;

  useEffect(() => setIndex(0), [filter]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const approve = async (item: AgentReviewItem) => {
    setBusy(item.agentId);
    try {
      await actions.approve(item.agentId, false);
    } catch {
      // Reported by the action.
    } finally {
      setBusy(null);
    }
  };

  // The latest values for the key handler, which is registered once.
  useEscape(onClose);
  const keys = useRef({ shown, index, approve, onOpenAgent });
  keys.current = { shown, index, approve, onOpenAgent };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      // A confirmation or other dialog on top owns the keyboard.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      const { shown, index, approve, onOpenAgent } = keys.current;
      const item = shown[index];
      if (!shown.length) return;
      else if (e.key === 'j' || e.key === 'ArrowDown') setIndex((index + 1) % shown.length);
      else if (e.key === 'k' || e.key === 'ArrowUp') setIndex((index - 1 + shown.length) % shown.length);
      else if (e.key === 'Enter' && item) onOpenAgent(item.agentId);
      else if (e.key === 'a' && item?.status === 'needs-review' && item.worktreePath) void approve(item);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const button = 'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-[gk-fade-in_160ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Agent review inbox" className="w-[560px] max-w-[96vw] h-full bg-[#10141c] border-l border-white/[0.08] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-400/15 ring-1 ring-inset ring-amber-400/25">
              <Inbox className="w-4 h-4 text-amber-200" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-50">Review inbox</h2>
              <p className="text-[11px] text-slate-400">{waiting ? `${waiting} agent${waiting === 1 ? '' : 's'} waiting for review` : 'Nothing waiting for review'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onOpenFleet} className="px-2 py-1 rounded-md text-[10px] text-slate-400 hover:text-teal-300">
              Fleet →
            </button>
            <button onClick={onRefresh} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div role="tablist" className="flex items-center gap-1.5 px-5 py-2.5 border-b border-white/[0.06] overflow-x-auto">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={filter === entry.id}
              onClick={() => setFilter(entry.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset transition-colors ${
                filter === entry.id ? 'bg-teal-400/15 text-teal-200 ring-teal-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {shown.length === 0 && (
            <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
              <Bot className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-200">Nothing here</p>
              <p className="text-xs text-slate-500 mt-1">Start an agent from the fleet. Its work shows up here when it is ready.</p>
            </div>
          )}
          {shown.map((item, i) => (
            <article
              key={item.agentId}
              data-index={i}
              onMouseEnter={() => setIndex(i)}
              className={`rounded-2xl bg-[#161c27] ring-1 ring-inset transition ${
                i === index ? 'ring-teal-400/40' : item.collisions.length ? 'ring-amber-500/30' : 'ring-white/[0.06]'
              }`}
            >
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AgentAvatar name={item.agentName} harness={item.harness} status={item.agentStatus} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-xs font-semibold text-slate-100 truncate">{item.agentName}</h3>
                        <HarnessTag harness={item.harness} />
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {item.branchName} · {timeAgo(item.lastActivity)}
                      </div>
                    </div>
                  </div>
                  <ReviewStatusBadge status={item.status} />
                </div>
                {item.taskDescription && <p className="mt-2 text-[11px] text-slate-300 leading-relaxed line-clamp-2">{item.taskDescription}</p>}
                <div className="mt-2 flex items-center gap-3 text-[10px] font-mono tabular-nums text-slate-500">
                  <span>
                    {item.files.length} file{item.files.length === 1 ? '' : 's'}
                  </span>
                  <span>{formatSigned(item.additions, item.deletions)}</span>
                  {item.commitsAhead > 0 && <span>{item.commitsAhead} ahead</span>}
                  {item.collisions.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="w-3 h-3" />
                      {item.collisions.length} shared
                    </span>
                  )}
                </div>
                {item.feedback && <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-violet-500/[0.07] text-[10px] text-violet-200/90 line-clamp-2">{item.feedback}</div>}
              </div>
              <div className="px-3.5 py-2 border-t border-white/[0.05] flex items-center gap-1">
                <button onClick={() => onOpenAgent(item.agentId)} className={`${button} bg-white/[0.05] hover:bg-white/[0.1] text-teal-300`}>
                  <Eye className="w-3 h-3" />
                  Review
                </button>
                <button onClick={() => onOpenLens(item.agentId)} className={`${button} bg-white/[0.05] hover:bg-white/[0.1] text-sky-300`}>
                  <Columns2 className="w-3 h-3" />
                  Lens
                </button>
                {item.status === 'needs-review' && item.worktreePath && (
                  <button onClick={() => approve(item)} disabled={busy !== null} className={`${button} ml-auto bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200`}>
                    <Check className="w-3 h-3" />
                    {busy === item.agentId ? 'Approving…' : 'Approve'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="px-5 py-2 border-t border-white/[0.06] text-[10px] text-slate-600 flex items-center gap-3">
          <span>
            <kbd className={kbd}>j</kbd>/<kbd className={kbd}>k</kbd> move
          </span>
          <span>
            <kbd className={kbd}>Enter</kbd> review
          </span>
          <span>
            <kbd className={kbd}>a</kbd> approve
          </span>
          <span className="ml-auto">
            <kbd className={kbd}>Esc</kbd> close
          </span>
        </div>
      </aside>
    </div>
  );
};
