// An agent's change to a file beside your own uncommitted change to it, to see
// how the two will meet before merging.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Columns2, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../../api/client';
import type { AgentReviewItem } from '../../../shared/types/agentReview';
import type { FileDiff } from '../../../shared/types/git';
import { buildPatch, wholeHunk } from '../../../shared/patch';
import { useAgentDiff, type AgentActions } from '../../hooks/useAgentActions';
import { DiffView } from '../Diff/DiffView';
import { useEscape } from '../ui/useEscape';
import { AgentAvatar, harnessColor, HarnessTag, ReviewStatusBadge } from './agentUi';

interface AgentLensProps {
  repo: string;
  item: AgentReviewItem | null;
  actions: AgentActions;
  onClose: () => void;
  onOpenRun: (agentId: string) => void;
}

export const AgentLens: React.FC<AgentLensProps> = ({ repo, item, actions, onClose, onOpenRun }) => {
  const agentId = item?.agentId ?? null;
  const { diff: agentDiff, setDiff, loading, reload } = useAgentDiff(repo, agentId, item?.lastActivity);
  const [selected, setSelected] = useState('');
  const [working, setWorking] = useState<{ diff: FileDiff; staged: boolean } | undefined>();
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const files = agentDiff?.files ?? [];
    if (!files.some((f) => f.path === selected)) setSelected(files[0]?.path ?? '');
  }, [agentDiff, selected]);

  useEffect(() => {
    let current = true;
    setWorking(undefined);
    if (selected) {
      // Your unstaged change to the file, or the staged one when nothing else is left.
      Promise.all([api.workingDiff({ repo, file: selected }), api.workingDiff({ repo, file: selected, staged: true })])
        .then(([unstaged, staged]) => {
          if (!current) return;
          setWorking(unstaged[0] ? { diff: unstaged[0], staged: false } : staged[0] ? { diff: staged[0], staged: true } : undefined);
        })
        .catch(() => undefined); // the file may not exist in your checkout
    }
    return () => {
      current = false;
    };
  }, [repo, selected, item?.updatedAt]);

  useEscape(onClose);

  const agentFile = agentDiff?.diffs.find((d) => d.path === selected);
  const collisions = item?.collisions ?? [];

  const reject = async (index: number) => {
    if (!agentId || !agentFile) return;
    setBusy(index);
    try {
      setDiff(await actions.rejectHunk(agentId, buildPatch(agentFile, wholeHunk(index), 'reverse')!));
    } catch {
      // Reported by the action.
    } finally {
      setBusy(null);
    }
  };

  const sideTitle = (badge: React.ReactNode, label: string, detail: string) => (
    <span className="flex items-center gap-1.5 min-w-0">
      {badge}
      <span className="text-[11px] font-semibold text-slate-200">{label}</span>
      <span className="text-[10px] text-slate-500 font-mono truncate">{detail}</span>
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex justify-end animate-[gk-fade-in_160ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Agent lens" className="w-[min(1280px,96vw)] h-full bg-[#10141c] border-l border-white/[0.08] flex flex-col">
        {!item ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Columns2 className="w-7 h-7 opacity-40" />
            <span className="text-xs">This agent is no longer tracked.</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar name={item.agentName} harness={item.harness} status={item.agentStatus} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-sm font-semibold text-slate-50 truncate">{item.agentName}</h2>
                    <HarnessTag harness={item.harness} />
                    <ReviewStatusBadge status={item.status} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{item.branchName} beside your working tree</div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onOpenRun(item.agentId)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300">
                  <Sparkles className="w-3 h-3" />
                  Run details
                </button>
                <button onClick={() => void reload()} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06] overflow-x-auto">
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              {(agentDiff?.files ?? []).length === 0 && <span className="text-[10px] text-slate-500">{loading ? 'Loading…' : 'The agent has not changed anything yet.'}</span>}
              {(agentDiff?.files ?? []).map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelected(file.path)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap ring-1 ring-inset transition-colors ${
                    file.path === selected ? 'bg-teal-400/15 text-teal-200 ring-teal-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200'
                  }`}
                >
                  {collisions.includes(file.path) && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                  {file.path}
                  <span className="text-emerald-400">+{file.additions}</span>
                  <span className="text-rose-400">−{file.deletions}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-white/[0.06]">
              <div className="flex flex-col min-h-0">
                <DiffView
                  diff={agentFile}
                  emptyLabel="The agent did not change this file."
                  title={sideTitle(
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: harnessColor(item.harness) }} />,
                    'Agent',
                    `${item.baseRef} → ${item.branchName}`
                  )}
                  hunkActions={
                    item.worktreePath
                      ? (_, index) => (
                          <button
                            onClick={() => reject(index)}
                            disabled={busy !== null}
                            className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] font-semibold text-slate-300 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40"
                          >
                            {busy === index ? 'Rejecting…' : 'Reject'}
                          </button>
                        )
                      : undefined
                  }
                />
              </div>
              <div className="flex flex-col min-h-0">
                <DiffView
                  diff={working?.diff}
                  emptyLabel="You have no uncommitted change to this file."
                  title={sideTitle(<span className="w-3 h-3 rounded-full flex-shrink-0 bg-teal-400" />, 'You', working?.staged ? 'staged, not committed' : 'not committed')}
                />
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
