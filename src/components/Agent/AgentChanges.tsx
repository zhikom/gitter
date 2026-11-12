// An agent's work against its base: the files it changed and each file's diff,
// with a button to reject a hunk from the agent's worktree.
import React, { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import type { AgentDiff } from '../../../shared/types/agentReview';
import { buildPatch, wholeHunk } from '../../../shared/patch';
import { ChangedFileList } from '../Diff/ChangedFileList';
import { DiffView } from '../Diff/DiffView';

interface AgentChangesProps {
  diff: AgentDiff | null;
  loading: boolean;
  /** Files another agent also changed. */
  collisions: string[];
  /** Absent when the agent has no worktree to change. */
  onRejectHunk?: (patch: string) => Promise<void>;
  toolbar?: React.ReactNode;
}

export const AgentChanges: React.FC<AgentChangesProps> = ({ diff, loading, collisions, onRejectHunk, toolbar }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const files = diff?.files ?? [];

  useEffect(() => {
    if (!files.some((f) => f.path === selected)) setSelected(files[0]?.path ?? null);
  }, [files, selected]);

  const fileDiff = diff?.diffs.find((d) => d.path === selected);
  const reject = async (index: number) => {
    if (!fileDiff || !onRejectHunk) return;
    setBusy(index);
    try {
      await onRejectHunk(buildPatch(fileDiff, wholeHunk(index), 'reverse')!);
    } catch {
      // The action reported the failure.
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="w-60 flex-shrink-0 border-r border-white/[0.06]">
        <ChangedFileList
          files={files}
          selected={selected}
          onSelect={setSelected}
          flagged={new Set(collisions)}
          emptyLabel={loading ? 'Loading…' : 'The agent has not changed anything yet.'}
        />
      </div>
      <DiffView
        diff={fileDiff}
        title={<span className="text-xs font-mono text-slate-300 truncate">{selected}</span>}
        toolbar={toolbar}
        banner={
          selected && collisions.includes(selected) ? (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/[0.08] border-b border-amber-500/20 text-[11px] text-amber-200">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              Another agent also changed this file. Reject the overlapping hunks or let one agent finish first.
            </div>
          ) : undefined
        }
        hunkActions={
          onRejectHunk
            ? (_, index) => (
                <button
                  onClick={() => reject(index)}
                  disabled={busy !== null}
                  title="Take this hunk back out of the agent's worktree"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] text-[10px] font-semibold text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 transition-colors disabled:opacity-40"
                >
                  <X className="w-3 h-3" />
                  {busy === index ? 'Rejecting…' : 'Reject'}
                </button>
              )
            : undefined
        }
      />
    </div>
  );
};
