import React, { useState } from 'react';
import { X, Archive } from 'lucide-react';

import { toast } from '../../utils/toast';
interface StashModalProps {
  onClose: () => void;
  onSave: (message: string, includeUntracked: boolean) => Promise<void>;
}

export const StashModal: React.FC<StashModalProps> = ({ onClose, onSave }) => {
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(message.trim(), includeUntracked);
      onClose();
    } catch (e: any) {
      toast(`Stash failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <Archive className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-sm text-slate-100">Stash Changes</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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

          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              className="rounded bg-[#14181f] border-[#2a3447] text-amber-500 focus:ring-0"
            />
            <span>Include untracked files (-u)</span>
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
              disabled={loading}
              className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs shadow-md transition disabled:opacity-40"
            >
              {loading ? 'Saving...' : 'Save Stash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
