// One file's diff, read-only: unified or side-by-side, with the view settings
// from Preferences. Callers add per-hunk buttons (stage, reject) through
// `hunkActions`, and line selection through `selection` and `onToggleLine`.
import React from 'react';
import { AlignLeft, ArrowLeft, Columns, FileCode, WrapText } from 'lucide-react';
import type { DiffHunk, DiffLine, FileDiff } from '../../../shared/types/git';
import { usePreference } from '../../preferences';
import { useCodeTypography } from '../../useCodeTypography';

interface DiffViewProps {
  diff: FileDiff | undefined;
  /** Left of the view toolbar: usually the file name and counts. */
  title?: React.ReactNode;
  /** Right of the view toolbar, before the view toggles. */
  toolbar?: React.ReactNode;
  /** Between the toolbar and the hunks, e.g. a warning. */
  banner?: React.ReactNode;
  hunkActions?: (hunk: DiffHunk, index: number) => React.ReactNode;
  selection?: ReadonlyMap<number, ReadonlySet<number>>;
  onToggleLine?: (hunkIndex: number, lineIndex: number) => void;
  onLineContextMenu?: (event: React.MouseEvent, hunkIndex: number, lineIndex: number) => void;
  onHunkContextMenu?: (event: React.MouseEvent, hunkIndex: number) => void;
  onBack?: () => void;
  emptyLabel?: string;
}

export function diffCounts(diff: FileDiff | undefined): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of diff?.hunks ?? []) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions++;
      else if (line.type === 'delete') deletions++;
    }
  }
  return { additions, deletions };
}

export const DiffCounts: React.FC<{ additions: number; deletions: number }> = ({ additions, deletions }) => (
  <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums">
    <span className="text-emerald-400">+{additions}</span>
    <span className="text-rose-400">−{deletions}</span>
  </span>
);

const LINE_TONE: Record<DiffLine['type'], string> = {
  add: 'bg-emerald-500/10 text-emerald-200',
  delete: 'bg-rose-500/10 text-rose-200',
  context: 'text-slate-300',
};
const SIGN: Record<DiffLine['type'], string> = { add: '+', delete: '−', context: ' ' };

