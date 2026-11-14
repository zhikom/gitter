import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, History } from 'lucide-react';
import type { SelectionHistoryRevision } from '../../../shared/types/git';
import { api } from '../../api/client';
import { usePreference } from '../../preferences';
import { useCodeTypography } from '../../useCodeTypography';
import { DiffView } from '../Diff/DiffView';
import { Button, Modal } from '../ui/Modal';

interface Props {
  repo: string;
  file: string;
  revision?: string;
  onClose: () => void;
  onOpenCommit: (hash: string) => void;
}

/** Pick lines from a committed version, then trace those exact lines through Git. */
export const SelectionHistoryModal: React.FC<Props> = ({ repo, file, revision, onClose, onOpenCommit }) => {
  const [source, setSource] = useState<{ revision: string; lines: string[] } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [history, setHistory] = useState<SelectionHistoryRevision[] | null>(null);
  const [selected, setSelected] = useState<SelectionHistoryRevision | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tabSize] = usePreference('tabSize');
  const typography = useCodeTypography();
  const anchorRef = useRef<number | null>(null);
  const start = anchor !== null && active !== null ? Math.min(anchor, active) : null;
  const end = anchor !== null && active !== null ? Math.max(anchor, active) : null;

  useEffect(() => {
    let live = true;
    setSource(null); setError('');
    api.selectionSource({ repo, file, revision })
      .then((value) => { if (live) setSource(value); })
      .catch((e) => { if (live) setError(`Could not open the committed file: ${e.message}. New or uncommitted-only files have no committed history yet.`); });
    return () => { live = false; };
  }, [repo, file, revision]);

  const select = (line: number, extend: boolean) => {
    if (!extend || anchorRef.current === null) { anchorRef.current = line; setAnchor(line); }
    setActive(line);
  };

  const load = async () => {
    if (!source || start === null || end === null) return;
    setShowHistory(true); setBusy(true); setHistory(null); setSelected(null); setError('');
    try {
      const found = await api.selectionHistory({ repo, file, revision: source.revision, start, end });
      setHistory(found); setSelected(found[0] ?? null);
    } catch (e: any) { setHistory([]); setError(`Could not load selection history: ${e.message}`); }
    finally { setBusy(false); }
  };

  return <Modal width="full" tall icon={<History className="w-4 h-4" />} title="History for selection"
    subtitle={`${file} · ${revision ? `at ${revision.slice(0, 7)}` : 'committed version at HEAD'}${start === null ? '' : ` · lines ${start}${end === start ? '' : `–${end}`}`}`}
    onClose={onClose}
    actions={showHistory ? <Button onClick={() => { setShowHistory(false); setError(''); }}><ArrowLeft className="w-3.5 h-3.5" /> Choose lines</Button> : <Button tone="primary" disabled={!source || start === null || busy} onClick={() => void load()}>Show history</Button>}>
    {error && <div role="alert" className="px-4 py-2 text-xs text-rose-300 bg-rose-500/10 border-b border-rose-500/20">{error}</div>}
    {!showHistory ? <>
      <div className="px-4 py-2 text-xs text-slate-400 border-b border-[#2a3447]">Click or drag across lines; Shift-click extends the selection. This shows committed source, so uncommitted changes are not included.</div>
      <div role="listbox" aria-label="Source lines" aria-multiselectable="true" style={{ ...typography, tabSize }} className="flex-1 overflow-auto bg-[#14181f] font-mono text-xs select-none">
        {!source && !error && <div className="p-6 text-slate-500">Loading committed file…</div>}
        {source?.lines.length === 0 && <div className="p-6 text-slate-500">This file is empty in the selected revision.</div>}
        {source?.lines.map((text, index) => {
          const line = index + 1;
          const chosen = start !== null && end !== null && line >= start && line <= end;
          return <div key={line} role="option" aria-label={`Line ${line}: ${text}`} aria-selected={chosen} tabIndex={line === (active ?? 1) ? 0 : -1}
            onMouseDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); select(line, event.shiftKey); }}
            onMouseEnter={(event) => { if (event.buttons === 1 && anchorRef.current !== null) setActive(line); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(line, event.shiftKey); }
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && source) {
                event.preventDefault();
                const next = Math.max(1, Math.min(source.lines.length, line + (event.key === 'ArrowDown' ? 1 : -1)));
                select(next, event.shiftKey);
                (event.currentTarget.parentElement?.querySelector(`[data-line="${next}"]`) as HTMLElement | null)?.focus();
              }
            }} data-line={line}
            className={`flex cursor-pointer ${chosen ? 'bg-teal-500/20 text-slate-100' : 'text-slate-300 hover:bg-[#202735]'}`}>
            <span className="w-14 flex-shrink-0 text-right pr-3 text-slate-500 border-r border-[#222a38]">{line}</span><span className="px-3 whitespace-pre">{text || ' '}</span>
          </div>;
        })}
      </div>
    </> : <div className="flex flex-1 min-h-0">
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-[#2a3447] bg-[#181d26]">
        <div className="p-3 text-xs text-slate-400">{busy ? 'Tracing selected lines…' : `${history?.length ?? 0} revision${history?.length === 1 ? '' : 's'}`}</div>
        <div role="listbox" aria-label="Selection revisions" className="flex-1 overflow-y-auto p-1 space-y-0.5">
          {!busy && history?.length === 0 && <p className="p-3 text-xs text-slate-500">No commits found for these lines.</p>}
          {history?.map((entry) => <button key={entry.hash} role="option" aria-selected={selected?.hash === entry.hash} onClick={() => setSelected(entry)} className={`w-full text-left px-2.5 py-2 rounded text-xs ${selected?.hash === entry.hash ? 'bg-[#263245] text-teal-100' : 'text-slate-300 hover:bg-[#202735]'}`}>
            <div className="truncate font-medium">{entry.summary}</div><div className="mt-1 flex gap-2 text-[10px] text-slate-500"><span className="font-mono text-teal-400">{entry.shortHash}</span><span className="truncate">{entry.author}</span><span className="ml-auto">{entry.date}</span></div>
          </button>)}
        </div>
      </div>
      <DiffView diff={selected?.diff} emptyLabel={busy ? 'Tracing history…' : 'Select a revision to see its changes.'}
        title={selected && <span className="text-xs text-slate-300 truncate">{selected.summary}</span>}
        toolbar={selected && <Button onClick={() => onOpenCommit(selected.hash)}>Open commit</Button>} />
    </div>}
  </Modal>;
};
