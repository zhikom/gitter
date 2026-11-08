import React, { useState } from 'react';
import { X, Bookmark, CheckSquare, Square, FileText } from 'lucide-react';
import { FileStatus } from '../../types/git';

import { toast } from '../../utils/toast';
interface ShelveModalProps {
  files: FileStatus[];
  onClose: () => void;
  onShelve: (name: string, files: string[], keepWorkingChanges: boolean) => Promise<void>;
}

export const ShelveModal: React.FC<ShelveModalProps> = ({ files, onClose, onShelve }) => {
  const [shelfName, setShelfName] = useState(() => {
    const d = new Date();
    return `Shelf: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  });
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set(files.map(f => f.path)));
  const [keepWorkingChanges, setKeepWorkingChanges] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleFile = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.path)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelfName.trim() || selectedFiles.size === 0) return;

    setLoading(true);
    try {
      await onShelve(shelfName.trim(), Array.from(selectedFiles), keepWorkingChanges);
      onClose();
    } catch (e: any) {
      toast(`Shelve failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <Bookmark className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-sm text-slate-100">Shelve Changes (JetBrains Shelf)</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col flex-1 min-h-0 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Shelf Name
            </label>
            <input
              type="text"
              autoFocus
              value={shelfName}
              onChange={(e) => setShelfName(e.target.value)}
              placeholder="e.g. Refactoring auth module"
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Files Selection */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Select files to shelve ({selectedFiles.size} of {files.length}):</span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-56 bg-[#13171f] border border-[#2a3447] rounded p-1 space-y-0.5">
              {files.length === 0 ? (
                <div className="text-xs text-slate-500 p-3 italic text-center">No modified files to shelve</div>
              ) : (
                files.map((f) => {
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
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      )}
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate font-mono text-[11px]">{f.path}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={keepWorkingChanges}
              onChange={(e) => setKeepWorkingChanges(e.target.checked)}
              className="rounded bg-[#14181f] border-[#2a3447] text-indigo-500 focus:ring-0"
            />
            <span>Keep files in working directory (do not revert after shelving)</span>
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
              disabled={loading || selectedFiles.size === 0 || !shelfName.trim()}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition disabled:opacity-40"
            >
              {loading ? 'Shelving...' : `Shelve ${selectedFiles.size} ${selectedFiles.size === 1 ? 'file' : 'files'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
