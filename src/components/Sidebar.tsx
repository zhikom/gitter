import React, { useState } from 'react';
import {
  GitBranch,
  Globe,
  Tag as TagIcon,
  Archive,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  GitMerge,
  ExternalLink,
  Layers,
  Box,
  RefreshCw,
  GitPullRequest,
  Copy,
  Edit2,
  UploadCloud,
  DownloadCloud,
} from 'lucide-react';
import { Branch, PullRequest, Remote, Stash, Submodule, Tag, Worktree } from '../types/git';

interface SidebarProps {
  branches: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
  pullRequests?: PullRequest[];
  worktrees?: Worktree[];
  submodules?: Submodule[];
  currentBranch: string;
  onCheckoutBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  onRenameBranch?: (oldName: string, newName: string) => void;
  onPushBranch?: (name: string) => void;
  onBranchDrop?: (sourceBranch: string, targetBranch: string) => void;
  onPopStash: (index: number) => void;
  onApplyStash?: (index: number) => void;
  onDropStash: (index: number) => void;
  onDeleteTag: (name: string) => void;
  onPushTag?: (name: string) => void;
  onCreateBranch: () => void;
  onCreateTag: () => void;
  onViewPr?: (pr: PullRequest) => void;
  onCreatePr?: (branch?: string) => void;
  onOpenWorktrees?: () => void;
  onSwitchWorktree?: (path: string) => void;
  onUpdateSubmodules?: () => void;
  width?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'localBranch' | 'remoteBranch' | 'tag' | 'stash';
  item: any;
}