export const DiffView: React.FC<DiffViewProps> = ({
  diff,
  title,
  toolbar,
  banner,
  hunkActions,
  selection,
  onToggleLine,
  onLineContextMenu,
  onHunkContextMenu,
  onBack,
  emptyLabel = 'Select a file to see its changes.',
}) => {
  const [view, setView] = usePreference('diffView');
  const [wrap, setWrap] = usePreference('wordWrap');
  const typography = useCodeTypography();
  const [tabSize] = usePreference('tabSize');
  const textClass = wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre';

  if (!diff) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {onBack && <button onClick={onBack} className="self-start m-2 px-2 py-1 text-xs text-slate-300 hover:text-white">← Back to graph</button>}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 select-none p-6 text-center">
          <FileCode className="w-10 h-10 opacity-25 text-teal-400" />
          <span className="text-xs">{emptyLabel}</span>
        </div>
      </div>
    );
  }

  const toggle = (active: boolean) =>
    `p-1 rounded ${active ? 'bg-[#2d384c] text-teal-300' : 'text-slate-400 hover:text-slate-200'}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#14181f]">
      <div className="min-h-9 flex-shrink-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1 bg-[#1b212c] border-b border-[#2a3447] select-none">
        <div className="flex min-w-[130px] flex-1 items-center gap-2">
          {onBack && <button onClick={onBack} title="Back to graph" aria-label="Back to graph" className="p-1 rounded text-slate-400 hover:bg-[#2d384c] hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          {title}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {toolbar}
          <button onClick={() => setWrap(!wrap)} title="Wrap long lines" aria-pressed={wrap} className={toggle(wrap)}>
            <WrapText className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center bg-[#14181f] border border-[#2a3447] rounded p-0.5">
            <button onClick={() => setView('unified')} title="Unified" aria-pressed={view === 'unified'} className={toggle(view === 'unified')}>
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('split')} title="Side by side" aria-pressed={view === 'split'} className={toggle(view === 'split')}>
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      {banner}
      <div style={{ ...typography, tabSize }} className="flex-1 overflow-auto p-2 font-mono leading-relaxed select-text">
        {diff.isBinary ? (
          <div className="p-8 text-center text-slate-500 italic">Binary file; no text diff.</div>
        ) : diff.hunks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic">No line changes (mode or whitespace only).</div>
        ) : (
          diff.hunks.map((hunk, h) => (
            <section key={`${h}:${hunk.header}`} className="mb-3 border border-[#222a38] rounded overflow-hidden">
              <div onContextMenu={onHunkContextMenu ? (event) => onHunkContextMenu(event, h) : undefined} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1 bg-[#181e29] border-b border-[#222a38] text-[11px] select-none">
                <span className="flex min-w-[110px] flex-1 items-center gap-2"><span className="text-teal-400/90 truncate">{hunk.header}</span><DiffCounts additions={hunk.lines.filter((line) => line.type === 'add').length} deletions={hunk.lines.filter((line) => line.type === 'delete').length} /></span>
                <span className="flex flex-wrap items-center gap-1.5 font-sans">{hunkActions?.(hunk, h)}</span>
              </div>
              {view === 'unified' ? (
                <div className="bg-[#12161d]">
                  {hunk.lines.map((line, l) => {
                    const selectable = Boolean(onToggleLine) && line.type !== 'context';
                    const selected = selection?.get(h)?.has(l);
                    return (
                      <div
                        key={l}
                        onClick={selectable ? () => onToggleLine!(h, l) : undefined}
                        onContextMenu={onLineContextMenu ? (event) => onLineContextMenu(event, h, l) : undefined}
                        role={selectable ? 'button' : undefined}
                        tabIndex={selectable ? 0 : undefined}
                        aria-pressed={selectable ? Boolean(selected) : undefined}
                        onKeyDown={selectable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleLine!(h, l); } } : undefined}
                        className={`flex ${selected ? 'bg-teal-500/25 ring-1 ring-inset ring-teal-500/40' : LINE_TONE[line.type]} ${selectable ? 'cursor-pointer' : ''}`}
                      >
                        <span className="w-10 flex-shrink-0 pr-2 text-right text-slate-600 select-none border-r border-[#222a38]">{line.oldLineNumber ?? ''}</span>
                        <span className="w-10 flex-shrink-0 pr-2 text-right text-slate-600 select-none border-r border-[#222a38]">{line.newLineNumber ?? ''}</span>
                        <span className="w-5 flex-shrink-0 text-center select-none">{selected ? '✓' : SIGN[line.type]}</span>
                        <span className={`flex-1 pr-2 ${textClass}`}>{line.text}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <SplitHunk hunk={hunk} textClass={textClass} selected={selection?.get(h)} onToggle={onToggleLine && ((l) => onToggleLine(h, l))} onContext={onLineContextMenu && ((event, l) => onLineContextMenu(event, h, l))} />
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
};

type Indexed = { line: DiffLine; index: number } | null;

/** Side by side: deletions on the left paired with the additions that replace them. */
const SplitHunk: React.FC<{ hunk: DiffHunk; textClass: string; selected?: ReadonlySet<number>; onToggle?: (lineIndex: number) => void; onContext?: (event: React.MouseEvent, lineIndex: number) => void }> = ({
  hunk,
  textClass,
  selected,
  onToggle,
  onContext,
}) => {
  const rows: Array<[Indexed, Indexed]> = [];
  for (let i = 0; i < hunk.lines.length; ) {
    const line = hunk.lines[i];
    if (line.type === 'context') {
      rows.push([{ line, index: i }, { line, index: i }]);
      i++;
      continue;
    }
    const deleted: Indexed[] = [];
    const added: Indexed[] = [];
    while (i < hunk.lines.length && hunk.lines[i].type === 'delete') deleted.push({ line: hunk.lines[i], index: i++ });
    while (i < hunk.lines.length && hunk.lines[i].type === 'add') added.push({ line: hunk.lines[i], index: i++ });
    for (let k = 0; k < Math.max(deleted.length, added.length); k++) rows.push([deleted[k] ?? null, added[k] ?? null]);
  }
  const cell = (entry: Indexed, side: 'old' | 'new') => {
    const line = entry?.line;
    const selectable = Boolean(onToggle && line && line.type !== 'context');
    const isSelected = entry && selected?.has(entry.index);
    return (
      <div
        onClick={selectable ? () => onToggle!(entry!.index) : undefined}
        onContextMenu={entry && onContext ? (event) => onContext(event, entry.index) : undefined}
        role={selectable ? 'button' : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-pressed={selectable ? Boolean(isSelected) : undefined}
        onKeyDown={selectable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle!(entry!.index); } } : undefined}
        className={`flex ${isSelected ? 'bg-teal-500/25 ring-1 ring-inset ring-teal-500/40' : line ? LINE_TONE[line.type] : 'bg-black/20'} ${selectable ? 'cursor-pointer' : ''}`}
      >
        <span className="w-10 flex-shrink-0 pr-2 text-right text-slate-600 select-none border-r border-[#222a38]">
          {(side === 'old' ? line?.oldLineNumber : line?.newLineNumber) ?? ''}
        </span>
        <span className={`flex-1 px-2 ${textClass}`}>{line?.text ?? ''}</span>
      </div>
    );
  };
  return (
    <div className="bg-[#12161d]">
      {rows.map(([left, right], i) => (
        <div key={i} className="grid grid-cols-2 divide-x divide-[#222a38]">
          {cell(left, 'old')}
          {cell(right, 'new')}
        </div>
      ))}
    </div>
  );
};
