import React, { useState } from 'react';
import { Archive } from 'lucide-react';
import type { FileStatus } from '../../../shared/types/git';
import { StatusLetter } from '../Diff/ChangedFileList';
import { Button, Field, inputClass, Modal } from '../ui/Modal';

export interface StashSaveOptions {
  message: string;
  includeUntracked: boolean;
  /** Paths to stash; undefined stashes every change. */
  files?: string[];
  /** Re-apply the stash right away so the changes stay in the working tree. */
  keepWorkingChanges: boolean;
}

interface StashModalProps {
  files: FileStatus[];
  onClose: () => void;
  /** Resolves once saved; a failure leaves the dialog open. */
  onSave: (options: StashSaveOptions) => Promise<void>;
}

const STATUS_LETTER: Record<FileStatus['status'], string> = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: '?', conflicted: 'M' };

export const StashModal: React.FC<StashModalProps> = ({ files, onClose, onSave }) => {
  // A file can be listed twice (staged and unstaged); it is stashed once.
  const paths = [...new Set(files.map((f) => f.path))];
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [keepWorkingChanges, setKeepWorkingChanges] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(paths));
  const [busy, setBusy] = useState(false);
  const all = chosen.size === paths.length;

  const toggle = (path: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Stashing everything needs no pathspec, which also covers files git lists as directories.
      await onSave({ message: message.trim(), includeUntracked, files: all ? undefined : [...chosen], keepWorkingChanges });
      onClose();
    } catch {
      // Reported by the action.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal width="md" icon={<Archive className="w-4 h-4 text-amber-400" />} title="Stash changes" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <Field label="Message (optional)">
          <input autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Half-done search filter" className={inputClass} />
        </Field>
        {paths.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>
                Files ({chosen.size} of {paths.length})
              </span>
              <button type="button" onClick={() => setChosen(all ? new Set() : new Set(paths))} className="text-amber-400 hover:text-amber-300 font-medium">
                {all ? 'Select none' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto bg-[#13171f] border border-[#2a3447] rounded p-1 space-y-0.5">
              {paths.map((path) => (
                <label key={path} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs hover:bg-[#181d26]">
                  <input type="checkbox" checked={chosen.has(path)} onChange={() => toggle(path)} />
                  <StatusLetter status={STATUS_LETTER[files.find((f) => f.path === path)!.status]} />
                  <span className="truncate font-mono text-[11px] text-slate-300">{path}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={includeUntracked} onChange={(e) => setIncludeUntracked(e.target.checked)} />
          Include untracked files
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={keepWorkingChanges} onChange={(e) => setKeepWorkingChanges(e.target.checked)} />
          Keep the changes here too (save a snapshot only)
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-[#2a3447]">
          <Button type="button" tone="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" busy={busy} disabled={paths.length > 0 && chosen.size === 0}>
            {all ? 'Stash all' : `Stash ${chosen.size} file${chosen.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