export const Sidebar: React.FC<SidebarProps> = ({
  branches,
  remotes,
  tags,
  stashes,
  pullRequests = [],
  worktrees = [],
  submodules = [],
  currentBranch,
  onCheckoutBranch,
  onDeleteBranch,
  onRenameBranch,
  onPushBranch,
  onBranchDrop,
  onPopStash,
  onApplyStash,
  onDropStash,
  onDeleteTag,
  onPushTag,
  onCreateBranch,
  onCreateTag,
  onViewPr,
  onCreatePr,
  onOpenWorktrees,
  onSwitchWorktree,
  onUpdateSubmodules,
  width = 256,
}) => {
  const [expandLocal, setExpandLocal] = useState(true);
  const [expandRemote, setExpandRemote] = useState(true);
  const [expandPrs, setExpandPrs] = useState(true);
  const [expandTags, setExpandTags] = useState(false);
  const [expandStashes, setExpandStashes] = useState(false);
  const [expandRemotes, setExpandRemotes] = useState(false);
  const [expandWorktrees, setExpandWorktrees] = useState(false);
  const [expandSubmodules, setExpandSubmodules] = useState(false);

  // Drag and drop state
  const [draggedBranch, setDraggedBranch] = useState<string | null>(null);
  const [dragOverBranch, setDragOverBranch] = useState<string | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleBranchContextMenu = (e: React.MouseEvent, branch: Branch) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: branch.isRemote ? 'remoteBranch' : 'localBranch',
      item: branch,
    });
  };

  const handleTagContextMenu = (e: React.MouseEvent, tag: Tag) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'tag',
      item: tag,
    });
  };

  const handleStashContextMenu = (e: React.MouseEvent, stash: Stash) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'stash',
      item: stash,
    });
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-[#181d26] border-r border-[#2a3447] flex flex-col h-full text-slate-300 select-none overflow-y-auto relative flex-shrink-0"
      onClick={() => setContextMenu(null)}
    >
      {/* LOCAL BRANCHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandLocal(!expandLocal)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandLocal ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <GitBranch className="w-3.5 h-3.5 text-teal-400" />
            <span>Local Branches</span>
            <span className="text-[10px] text-slate-500 font-normal">({localBranches.length})</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateBranch();
            }}
            title="Create New Branch"
            className="p-0.5 hover:text-teal-300 text-slate-400 rounded"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandLocal && (
          <div className="pb-1">
            {localBranches.map((branch) => {
              const isCurrent = branch.name === currentBranch;
              const isDragOver = dragOverBranch === branch.name;

              return (
                <div
                  key={branch.name}
                  draggable={true}
                  onDragStart={(e) => {
                    setDraggedBranch(branch.name);
                    e.dataTransfer.setData('text/plain', branch.name);
                    e.dataTransfer.setData('application/x-gitter-branch', branch.name);
                  }}
                  onDragEnd={() => {
                    setDraggedBranch(null);
                    setDragOverBranch(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedBranch && draggedBranch !== branch.name) {
                      setDragOverBranch(branch.name);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverBranch === branch.name) {
                      setDragOverBranch(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const source = e.dataTransfer.getData('application/x-gitter-branch') || draggedBranch;
                    setDragOverBranch(null);
                    setDraggedBranch(null);
                    if (source && source !== branch.name && onBranchDrop) {
                      onBranchDrop(source, branch.name);
                    }
                  }}
                  onDoubleClick={() => onCheckoutBranch(branch.name)}
                  onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                  title={`Double click to checkout ${branch.name}. Drag onto another branch to merge/rebase.`}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition select-none ${
                    isCurrent
                      ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400'
                      : 'hover:bg-[#202735] text-slate-300'
                  } ${isDragOver ? 'ring-2 ring-teal-400 bg-teal-500/20' : ''}`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {isCurrent ? (
                      <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-teal-400" />
                      </div>
                    )}
                    <span className="truncate">{branch.name}</span>
                  </div>

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
                    {(branch.ahead > 0 || branch.behind > 0) && (
                      <span className="text-[10px] text-slate-400 px-1 rounded bg-[#202735]">
                        {branch.ahead > 0 && `↑${branch.ahead}`} {branch.behind > 0 && `↓${branch.behind}`}
                      </span>
                    )}
                    {!isCurrent && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete branch '${branch.name}'?`)) {
                            onDeleteBranch(branch.name);
                          }
                        }}
                        title="Delete branch"
                        className="p-1 hover:text-red-400 text-slate-500 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REMOTE BRANCHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandRemote(!expandRemote)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandRemote ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Remote Branches</span>
            <span className="text-[10px] text-slate-500 font-normal">({remoteBranches.length})</span>
          </div>
        </div>

        {expandRemote && (
          <div className="pb-1">
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', branch.name);
                  e.dataTransfer.setData('application/x-gitter-branch', branch.name);
                }}
                onDoubleClick={() => onCheckoutBranch(branch.name)}
                onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                title={`Double click to checkout ${branch.name}`}
                className="group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-[#202735] text-slate-400 hover:text-slate-200 transition"
              >
                <div className="flex items-center space-x-2 truncate">
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
                  </div>
                  <span className="truncate">{branch.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PULL REQUESTS (GITHUB) */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandPrs(!expandPrs)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandPrs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
            <span>Pull Requests</span>
            <span className="text-[10px] text-slate-500 font-normal">({pullRequests.length})</span>
          </div>
          {onCreatePr && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreatePr();
              }}
              title="Create Pull Request"
              className="p-0.5 hover:text-purple-300 text-slate-400 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {expandPrs && (
          <div className="pb-1">
            {pullRequests.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No pull requests</div>
            ) : (
              pullRequests.map((pr) => (
                <div
                  key={pr.number}
                  onClick={() => onViewPr && onViewPr(pr)}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-[#202735] text-slate-300 transition"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-mono text-[10px] text-purple-400 flex-shrink-0">#{pr.number}</span>
                    <span className="truncate">{pr.title}</span>
                  </div>
                  <span className="text-[9px] font-bold px-1 rounded bg-purple-500/20 text-purple-300 flex-shrink-0">
                    {pr.state}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* TAGS */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandTags(!expandTags)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandTags ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
            <span>Tags</span>
            <span className="text-[10px] text-slate-500 font-normal">({tags.length})</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateTag();
            }}
            title="Create Tag"
            className="p-0.5 hover:text-yellow-300 text-slate-400 rounded"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandTags && (
          <div className="pb-1">
            {tags.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No tags</div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.name}
                  onDoubleClick={() => onCheckoutBranch(tag.name)}
                  onContextMenu={(e) => handleTagContextMenu(e, tag)}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#202735] text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <TagIcon className="w-3 h-3 text-yellow-400/70" />
                    <span className="font-mono truncate">{tag.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete tag '${tag.name}'?`)) {
                        onDeleteTag(tag.name);
                      }
                    }}
                    title="Delete Tag"
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-500 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* STASHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandStashes(!expandStashes)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandStashes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Stashes</span>
            <span className="text-[10px] text-slate-500 font-normal">({stashes.length})</span>
          </div>
        </div>

        {expandStashes && (
          <div className="pb-1">
            {stashes.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No stashes</div>
            ) : (
              stashes.map((stash) => (
                <div
                  key={stash.name}
                  onContextMenu={(e) => handleStashContextMenu(e, stash)}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#202735] text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Archive className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                    <span className="truncate text-slate-300">{stash.message || stash.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPopStash(stash.index);
                      }}
                      title="Pop stash"
                      className="p-1 hover:text-emerald-400 text-slate-500 rounded"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDropStash(stash.index);
                      }}
                      title="Drop stash"
                      className="p-1 hover:text-red-400 text-slate-500 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* REMOTES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandRemotes(!expandRemotes)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandRemotes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Remotes</span>
            <span className="text-[10px] text-slate-500 font-normal">({remotes.length})</span>
          </div>
        </div>

        {expandRemotes && (
          <div className="pb-1">
            {remotes.map((remote) => (
              <div
                key={remote.name}
                className="px-4 py-1 text-xs text-slate-400 flex flex-col"
              >
                <div className="font-semibold text-slate-300 flex items-center space-x-1">
                  <span>{remote.name}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate" title={remote.fetchUrl}>
                  {remote.fetchUrl}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WORKTREES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandWorktrees(!expandWorktrees)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandWorktrees ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span>Worktrees</span>
            <span className="text-[10px] text-slate-500 font-normal">({worktrees.length})</span>
          </div>
          {onOpenWorktrees && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenWorktrees();
              }}
              title="Manage Worktrees"
              className="p-0.5 hover:text-teal-300 text-slate-400 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {expandWorktrees && (
          <div className="pb-1">
            {worktrees.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No worktrees</div>
            ) : (
              worktrees.map((wt) => (
                <div
                  key={wt.path}
                  onClick={() => onSwitchWorktree && onSwitchWorktree(wt.path)}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition ${
                    wt.isCurrent ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400' : 'hover:bg-[#202735] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="truncate">{wt.branch || wt.path.split(/[\/\\]/).pop()}</span>
                  </div>
                  {wt.isCurrent && <Check className="w-3 h-3 text-teal-400" />}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* SUBMODULES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandSubmodules(!expandSubmodules)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandSubmodules ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Box className="w-3.5 h-3.5 text-indigo-400" />
            <span>Submodules</span>
            <span className="text-[10px] text-slate-500 font-normal">({submodules.length})</span>
          </div>
          {onUpdateSubmodules && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSubmodules();
              }}
              title="Update Submodules"
              className="p-0.5 hover:text-indigo-300 text-slate-400 rounded"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>

        {expandSubmodules && (
          <div className="pb-1">
            {submodules.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No submodules</div>
            ) : (
              submodules.map((sub) => (
                <div
                  key={sub.path}
                  className="px-4 py-1.5 text-xs text-slate-300 flex items-center justify-between"
                >
                  <span className="font-mono truncate">{sub.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{sub.commitHash.slice(0, 7)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 280), left: Math.min(contextMenu.x, window.innerWidth - 220) }}
          className="fixed bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[210px]"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'localBranch' && (
            <>
              <div className="px-3 py-1 font-mono text-[11px] text-teal-400 border-b border-[#2a3447] truncate">
                {contextMenu.item.name}
              </div>
              <button
                onClick={() => {
                  onCheckoutBranch(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
              >
                <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                <span>Checkout branch</span>
              </button>

              {contextMenu.item.name !== currentBranch && (
                <>
                  <button
                    onClick={() => {
                      if (onBranchDrop) onBranchDrop(contextMenu.item.name, currentBranch);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
                  >
                    <GitMerge className="w-3.5 h-3.5 text-teal-400" />
                    <span>Merge into {currentBranch}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (onBranchDrop) onBranchDrop(currentBranch, contextMenu.item.name);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-blue-300"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                    <span>Rebase {currentBranch} onto {contextMenu.item.name}</span>
                  </button>
                </>
              )}

              <div className="border-t border-[#2a3447] my-1" />

              {onPushBranch && (
                <button
                  onClick={() => {
                    onPushBranch(contextMenu.item.name);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                  <span>Push to origin/{contextMenu.item.name}</span>
                </button>
              )}

              {onRenameBranch && (
                <button
                  onClick={() => {
                    const newName = prompt(`Rename branch '${contextMenu.item.name}' to:`, contextMenu.item.name);
                    if (newName && newName !== contextMenu.item.name) {
                      onRenameBranch(contextMenu.item.name, newName.trim());
                    }
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rename branch...</span>
                </button>
              )}

              {onCreatePr && (
                <button
                  onClick={() => {
                    onCreatePr(contextMenu.item.name);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
                >
                  <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
                  <span>Create Pull Request...</span>
                </button>
              )}

              <button
                onClick={() => {
                  copyToClipboard(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy branch name</span>
              </button>

              {contextMenu.item.name !== currentBranch && (
                <>
                  <div className="border-t border-[#2a3447] my-1" />
                  <button
                    onClick={() => {
                      if (confirm(`Delete branch '${contextMenu.item.name}'?`)) {
                        onDeleteBranch(contextMenu.item.name);
                      }
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete branch</span>
                  </button>
                </>
              )}
            </>
          )}

          {contextMenu.type === 'remoteBranch' && (
            <>
              <div className="px-3 py-1 font-mono text-[11px] text-blue-400 border-b border-[#2a3447] truncate">
                {contextMenu.item.name}
              </div>
              <button
                onClick={() => {
                  onCheckoutBranch(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
              >
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                <span>Checkout as local branch</span>
              </button>
              <button
                onClick={() => {
                  copyToClipboard(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy branch name</span>
              </button>
            </>
          )}

          {contextMenu.type === 'tag' && (
            <>
              <div className="px-3 py-1 font-mono text-[11px] text-yellow-400 border-b border-[#2a3447] truncate">
                Tag: {contextMenu.item.name}
              </div>
              <button
                onClick={() => {
                  onCheckoutBranch(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
              >
                <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
                <span>Checkout tag</span>
              </button>
              {onPushTag && (
                <button
                  onClick={() => {
                    onPushTag(contextMenu.item.name);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                  <span>Push tag to origin</span>
                </button>
              )}
              <button
                onClick={() => {
                  copyToClipboard(contextMenu.item.name);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy tag name</span>
              </button>
              <div className="border-t border-[#2a3447] my-1" />
              <button
                onClick={() => {
                  if (confirm(`Delete tag '${contextMenu.item.name}'?`)) {
                    onDeleteTag(contextMenu.item.name);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete tag</span>
              </button>
            </>
          )}

          {contextMenu.type === 'stash' && (
            <>
              <div className="px-3 py-1 font-mono text-[11px] text-amber-400 border-b border-[#2a3447] truncate">
                {contextMenu.item.name}: {contextMenu.item.message || 'WIP'}
              </div>
              {onApplyStash && (
                <button
                  onClick={() => {
                    onApplyStash(contextMenu.item.index);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-emerald-300"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Apply stash (keep in stash list)</span>
                </button>
              )}
              <button
                onClick={() => {
                  onPopStash(contextMenu.item.index);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-blue-400" />
                <span>Pop stash (apply & remove)</span>
              </button>
              <div className="border-t border-[#2a3447] my-1" />
              <button
                onClick={() => {
                  if (confirm(`Drop ${contextMenu.item.name}?`)) {
                    onDropStash(contextMenu.item.index);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Drop stash</span>
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
