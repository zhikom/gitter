import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { FileCommitHistory, FileDiff } from '../../../shared/types/git';
import { api } from '../../api/client';
import { DiffView } from '../Diff/DiffView';
import { Button, inputClass, Modal } from '../ui/Modal';

interface Props { repo: string; initialPath?: string; onClose: () => void; onOpenCommit: (hash: string) => void }

export const HistorySearchModal: React.FC<Props> = ({ repo, initialPath = '', onClose, onOpenCommit }) => {
  const [text, setText] = useState('');
  const [directory, setDirectory] = useState(initialPath);
  const [searchedDirectory, setSearchedDirectory] = useState(initialPath);
  const [results, setResults] = useState<FileCommitHistory[] | null>(null);
  const [selected, setSelected] = useState<FileCommitHistory | null>(null);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSelected(null); setFiles([]);
    try { const items = await api.searchHistory({ repo, text, directory }); setSearchedDirectory(directory); setResults(items); setSelected(items[0] ?? null); }
    catch (e: any) { setError(String(e?.message || e)); setResults([]); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let current = true;
    setFiles([]); setPath('');
    if (selected) void api.commitDiff({ repo, hash: selected.hash }).then((items) => {
      if (!current) return;
      const relevant = searchedDirectory ? items.filter((item) => item.path === searchedDirectory || item.path.startsWith(`${searchedDirectory.replace(/\/$/, '')}/`) || item.oldPath === searchedDirectory || item.oldPath?.startsWith(`${searchedDirectory.replace(/\/$/, '')}/`)) : items;
      setFiles(relevant); setPath(relevant[0]?.path || '');
    }).catch((e) => { if (current) setError(`Could not load changes: ${e.message}`); });
    return () => { current = false; };
  }, [repo, selected, searchedDirectory]);
  return <Modal width="full" tall icon={<Search className="w-4 h-4" />} title="Search history" subtitle="Find commits that added or removed text, or view a directory's history" onClose={onClose} actions={<Button disabled={!selected} onClick={() => selected && onOpenCommit(selected.hash)}>Open commit</Button>}>
    <form onSubmit={(event) => void search(event)} className="flex gap-2 px-3 py-2 border-b border-[#2a3447]">
      <input aria-label="Text in changed lines" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text added or removed (optional)" className={inputClass} />
      <input aria-label="Directory or file" value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="Directory or file, relative to repository (optional)" className={inputClass} />
      <Button type="submit" tone="primary" disabled={!text && !directory} busy={busy}>Search</Button>
    </form>
    {error && <div role="alert" className="px-3 py-2 text-xs text-rose-300">{error}</div>}
    <div className="flex flex-1 min-h-0">
      <div className="w-72 flex-shrink-0 overflow-auto border-r border-[#2a3447] p-2 text-xs">
        {results === null ? <p className="p-2 text-slate-500">Search text across branches, or enter a directory to browse its history.</p> : results.length === 0 ? <p className="p-2 text-slate-500">No matching commits.</p> : <p className="px-2 py-1 text-slate-500">Up to 300 commits</p>}
        {results?.map((item) => <button key={item.hash} onClick={() => setSelected(item)} className={`block w-full text-left rounded p-2 ${selected?.hash === item.hash ? 'bg-[#263245]' : 'hover:bg-[#202735]'}`}><div className="text-slate-200 truncate">{item.summary}</div><div className="text-slate-500 text-[10px] mt-1">{item.shortHash} · {item.author} · {item.date}</div></button>)}
      </div>
      <div className="w-48 flex-shrink-0 overflow-auto border-r border-[#2a3447] p-2 text-xs">{files.map((item) => <button key={item.path} onClick={() => setPath(item.path)} className={`block w-full text-left rounded p-2 break-all ${path === item.path ? 'text-teal-300 bg-[#263245]' : 'text-slate-400 hover:bg-[#202735]'}`}>{item.path}</button>)}</div>
      <DiffView diff={files.find((item) => item.path === path)} emptyLabel={selected ? 'No matching file diff in this commit.' : 'Select a commit to see its changes.'} />
    </div>
  </Modal>;
};
