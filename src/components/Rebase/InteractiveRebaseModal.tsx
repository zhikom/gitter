import React, { useState, useEffect } from 'react';
import { RebaseCommitItem, RebaseActionType } from '../../types/git';
import { api } from '../../api/client';
import {
  X,
  GitMerge,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  Trash2,
  Edit3,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface InteractiveRebaseModalProps {
  baseHash: string;
  repoPath: string;
  onClose: () => void;
  onComplete: () => void;
}

export const InteractiveRebaseModal: React.FC<InteractiveRebaseModalProps> = ({
  baseHash,
  repoPath,
  onClose,
  onComplete,
}) => {
  const [commits, setCommits] = useState<RebaseCommitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [isAiOptimizing, setIsAiOptimizing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getRebaseCommits(repoPath, baseHash)
      .then((items) => {
        if (!isMounted) return;
        setCommits(items);
      })
      .catch((e) => {
        alert(`Failed to load rebase commits: ${e.message}`);
        onClose();
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [baseHash, repoPath]);

  const handleActionChange = (index: number, action: RebaseActionType) => {
    setCommits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], action };
      return next;
    });
  };

  const handleSummaryChange = (index: number, text: string) => {
    setCommits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], newSummary: text };
      return next;
    });
  };

  const moveCommit = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= commits.length) return;

    setCommits((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  // AI Auto-Squash & Clean History
  const handleAiAutoSquash = async () => {
    setIsAiOptimizing(true);
    try {
      // Analyze commit messages for WIP, fix, typo, formatting
      const updated = commits.map((c, i) => {
        const lower = c.summary.toLowerCase();
        if (i > 0 && (lower.includes('wip') || lower.includes('fix') || lower.includes('typo') || lower.includes('cleanup'))) {
          return {
            ...c,
            action: 'squash' as RebaseActionType,
            newSummary: c.summary.replace(/^(wip|fix|cleanup)[:\s]*/i, '').trim(),
          };
        }
        return c;
      });

      setCommits(updated);
    } finally {
      setIsAiOptimizing(false);
    }
  };

  const handleStartRebase = async () => {
    if (commits.length === 0) return;
    if (commits.every((c) => c.action === 'drop')) {
      alert('Cannot drop all commits.');
      return;
    }

    if (commits[0].action === 'squash' || commits[0].action === 'fixup') {
      alert('The first commit in the rebase plan cannot be squashed.');
      return;
    }

    setExecuting(true);
    try {
      const res = await api.executeRebase(repoPath, baseHash, commits);
      alert(res.output || 'Interactive rebase completed successfully!');
      onComplete();
      onClose();
    } catch (e: any) {
      alert(`Rebase failed: ${e.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const getActionBadge = (action: RebaseActionType) => {
    switch (action) {
      case 'pick':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'reword':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'squash':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'fixup':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
      case 'drop':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-4xl h-[80vh] bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100">
                Interactive Rebase & Squash Tool
              </span>
              <span className="block text-xs font-mono text-slate-400">
                Rebasing onto <span className="text-teal-400">{baseHash.slice(0, 7)}</span> ({commits.length} commits)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleAiAutoSquash}
              disabled={isAiOptimizing || loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Auto-Squash</span>
            </button>

            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-[#1a2332] px-4 py-2 border-b border-[#2a3447] flex items-center space-x-2 text-xs text-slate-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            Reorder, squash, or reword commits below. Gitter creates an automatic backup branch and cleanly rewrites history.
          </span>
        </div>

        {/* Commit Sequence Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">Loading commits...</div>
          ) : commits.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">No commits to rebase</div>
          ) : (
            commits.map((c, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === commits.length - 1;
              const isDropped = c.action === 'drop';

              return (
                <div
                  key={c.hash}
                  className={`flex items-center space-x-3 p-2.5 rounded border transition ${
                    isDropped
                      ? 'bg-[#14181f]/40 border-rose-950 opacity-60'
                      : 'bg-[#14181f] border-[#2a3447] hover:border-slate-500'
                  }`}
                >
                  {/* Reorder Buttons */}
                  <div className="flex flex-col space-y-0.5">
                    <button
                      onClick={() => moveCommit(idx, 'up')}
                      disabled={isFirst}
                      title="Move Up"
                      className="p-1 rounded hover:bg-[#202735] text-slate-400 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveCommit(idx, 'down')}
                      disabled={isLast}
                      title="Move Down"
                      className="p-1 rounded hover:bg-[#202735] text-slate-400 hover:text-slate-200 disabled:opacity-20"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Action Selector */}
                  <select
                    value={c.action}
                    onChange={(e) => handleActionChange(idx, e.target.value as RebaseActionType)}
                    className={`text-xs font-semibold px-2 py-1 rounded border uppercase ${getActionBadge(
                      c.action
                    )} bg-[#1b212c] focus:outline-none`}
                  >
                    <option value="pick">pick</option>
                    <option value="reword">reword</option>
                    <option value="squash" disabled={isFirst}>squash</option>
                    <option value="fixup" disabled={isFirst}>fixup</option>
                    <option value="drop">drop</option>
                  </select>

                  {/* Commit SHA */}
                  <span className="font-mono text-xs text-teal-400 w-16">
                    {c.shortHash}
                  </span>

                  {/* Summary (editable if reword or squash) */}
                  <div className="flex-1">
                    {c.action === 'reword' || c.action === 'squash' ? (
                      <input
                        type="text"
                        value={c.newSummary !== undefined ? c.newSummary : c.summary}
                        onChange={(e) => handleSummaryChange(idx, e.target.value)}
                        placeholder="New commit summary..."
                        className="w-full bg-[#1b212c] border border-teal-500/50 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none"
                      />
                    ) : (
                      <span className={`text-xs ${isDropped ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                        {c.summary}
                      </span>
                    )}
                  </div>

                  {/* Author */}
                  <span className="text-xs text-slate-400 w-32 truncate text-right">
                    {c.author}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#181d26] border-t border-[#2a3447] flex items-center justify-between px-4">
          <div className="text-xs text-slate-400">
            {commits.filter((c) => c.action !== 'drop').length} commits will be applied
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
            >
              Cancel
            </button>
            <button
              onClick={handleStartRebase}
              disabled={executing || loading}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white font-semibold text-xs shadow-md transition disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>{executing ? 'Rewriting History...' : 'Start Rebase'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
