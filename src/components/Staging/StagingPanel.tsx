import React, { useState } from 'react';
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
  Copy,
  ExternalLink,
  Archive,
  History,
  Bookmark,
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
  onStash?: () => void;
  onShelve?: () => void;
  onOpenBlame?: (file: string) => void;
  onOpenFileHistory?: (file: string) => void;
  onRevealInExplorer?: (file: string) => void;
  onOpenInVsCode?: (file: string) => void;
  onOpenExternalDiff?: (file: string, staged: boolean) => void;
  onToggleVirtualBranches?: () => void;
  width?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  file: FileStatus;
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
  onStash,
  onShelve,
  onOpenBlame,
  onOpenFileHistory,
  onRevealInExplorer,
  onOpenInVsCode,
  onOpenExternalDiff,
  onToggleVirtualBranches,
  width = 280,
}) => {
  const stagedFiles = statuses.filter((s) => s.staged);
  const unstagedFiles = statuses.filter((s) => !s.staged);

  // Drag and drop state
  const [isDragOverStaged, setIsDragOverStaged] = useState<boolean>(false);
  const [isDragOverUnstaged, setIsDragOverUnstaged] = useState<boolean>(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  const handleFileContextMenu = (e: React.MouseEvent, file: FileStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  return (
    <div
      style={{ width: `${width}px` }}
      className="bg-[#181d26] border-r border-[#2a3447] flex flex-col h-full select-none text-slate-300 relative flex-shrink-0"
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div className="h-10 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3 text-xs font-semibold text-slate-300">
        <div className="flex items-center space-x-2">
          <FileDiff className="w-4 h-4 text-teal-400" />
          <span>Working Tree Files</span>
        </div>
        <div className="flex items-center space-x-2">
          {onToggleVirtualBranches && (
            <button
              onClick={onToggleVirtualBranches}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-medium transition"
              title="Switch to GitButler Virtual Branches"
            >
              <Archive className="w-3 h-3 text-purple-400" />
              <span>Virtual Lanes</span>
            </button>
          )}
          <span className="text-xs text-slate-500">
            {statuses.length}
          </span>
        </div>
      </div>

      {/* Lists Container */}
      <div className="flex-1 overflow-y-auto">
        {/* STAGED SECTION (DROPZONE FOR UNSTAGED FILES) */}
        <div
          className={`border-b border-[#222a3a] transition ${
            isDragOverStaged ? 'bg-emerald-500/10 ring-2 ring-emerald-500' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsDragOverStaged(true);
          }}
          onDragLeave={() => setIsDragOverStaged(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverStaged(false);
            const path = e.dataTransfer.getData('application/x-gitter-file-path');
            const staged = e.dataTransfer.getData('application/x-gitter-file-staged') === 'true';
            if (path && !staged) {
              onStageFile(path);
            }
          }}
        >
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
              <div className="px-4 py-2 text-xs text-slate-600 italic">
                {isDragOverStaged ? 'Drop to stage file' : 'No staged files'}
              </div>
            ) : (
              stagedFiles.map((file) => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={`staged-${file.path}`}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', file.path);
                      e.dataTransfer.setData('application/x-gitter-file-path', file.path);
                      e.dataTransfer.setData('application/x-gitter-file-staged', 'true');
                    }}
                    onClick={() => onSelectFile(file.path, true)}
                    onDoubleClick={() => onUnstageFile(file.path)}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    title={`Click to view diff. Double-click to unstage. Right-click for options. Drag to Unstaged below.`}
                    className={`group flex items-center justify-between px-3 py-1 text-xs cursor-pointer transition select-none ${
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

        {/* UNSTAGED SECTION (DROPZONE FOR STAGED FILES) */}
        <div
          className={`transition ${isDragOverUnstaged ? 'bg-amber-500/10 ring-2 ring-amber-500' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsDragOverUnstaged(true);
          }}
          onDragLeave={() => setIsDragOverUnstaged(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverUnstaged(false);
            const path = e.dataTransfer.getData('application/x-gitter-file-path');
            const staged = e.dataTransfer.getData('application/x-gitter-file-staged') === 'true';
            if (path && staged) {
              onUnstageFile(path);
            }
          }}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[#1c222e] text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            <div className="flex items-center space-x-1.5">
              <span>Unstaged Files</span>
              <span className="text-slate-400 font-normal">({unstagedFiles.length})</span>
            </div>

            {unstagedFiles.length > 0 && (
              <div className="flex items-center space-x-1">
                {onShelve && (
                  <button
                    onClick={onShelve}
                    title="Shelve changes (JetBrains-style shelf)"
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#283244] text-[10px] text-indigo-300 transition"
                  >
                    <Bookmark className="w-3 h-3 text-indigo-400" />
                    <span>Shelve</span>
                  </button>
                )}
                {onStash && (
                  <button
                    onClick={onStash}
                    title="Stash uncommitted changes"
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#283244] text-[10px] text-amber-300 transition"
                  >
                    <Archive className="w-3 h-3 text-amber-400" />
                    <span>Stash</span>
                  </button>
                )}
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
              <div className="px-4 py-2 text-xs text-slate-600 italic">
                {isDragOverUnstaged ? 'Drop to unstage file' : 'No unstaged changes'}
              </div>
            ) : (
              unstagedFiles.map((file) => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={`unstaged-${file.path}`}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', file.path);
                      e.dataTransfer.setData('application/x-gitter-file-path', file.path);
                      e.dataTransfer.setData('application/x-gitter-file-staged', 'false');
                    }}
                    onClick={() => onSelectFile(file.path, false)}
                    onDoubleClick={() => onStageFile(file.path)}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    title={`Click to view diff. Double-click to stage. Right-click for options. Drag to Staged above.`}
                    className={`group flex items-center justify-between px-3 py-1 text-xs cursor-pointer transition select-none ${
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

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 240),
            left: Math.min(contextMenu.x, window.innerWidth - 220),
          }}
          className="fixed bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 font-mono text-[11px] text-teal-400 border-b border-[#2a3447] truncate">
            {contextMenu.file.path}
          </div>

          {contextMenu.file.staged ? (
            <button
              onClick={() => {
                onUnstageFile(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-amber-300"
            >
              <Minus className="w-3.5 h-3.5 text-amber-400" />
              <span>Unstage file</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onStageFile(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
            >
              <Plus className="w-3.5 h-3.5 text-teal-400" />
              <span>Stage file</span>
            </button>
          )}

          {onOpenExternalDiff && (
            <button
              onClick={() => {
                onOpenExternalDiff(contextMenu.file.path, contextMenu.file.staged);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              <span>Open in External Diff Tool (code --diff)</span>
            </button>
          )}

          {onOpenInVsCode && (
            <button
              onClick={() => {
                onOpenInVsCode(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-blue-300"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Open in VS Code</span>
            </button>
          )}

          {onOpenFileHistory && (
            <button
              onClick={() => {
                onOpenFileHistory(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-indigo-300"
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              <span>Show File History (All Commits)</span>
            </button>
          )}

          {onOpenBlame && (
            <button
              onClick={() => {
                onOpenBlame(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>View Blame / Annotate</span>
            </button>
          )}

          {onShelve && (
            <button
              onClick={() => {
                onShelve();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-indigo-300"
            >
              <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
              <span>Shelve Changes...</span>
            </button>
          )}

          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.file.path);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy file path</span>
          </button>

          {onRevealInExplorer && (
            <button
              onClick={() => {
                onRevealInExplorer(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-300"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              <span>Reveal in File Explorer</span>
            </button>
          )}

          <div className="border-t border-[#2a3447] my-1" />

          <button
            onClick={() => {
              if (confirm(`Discard changes to ${contextMenu.file.path}?`)) {
                onDiscardFile(contextMenu.file.path);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard changes</span>
          </button>
        </div>
      )}
    </div>
  );
};
