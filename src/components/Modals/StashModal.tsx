import React, { useState } from 'react';
import { X, Archive, CheckSquare, Square, FileText } from 'lucide-react';
import { FileStatus } from '../../types/git';

import { toast } from '../../utils/toast';

export interface StashSaveOptions {
  message: string;
  includeUntracked: boolean;
  /** Paths to stash; undefined stashes every change. */
  files?: string[];
  /** Re-apply the stash right away so the changes stay in the working tree. */
  keepWorkingChanges: boolean;
}

interface StashModalProps {
  files?: FileStatus[];
  onClose: () => void;
  onSave: (options: StashSaveOptions) => Promise<void>;
}

export const StashModal: React.FC<StashModalProps> = ({ files = [], onClose, onSave }) => {
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [keepWorkingChanges, setKeepWorkingChanges] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set(files.map((f) => f.path)));
  const [loading, setLoading] = useState(false);

  const allSelected = selectedFiles.size === files.length;

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedFiles(allSelected ? new Set() : new Set(files.map((f) => f.path)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length > 0 && selectedFiles.size === 0) return;
    setLoading(true);
    try {
      await onSave({
        message: message.trim(),
        includeUntracked,
        // Stashing everything needs no pathspec, which also covers files git lists as directories.
        files: files.length > 0 && !allSelected ? Array.from(selectedFiles) : undefined,
        keepWorkingChanges,
      });
      onClose();
    } catch (e: any) {
      toast(`Stash failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const submitLabel =
    files.length > 0 && !allSelected
      ? `Stash ${selectedFiles.size} ${selectedFiles.size === 1 ? 'file' : 'files'}`
      : 'Save Stash';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <Archive className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-sm text-slate-100">Stash Changes</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col flex-1 min-h-0 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Stash Message (Optional)
            </label>
            <input
              type="text"
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. WIP on feature/search"
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Files to stash ({selectedFiles.size} of {files.length}):</span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto max-h-56 bg-[#13171f] border border-[#2a3447] rounded p-1 space-y-0.5">
                {files.map((f) => {
                  const checked = selectedFiles.has(f.path);
                  return (
                    <div
                      key={f.path}
                      onClick={() => toggleFile(f.path)}
                      className={`flex items-center space-x-2 px-2 py-1.5 rounded cursor-pointer text-xs transition ${
                        checked ? 'bg-[#1e2636] text-slate-200' : 'hover:bg-[#181d26] text-slate-400'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      )}
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate font-mono text-[11px]">{f.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              className="rounded bg-[#14181f] border-[#2a3447] text-amber-500 focus:ring-0"
            />
            <span>Include untracked files (-u)</span>
          </label>

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={keepWorkingChanges}
              onChange={(e) => setKeepWorkingChanges(e.target.checked)}
              className="rounded bg-[#14181f] border-[#2a3447] text-amber-500 focus:ring-0"
            />
            <span>Keep changes in the working directory (save a snapshot only)</span>
          </label>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#2a3447]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (files.length > 0 && selectedFiles.size === 0)}
              className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs shadow-md transition disabled:opacity-40"
            >
              {loading ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
