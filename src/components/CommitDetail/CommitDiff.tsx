import React, { useState } from 'react';
import { Clock, History, ListFilter, Minus, Plus } from 'lucide-react';
import type { Commit, FileDiff } from '../../../shared/types/git';
import { buildPatch, wholeHunk, type LineSelection } from '../../../shared/patch';
import { getPreference } from '../../preferences';
import { DiffCounts, diffCounts, DiffView } from '../Diff/DiffView';
import { PatchContextMenu, type PatchMenuItem } from '../Diff/PatchContextMenu';
import { ask } from '../ui/ask';

interface Props {
  commit: Commit;
  diff?: FileDiff;
  onBack: () => void;
  onApply: (patch: string, reverse: boolean) => Promise<void>;
  onBlame: (file: string) => void;
  onHistory: (file: string) => void;
  onSelectionHistory: (file: string, revision: string) => void;
}

/** A historical file's diff; applying or reversing a hunk only changes WIP. */
export const CommitDiff: React.FC<Props> = ({ commit, diff, onBack, onApply, onBlame, onHistory, onSelectionHistory }) => {
  const [selection, setSelection] = useState<{ key: string; lines: Map<number, Set<number>> }>({ key: '', lines: new Map() });
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number; hunk: number; line?: number } | null>(null);
  const key = diff ? `${commit.hash}\0${diff.path}\0${diff.rawDiff}` : '';
  const lines = selection.key === key ? selection.lines : new Map<number, Set<number>>();
  const count = [...lines.values()].reduce((total, chosen) => total + chosen.size, 0);
  // A partial rename needs additional path operations; offer whole-file restore instead.
  const canPatch = Boolean(diff && !diff.isBinary && !diff.oldPath && diff.hunks.length);

  const toggleLine = (hunk: number, line: number) => {
    const next = new Map(lines);
    const chosen = new Set(next.get(hunk));
    if (chosen.has(line)) chosen.delete(line); else chosen.add(line);
    if (chosen.size) next.set(hunk, chosen); else next.delete(hunk);
    setSelection({ key, lines: next });
  };
  const apply = async (reverse: boolean, chosen: LineSelection) => {
    if (!diff || !canPatch) return;
    const patch = buildPatch(diff, chosen, reverse ? 'reverse' : 'forward');
    if (!patch) return;
    if (reverse && getPreference('confirmDiscard') && !(await ask.confirm({
      title: 'Revert these changes?',
      message: `Apply the inverse of the selected changes to ${diff.path} in your working tree.`,
      confirmLabel: 'Revert changes', danger: true,
    }))) return;
    setBusy(true);
    try { await onApply(patch, reverse); setSelection({ key: '', lines: new Map() }); }
    catch { /* The caller reports the error; keep the selection. */ }
    finally { setBusy(false); }
  };
  const openMenu = (event: React.MouseEvent, hunk: number, line?: number) => {
    event.preventDefault(); event.stopPropagation();
    setContext({ x: event.clientX, y: event.clientY, hunk, line });
  };
  const items: PatchMenuItem[] = [];
  if (context && diff) {
    const line = context.line === undefined ? undefined : diff.hunks[context.hunk]?.lines[context.line];
    const chosen: LineSelection | null = line && line.type !== 'context' && context.line !== undefined
      ? lines.get(context.hunk)?.has(context.line) ? lines : new Map([[context.hunk, new Set([context.line])]])
      : null;
    for (const reverse of [false, true]) {
      const action = reverse ? 'Revert' : 'Apply';
      items.push({ label: `${action} hunk to working tree`, danger: reverse, run: () => void apply(reverse, wholeHunk(context.hunk)) });
      if (chosen) items.push({ label: `${action} ${count && lines.get(context.hunk)?.has(context.line!) ? 'selected lines' : 'this line'}`, danger: reverse, run: () => void apply(reverse, chosen) });
    }
  }
  const button = 'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40';
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <DiffView
        diff={diff}
        onBack={onBack}
        title={<><span className="truncate text-xs font-semibold text-slate-200" title={diff?.path}>{diff?.path}</span><DiffCounts {...diffCounts(diff)} /><span className="font-mono text-[10px] text-slate-500">{commit.shortHash}</span></>}
        toolbar={diff && <>
          <button onClick={() => onBlame(diff.path)} title="Blame" aria-label="Blame" className="p-1 text-slate-400 hover:text-teal-300"><Clock className="w-4 h-4" /></button>
          <button onClick={() => onHistory(diff.path)} title="File history" aria-label="File history" className="p-1 text-slate-400 hover:text-teal-300"><History className="w-4 h-4" /></button>
          <button onClick={() => onSelectionHistory(diff.oldPath && diff.isDeleted ? diff.oldPath : diff.path, diff.isDeleted ? commit.parents[0] : commit.hash)} disabled={diff.isDeleted && !commit.parents[0]} title="History for selection" aria-label="History for selection" className="p-1 text-slate-400 hover:text-teal-300 disabled:opacity-40"><ListFilter className="w-4 h-4" /></button>
        </>}
        banner={diff?.oldPath ? <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-200">Partial actions are unavailable for renamed files. Use the file menu to restore a version.</div> : undefined}
        selection={lines}
        onToggleLine={canPatch ? toggleLine : undefined}
        onLineContextMenu={canPatch ? openMenu : undefined}
        onHunkContextMenu={canPatch ? (event, hunk) => openMenu(event, hunk) : undefined}
        hunkActions={!canPatch ? undefined : (_, index) => <>
          <button disabled={busy} onClick={() => void apply(false, wholeHunk(index))} title="Apply this hunk to the working tree" className={`${button} border-teal-500/40 bg-teal-500/10 text-teal-200 hover:bg-teal-500/20`}><Plus className="h-3 w-3" /> Apply hunk</button>
          <button disabled={busy} onClick={() => void apply(true, wholeHunk(index))} title="Apply the inverse of this hunk to the working tree" className={`${button} border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20`}><Minus className="h-3 w-3" /> Revert hunk</button>
        </>}
      />
      {count > 0 && <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-teal-500/50 bg-[#1b222f] px-4 py-2 text-xs shadow-2xl">
        <span className="font-semibold text-teal-300">{count} line{count === 1 ? '' : 's'}</span>
        <button disabled={busy} onClick={() => void apply(false, lines)} className={`${button} border-teal-500/40 text-teal-200`}><Plus className="h-3 w-3" /> Apply</button>
        <button disabled={busy} onClick={() => void apply(true, lines)} className={`${button} border-rose-500/30 text-rose-300`}><Minus className="h-3 w-3" /> Revert</button>
        <button onClick={() => setSelection({ key: '', lines: new Map() })} className="text-slate-400 underline hover:text-white">Clear</button>
      </div>}
      <PatchContextMenu position={context} items={items} onClose={() => setContext(null)} />
    </div>
  );
};
