// The selected working-tree file's diff with the staging layer on top: stage,
// unstage or discard whole hunks or chosen lines.
import React, { useState } from 'react';
import { AlertTriangle, Clock, ExternalLink, History, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
import type { FileDiff } from '../../../shared/types/git';
import { buildPatch, wholeHunk, type LineSelection, type PatchDirection } from '../../../shared/patch';
import { getPreference, usePreference } from '../../preferences';
import { ask } from '../ui/ask';
import { DiffCounts, diffCounts, DiffView } from '../Diff/DiffView';
import { PatchContextMenu, type PatchMenuItem } from '../Diff/PatchContextMenu';

export type PatchAction = 'stage' | 'unstage' | 'discard';

const DIRECTION: Record<PatchAction, PatchDirection> = { stage: 'forward', unstage: 'reverse', discard: 'reverse' };

interface WorkingDiffProps {
  diff: FileDiff | undefined;
  staged: boolean;
  conflicted: boolean;
  /** The file is selected but has only whitespace changes, which are hidden. */
  whitespaceOnly: boolean;
  banner?: React.ReactNode;
  onToggleStaged: () => void;
  onPatch: (action: PatchAction, patch: string) => Promise<void>;
  onExplain: (diff: FileDiff) => void;
  onResolveConflict: (file: string) => void;
  onBlame: (file: string) => void;
  onFileHistory: (file: string) => void;
  onExternalDiff: (file: string, staged: boolean) => void;
  onBack?: () => void;
}

const hunkButton = 'px-2 py-0.5 rounded text-[10px] font-semibold border transition disabled:opacity-40';

export const WorkingDiff: React.FC<WorkingDiffProps> = ({
  diff,
  staged,
  conflicted,
  whitespaceOnly,
  banner,
  onToggleStaged,
  onPatch,
  onExplain,
  onResolveConflict,
  onBlame,
  onFileHistory,
  onExternalDiff,
  onBack,
}) => {
  const [ignoreWhitespace, setIgnoreWhitespace] = usePreference('ignoreWhitespace');
  // A selection belongs to one loaded diff. Any reload (a save in your editor,
  // another file, the other side) starts afresh, so a highlighted line is always
  // the line an action will take.
  // Keyed by content, not by object: a refresh that leaves the file as it was keeps the selection.
  const diffKey = diff ? `${staged}\0${diff.path}\0${diff.rawDiff}` : '';
  const [selection, setSelection] = useState<{ key: string; lines: Map<number, Set<number>> }>({ key: '', lines: new Map() });
  const lines = selection.key === diffKey ? selection.lines : new Map<number, Set<number>>();
  const selectedCount = [...lines.values()].reduce((n, s) => n + s.size, 0);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number; hunk: number; line?: number } | null>(null);
  // With whitespace hidden, git shows changed lines as context, and patches built from that do not apply.
  const canPatch = Boolean(diff) && !conflicted && !ignoreWhitespace && !diff?.isBinary;

  const toggleLine = (hunk: number, line: number) => {
    const next = new Map(lines);
    const set = new Set(next.get(hunk));
    if (set.has(line)) set.delete(line);
    else set.add(line);
    if (set.size) next.set(hunk, set);
    else next.delete(hunk);
    setSelection({ key: diffKey, lines: next });
  };

  const apply = async (action: PatchAction, chosen: LineSelection) => {
    if (!diff) return;
    const patch = buildPatch(diff, chosen, DIRECTION[action]);
    if (!patch) return;
    if (
      action === 'discard' &&
      getPreference('confirmDiscard') &&
      !(await ask.confirm({ title: 'Discard changes?', message: `The chosen changes to ${diff.path} will be lost.`, confirmLabel: 'Discard', danger: true }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await onPatch(action, patch);
      setSelection({ key: '', lines: new Map() });
    } catch {
      // Reported by the action; the selection stays for another try.
    } finally {
      setBusy(false);
    }
  };

  const counts = diffCounts(diff);
  const file = diff?.path ?? '';
  const sideActions: PatchAction[] = staged ? ['unstage'] : ['stage', 'discard'];
  const tone: Record<PatchAction, string> = {
    stage: 'bg-teal-500/15 hover:bg-teal-500/25 text-teal-200 border-teal-500/40',
    unstage: 'bg-[#222b3b] hover:bg-[#2c374c] text-amber-200 border-[#2e3a4e]',
    discard: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30',
  };
  const label: Record<PatchAction, string> = { stage: 'Stage', unstage: 'Unstage', discard: 'Discard' };
  const openMenu = (event: React.MouseEvent, hunk: number, line?: number) => {
    event.preventDefault(); event.stopPropagation();
    setContext({ x: event.clientX, y: event.clientY, hunk, line });
  };
  const menuItems: PatchMenuItem[] = [];
  if (context && diff) {
    const line = context.line === undefined ? undefined : diff.hunks[context.hunk]?.lines[context.line];
    const lineSelection: LineSelection | null = line && line.type !== 'context' && context.line !== undefined
      ? lines.get(context.hunk)?.has(context.line) ? lines : new Map([[context.hunk, new Set([context.line])]])
      : null;
    for (const action of sideActions) {
      menuItems.push({ label: `${label[action]} hunk`, danger: action === 'discard', run: () => void apply(action, wholeHunk(context.hunk)) });
      if (lineSelection) menuItems.push({ label: `${label[action]} ${selectedCount > 0 && lines.get(context.hunk)?.has(context.line!) ? 'selected lines' : 'this line'}`, danger: action === 'discard', run: () => void apply(action, lineSelection) });
    }
  }

  const toolbarButton = 'flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition';

  if (!diff && whitespaceOnly) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {onBack && <button onClick={onBack} className="self-start m-2 px-2 py-1 text-xs text-slate-300 hover:text-white">← Back to graph</button>}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs p-6 text-center">
          This file only has whitespace changes, which are hidden.
          <button onClick={() => setIgnoreWhitespace(false)} className="px-3 py-1.5 rounded bg-[#202735] border border-[#2a3447] hover:bg-[#2d384c] text-slate-200">
            Show whitespace changes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <DiffView
        diff={diff}
        onBack={onBack}
        emptyLabel="Select a changed file to see its diff."
        title={
          <>
            <span className="text-xs font-semibold text-slate-200 truncate" title={file}>
              {file}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold border ${
                staged ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {staged ? 'Staged' : 'Unstaged'}
            </span>
            <DiffCounts {...counts} />
          </>
        }
        toolbar={
          diff && (
            <>
              {conflicted && (
                <button onClick={() => onResolveConflict(file)} className={`${toolbarButton} bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-200`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Resolve
                </button>
              )}
              <button
                onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
                aria-pressed={ignoreWhitespace}
                title="Hide whitespace-only changes"
                className={`${toolbarButton} ${ignoreWhitespace ? 'bg-teal-500/20 text-teal-200 border-teal-500/50' : 'bg-[#202735] text-slate-400 border-[#2a3447] hover:text-slate-200'}`}
              >
                Whitespace
              </button>
              <button onClick={() => onBlame(file)} title="Blame" className={`${toolbarButton} bg-[#202735] border-[#2a3447] text-slate-300 hover:bg-[#2d384c]`}>
                <Clock className="w-3.5 h-3.5 text-teal-400" />
              </button>
              <button onClick={() => onFileHistory(file)} title="File history" aria-label="File history" className={`${toolbarButton} bg-[#202735] border-[#2a3447] text-slate-300 hover:bg-[#2d384c]`}><History className="w-3.5 h-3.5 text-teal-400" /></button>
              <button onClick={() => onExternalDiff(file, staged)} title="Open in your diff tool" className={`${toolbarButton} bg-[#202735] border-[#2a3447] text-slate-300 hover:bg-[#2d384c]`}>
                <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              </button>
              <button onClick={() => onExplain(diff)} title="Explain these changes with AI" className={`${toolbarButton} bg-teal-500/10 border-teal-500/40 text-teal-200 hover:bg-teal-500/20`}>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onToggleStaged}
                className={`${toolbarButton} ${staged ? 'bg-[#202735] border-[#2a3447] text-amber-200 hover:bg-[#2d384c]' : 'bg-teal-500 border-teal-500 text-white hover:bg-teal-400'}`}
              >
                {staged ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {staged ? 'Unstage file' : 'Stage file'}
              </button>
            </>
          )
        }
        selection={lines}
        onToggleLine={canPatch ? toggleLine : undefined}
        onLineContextMenu={canPatch ? openMenu : undefined}
        onHunkContextMenu={canPatch ? (event, hunk) => openMenu(event, hunk) : undefined}
        banner={
          banner || (ignoreWhitespace && diff && !conflicted) ? (
            <>
              {banner}
              {ignoreWhitespace && diff && !conflicted && (
                <div className="px-3 py-1.5 bg-sky-500/[0.06] border-b border-sky-500/20 text-[11px] text-sky-200">
                  Whitespace changes are hidden. Show them to stage or discard parts of this file.
                </div>
              )}
            </>
          ) : undefined
        }
        hunkActions={
          !canPatch
            ? undefined
            : (_, index) =>
                sideActions.map((action) => (
                  <button key={action} disabled={busy} title={`${label[action]} hunk`} onClick={() => apply(action, wholeHunk(index))} className={`${hunkButton} inline-flex items-center gap-1 ${tone[action]}`}>
                    {action === 'stage' ? <Plus className="w-3 h-3" /> : action === 'unstage' ? <Minus className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}{label[action]} hunk
                  </button>
                ))
        }
      />
      {selectedCount > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-[#1b222f] border border-teal-500/50 shadow-2xl select-none">
          <span className="text-xs text-teal-300 font-semibold">
            {selectedCount} line{selectedCount === 1 ? '' : 's'}
          </span>
          {sideActions.map((action) => (
            <button key={action} disabled={busy} onClick={() => apply(action, lines)} className={`${hunkButton} rounded-full px-3 py-1 text-xs ${tone[action]}`}>
              {label[action]}
            </button>
          ))}
          <button onClick={() => setSelection({ key: '', lines: new Map() })} className="text-xs text-slate-400 hover:text-slate-200 underline">
            Clear
          </button>
        </div>
      )}
      <PatchContextMenu position={context} items={menuItems} onClose={() => setContext(null)} />
    </div>
  );
};
