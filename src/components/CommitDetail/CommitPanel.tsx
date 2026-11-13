import React, { useState } from 'react';
import { Check, Copy, GitCommit, MoreHorizontal, Sparkles } from 'lucide-react';
import type { AIExplanation, Commit, FileDiff } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { filesOfDiffs, StatusLetter } from '../Diff/ChangedFileList';
import { DiffCounts } from '../Diff/DiffView';
import { Explanation } from '../Diff/Explanation';
import { PatchContextMenu, type PatchMenuItem } from '../Diff/PatchContextMenu';

interface Props {
  commit: Commit;
  diffs: FileDiff[] | null;
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  onWorkingChanges: () => void;
  onRestoreFiles: (files: string[]) => void;
  onApplyFile: (diff: FileDiff, reverse: boolean) => void;
  onCheckout: () => void;
  onBranch: () => void;
  onCherryPick: () => void;
  onRevert: () => void;
  onBlame: (file: string) => void;
  onHistory: (file: string) => void;
  onEdit: (file: string) => void;
  onReveal: (file: string) => void;
}

export const CommitPanel: React.FC<Props> = ({ commit, diffs, selectedFile, onSelectFile, onWorkingChanges, onRestoreFiles, onApplyFile, onCheckout, onBranch, onCherryPick, onRevert, onBlame, onHistory, onEdit, onReveal }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [context, setContext] = useState<{ x: number; y: number; files: string[] } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const files = filesOfDiffs(diffs ?? []);
  const shown = files.filter((file) => file.path.toLowerCase().includes(filter.toLowerCase()));
  const totals = files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 });
  const choose = (event: React.MouseEvent, file: string) => {
    if (event.shiftKey && anchor) {
      const start = shown.findIndex((item) => item.path === anchor);
      const end = shown.findIndex((item) => item.path === file);
      setSelected(start < 0 ? [file] : shown.slice(Math.min(start, end), Math.max(start, end) + 1).map((item) => item.path));
    } else if (event.metaKey || event.ctrlKey) {
      setSelected((current) => current.includes(file) ? current.filter((item) => item !== file) : [...current, file]);
      setAnchor(file);
    } else {
      setSelected([file]); setAnchor(file);
    }
    onSelectFile(file);
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); }
    catch { toast.error('Could not copy to the clipboard.'); }
  };
  const explain = async () => {
    if (!diffs) return;
    setExplaining(true);
    try { setExplanation(await api.explainChanges({ diff: diffs.map((d) => d.rawDiff).join('\n'), title: `Commit ${commit.shortHash}: ${commit.summary}` })); }
    catch (e: any) { toast.error(`AI review failed: ${e.message}`); }
    finally { setExplaining(false); }
  };
  const contextDiff = context?.files.length === 1 ? diffs?.find((d) => d.path === context.files[0]) : undefined;
  const items: PatchMenuItem[] = context ? [
    ...(context.files.length === 1 ? [{ label: 'View diff', run: () => onSelectFile(context.files[0]) }] : []),
    { label: context.files.length === 1 ? 'Restore file from this commit' : `Restore ${context.files.length} selected files from this commit`, danger: true, run: () => onRestoreFiles(context.files) },
    ...(contextDiff && !contextDiff.isBinary && !contextDiff.oldPath && contextDiff.hunks.length ? [
      { label: 'Apply file changes to working tree', run: () => onApplyFile(contextDiff, false) },
      { label: 'Revert file changes in working tree', danger: true, run: () => onApplyFile(contextDiff, true) },
    ] : []),
    ...(context.files.length === 1 ? [
      { label: 'Show file history', run: () => onHistory(context.files[0]) },
      { label: 'View blame', run: () => onBlame(context.files[0]) },
      { label: 'Open in editor', run: () => onEdit(context.files[0]) },
      { label: 'Reveal in file manager', run: () => onReveal(context.files[0]) },
      { label: 'Copy file path', run: () => void copy(context.files[0]) },
    ] : []),
  ] : [];

  return (
    <section aria-label="Commit details" className="flex h-full min-h-0 flex-col bg-[#181d26] text-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-[#2a3447] bg-[#1b212c] px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold"><GitCommit className="h-4 w-4 text-teal-400" /> Commit details</span>
        <button onClick={onWorkingChanges} className="rounded border border-[#344257] px-2 py-1 text-[11px] text-slate-300 hover:bg-[#283244]">Working changes</button>
      </div>
      <div className="space-y-2 border-b border-[#2a3447] px-3 py-3">
        <div className="break-words text-sm font-semibold text-slate-100">{commit.summary}</div>
        {commit.body && <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-400">{commit.body}</pre>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <span>{commit.author.name}</span><span>·</span><span>{commit.date}</span><span>·</span>
          <button title="Copy commit hash" onClick={() => { void copy(commit.hash); setCopied(true); setTimeout(() => setCopied(false), 1800); }} className="inline-flex items-center gap-1 font-mono text-teal-300">{commit.shortHash}{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={explain} disabled={!diffs?.length || explaining} title="Explain commit with AI" className="rounded border border-[#344257] px-2 py-1 text-[11px] text-teal-300 disabled:opacity-40 hover:bg-[#283244]"><Sparkles className="inline h-3 w-3" /> {explaining ? 'Reviewing…' : 'AI review'}</button>
          <button onClick={() => setActionsOpen((value) => !value)} aria-expanded={actionsOpen} className="rounded border border-[#344257] px-2 py-1 text-[11px] text-slate-300 hover:bg-[#283244]"><MoreHorizontal className="inline h-3 w-3" /> Actions</button>
        </div>
        {actionsOpen && <div className="flex flex-wrap gap-1.5 text-[11px]">{[
          ['Check out', onCheckout], ['Branch here', onBranch], ['Cherry-pick', onCherryPick], ['Revert commit', onRevert],
        ].map(([label, action]) => <button key={label as string} onClick={action as () => void} className="rounded bg-[#252e3d] px-2 py-1 text-slate-200 hover:bg-[#344257]">{label as string}</button>)}</div>}
      </div>
      {explanation && <Explanation explanation={explanation} />}
      <div className="flex items-center justify-between gap-2 border-b border-[#2a3447] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span>Changed files ({files.length})</span><DiffCounts {...totals} />
      </div>
      {(files.length >= 8 || filter) && <input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter changed files" placeholder="Filter files…" className="mx-2 mt-2 rounded border border-[#2a3447] bg-[#14181f] px-2 py-1.5 text-xs text-slate-200" />}
      <div role="listbox" aria-label="Commit files" aria-multiselectable="true" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
        {!diffs && <p className="px-3 py-5 text-xs text-slate-500">Loading changes…</p>}
        {diffs && !shown.length && <p className="px-3 py-5 text-xs text-slate-500">{files.length ? 'No file matches.' : 'This commit changes no files.'}</p>}
        {shown.map((file) => {
          const active = selected.includes(file.path) || (selected.length === 0 && selectedFile === file.path);
          return <button key={file.path} role="option" aria-selected={active} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
            onClick={(event) => choose(event, file.path)}
            onContextMenu={(event) => { event.preventDefault(); const targets = selected.includes(file.path) ? selected : [file.path]; if (!selected.includes(file.path)) { setSelected(targets); setAnchor(file.path); } setContext({ x: event.clientX, y: event.clientY, files: targets }); }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${active ? 'bg-[#2b3952] text-teal-100' : 'text-slate-300 hover:bg-[#222b39]'}`}>
            <StatusLetter status={file.status} /><span className="min-w-0 flex-1 truncate font-mono">{file.path}</span><DiffCounts additions={file.additions} deletions={file.deletions} />
          </button>;
        })}
      </div>
      <PatchContextMenu position={context} items={items} onClose={() => setContext(null)} />
    </section>
  );
};
