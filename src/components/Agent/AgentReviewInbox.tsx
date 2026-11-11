import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Columns2,
  Eye,
  GitMerge,
  Inbox,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { AgentFleetState } from '../../types/agentFleet';
import {
  AgentAttentionItem,
  AgentReviewItem,
  AgentReviewState,
} from '../../types/agentReview';
import { AgentAvatar, HarnessTag, ReviewStatusBadge, timeAgo } from './agentUi';

type InboxTab = 'inbox' | 'attention';
type InboxFilter = 'all' | 'needs-review' | 'running' | 'done';

interface AgentReviewInboxProps {
  review: AgentReviewState | null;
  fleet: AgentFleetState | null;
  acknowledged: Set<string>;
  onClose: () => void;
  onRefresh: () => void;
  onOpenAgent: (agentId: string) => void;
  onOpenLens: (agentId: string) => void;
  onOpenFleet: () => void;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onApprove: (agentId: string, mode: 'commit' | 'merge') => Promise<void>;
  onRequestChanges: (agentId: string, feedback: string) => Promise<void>;
  onDiscard: (agentId: string) => Promise<void>;
  onCheckpoint: (agentId: string) => Promise<void>;
  onRollback: (agentId: string) => Promise<void>;
}

const matchesFilter = (item: AgentReviewItem, filter: InboxFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'needs-review') {
    return item.status === 'needs-review' || item.status === 'changes-requested' || item.status === 'failed';
  }
  if (filter === 'running') return item.status === 'running' || item.status === 'queued';
  return item.status === 'approved' || item.status === 'merged';
};

const severityIcon = (item: AgentAttentionItem) => {
  if (item.kind === 'collision') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  if (item.kind === 'index-lock' || item.kind === 'error') return <AlertTriangle className="w-4 h-4 text-rose-400" />;
  return <Inbox className="w-4 h-4 text-sky-400" />;
};

