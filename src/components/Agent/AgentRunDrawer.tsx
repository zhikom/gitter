import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Columns2,
  ExternalLink,
  FolderGit2,
  GitMerge,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { AgentReviewItem } from '../../types/agentReview';
import { AgentDiffResponse } from '../../types/agentReview';
import { toast } from '../../utils/toast';
import { AgentDiffViewer } from './AgentDiffViewer';
import { AgentAvatar, HarnessTag, ReviewStatusBadge, timeAgo } from './agentUi';

interface AgentRunDrawerProps {
  repoPath: string;
  item: AgentReviewItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenLens: (agentId: string) => void;
  onOpenWorktreeTab?: (worktreePath: string) => void;
  onApprove: (agentId: string, mode: 'commit' | 'merge') => Promise<void>;
  onRequestChanges: (agentId: string, feedback: string) => Promise<void>;
  onDiscard: (agentId: string) => Promise<void>;
  onCheckpoint: (agentId: string) => Promise<void>;
  onRollback: (agentId: string) => Promise<void>;
  onAskWhy: (prompt: string) => void;
}

type DrawerTab = 'overview' | 'changes';

export const AgentRunDrawer: React.FC<AgentRunDrawerProps> = ({
  repoPath,
  item,
  onClose,
  onRefresh,
  onOpenLens,
  onOpenWorktreeTab,
  onApprove,
  onRequestChanges,
  onDiscard,
  onCheckpoint,
  onRollback,
  onAskWhy,
}) => {
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [diff, setDiff] = useState<AgentDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [armedDiscard, setArmedDiscard] = useState(false);

  const agentId = item?.agentId ?? null;

  const loadDiff = React.useCallback(async () => {
    if (!repoPath || !agentId) return;
    setDiffLoading(true);
    try {
      setDiff(await api.getAgentReviewDiff(repoPath, agentId));
    } catch (e: any) {
      toast.error(`Could not load agent diff: ${e.message}`);
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  }, [repoPath, agentId]);

  useEffect(() => {
    setDiff(null);
    setTab('overview');
    setFeedback(item?.feedback || '');
    setShowFeedback(false);
    setArmedDiscard(false);
    if (agentId) void loadDiff();
  }, [agentId, item?.feedback, loadDiff]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const handleRejectHunk = async (patch: string) => {
    if (!agentId) return;
    try {
      const next = await api.rejectAgentHunk(repoPath, agentId, patch);
      setDiff(next);
      onRefresh();
      toast.success('Hunk rejected from the agent worktree.');
    } catch (e: any) {
      toast.error(`Reject hunk failed: ${e.message}`);
    }
  };

  const submitFeedback = async () => {
    if (!agentId || !feedback.trim()) return;
    await runAction('feedback', () => onRequestChanges(agentId, feedback));
    setShowFeedback(false);
    toast.success('Review feedback saved for the agent.');
  };

  const collisionCount = item?.collisions.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex justify-end animate-[gk-fade-in_160ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Agent run detail"
        className="w-[560px] max-w-[96vw] h-full bg-[#10141c] border-l border-white/[0.08] shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] flex flex-col animate-[gk-pop-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {!item ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Sparkles className="w-7 h-7 opacity-40" />
            <span className="text-xs">Select an agent to inspect its run.</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar
                  name={item.agentName}
                  harness={item.harness}
                  color={item.color}
                  status={item.agentStatus}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-sm font-semibold text-slate-50 truncate">{item.agentName}</h2>
                    <HarnessTag harness={item.harness} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{item.branchName}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <ReviewStatusBadge status={item.status} />
                    <span className="text-[10px] text-slate-600">{timeAgo(item.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={onRefresh}
                  title="Refresh"
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
                  { id: 'overview' as const, label: 'Overview' },
                  { id: 'changes' as const, label: `Changes (${item.files.length})` },
                ]
              ).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setTab(entry.id)}
                  className={`relative py-2.5 transition-colors ${
                    tab === entry.id ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {entry.label}
                  <span
                    className={`absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-teal-400 transition-transform origin-left ${
                      tab === entry.id ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <section className="rounded-xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06] p-3.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500 mb-1">
                    Objective
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{item.taskDescription}</p>
                </section>

                <section className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Files</div>
                    <div className="text-lg font-semibold text-slate-100 tabular-nums">{item.files.length}</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Lines</div>
                    <div className="text-sm font-semibold tabular-nums mt-1">
                      <span className="text-emerald-400">+{item.additions}</span>{' '}
                      <span className="text-rose-400">−{item.deletions}</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Ahead</div>
                    <div className="text-lg font-semibold text-slate-100 tabular-nums">{item.commitsAhead}</div>
                  </div>
                </section>

                <section className="rounded-xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06] p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <FolderGit2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="font-mono truncate">{item.worktreePath || 'Shared working directory'}</span>
                  </div>
                  {item.worktreePath && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenWorktreeTab?.(item.worktreePath!)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open worktree tab
                      </button>
                      <button
                        onClick={() => api.revealInExplorer(item.worktreePath!)}
                        className="px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 transition-colors"
                      >
                        Reveal
                      </button>
                    </div>
                  )}
                </section>

                {collisionCount > 0 && (
                  <section className="rounded-xl bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/25 p-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      {collisionCount} collision{collisionCount === 1 ? '' : 's'} on this agent
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {item.collisions.map((file) => (
                        <li key={file} className="text-[10px] font-mono text-amber-100/80 truncate">
                          {file}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="rounded-xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-[11px] font-semibold text-slate-200">Checkpoint & rollback</div>
                        <div className="text-[10px] text-slate-500">
                          {item.checkpoint
                            ? `${item.checkpoint.label} · ${timeAgo(item.checkpoint.createdAt)}`
                            : 'No checkpoint yet. Snapshot before the next agent run.'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => runAction('checkpoint', () => onCheckpoint(item.agentId))}
                        disabled={busy === 'checkpoint'}
                        className="px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-slate-300 transition-colors disabled:opacity-40"
                      >
                        {item.checkpoint ? 'Re-checkpoint' : 'Checkpoint'}
                      </button>
                      {item.checkpoint && (
                        <button
                          onClick={() => runAction('rollback', () => onRollback(item.agentId))}
                          disabled={busy === 'rollback'}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-semibold text-amber-200 transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Rollback
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {item.feedback && (
                  <section className="rounded-xl bg-violet-500/[0.06] ring-1 ring-inset ring-violet-400/20 p-3.5">
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-300/80 mb-1">
                      Latest feedback
                    </div>
                    <p className="text-[11px] text-violet-100/90 leading-relaxed">{item.feedback}</p>
                  </section>
                )}

                {showFeedback && (
                  <section className="rounded-xl bg-[#161c27] ring-1 ring-inset ring-violet-400/25 p-3.5">
                    <textarea
                      autoFocus
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={3}
                      placeholder="Describe what the agent should change…"
                      className="w-full bg-black/30 rounded-lg px-2.5 py-2 text-[11px] text-slate-100 ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400/60 resize-none"
                    />
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <button
                        onClick={() => setShowFeedback(false)}
                        className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitFeedback}
                        disabled={!feedback.trim() || busy === 'feedback'}
                        className="px-2.5 py-1 rounded bg-violet-500/20 hover:bg-violet-500/30 text-[10px] font-semibold text-violet-200 transition-colors disabled:opacity-40"
                      >
                        {busy === 'feedback' ? 'Saving…' : 'Send feedback'}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                {diffLoading && !diff ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Loading agent diff…
                  </div>
                ) : (
                  <AgentDiffViewer
                    rawDiff={diff?.rawDiff || ''}
                    files={diff?.files || []}
                    agentName={item.agentName}
                    harness={item.harness}
                    color={item.color}
                    collisionFiles={item.collisions}
                    onRejectHunk={handleRejectHunk}
                    onAskWhy={() =>
                      onAskWhy(
                        `Explain why ${item.agentName} changed ${diff?.files[0]?.path || 'these files'}. Focus on intent, risks, and what I should verify.`
                      )
                    }
                  />
                )}
              </div>
            )}

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setTab('changes')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300 transition-colors"
              >
                Review changes
              </button>
              <button
                onClick={() => onOpenLens(item.agentId)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-sky-300 transition-colors"
              >
                <Columns2 className="w-3 h-3" />
                Lens
              </button>
              <button
                onClick={() => runAction('approve', () => onApprove(item.agentId, 'commit'))}
                disabled={busy === 'approve' || item.files.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-[10px] font-semibold text-emerald-200 transition-colors disabled:opacity-40"
              >
                <Check className="w-3 h-3" />
                {busy === 'approve' ? 'Approving…' : 'Approve & commit'}
              </button>
              <button
                onClick={() => runAction('merge', () => onApprove(item.agentId, 'merge'))}
                disabled={busy === 'merge' || item.files.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-500/15 hover:bg-teal-500/25 text-[10px] font-semibold text-teal-200 transition-colors disabled:opacity-40"
              >
                <GitMerge className="w-3 h-3" />
                {busy === 'merge' ? 'Merging…' : 'Merge'}
              </button>
              <button
                onClick={() => setShowFeedback((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-violet-500/15 text-[10px] font-semibold text-slate-300 hover:text-violet-200 transition-colors"
              >
                <MessageSquare className="w-3 h-3" />
                Request changes
              </button>
              <button
                onClick={async () => {
                  if (!armedDiscard) {
                    setArmedDiscard(true);
                    setTimeout(() => setArmedDiscard(false), 3000);
                    return;
                  }
                  setArmedDiscard(false);
                  await runAction('discard', () => onDiscard(item.agentId));
                }}
                disabled={busy === 'discard'}
                className={`ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
                  armedDiscard
                    ? 'bg-rose-500/25 text-rose-100'
                    : 'text-rose-400 hover:bg-rose-500/15'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                {armedDiscard ? 'Confirm discard' : 'Discard'}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
