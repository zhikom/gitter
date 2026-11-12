import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { FileCommitHistory, FileDiff } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { DiffView } from '../Diff/DiffView';
import { Button, Modal } from '../ui/Modal';

interface FileHistoryModalProps {
  file: string;
  repo: string;
  onClose: () => void;
  onOpenCommit: (hash: string) => void;
}

/** Every commit that changed a file, following renames, with each one's change to it. */
export const FileHistoryModal: React.FC<FileHistoryModalProps> = ({ file, repo, onClose, onOpenCommit }) => {
  const [history, setHistory] = useState<FileCommitHistory[] | null>(null);
  const [selected, setSelected] = useState<FileCommitHistory | null>(null);
  const [diff, setDiff] = useState<FileDiff | undefined>();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let current = true;
    api
      .fileHistory({ repo, file })
      .then((revisions) => {
        if (!current) return;
        setHistory(revisions);
        setSelected(revisions[0] ?? null);
      })
      .catch((e) => {
        if (current) setHistory([]);
        toast.error(`Could not load the file's history: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo, file]);

  useEffect(() => {
    let current = true;
    setDiff(undefined);
    if (selected) {
      api
        .fileCommitDiff({ repo, hash: selected.hash, file })
        .then((diffs) => current && setDiff(diffs[0]))
        .catch((e) => toast.error(`Could not load the change: ${e.message}`));
    }
    return () => {
      current = false;
    };
  }, [repo, file, selected]);

  const needle = filter.toLowerCase();
  const shown = (history ?? []).filter((h) => !needle || `${h.summary} ${h.author} ${h.shortHash}`.toLowerCase().includes(needle));

  return (
    <Modal width="xl" tall icon={<History className="w-4 h-4" />} title="File history" subtitle={file} onClose={onClose}>
      <div className="flex-1 min-h-0 flex">
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-[#2a3447] bg-[#181d26]">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by message, author or hash…"
            aria-label="Filter revisions"
            className="m-2 bg-[#14181f] border border-[#2a3447] rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
          />
          <div role="listbox" aria-label="Revisions" className="flex-1 overflow-y-auto p-1 space-y-0.5">
            {!history && <div className="p-4 text-center text-xs text-slate-500">Loading…</div>}
            {history && shown.length === 0 && <div className="p-4 text-center text-xs text-slate-500">No revisions.</div>}
            {shown.map((revision) => (
              <button
                key={revision.hash}
                role="option"
                aria-selected={selected?.hash === revision.hash}
                onClick={() => setSelected(revision)}
                className={`w-full text-left px-2.5 py-2 rounded text-xs transition ${
                  selected?.hash === revision.hash ? 'bg-[#263245] text-teal-100' : 'text-slate-300 hover:bg-[#202735]'
                }`}
              >
                <div className="truncate font-medium">{revision.summary}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="font-mono text-teal-400/80">{revision.shortHash}</span>
                  <span className="truncate">{revision.author}</span>
                  <span className="ml-auto flex-shrink-0">{revision.date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <DiffView
          diff={diff}
          emptyLabel={history?.length === 0 ? 'No commits change this file.' : 'Select a revision.'}
          title={selected && <span className="text-xs text-slate-300 truncate">{selected.summary}</span>}
          toolbar={selected && <Button onClick={() => onOpenCommit(selected.hash)}>Open commit</Button>}
        />
      </div>
    </Modal>
  );
};
