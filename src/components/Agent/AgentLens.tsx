import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Columns2,
  FileCode2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { AgentDiffResponse, AgentReviewItem } from '../../types/agentReview';
import { FileDiff } from '../../types/git';
import { parseGitDiff } from '../../utils/diffParser';
import { generateHunkPatch } from '../../utils/patchGenerator';
import { toast } from '../../utils/toast';
import { AgentAvatar, HarnessTag, ReviewStatusBadge } from './agentUi';

interface AgentLensProps {
  repoPath: string;
  item: AgentReviewItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenRun: (agentId: string) => void;
  onRejectHunk: (agentId: string, patch: string) => Promise<void>;
}

const HunkList: React.FC<{
  diff: FileDiff | undefined;
  emptyLabel: string;
  onRejectHunk?: (patch: string, key: string) => void;
  rejectBusy?: string | null;
  rejectLabel?: string;
}> = ({ diff, emptyLabel, onRejectHunk, rejectBusy, rejectLabel = 'Reject' }) => {
  if (!diff) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
        <FileCode2 className="w-6 h-6 opacity-40" />
        <span className="text-[11px]">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] leading-[1.55]">
      {diff.hunks.map((hunk, hunkIndex) => {
        const key = `${diff.path}:${hunk.header}`;
        return (
          <section key={key} className="border-b border-white/[0.05]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-2.5 py-1 bg-sky-500/[0.07] border-b border-sky-500/10">
              <span className="text-[10px] text-sky-300/90 truncate">{hunk.header}</span>
              {onRejectHunk && (
                <button
                  onClick={() => onRejectHunk(generateHunkPatch(diff.path, hunk), key)}
                  disabled={rejectBusy === key}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] font-semibold text-slate-300 hover:bg-rose-500/20 hover:text-rose-200 transition-colors disabled:opacity-40 flex-shrink-0"
                  title="Reject this hunk from the agent worktree"
                >
                  <X className="w-2.5 h-2.5" />
                  {rejectBusy === key ? '…' : rejectLabel}
                </button>
              )}
            </div>
            {hunk.lines.map((line, lineIndex) => {
              const tone =
                line.type === 'add'
                  ? 'bg-emerald-500/10 text-emerald-200'
                  : line.type === 'delete'
                  ? 'bg-rose-500/10 text-rose-200'
                  : 'text-slate-400';
              return (
                <div key={lineIndex} className={`flex ${tone}`}>
                  <span className="w-9 flex-shrink-0 text-right pr-2 text-slate-600 select-none">
                    {line.oldLineNumber ?? ''}
                  </span>
                  <span className="w-9 flex-shrink-0 text-right pr-2 text-slate-600 select-none">
                    {line.newLineNumber ?? ''}
                  </span>
                  <span className="w-4 flex-shrink-0 text-center select-none">
                    {line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' '}
                  </span>
                  <span className="whitespace-pre-wrap break-all pr-2">{line.text}</span>
                </div>
              );
            })}
            {hunkIndex === diff.hunks.length - 1 && <div className="h-2" />}
          </section>
        );
      })}
    </div>
  );
};