export const AgentReviewInbox: React.FC<AgentReviewInboxProps> = ({
  review,
  fleet,
  acknowledged,
  onClose,
  onRefresh,
  onOpenAgent,
  onOpenLens,
  onOpenFleet,
  onAcknowledge,
  onAcknowledgeAll,
  onApprove,
  onRequestChanges,
  onDiscard,
  onCheckpoint,
  onRollback,
}) => {
  const [tab, setTab] = useState<InboxTab>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [armedDiscard, setArmedDiscard] = useState<string | null>(null);
  const armedDiscardRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = review?.items ?? [];
  const attention = review?.attention ?? [];
  const pendingAttention = attention.filter((item) => !acknowledged.has(item.id));

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [items, filter]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, tab]);

  useEffect(
    () => () => {
      armedDiscardRef.current = null;
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (tab !== 'inbox' || filtered.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'a') {
        const item = filtered[selectedIndex];
        if (item && item.status === 'needs-review') {
          e.preventDefault();
          void runApprove(item, 'commit');
        }
      } else if (e.key === 'r') {
        const item = filtered[selectedIndex];
        if (item) {
          e.preventDefault();
          setFeedbackFor(item.agentId);
          setFeedbackText(item.feedback || '');
        }
      } else if (e.key === 'x') {
        const item = filtered[selectedIndex];
        if (item) {
          e.preventDefault();
          void armDiscard(item.agentId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtered, selectedIndex, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const runApprove = (item: AgentReviewItem, mode: 'commit' | 'merge') =>
    runAction(`approve:${item.agentId}:${mode}`, () => onApprove(item.agentId, mode));

  const armDiscard = async (agentId: string) => {
    if (armedDiscardRef.current !== agentId) {
      armedDiscardRef.current = agentId;
      setArmedDiscard(agentId);
      setTimeout(() => {
        if (armedDiscardRef.current === agentId) {
          armedDiscardRef.current = null;
          setArmedDiscard(null);
        }
      }, 3000);
      return;
    }
    armedDiscardRef.current = null;
    setArmedDiscard(null);
    await runAction(`discard:${agentId}`, () => onDiscard(agentId));
  };

  const submitFeedback = async (agentId: string) => {
    if (!feedbackText.trim()) return;
    await runAction(`feedback:${agentId}`, () => onRequestChanges(agentId, feedbackText));
    setFeedbackFor(null);
    setFeedbackText('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-[gk-fade-in_160ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Agent review inbox"
        className="w-[580px] max-w-[96vw] h-full bg-[#10141c] border-l border-white/[0.08] shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] flex flex-col animate-[gk-pop-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400/20 to-teal-500/15 ring-1 ring-inset ring-amber-400/25">
              <Inbox className="w-4 h-4 text-amber-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-50">Agent Review Inbox</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400/10 text-[10px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-400/25">
                  {items.filter((i) => i.status === 'needs-review').length} ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Review, request changes, or merge agent work without leaving the graph.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              title="Refresh review state"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-5 px-5 border-b border-white/[0.06] text-xs font-semibold">
          {(
            [
              { id: 'inbox' as const, label: `Inbox (${items.length})`, icon: <Inbox className="w-3.5 h-3.5" /> },
              {
                id: 'attention' as const,
                label: `Attention${pendingAttention.length ? ` (${pendingAttention.length})` : ''}`,
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
              },
            ]
          ).map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              className={`relative py-2.5 flex items-center gap-1.5 transition-colors ${
                tab === entry.id ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {entry.icon}
              {entry.label}
              <span
                className={`absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-teal-400 transition-transform origin-left ${
                  tab === entry.id ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          ))}
          <button
            onClick={onOpenFleet}
            className="ml-auto py-2.5 text-[10px] text-slate-500 hover:text-teal-300 transition-colors"
          >
            Fleet orchestrator →
          </button>
        </div>

        {tab === 'inbox' ? (
          <>
            {/* Filters */}
            <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-white/[0.06] overflow-x-auto">
              {(
                [
                  { id: 'all' as const, label: 'All' },
                  { id: 'needs-review' as const, label: 'Needs review' },
                  { id: 'running' as const, label: 'In flight' },
                  { id: 'done' as const, label: 'Done' },
                ]
              ).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setFilter(entry.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset transition-colors ${
                    filter === entry.id
                      ? 'bg-teal-400/15 text-teal-200 ring-teal-400/40'
                      : 'text-slate-400 ring-white/10 hover:text-slate-200'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                  <Bot className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-200">Nothing in this queue</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Spawn an agent or wait for a run to finish. New decisions land here automatically.
                  </p>
                </div>
              ) : (
                filtered.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  const hasCollision = item.collisions.length > 0;
                  const approveKey = `approve:${item.agentId}:commit`;
                  const mergeKey = `approve:${item.agentId}:merge`;
                  return (
                    <article
                      key={item.id}
                      data-index={index}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`rounded-2xl bg-[#161c27] ring-1 ring-inset transition-all ${
                        isSelected
                          ? 'ring-teal-400/40 shadow-lg shadow-black/25'
                          : hasCollision
                          ? 'ring-amber-500/30'
                          : 'ring-white/[0.06] hover:ring-white/[0.12]'
                      }`}
                    >
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AgentAvatar
                              name={item.agentName}
                              harness={item.harness}
                              color={item.color}
                              status={item.agentStatus}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <h3 className="text-xs font-semibold text-slate-100 truncate">{item.agentName}</h3>
                                <HarnessTag harness={item.harness} />
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">
                                {item.branchName} · {timeAgo(item.updatedAt)}
                              </div>
                            </div>
                          </div>
                          <ReviewStatusBadge status={item.status} />
                        </div>

                        <p className="mt-2.5 text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                          {item.taskDescription}
                        </p>

                        <div className="mt-2 flex items-center gap-3 text-[10px] font-mono tabular-nums text-slate-500">
                          <span>{item.files.length} file{item.files.length === 1 ? '' : 's'}</span>
                          <span className="text-emerald-400">+{item.additions}</span>
                          <span className="text-rose-400">−{item.deletions}</span>
                          {item.commitsAhead > 0 && <span>{item.commitsAhead} commit{item.commitsAhead === 1 ? '' : 's'} ahead</span>}
                          {hasCollision && (
                            <span className="flex items-center gap-1 text-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              {item.collisions.length} collision{item.collisions.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        {item.files.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.files.slice(0, 4).map((file) => (
                              <span
                                key={file.path}
                                className="px-1.5 py-0.5 rounded bg-black/30 text-[9px] font-mono text-slate-400 truncate max-w-[180px]"
                              >
                                {file.path}
                              </span>
                            ))}
                            {item.files.length > 4 && (
                              <span className="text-[9px] text-slate-600 px-1">+{item.files.length - 4}</span>
                            )}
                          </div>
                        )}

                        {item.feedback && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-violet-500/[0.07] ring-1 ring-inset ring-violet-400/15 text-[10px] text-violet-200/90 line-clamp-2">
                            <span className="font-semibold">Feedback:</span> {item.feedback}
                          </div>
                        )}

                        {item.checkpoint && (
                          <div className="mt-2 flex items-center gap-2 px-2 py-1 rounded-lg bg-emerald-500/[0.05] ring-1 ring-inset ring-emerald-400/15 text-[10px] text-emerald-200/90">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <span className="truncate">
                              Checkpoint {item.checkpoint.id} · {timeAgo(item.checkpoint.createdAt)}
                            </span>
                            <button
                              onClick={() => runAction(`rollback:${item.agentId}`, () => onRollback(item.agentId))}
                              disabled={busy === `rollback:${item.agentId}`}
                              className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold text-emerald-300 hover:bg-emerald-500/15 transition-colors flex-shrink-0"
                            >
                              Rollback
                            </button>
                          </div>
                        )}
                      </div>

                      {feedbackFor === item.agentId && (
                        <div className="px-3.5 pb-3">
                          <textarea
                            autoFocus
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="Tell the agent what to change. This is saved with the review item."
                            rows={2}
                            className="w-full bg-black/30 rounded-lg px-2.5 py-2 text-[11px] text-slate-100 ring-1 ring-inset ring-violet-400/30 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400/60 resize-none"
                          />
                          <div className="flex items-center justify-end gap-1.5 mt-1.5">
                            <button
                              onClick={() => {
                                setFeedbackFor(null);
                                setFeedbackText('');
                              }}
                              className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-slate-200"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => submitFeedback(item.agentId)}
                              disabled={!feedbackText.trim() || busy === `feedback:${item.agentId}`}
                              className="px-2.5 py-1 rounded bg-violet-500/20 hover:bg-violet-500/30 text-[10px] font-semibold text-violet-200 transition-colors disabled:opacity-40"
                            >
                              {busy === `feedback:${item.agentId}` ? 'Sending…' : 'Send feedback'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="px-3.5 py-2 border-t border-white/[0.05] flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => onOpenAgent(item.agentId)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Review
                        </button>
                        <button
                          onClick={() => onOpenLens(item.agentId)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-sky-300 transition-colors"
                        >
                          <Columns2 className="w-3 h-3" />
                          Lens
                        </button>
                        <button
                          onClick={() => runApprove(item, 'commit')}
                          disabled={busy === approveKey || item.files.length === 0}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-[10px] font-semibold text-emerald-200 transition-colors disabled:opacity-40"
                        >
                          <Check className="w-3 h-3" />
                          {busy === approveKey ? 'Approving…' : 'Approve & commit'}
                        </button>
                        <button
                          onClick={() => runApprove(item, 'merge')}
                          disabled={busy === mergeKey || item.files.length === 0}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-500/15 hover:bg-teal-500/25 text-[10px] font-semibold text-teal-200 transition-colors disabled:opacity-40"
                        >
                          <GitMerge className="w-3 h-3" />
                          {busy === mergeKey ? 'Merging…' : 'Merge'}
                        </button>
                        <button
                          onClick={() => {
                            setFeedbackFor(item.agentId);
                            setFeedbackText(item.feedback || '');
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-violet-500/15 text-[10px] font-semibold text-slate-300 hover:text-violet-200 transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Request changes
                        </button>
                        <button
                          onClick={() => runAction(`checkpoint:${item.agentId}`, () => onCheckpoint(item.agentId))}
                          disabled={busy === `checkpoint:${item.agentId}`}
                          title="Snapshot this agent before its next run"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-slate-300 transition-colors disabled:opacity-40"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {item.checkpoint ? 'Re-checkpoint' : 'Checkpoint'}
                        </button>
                        <button
                          onClick={() => armDiscard(item.agentId)}
                          disabled={busy === `discard:${item.agentId}`}
                          className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            armedDiscard === item.agentId
                              ? 'bg-rose-500/25 text-rose-100'
                              : 'text-rose-400 hover:bg-rose-500/15'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                          {armedDiscard === item.agentId ? 'Confirm discard' : 'Discard'}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="px-5 py-2 border-t border-white/[0.06] bg-white/[0.02] text-[10px] text-slate-600 flex items-center gap-3">
              <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">j</kbd>/<kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">k</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">a</kbd> approve</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">r</kbd> request changes</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">x</kbd> discard</span>
              <span className="ml-auto"><kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-slate-400">Esc</kbd> close</span>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] text-slate-400">
                {pendingAttention.length} decision{pendingAttention.length === 1 ? '' : 's'} need you
              </span>
              {pendingAttention.length > 0 && (
                <button
                  onClick={onAcknowledgeAll}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Acknowledge all
                </button>
              )}
            </div>
            {pendingAttention.length === 0 ? (
              <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                <Check className="w-8 h-8 text-emerald-500/60 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-200">You are all caught up</p>
                <p className="text-xs text-slate-500 mt-1">
                  Routine agent progress stays quiet. Only decisions and errors land here.
                </p>
              </div>
            ) : (
              pendingAttention.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl px-3 py-2.5 ring-1 ring-inset bg-[#161c27] ${
                    item.severity === 'high' ? 'ring-amber-500/25' : 'ring-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex-shrink-0">{severityIcon(item)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[11px] font-semibold text-slate-200 truncate">{item.title}</h4>
                        <span className="text-[9px] text-slate-600 flex-shrink-0">{timeAgo(item.createdAt)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{item.detail}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {item.agentId && (
                          <button
                            onClick={() => onOpenAgent(item.agentId!)}
                            className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300 transition-colors"
                          >
                            Open agent
                          </button>
                        )}
                        <button
                          onClick={() => onAcknowledge(item.id)}
                          className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {fleet?.indexLockDetected && (
              <div className="rounded-xl px-3 py-2.5 bg-rose-500/[0.07] ring-1 ring-inset ring-rose-400/20 text-[11px] text-rose-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="font-semibold">Index lock is held.</span>
                </div>
                <p className="text-[10px] text-rose-300/70 mt-1">
                  Open the fleet orchestrator to break a stale lock before committing.
                </p>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
