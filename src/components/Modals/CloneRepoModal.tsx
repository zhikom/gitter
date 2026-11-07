import React, { useState } from 'react';
import { X, DownloadCloud, Folder } from 'lucide-react';

interface CloneRepoModalProps {
  onClose: () => void;
  onClone: (url: string, targetPath: string) => Promise<void>;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ onClose, onClone }) => {
  const [url, setUrl] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !targetPath.trim() || loading) return;

    setLoading(true);
    try {
      await onClone(url.trim(), targetPath.trim());
      onClose();
    } catch (e: any) {
      alert(`Clone failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <DownloadCloud className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm text-slate-100">Clone Repository</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Repository URL (HTTPS or SSH)
            </label>
            <input
              type="text"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repository.git"
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Destination Directory Path
            </label>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="e.g. C:\Users\home\repos\my-new-repo"
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
              disabled={!url.trim() || !targetPath.trim() || loading}
              className="px-4 py-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white font-semibold text-xs shadow-md transition disabled:opacity-40"
            >
              {loading ? 'Cloning...' : 'Clone Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