export const AgentLens: React.FC<AgentLensProps> = ({
  repoPath,
  item,
  onClose,
  onRefresh,
  onOpenRun,
  onRejectHunk,
}) => {
  const [agentDiff, setAgentDiff] = useState<AgentDiffResponse | null>(null);
  const [workingDiffs, setWorkingDiffs] = useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rejectBusy, setRejectBusy] = useState<string | null>(null);

  const agentId = item?.agentId ?? null;

  const loadAgentDiff = useCallback(async () => {
    if (!repoPath || !agentId) return;
    setLoading(true);
    try {
      const next = await api.getAgentReviewDiff(repoPath, agentId);
      setAgentDiff(next);
      setSelectedFile((current) => {
        if (current && next.files.some((f) => f.path === current)) return current;
        return next.files[0]?.path || '';
      });
    } catch (e: any) {
      toast.error(`Could not load agent lens: ${e.message}`);
      setAgentDiff(null);
    } finally {
      setLoading(false);
    }
  }, [repoPath, agentId]);

  useEffect(() => {
    setAgentDiff(null);
    setWorkingDiffs([]);
    setSelectedFile('');
    if (agentId) void loadAgentDiff();
  }, [agentId, loadAgentDiff]);

  useEffect(() => {
    if (!repoPath || !selectedFile) {
      setWorkingDiffs([]);
      return;
    }
    let cancelled = false;
    api
      .getDiff(repoPath, selectedFile, false)
      .then((diffs) => {
        if (!cancelled) setWorkingDiffs(diffs);
      })
      .catch(() => {
        if (!cancelled) setWorkingDiffs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, selectedFile, item?.updatedAt]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const agentParsed = useMemo(() => parseGitDiff(agentDiff?.rawDiff || ''), [agentDiff?.rawDiff]);
  const agentFile =
    agentParsed.find((d) => d.path === selectedFile) || agentParsed[0];
  const workingFile =
    workingDiffs.find((d) => d.path === selectedFile) || workingDiffs[0];

  const collisionFiles = item?.collisions ?? [];
  const collisionOnSelected = selectedFile ? collisionFiles.includes(selectedFile) : false;

  const handleReject = async (patch: string, key: string) => {
    if (!agentId) return;
    setRejectBusy(key);
    try {
      await onRejectHunk(agentId, patch);
      await loadAgentDiff();
    } finally {
      setRejectBusy(null);
    }
  };

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
        aria-label="Agent split lens"
        className="w-[min(1080px,94vw)] h-full bg-[#10141c] border-l border-white/[0.08] shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.8)] flex flex-col animate-[gk-pop-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {!item ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Columns2 className="w-7 h-7 opacity-40" />
            <span className="text-xs">Select an agent to open its lens.</span>
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
                    <ReviewStatusBadge status={item.status} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    {item.branchName} · split lens vs. working tree
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    void loadAgentDiff();
                    onRefresh();
                  }}
                  title="Refresh lens"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  title="Close lens (Esc)"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* File strip */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06] overflow-x-auto">
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              {(agentDiff?.files ?? []).length === 0 ? (
                <span className="text-[10px] text-slate-500">No files to compare yet.</span>
              ) : (
                (agentDiff?.files ?? []).map((file) => {
                  const isActive = file.path === selectedFile;
                  const collision = collisionFiles.includes(file.path);
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap ring-1 ring-inset transition-colors ${
                        isActive
                          ? 'bg-teal-400/15 text-teal-200 ring-teal-400/40'
                          : 'text-slate-400 ring-white/10 hover:text-slate-200'
                      }`}
                    >
                      {collision && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                      {file.path}
                      <span className="text-emerald-400">+{file.additions}</span>
                      <span className="text-rose-400">−{file.deletions}</span>
                    </button>
                  );
                })
              )}
            </div>

            {collisionOnSelected && (
              <div className="flex items-start gap-2 px-4 py-1.5 bg-amber-500/[0.07] border-b border-amber-500/20 text-[10px] text-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  Another agent is touching this file. Reject overlapping hunks before merging the
                  branch.
                </span>
              </div>
            )}

            {loading && !agentDiff ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Loading agent lens…
              </div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-white/[0.06]">
                {/* Agent side */}
                <section className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold ring-1 ring-inset ring-white/10 flex-shrink-0"
                        style={{ backgroundColor: `${item.color}22`, color: item.color }}
                      >
                        A
                      </span>
                      <span className="text-[10px] font-semibold text-slate-200 truncate">
                        Agent branch
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono truncate">
                        {item.branchName}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 flex-shrink-0">
                      {item.additions} additions
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto">
                    <HunkList
                      diff={agentFile}
                      emptyLabel="No agent changes for this file."
                      onRejectHunk={handleReject}
                      rejectBusy={rejectBusy}
                    />
                  </div>
                </section>

                {/* Working tree side */}
                <section className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold bg-teal-400/15 text-teal-300 ring-1 ring-inset ring-teal-400/25 flex-shrink-0">
                        W
                      </span>
                      <span className="text-[10px] font-semibold text-slate-200 truncate">
                        Your working tree
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono truncate">
                        unstaged
                      </span>
                    </div>
                    <button
                      onClick={() => onOpenRun(item.agentId)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-semibold text-teal-300 transition-colors flex-shrink-0"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Run detail
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto">
                    <HunkList
                      diff={workingFile}
                      emptyLabel="No working tree changes for this file."
                    />
                  </div>
                </section>
              </div>
            )}

            <div className="px-5 py-2 border-t border-white/[0.06] bg-white/[0.02] flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-400" />
                Keep the agent side
              </span>
              <span className="flex items-center gap-1">
                <X className="w-3 h-3 text-rose-400" />
                Reject a hunk from the agent worktree
              </span>
              <span className="ml-auto font-mono text-slate-600">{selectedFile || 'no file selected'}</span>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
