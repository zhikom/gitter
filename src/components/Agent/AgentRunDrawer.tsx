import React, { useEffect, useState } from 'react';
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
import type { AgentReviewItem } from '../../../shared/types/agentReview';
import { useAgentDiff, type AgentActions } from '../../hooks/useAgentActions';
import { ask } from '../ui/ask';
import { useEscape } from '../ui/useEscape';
import { AgentChanges } from './AgentChanges';
import { AgentAvatar, HarnessTag, ReviewStatusBadge, timeAgo } from './agentUi';

interface AgentRunDrawerProps {
  repo: string;
  item: AgentReviewItem | null;
  actions: AgentActions;
  onClose: () => void;
  onRefresh: () => void;
  onOpenLens: (agentId: string) => void;
  onOpenWorktree: (worktreePath: string) => void;
  onAskWhy: (prompt: string) => void;
}

type DrawerTab = 'overview' | 'changes';

const card = 'rounded-xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06] p-3.5';
const smallButton = 'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors disabled:opacity-40';
const footerButton = 'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-colors disabled:opacity-40';

/** One agent's run: its task, numbers, checkpoint, feedback, changes, and the review decision. */
export const AgentRunDrawer: React.FC<AgentRunDrawerProps> = ({ repo, item, actions, onClose, onRefresh, onOpenLens, onOpenWorktree, onAskWhy }) => {
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const agentId = item?.agentId ?? null;
  // New activity from the agent reloads its diff.
  const { diff, setDiff, loading: diffLoading } = useAgentDiff(repo, agentId, item?.lastActivity);

  useEffect(() => {
    setTab('overview');
    setShowFeedback(false);
  }, [agentId]);
  useEffect(() => setFeedback(item?.feedback || ''), [agentId, item?.feedback]);

  useEscape(onClose);

  // Actions report their own failures; the drawer only tracks which one is running.
  const run = async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(key);
    try {
      await action();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rejectHunk = async (patch: string) => {
    if (agentId) setDiff(await actions.rejectHunk(agentId, patch));
  };

  const submitFeedback = async () => {
    if (agentId && feedback.trim() && (await run('feedback', () => actions.requestChanges(agentId, feedback)))) setShowFeedback(false);
  };

  const discard = async () => {
    if (!item) return;
    const confirmed = await ask.confirm({
      title: `Discard ${item.agentName}'s changes?`,
      message: item.checkpoint
        ? `The agent's worktree goes back to the checkpoint "${item.checkpoint.label}".`
        : `The agent's worktree goes back to ${item.baseRef}. Everything the agent did is lost.`,
      confirmLabel: 'Discard',
      danger: true,
    });
    if (confirmed) await run('discard', () => actions.discard(item.agentId));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex justify-end animate-[gk-fade-in_160ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Agent run"
        className={`${tab === 'changes' ? 'w-[min(1080px,96vw)]' : 'w-[560px] max-w-[96vw]'} h-full bg-[#10141c] border-l border-white/[0.08] shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] flex flex-col transition-[width] duration-200`}
      >
        {!item ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Sparkles className="w-7 h-7 opacity-40" />
            <span className="text-xs">This agent is no longer tracked.</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar name={item.agentName} harness={item.harness} status={item.agentStatus} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-sm font-semibold text-slate-50 truncate">{item.agentName}</h2>
                    <HarnessTag harness={item.harness} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {item.branchName} · from {item.baseRef}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <ReviewStatusBadge status={item.status} />
                    <span className="text-[10px] text-slate-600">active {timeAgo(item.lastActivity)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={onRefresh} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div role="tablist" className="flex items-center gap-5 px-5 border-b border-white/[0.06] text-xs font-semibold">
              {[
                { id: 'overview' as const, label: 'Overview' },
                { id: 'changes' as const, label: `Changes (${item.files.length})` },
              ].map((entry) => (
                <button
                  key={entry.id}
                  role="tab"
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                  className={`relative py-2.5 transition-colors ${tab === entry.id ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {entry.label}
                  {tab === entry.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-teal-400" />}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <section className={card}>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500 mb-1">Task</div>
                  <p className="text-xs text-slate-200 leading-relaxed">{item.taskDescription || <span className="text-slate-500">No task description; found from its branch.</span>}</p>
                </section>

                <section className="grid grid-cols-3 gap-2">
                  {[
                    ['Files', item.files.length],
                    ['Commits ahead', item.commitsAhead],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
                      <div className="text-lg font-semibold text-slate-100 tabular-nums">{value}</div>
                    </div>
                  ))}
                  <div className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Lines</div>
                    <div className="text-sm font-semibold tabular-nums mt-1">
                      <span className="text-emerald-400">+{item.additions}</span> <span className="text-rose-400">−{item.deletions}</span>
                    </div>
                  </div>
                </section>

                <section className={`${card} space-y-2`}>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <FolderGit2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="font-mono truncate">{item.worktreePath || 'No worktree: only the branch is reviewed'}</span>
                  </div>
                  {item.worktreePath && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onOpenWorktree(item.worktreePath!)} className={`${smallButton} bg-white/[0.05] hover:bg-white/[0.1] text-teal-300`}>
                        <ExternalLink className="w-3 h-3" />
                        Open in a tab
                      </button>
                      <button onClick={() => api.revealInFileManager({ repo: item.worktreePath! })} className={`${smallButton} bg-white/[0.05] hover:bg-white/[0.1] text-slate-300`}>
                        Show in folder
                      </button>
                    </div>
                  )}
                </section>

                {item.collisions.length > 0 && (
                  <section className="rounded-xl bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/25 p-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      {item.collisions.length} file{item.collisions.length === 1 ? '' : 's'} shared with another agent
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

                {item.worktreePath && (
                  <section className={card}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="text-[11px] font-semibold text-slate-200">Checkpoint</div>
                          <div className="text-[10px] text-slate-500">
                            {item.checkpoint ? `${item.checkpoint.label} · ${timeAgo(item.checkpoint.createdAt)}` : 'Save the worktree now to roll back to it later.'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => run('checkpoint', () => actions.checkpoint(item.agentId))} disabled={busy !== null} className={`${smallButton} bg-white/[0.05] hover:bg-white/[0.1] text-slate-300`}>
                          {item.checkpoint ? 'Save again' : 'Save checkpoint'}
                        </button>
                        {item.checkpoint && (
                          <button onClick={() => run('rollback', () => actions.rollback(item.agentId))} disabled={busy !== null} className={`${smallButton} bg-amber-500/15 hover:bg-amber-500/25 text-amber-200`}>
                            <RotateCcw className="w-3 h-3" />
                            Roll back
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {item.feedback && !showFeedback && (
                  <section className="rounded-xl bg-violet-500/[0.06] ring-1 ring-inset ring-violet-400/20 p-3.5">
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-300/80 mb-1">Latest note</div>
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
                      placeholder="What should the agent change?"
                      className="w-full bg-black/30 rounded-lg px-2.5 py-2 text-[11px] text-slate-100 ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400/60 resize-none"
                    />
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <button onClick={() => setShowFeedback(false)} className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-slate-200">
                        Cancel
                      </button>
                      <button onClick={submitFeedback} disabled={!feedback.trim() || busy !== null} className={`${smallButton} bg-violet-500/20 hover:bg-violet-500/30 text-violet-200`}>
                        {busy === 'feedback' ? 'Saving…' : 'Save request'}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <AgentChanges
                diff={diff}
                loading={diffLoading}
                collisions={item.collisions}
                onRejectHunk={item.worktreePath ? rejectHunk : undefined}
                toolbar={
                  <button
                    onClick={() => onAskWhy(`Explain what ${item.agentName} changed on ${item.branchName} and why. Focus on intent, risks, and what I should verify.`)}
                    className={`${smallButton} bg-white/[0.05] hover:bg-white/[0.1] text-teal-300`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Ask why
                  </button>
                }
              />
            )}

            <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center gap-1.5 flex-wrap">
              {tab === 'overview' && (
                <button onClick={() => setTab('changes')} className={`${footerButton} bg-white/[0.05] hover:bg-white/[0.1] text-teal-300`}>
                  Review changes
                </button>
              )}
              <button onClick={() => onOpenLens(item.agentId)} title="Compare with your working tree" className={`${footerButton} bg-white/[0.05] hover:bg-white/[0.1] text-sky-300`}>
                <Columns2 className="w-3 h-3" />
                Lens
              </button>
              <button
                onClick={() => run('approve', () => actions.approve(item.agentId, false))}
                disabled={busy !== null || item.files.length === 0 || !item.worktreePath}
                title="Commit the agent's uncommitted files on its branch"
                className={`${footerButton} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200`}
              >
                <Check className="w-3 h-3" />
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button
                onClick={() => run('merge', () => actions.approve(item.agentId, true))}
                disabled={busy !== null || item.files.length === 0 || !item.worktreePath}
                title="Approve, then merge the agent's branch into your checked-out branch"
                className={`${footerButton} bg-teal-500/15 hover:bg-teal-500/25 text-teal-200`}
              >
                <GitMerge className="w-3 h-3" />
                {busy === 'merge' ? 'Merging…' : 'Approve & merge'}
              </button>
              <button
                onClick={() => {
                  setTab('overview');
                  setShowFeedback(true);
                }}
                className={`${footerButton} bg-white/[0.05] hover:bg-violet-500/15 text-slate-300 hover:text-violet-200`}
              >
                <MessageSquare className="w-3 h-3" />
                Request changes
              </button>
              <button onClick={discard} disabled={busy !== null || !item.worktreePath} className={`ml-auto ${footerButton} text-rose-400 hover:bg-rose-500/15`}>
                <Trash2 className="w-3 h-3" />
                Discard
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
