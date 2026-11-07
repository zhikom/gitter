import React, { useState } from 'react';
import { X, FolderOpen } from 'lucide-react';

interface OpenRepoModalProps {
  currentPath: string;
  onClose: () => void;
  onOpen: (path: string) => void;
}

export const OpenRepoModal: React.FC<OpenRepoModalProps> = ({
  currentPath,
  onClose,
  onOpen,
}) => {
  const [repoPath, setRepoPath] = useState(currentPath);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    onOpen(repoPath.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-sm text-slate-100">Open Local Repository</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Repository Directory Path
            </label>
            <input
              type="text"
              autoFocus
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="e.g. C:\Users\home\repos\gitter"
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

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
              disabled={!repoPath.trim()}
              className="px-4 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white font-semibold text-xs shadow-md transition disabled:opacity-40"
            >
              Open Repository
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
