import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  RotateCcw,
  GitBranch,
  GitCommit,
  Clock,
  Search,
  AlertTriangle,
  Check,
  Undo2,
} from 'lucide-react';
import { api } from '../../api/client';

import { toast } from '../../utils/toast';
interface ReflogEntry {
  hash: string;
  selector: string;
  action: string;
  message: string;
  date: string;
}

interface ReflogModalProps {
  repoPath: string;
  onClose: () => void;
  onRefresh: () => void;
  onCreateBranchAt: (hash: string) => void;
}

export const ReflogModal: React.FC<ReflogModalProps> = ({
  repoPath,
  onClose,
  onRefresh,
  onCreateBranchAt,
}) => {
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getReflog(repoPath, 100)
      .then((data) => {
        if (!isMounted) return;
        setEntries(data || []);
      })
      .catch((err) => {
        console.error('Fetch reflog error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath]);

  const handleReset = async (hash: string, mode: 'soft' | 'hard') => {
    if (mode === 'hard') {
      const confirmHard = confirm(
        `Are you sure you want to perform a HARD reset to ${hash.slice(0, 7)}? Any uncommitted changes will be permanently discarded.`
      );
      if (!confirmHard) return;
    }

    setActionLoading(true);
    try {
      await api.reset(repoPath, hash, mode);
      toast(`Reset to ${hash.slice(0, 7)} (${mode}) completed!`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Reset failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async (hash: string) => {
    setActionLoading(true);
    try {
      await api.checkoutBranch(repoPath, hash);
      toast(`Checked out ${hash.slice(0, 7)} (detached HEAD)`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Checkout failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredEntries = entries.filter(
    (e) =>
      e.message.toLowerCase().includes(search.toLowerCase()) ||
      e.selector.toLowerCase().includes(search.toLowerCase()) ||
      e.hash.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-5xl h-[85vh] bg-[#141820] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100">Git Reflog & History Timeline</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  HEAD History
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Resurrect lost commits, recover deleted branches, or rollback any action
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Toolbar */}
        <div className="p-3 bg-[#161b24] border-b border-[#232c3d] flex items-center justify-between">
          <div className="relative w-80">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter reflog actions (e.g. commit, checkout, rebase)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1c2230] border border-[#2b364c] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <span className="text-xs text-slate-400">Showing {filteredEntries.length} entries</span>
        </div>

        {/* Reflog Table / List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#1c2230]">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading reflog entries...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No reflog entries matched your search.</div>
          ) : (
            filteredEntries.map((entry, index) => {
              const isLatest = index === 0;
              return (
                <div
                  key={`${entry.selector}-${entry.hash}-${index}`}
                  className={`p-3.5 flex items-center justify-between hover:bg-[#181e2b] transition-colors ${
                    isLatest ? 'bg-teal-500/5' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3 min-w-0">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#1e2636] border border-[#2a364d] text-teal-300 flex-shrink-0">
                      {entry.selector}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-amber-300 font-semibold">
                          {entry.hash.slice(0, 7)}
                        </span>
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {entry.message}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{entry.date}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1.5 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handleReset(entry.hash, 'soft')}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded text-xs bg-[#202738] hover:bg-teal-500/20 hover:text-teal-300 text-slate-300 border border-[#2b364c] transition-colors"
                      title="Soft Reset: Rollback HEAD to this commit, keeping current changes staged"
                    >
                      Reset (Soft)
                    </button>

                    <button
                      onClick={() => handleReset(entry.hash, 'hard')}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                      title="Hard Reset: Revert working tree and index to this exact state"
                    >
                      Reset (Hard)
                    </button>

                    <button
                      onClick={() => {
                        onClose();
                        onCreateBranchAt(entry.hash);
                      }}
                      className="px-2.5 py-1 rounded text-xs bg-[#202738] hover:bg-[#2c374d] text-slate-300 border border-[#2b364c] transition-colors flex items-center space-x-1"
                      title="Create a new branch from this reflog commit"
                    >
                      <GitBranch className="w-3 h-3 text-teal-400" />
                      <span>Branch</span>
                    </button>

                    <button
                      onClick={() => handleCheckout(entry.hash)}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded text-xs bg-[#202738] hover:bg-[#2c374d] text-slate-300 border border-[#2b364c] transition-colors"
                      title="Checkout this commit directly"
                    >
                      Checkout
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
