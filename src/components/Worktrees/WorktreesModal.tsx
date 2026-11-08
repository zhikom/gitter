import React, { useState, useEffect } from 'react';
import { Worktree } from '../../types/git';
import { api } from '../../api/client';
import {
  X,
  Layers,
  Plus,
  Trash2,
  FolderOpen,
  GitBranch,
  CheckCircle,
} from 'lucide-react';

import { toast } from '../../utils/toast';
interface WorktreesModalProps {
  repoPath: string;
  onClose: () => void;
  onSwitchWorktree: (path: string) => void;
}

export const WorktreesModal: React.FC<WorktreesModalProps> = ({
  repoPath,
  onClose,
  onSwitchWorktree,
}) => {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [targetPath, setTargetPath] = useState('');
  const [branch, setBranch] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchWorktrees = () => {
    setLoading(true);
    api.getWorktrees(repoPath)
      .then((data) => setWorktrees(data))
      .catch((e) => console.error('Worktree error:', e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorktrees();
  }, [repoPath]);

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPath.trim() || !branch.trim() || isAdding) return;

    setIsAdding(true);
    try {
      await api.addWorktree(repoPath, targetPath.trim(), branch.trim());
      setTargetPath('');
      setBranch('');
      setShowAddForm(false);
      fetchWorktrees();
    } catch (e: any) {
      toast(`Add worktree error: ${e.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveWorktree = async (wtPath: string) => {
    if (!confirm(`Remove worktree at ${wtPath}?`)) return;

    try {
      await api.removeWorktree(repoPath, wtPath);
      fetchWorktrees();
    } catch (e: any) {
      toast(`Remove error: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-3xl bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100">Git Worktree Manager</span>
              <span className="block text-xs text-slate-400">
                Work on multiple branches simultaneously in isolated directories
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white text-xs font-semibold shadow-md transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Worktree</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form onSubmit={handleAddWorktree} className="bg-[#15232d] p-4 border-b border-teal-500/30 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">New Directory Path</label>
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="e.g. C:\Users\home\repos\gitter-feature"
                  className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Branch Name</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. feature/cool-feature"
                  className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding || !targetPath.trim() || !branch.trim()}
                className="px-4 py-1 rounded bg-teal-500 hover:bg-teal-400 text-white font-semibold text-xs transition disabled:opacity-40"
              >
                {isAdding ? 'Creating...' : 'Create Worktree'}
              </button>
            </div>
          </form>
        )}

        {/* Worktrees List */}
        <div className="p-4 space-y-2.5 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-xs">Loading worktrees...</div>
          ) : worktrees.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">No active worktrees</div>
          ) : (
            worktrees.map((wt) => (
              <div
                key={wt.path}
                className={`flex items-center justify-between p-3 rounded border transition ${
                  wt.isCurrent
                    ? 'bg-teal-500/10 border-teal-500/40 text-slate-100'
                    : 'bg-[#181d26] border-[#2a3447] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className="p-2 rounded bg-[#202735] text-teal-400">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-semibold truncate">{wt.path}</span>
                      {wt.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center space-x-1">
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>ACTIVE</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                      <GitBranch className="w-3 h-3 text-emerald-400" />
                      <span>{wt.branch || 'HEAD'}</span>
                      <span>•</span>
                      <span className="font-mono text-slate-500">{wt.head.slice(0, 7)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {!wt.isCurrent && (
                    <>
                      <button
                        onClick={() => {
                          onSwitchWorktree(wt.path);
                          onClose();
                        }}
                        className="px-3 py-1 rounded bg-[#202735] hover:bg-[#283244] border border-[#2a3447] text-xs font-medium text-teal-300 transition"
                      >
                        Switch To
                      </button>
                      <button
                        onClick={() => handleRemoveWorktree(wt.path)}
                        title="Remove Worktree"
                        className="p-1.5 hover:text-red-400 text-slate-500 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
