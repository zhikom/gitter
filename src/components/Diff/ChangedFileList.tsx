import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChangedFile, FileDiff } from '../../../shared/types/git';
import { diffCounts } from './DiffView';

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  A: { label: 'Added', className: 'text-emerald-400' },
  D: { label: 'Deleted', className: 'text-rose-400' },
  R: { label: 'Renamed', className: 'text-sky-400' },
  C: { label: 'Copied', className: 'text-sky-400' },
  T: { label: 'Type changed', className: 'text-amber-400' },
  '?': { label: 'Untracked', className: 'text-emerald-400' },
  M: { label: 'Modified', className: 'text-amber-300' },
};

export const StatusLetter: React.FC<{ status: string }> = ({ status }) => {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.M;
  return (
    <span title={style.label} className={`w-3 flex-shrink-0 text-center text-[10px] font-bold font-mono ${style.className}`}>
      {status === '?' ? 'U' : status}
    </span>
  );
};

/** The changed-file rows a list of parsed diffs implies, for views that load whole diffs. */
export function filesOfDiffs(diffs: FileDiff[]): ChangedFile[] {
  return diffs.map((d) => ({
    path: d.path,
    oldPath: d.oldPath,
    status: d.isNew ? 'A' : d.isDeleted ? 'D' : d.oldPath ? 'R' : 'M',
    ...diffCounts(d),
  }));
}

interface ChangedFileListProps {
  files: ChangedFile[];
  selected: string | null;
  onSelect: (path: string) => void;
  /** Files to flag, e.g. ones another agent also changed. */
  flagged?: ReadonlySet<string>;
  heading?: React.ReactNode;
  emptyLabel?: string;
}

/** Long lists get a filter box. */
const FILTER_FROM = 12;

export const ChangedFileList: React.FC<ChangedFileListProps> = ({ files, selected, onSelect, flagged, heading, emptyLabel = 'No changed files.' }) => {
  const [filter, setFilter] = useState('');
  const shown = filter ? files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())) : files;
  return (
  <div className="flex flex-col min-h-0 h-full bg-[#181d26]">
    <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#222a3a] select-none flex-shrink-0">
      {heading ?? `Changed files (${files.length})`}
    </div>
    {(files.length >= FILTER_FROM || filter) && (
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter files…"
        aria-label="Filter files"
        className="mx-2 mt-2 bg-[#14181f] border border-[#2a3447] rounded-md px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
      />
    )}
    <div role="listbox" aria-label="Changed files" className="flex-1 overflow-y-auto p-1 space-y-0.5">
      {shown.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-500">{files.length ? 'No file matches.' : emptyLabel}</div>}
      {shown.map((file) => {
        const name = file.path.split('/').pop() ?? file.path;
        const folder = file.path.slice(0, file.path.length - name.length);
        const active = file.path === selected;
        return (
          <button
            key={file.path}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(file.path)}
            title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition ${
              active ? 'bg-[#263245] text-teal-200' : 'text-slate-300 hover:bg-[#202735]'
            }`}
          >
            <StatusLetter status={file.status} />
            {flagged?.has(file.path) && <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />}
            <span className="min-w-0 flex-1 truncate font-mono">
              <span className={active ? 'font-semibold' : ''}>{name}</span>
              {folder && <span className="ml-1.5 text-[10px] text-slate-500">{folder}</span>}
            </span>
            <span className="flex-shrink-0 text-[10px] font-mono tabular-nums">
              <span className="text-emerald-400">+{file.additions}</span> <span className="text-rose-400">−{file.deletions}</span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
  );
};
