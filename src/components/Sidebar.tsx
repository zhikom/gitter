import { menuPosition, useDismiss } from './ui/useDismiss';
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
  Layers,
  Box,
  RefreshCw,
  GitPullRequest,
  Copy,
  Edit2,
  UploadCloud,
  DownloadCloud,
  SlidersHorizontal,
  Workflow,
  Search,
  X,
} from 'lucide-react';
import { Branch, PullRequest, Remote, Stash, Submodule, Tag, Worktree } from '../../shared/types/git';

export interface SidebarSectionConfig {
  localBranches: boolean;
  remoteBranches: boolean;
  gitflow: boolean;
  pullRequests: boolean;
  tags: boolean;
  stashes: boolean;
  remotes: boolean;
  worktrees: boolean;
  submodules: boolean;
}

interface SidebarProps {
  branches: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
  pullRequests?: PullRequest[];
  pullRequestStatus?: { supported: boolean; loading: boolean; message: string; needsConnection: boolean };
  onConnectPullRequests?: () => void;
  onRefreshPullRequests?: () => void;
  worktrees?: Worktree[];
  submodules?: Submodule[];
  currentBranch: string;
  selectedBranch: string | null;
  onSelectBranch: (branch: Branch) => void;
  onCheckoutBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  /** Asks for the new name itself. */
  onRenameBranch?: (name: string) => void;
  onPushBranch?: (name: string) => void;
  onBranchDrop?: (sourceBranch: string, targetBranch: string) => void;
  onPopStash: (index: number) => void;
  onApplyStash?: (index: number) => void;
  onDropStash: (index: number) => void;
  onInspectStash?: (index: number, name: string) => void;
  onDeleteTag: (name: string) => void;
  onPushTag?: (name: string) => void;
  onCreateBranch: () => void;
  onCreateTag: () => void;
  onViewPr?: (pr: PullRequest) => void;
  onCreatePr?: (branch?: string) => void;
  onOpenWorktrees?: () => void;
  onSwitchWorktree?: (path: string) => void;
  onUpdateSubmodules?: () => void;
  onCherryPickToBranch?: (commitHash: string, branchName: string) => void;
  onOpenGitflow?: () => void;
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
  pullRequestStatus,
  onConnectPullRequests,
  onRefreshPullRequests,
  worktrees = [],
  submodules = [],
  currentBranch,
  selectedBranch,
  onSelectBranch,
  onCheckoutBranch,
  onDeleteBranch,
  onRenameBranch,
  onPushBranch,
  onBranchDrop,
  onPopStash,
  onApplyStash,
  onDropStash,
  onInspectStash,
  onDeleteTag,
  onPushTag,
  onCreateBranch,
  onCreateTag,
  onViewPr,
  onCreatePr,
  onOpenWorktrees,
  onSwitchWorktree,
  onUpdateSubmodules,
  onCherryPickToBranch,
  onOpenGitflow,
  width = 256,
}) => {
  const [expandLocal, setExpandLocal] = useState(true);
  const [expandRemote, setExpandRemote] = useState(true);
  const [expandGitflow, setExpandGitflow] = useState(true);
  const [expandPrs, setExpandPrs] = useState(true);
  const [expandTags, setExpandTags] = useState(false);
  const [expandStashes, setExpandStashes] = useState(false);
  const [expandRemotes, setExpandRemotes] = useState(false);
  const [expandWorktrees, setExpandWorktrees] = useState(false);
  const [expandSubmodules, setExpandSubmodules] = useState(false);

  // Section Visibility / Decluttering
  const [showSectionCustomizer, setShowSectionCustomizer] = useState(false);
  // Sections show by default when they have something to show; what the user
  // switches on or off is kept, so a section with data loaded later still appears.
  const [overrides, setOverrides] = useState<Partial<SidebarSectionConfig>>(() => {
    try {
      // A new key: earlier versions saved every section's state, which would pin data-dependent sections off.
      return JSON.parse(localStorage.getItem('gitter_sidebar_section_overrides') || '{}');
    } catch {
      return {};
    }
  });
  const defaults: SidebarSectionConfig = {
    localBranches: true,
    remoteBranches: true,
    gitflow: true,
    pullRequests: pullRequests.length > 0 || Boolean(pullRequestStatus?.supported || pullRequestStatus?.loading),
    tags: true,
    stashes: true,
    remotes: false,
    worktrees: worktrees.length > 1,
    submodules: submodules.length > 0,
  };
  const sectionConfig: SidebarSectionConfig = { ...defaults, ...overrides };
  const saveOverrides = (next: Partial<SidebarSectionConfig>) => {
    setOverrides(next);
    try {
      localStorage.setItem('gitter_sidebar_section_overrides', JSON.stringify(next));
    } catch {
      // Kept for this session only.
    }
  };

  const toggleSection = (key: keyof SidebarSectionConfig) => saveOverrides({ ...overrides, [key]: !sectionConfig[key] });
  const resetSmartDefaults = () => saveOverrides({});

  // Drag and drop state
  const [draggedBranch, setDraggedBranch] = useState<string | null>(null);
  const [dragOverBranch, setDragOverBranch] = useState<string | null>(null);

  // Quick Search / Navigator Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  useDismiss(Boolean(contextMenu), () => setContextMenu(null));

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const q = searchQuery.trim().toLowerCase();
  const filteredLocalBranches = q
    ? localBranches.filter((b) => b.name.toLowerCase().includes(q))
    : localBranches;
  const filteredRemoteBranches = q
    ? remoteBranches.filter((b) => b.name.toLowerCase().includes(q))
    : remoteBranches;
  const filteredTags = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  const filteredStashes = q
    ? stashes.filter((s) => s.name.toLowerCase().includes(q) || (s.message || '').toLowerCase().includes(q))
    : stashes;
  const totalMatches =
    filteredLocalBranches.length +
    filteredRemoteBranches.length +
    filteredTags.length +
    filteredStashes.length;

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
      onClick={() => {
        setContextMenu(null);
        setShowSectionCustomizer(false);
      }}
    >
      {/* SIDEBAR HEADER / SECTION CUSTOMIZER */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#222a3a] bg-[#141820]/80 text-slate-400 select-none flex-shrink-0">
        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
          Navigator
        </span>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSectionCustomizer(!showSectionCustomizer);
            }}
            title="Configure Visible Sections (Declutter Sidebar)"
            className={`p-1 rounded hover:bg-[#202735] transition ${
              showSectionCustomizer ? 'text-teal-400 bg-[#202735]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {showSectionCustomizer && (
            <div
              className="absolute right-0 top-full mt-1.5 w-56 bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-2.5 z-50 text-xs text-slate-200 space-y-2 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#2a3447] pb-1.5 font-semibold text-[11px] text-slate-300">
                <span>Sidebar Sections</span>
                <button
                  onClick={resetSmartDefaults}
                  className="text-[10px] text-teal-400 hover:underline font-normal"
                >
                  Smart Defaults
                </button>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                    <span>Local Branches</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.localBranches}
                    onChange={() => toggleSection('localBranches')}
                    className="rounded text-teal-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    <span>Remote Branches</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.remoteBranches}
                    onChange={() => toggleSection('remoteBranches')}
                    className="rounded text-blue-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Workflow className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Gitflow</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.gitflow}
                    onChange={() => toggleSection('gitflow')}
                    className="rounded text-indigo-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
                    <span>Pull Requests</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.pullRequests}
                    onChange={() => toggleSection('pullRequests')}
                    className="rounded text-purple-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Tags</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.tags}
                    onChange={() => toggleSection('tags')}
                    className="rounded text-yellow-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Stashes</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.stashes}
                    onChange={() => toggleSection('stashes')}
                    className="rounded text-amber-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Remotes</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.remotes}
                    onChange={() => toggleSection('remotes')}
                    className="rounded text-cyan-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Layers className="w-3.5 h-3.5 text-teal-400" />
                    <span>Worktrees</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.worktrees}
                    onChange={() => toggleSection('worktrees')}
                    className="rounded text-teal-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer hover:bg-[#222a38] px-1.5 py-1 rounded">
                  <span className="flex items-center space-x-2">
                    <Box className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Submodules</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionConfig.submodules}
                    onChange={() => toggleSection('submodules')}
                    className="rounded text-indigo-500 bg-[#14181f] border-[#2a3447]"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QUICK SEARCH FILTER BAR */}
      <div className="px-2.5 py-1.5 border-b border-[#222a3a] bg-[#141820]/40 flex-shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter branches, tags..."
            className="w-full bg-[#10141b] border border-[#2a3447] focus:border-teal-500/70 rounded pl-7 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 p-0.5 text-slate-500 hover:text-slate-300 rounded"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="flex items-center justify-between text-[10px] text-teal-400 mt-1 px-1">
            <span>{totalMatches} matching items</span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-500 hover:text-slate-300 hover:underline"
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* LOCAL BRANCHES */}
      {sectionConfig.localBranches && (
        <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandLocal(!expandLocal)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandLocal ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <GitBranch className="w-3.5 h-3.5 text-teal-400" />
            <span>Local Branches</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {q ? `(${filteredLocalBranches.length}/${localBranches.length})` : `(${localBranches.length})`}
            </span>
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

        {(expandLocal || !!q) && (
          <div className="pb-1">
            {filteredLocalBranches.map((branch) => {
              const isCurrent = branch.name === currentBranch;
              const isDragOver = dragOverBranch === branch.name;

              return (
                <div
                  key={branch.name}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select branch ${branch.name}`}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectBranch(branch); } }}
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
                    setDragOverBranch(null);
                    setDraggedBranch(null);

                    // A commit dropped on a branch is cherry-picked onto it.
                    const droppedCommit = e.dataTransfer.getData('application/x-gitter-commit');
                    if (droppedCommit) {
                      onCherryPickToBranch?.(droppedCommit, branch.name);
                      return;
                    }

                    const source = e.dataTransfer.getData('application/x-gitter-branch') || draggedBranch;
                    if (source && source !== branch.name && onBranchDrop) {
                      onBranchDrop(source, branch.name);
                    }
                  }}
                  onClick={() => onSelectBranch(branch)}
                  onDoubleClick={() => onCheckoutBranch(branch.name)}
                  onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                  title={`Double click to checkout ${branch.name}. Drag another branch to merge/rebase, or drag a commit here to cherry-pick.`}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition select-none ${
                    isCurrent
                      ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400'
                      : selectedBranch === branch.name ? 'bg-[#263245] text-white' : 'hover:bg-[#202735] text-slate-300'
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

                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {/* Ahead & Behind Badges */}
                    {branch.ahead > 0 && (
                      <span
                        className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        title={`${branch.ahead} commit${branch.ahead > 1 ? 's' : ''} to push`}
                      >
                        ↑{branch.ahead}
                      </span>
                    )}
                    {branch.behind > 0 && (
                      <span
                        className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        title={`${branch.behind} commit${branch.behind > 1 ? 's' : ''} to pull`}
                      >
                        ↓{branch.behind}
                      </span>
                    )}

                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition">
                      {!isCurrent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBranch(branch.name);
                          }}
                          title="Delete branch"
                          className="p-1 hover:text-red-400 text-slate-500 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* REMOTE BRANCHES */}
      {sectionConfig.remoteBranches && (
        <div className="border-b border-[#222a3a]">
          <div
            onClick={() => setExpandRemote(!expandRemote)}
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
          >
            <div className="flex items-center space-x-1.5">
              {expandRemote ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Remote Branches</span>
              <span className="text-[10px] text-slate-500 font-normal">
                {q ? `(${filteredRemoteBranches.length}/${remoteBranches.length})` : `(${remoteBranches.length})`}
              </span>
            </div>
          </div>

          {(expandRemote || !!q) && (
            <div className="pb-1">
              {filteredRemoteBranches.map((branch) => (
                <div
                  key={branch.name}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select branch ${branch.name}`}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectBranch(branch); } }}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', branch.name);
                    e.dataTransfer.setData('application/x-gitter-branch', branch.name);
                  }}
                  onClick={() => onSelectBranch(branch)}
                  onDoubleClick={() => onCheckoutBranch(branch.name)}
                  onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                  title={`Double click to checkout ${branch.name}`}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-[#202735] text-slate-400 hover:text-slate-200 transition ${selectedBranch === branch.name ? 'bg-[#263245] text-white' : ''}`}
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
      )}

      {/* GITFLOW INTEGRATION */}
      {sectionConfig.gitflow && (
        <div className="border-b border-[#222a3a]">
          <div
            onClick={() => setExpandGitflow(!expandGitflow)}
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
          >
            <div className="flex items-center space-x-1.5">
              {expandGitflow ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Workflow className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gitflow</span>
            </div>
            {onOpenGitflow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenGitflow();
                }}
                title="Gitflow Actions (Feature, Release, Hotfix)"
                className="px-1.5 py-0.5 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded text-[10px] font-semibold border border-indigo-500/30"
              >
                + Gitflow
              </button>
            )}
          </div>

          {expandGitflow && (
            <div className="pb-1 text-xs">
              <button
                onClick={onOpenGitflow}
                className="w-full text-left px-4 py-1.5 hover:bg-[#202735] text-slate-300 flex items-center justify-between group transition"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                  <span className="text-slate-300">Features / Releases / Hotfixes</span>
                </div>
                <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition">
                  Manage →
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* PULL REQUESTS */}
      {sectionConfig.pullRequests && (
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
            {pullRequestStatus?.loading && <div className="px-5 py-1 text-xs text-slate-500">Loading pull requests…</div>}
            {pullRequestStatus?.message && <div className="px-5 py-1 text-xs text-amber-300 break-words">{pullRequestStatus.message} {pullRequestStatus.needsConnection && <button type="button" className="text-teal-300 underline" onClick={onConnectPullRequests}>Settings</button>} {!pullRequestStatus.needsConnection && <button type="button" className="text-teal-300 underline" onClick={onRefreshPullRequests}>Retry</button>}</div>}
            {!pullRequestStatus?.loading && !pullRequestStatus?.message && pullRequests.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No pull requests</div>
            ) : (
              pullRequests.map((pr) => (
                <div
                  key={`${pr.provider?.connectionId ?? 'github'}:${pr.provider?.projectKey ?? ''}:${pr.provider?.slug ?? ''}:${pr.number}`}
                  onClick={() => onViewPr && onViewPr(pr)}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-[#202735] text-slate-300 transition"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-mono text-[10px] text-purple-400 flex-shrink-0">#{pr.number}</span>
                    <span className="truncate">{pr.title}</span>
                  </div>
                  <span className="text-[9px] font-bold px-1 rounded bg-purple-500/20 text-purple-300 flex-shrink-0">
                    {pr.isDraft ? 'DRAFT' : pr.state}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      )}

      {/* TAGS */}
      {sectionConfig.tags && (
        <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandTags(!expandTags)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandTags ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
            <span>Tags</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {q ? `(${filteredTags.length}/${tags.length})` : `(${tags.length})`}
            </span>
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

        {(expandTags || !!q) && (
          <div className="pb-1">
            {filteredTags.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No tags</div>
            ) : (
              filteredTags.map((tag) => (
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
                      onDeleteTag(tag.name);
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
      )}

      {/* STASHES */}
      {sectionConfig.stashes && (
        <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandStashes(!expandStashes)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandStashes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Stashes</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {q ? `(${filteredStashes.length}/${stashes.length})` : `(${stashes.length})`}
            </span>
          </div>
        </div>

        {(expandStashes || !!q) && (
          <div className="pb-1">
            {filteredStashes.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No stashes</div>
            ) : (
              filteredStashes.map((stash) => (
                <div
                  key={stash.name}
                  onClick={() => onInspectStash?.(stash.index, stash.message || stash.name)}
                  onContextMenu={(e) => handleStashContextMenu(e, stash)}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#202735] text-slate-300 cursor-pointer"
                  title="Click to inspect stash diff & files"
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
      )}

      {/* REMOTES */}
      {sectionConfig.remotes && (
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
      )}

      {/* WORKTREES */}
      {sectionConfig.worktrees && (
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
      )}

      {/* SUBMODULES */}
      {sectionConfig.submodules && (
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
      )}

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div
          data-context-menu
          style={menuPosition(contextMenu.x, contextMenu.y, 220, 300)}
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
                    onRenameBranch(contextMenu.item.name);
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
                      onDeleteBranch(contextMenu.item.name);
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
                  onDeleteTag(contextMenu.item.name);
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
                  onDropStash(contextMenu.item.index);
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
