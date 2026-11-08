import React, { useState } from 'react';
import { X, FolderOpen, FolderSearch } from 'lucide-react';
import { api } from '../../api/client';

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
  const [browsing, setBrowsing] = useState(false);

  const handleBrowseNative = async () => {
    setBrowsing(true);
    try {
      const res = await api.pickNativeFolder();
      if (res && res.path) {
        setRepoPath(res.path);
        onOpen(res.path);
        onClose();
      }
    } catch (e: any) {
      alert(`Browse error: ${e.message}`);
    } finally {
      setBrowsing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    onOpen(repoPath.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-sm text-slate-100">Open Local Repository</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Repository Directory Path
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                autoFocus
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="e.g. C:\Users\home\repos\my-project"
                className="flex-1 bg-[#14181f] border border-[#2a3447] rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <button
                type="button"
                onClick={handleBrowseNative}
                disabled={browsing}
                className="px-3.5 py-2 rounded bg-[#202735] hover:bg-[#2b3548] border border-[#2c364a] text-teal-400 hover:text-teal-300 text-xs font-semibold transition flex items-center space-x-1.5 flex-shrink-0"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                <span>{browsing ? 'Opening...' : 'Browse...'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Select any directory containing a <code className="text-teal-400">.git</code> folder.
            </p>
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
