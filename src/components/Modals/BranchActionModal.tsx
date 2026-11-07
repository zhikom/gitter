import React from 'react';
import { GitMerge, ArrowRight, X, RefreshCw, GitBranch } from 'lucide-react';

interface BranchActionModalProps {
  sourceBranch: string;
  targetBranch: string;
  onClose: () => void;
  onMerge: (source: string, target: string) => Promise<void>;
  onRebase: (source: string, target: string) => Promise<void>;
}

export const BranchActionModal: React.FC<BranchActionModalProps> = ({
  sourceBranch,
  targetBranch,
  onClose,
  onMerge,
  onRebase,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded bg-teal-500/20 text-teal-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-slate-100">Branch Drag & Drop</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source -> Target Visual */}
        <div className="flex items-center justify-center space-x-3 my-5 p-3 bg-[#14181f] border border-[#2a3447] rounded font-mono text-xs">
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/40">
            <GitBranch className="w-3.5 h-3.5" />
            <span>{sourceBranch}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
          <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40">
            <GitBranch className="w-3.5 h-3.5" />
            <span>{targetBranch}</span>
          </div>
        </div>

        {/* Actions List */}
        <div className="space-y-2 text-xs">
          <button
            onClick={() => {
              onMerge(sourceBranch, targetBranch);
              onClose();
            }}
            className="w-full flex items-center justify-between p-3 rounded bg-[#181d26] hover:bg-[#263245] border border-[#2a3447] hover:border-teal-500 transition group text-left"
          >
            <div>
              <span className="font-bold text-slate-200 block group-hover:text-teal-300">
                Merge {sourceBranch} into {targetBranch}
              </span>
              <span className="text-[11px] text-slate-400">
                Creates a merge commit combining history
              </span>
            </div>
            <GitMerge className="w-4 h-4 text-teal-400" />
          </button>

          <button
            onClick={() => {
              onRebase(sourceBranch, targetBranch);
              onClose();
            }}
            className="w-full flex items-center justify-between p-3 rounded bg-[#181d26] hover:bg-[#263245] border border-[#2a3447] hover:border-blue-500 transition group text-left"
          >
            <div>
              <span className="font-bold text-slate-200 block group-hover:text-blue-300">
                Rebase {sourceBranch} onto {targetBranch}
              </span>
              <span className="text-[11px] text-slate-400">
                Re-applies commits on top of {targetBranch}
              </span>
            </div>
            <RefreshCw className="w-4 h-4 text-blue-400" />
          </button>
        </div>

        <div className="flex justify-end pt-4 border-t border-[#2a3447] mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
