import React from 'react';
import { FileStatus, GitFileState } from '../../types/git';
import {
  Plus,
  Minus,
  Trash2,
  FileText,
  AlertCircle,
  FilePlus,
  FileMinus,
  FileDiff,
  CheckCheck,
  Undo2,
} from 'lucide-react';

interface StagingPanelProps {
  statuses: FileStatus[];
  selectedFile: string | null;
  onSelectFile: (file: string, staged: boolean) => void;
  onStageFile: (file: string) => void;
  onUnstageFile: (file: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardFile: (file: string) => void;
  onDiscardAll: () => void;
}

export const StagingPanel: React.FC<StagingPanelProps> = ({
  statuses,
  selectedFile,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onDiscardFile,
  onDiscardAll,
}) => {
  const stagedFiles = statuses.filter((s) => s.staged);
  const unstagedFiles = statuses.filter((s) => !s.staged);

  const getStatusBadge = (status: GitFileState) => {
    switch (status) {
      case 'modified':
        return <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded">M</span>;
      case 'added':
        return <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded">A</span>;
      case 'deleted':
        return <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1 rounded">D</span>;
      case 'untracked':
        return <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1 rounded">U</span>;
      case 'conflicted':
        return <span className="text-[10px] font-bold text-rose-500 bg-rose-500/20 px-1 rounded">!</span>;
      default:
        return null;
    }
  };

  return (
    <div className="w-80 bg-[#181d26] border-l border-[#2a3447] flex flex-col h-full select-none text-slate-300">
      {/* Header */}
      <div className="h-10 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3 text-xs font-semibold text-slate-300">
        <div className="flex items-center space-x-2">
          <FileDiff className="w-4 h-4 text-teal-400" />
          <span>Working Tree Files</span>
        </div>
        <span className="text-xs text-slate-500">
          {statuses.length} change{statuses.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Lists Container */}
      <div className="flex-1 overflow-y-auto">
        {/* STAGED SECTION */}
        <div className="border-b border-[#222a3a]">
          <div className="flex items-center justify-between px-3 py-2 bg-[#1c222e] text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            <div className="flex items-center space-x-1.5">
              <span>Staged Files</span>
              <span className="text-slate-400 font-normal">({stagedFiles.length})</span>
            </div>

            {stagedFiles.length > 0 && (
              <button
                onClick={onUnstageAll}
                title="Unstage all files"
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#283244] text-[10px] text-slate-300 transition"
              >
                <Minus className="w-3 h-3" />
                <span>Unstage All</span>
              </button>
            )}
          </div>

          <div className="py-1">
            {stagedFiles.length === 0 ? (
              <div className="px-4 py-2 text-xs text-slate-600 italic">No staged files</div>
            ) : (
              stagedFiles.map((file) => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={`staged-${file.path}`}
                    onClick={() => onSelectFile(file.path, true)}
                    className={`group flex items-center justify-between px-3 py-1 text-xs cursor-pointer transition ${
                      isSelected ? 'bg-[#263245] text-white' : 'hover:bg-[#202735] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {getStatusBadge(file.status)}
                      <span className="truncate font-mono text-[11px]">{file.path}</span>
                    </div>

                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnstageFile(file.path);
                        }}
                        title="Unstage file"
                        className="p-1 hover:text-amber-400 text-slate-400 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* UNSTAGED SECTION */}
        <div>
          <div className="flex items-center justify-between px-3 py-2 bg-[#1c222e] text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            <div className="flex items-center space-x-1.5">
              <span>Unstaged Files</span>
              <span className="text-slate-400 font-normal">({unstagedFiles.length})</span>
            </div>

            {unstagedFiles.length > 0 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={onDiscardAll}
                  title="Discard all changes"
                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-red-500/20 text-[10px] text-red-300 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Discard All</span>
                </button>
                <button
                  onClick={onStageAll}
                  title="Stage all files"
                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#283244] text-[10px] text-teal-300 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>Stage All</span>
                </button>
              </div>
            )}
          </div>

          <div className="py-1">
            {unstagedFiles.length === 0 ? (
              <div className="px-4 py-2 text-xs text-slate-600 italic">No unstaged changes</div>
            ) : (
              unstagedFiles.map((file) => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={`unstaged-${file.path}`}
                    onClick={() => onSelectFile(file.path, false)}
                    className={`group flex items-center justify-between px-3 py-1 text-xs cursor-pointer transition ${
                      isSelected ? 'bg-[#263245] text-white' : 'hover:bg-[#202735] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {getStatusBadge(file.status)}
                      <span className="truncate font-mono text-[11px]">{file.path}</span>
                    </div>

                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Discard changes to ${file.path}?`)) {
                            onDiscardFile(file.path);
                          }
                        }}
                        title="Discard file changes"
                        className="p-1 hover:text-red-400 text-slate-500 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStageFile(file.path);
                        }}
                        title="Stage file"
                        className="p-1 hover:text-teal-400 text-slate-400 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
