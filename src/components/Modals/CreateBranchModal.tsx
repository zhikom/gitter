import React, { useState } from 'react';
import { X, GitBranch } from 'lucide-react';

interface CreateBranchModalProps {
  startPoint: string;
  onClose: () => void;
  onCreate: (name: string, startPoint: string) => Promise<void>;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  startPoint,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;

    setLoading(true);
    try {
      await onCreate(name.trim(), startPoint);
      onClose();
    } catch (e: any) {
      alert(`Error creating branch: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm text-slate-100">Create New Branch</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Branch Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. feature/my-cool-feature"
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Starting Point
            </label>
            <div className="text-xs font-mono text-slate-400 px-3 py-1.5 bg-[#14181f] border border-[#2a3447] rounded">
              {startPoint}
            </div>
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
              disabled={!name.trim() || loading}
              className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold shadow-md transition disabled:opacity-40"
            >
              {loading ? 'Creating...' : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
