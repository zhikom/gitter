import React from 'react';
import { ArrowRight, GitBranch, GitMerge, RefreshCw } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface BranchActionModalProps {
  source: string;
  target: string;
  onClose: () => void;
  onMerge: (source: string, target: string) => void;
  onRebase: (source: string, target: string) => void;
}

/** What to do when one branch is dropped on another. */
export const BranchActionModal: React.FC<BranchActionModalProps> = ({ source, target, onClose, onMerge, onRebase }) => {
  const choice = (title: string, detail: string, icon: React.ReactNode, run: () => void) => (
    <button
      onClick={() => {
        run();
        onClose();
      }}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#181d26] hover:bg-[#263245] border border-[#2a3447] hover:border-teal-500 text-left"
    >
      <span>
        <span className="block text-xs font-bold text-slate-200">{title}</span>
        <span className="text-[11px] text-slate-400">{detail}</span>
      </span>
      {icon}
    </button>
  );

  return (
    <Modal width="sm" icon={<GitMerge className="w-4 h-4" />} title="Combine branches" onClose={onClose}>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-center gap-3 mb-3 p-3 bg-[#14181f] border border-[#2a3447] rounded font-mono text-xs">
          <span className="flex items-center gap-1.5 text-teal-300">
            <GitBranch className="w-3.5 h-3.5" />
            {source}
          </span>
          <ArrowRight className="w-4 h-4 text-slate-500" />
          <span className="flex items-center gap-1.5 text-blue-300">
            <GitBranch className="w-3.5 h-3.5" />
            {target}
          </span>
        </div>
        {choice(`Merge ${source} into ${target}`, `Checks out ${target} and adds a merge commit`, <GitMerge className="w-4 h-4 text-teal-400" />, () => onMerge(source, target))}
        {choice(`Rebase ${source} onto ${target}`, `Checks out ${source} and replays its commits on ${target}`, <RefreshCw className="w-4 h-4 text-blue-400" />, () => onRebase(source, target))}
      </div>
    </Modal>
  );
};
