import React, { useState } from 'react';
import {
  GitBranch,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Sparkles,
  Archive,
  FolderOpen,
  PlusCircle,
  Settings,
  ChevronDown,
  Terminal,
  Layers,
  DownloadCloud,
  Search,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { RepositoryState } from '../types/git';

interface HeaderToolbarProps {
  repoState: RepositoryState | null;
  onRefresh: () => void;
  onPull: (rebase?: boolean) => void;
  onPush: (forceWithLease?: boolean) => void;
  onFetch: () => void;
  onOpenBranchModal: () => void;
  onOpenStashModal: () => void;
  onPopStash: () => void;
  onOpenQuickLaunch?: () => void;
  onToggleSidebar?: () => void;
  onToggleStaging?: () => void;
  onToggleAgent: () => void;
  isSidebarOpen?: boolean;
  isStagingOpen?: boolean;
  isAgentOpen: boolean;
  onOpenSettings: () => void;
  onOpenRepo: () => void;
  onCloneRepo: () => void;
  onInitRepo: () => void;
  loading: boolean;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  repoState,
  onRefresh,
  onPull,
  onPush,
  onFetch,
  onOpenBranchModal,
  onOpenStashModal,
  onPopStash,
  onOpenQuickLaunch,
  onToggleSidebar,
  onToggleStaging,
  onToggleAgent,
  isSidebarOpen = true,
  isStagingOpen = true,
  isAgentOpen,
  onOpenSettings,
  onOpenRepo,
  onCloneRepo,
  onInitRepo,
  loading,
}) => {
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);
  const [showPushMenu, setShowPushMenu] = useState(false);

  return (
    <header className="h-12 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3 select-none z-30">
      {/* Left: App Logo, Sidebar Toggle, & Repo Selector */}
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={`Toggle Left Sidebar (${isSidebarOpen ? 'Ctrl+B to hide' : 'Ctrl+B to show'})`}
            className={`p-1.5 rounded transition ${
              isSidebarOpen ? 'text-teal-400 bg-[#202735]' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center space-x-2 mr-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
            GITTER
          </span>
        </div>

        {/* Current Repository Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRepoMenu(!showRepoMenu)}
            className="flex items-center space-x-2 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
            <span className="max-w-[140px] truncate">{repoState?.name || 'No Repository'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showRepoMenu && (
            <div
              className="absolute left-0 mt-1 w-52 bg-[#1b212c] border border-[#2a3447] rounded-md shadow-xl py-1 z-50 text-xs"
              onClick={() => setShowRepoMenu(false)}
            >
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Repositories
              </div>
              <button
                onClick={onOpenRepo}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                <span>Open Local Repository...</span>
              </button>
              <button
                onClick={onCloneRepo}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-blue-400" />
                <span>Clone Repository...</span>
              </button>
              <button
                onClick={onInitRepo}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <PlusCircle className="w-3.5 h-3.5 text-purple-400" />
                <span>Init New Repository...</span>
              </button>
              {repoState && (
                <div className="border-t border-[#2a3447] mt-1 pt-1 px-3 py-1 text-[11px] text-slate-400 truncate">
                  Path: {repoState.path}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current Branch Indicator */}
        {repoState && (
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#14181f] border border-[#2a3447] text-xs font-mono text-teal-300">
            <GitBranch className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-semibold">{repoState.currentBranch}</span>
            {repoState.isRebasing && (
              <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">REBASING</span>
            )}
            {repoState.isMerging && (
              <span className="ml-1 text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">MERGING</span>
            )}
          </div>
        )}
      </div>

      {/* Center: Main Git Action Controls */}
      <div className="flex items-center space-x-1">
        {/* Pull Button with Menu */}
        <div className="relative">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => onPull(false)}
              disabled={loading}
              title="Pull from remote"
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded-l text-xs font-medium text-slate-200 transition disabled:opacity-50"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-teal-400" />
              <span>Pull</span>
            </button>
            <button
              onClick={() => setShowPullMenu(!showPullMenu)}
              className="px-1.5 bg-[#202735] hover:bg-[#2d384c] border-y border-r border-[#2a3447] rounded-r text-slate-400"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {showPullMenu && (
            <div
              className="absolute top-full mt-1 w-36 bg-[#1b212c] border border-[#2a3447] rounded shadow-lg py-1 z-50 text-xs"
              onClick={() => setShowPullMenu(false)}
            >
              <button
                onClick={() => onPull(false)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] text-slate-200"
              >
                Pull (Merge)
              </button>
              <button
                onClick={() => onPull(true)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] text-slate-200"
              >
                Pull (Rebase)
              </button>
            </div>
          )}
        </div>

        {/* Push Button with Menu */}
        <div className="relative">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => onPush(false)}
              disabled={loading}
              title="Push commits to remote"
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded-l text-xs font-medium text-slate-200 transition disabled:opacity-50"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 text-blue-400" />
              <span>Push</span>
            </button>
            <button
              onClick={() => setShowPushMenu(!showPushMenu)}
              className="px-1.5 bg-[#202735] hover:bg-[#2d384c] border-y border-r border-[#2a3447] rounded-r text-slate-400"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {showPushMenu && (
            <div
              className="absolute top-full mt-1 w-44 bg-[#1b212c] border border-[#2a3447] rounded shadow-lg py-1 z-50 text-xs"
              onClick={() => setShowPushMenu(false)}
            >
              <button
                onClick={() => onPush(false)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] text-slate-200"
              >
                Standard Push
              </button>
              <button
                onClick={() => onPush(true)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] text-amber-300"
              >
                Push (Force with Lease)
              </button>
            </div>
          )}
        </div>

        {/* Branch Button */}
        <button
          onClick={onOpenBranchModal}
          disabled={loading}
          title="Create a new branch"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-200 transition"
        >
          <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
          <span>Branch</span>
        </button>

        {/* Stash Button */}
        <button
          onClick={onOpenStashModal}
          disabled={loading}
          title="Save changes to stash"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-200 transition"
        >
          <Archive className="w-3.5 h-3.5 text-amber-400" />
          <span>Stash</span>
        </button>

        {/* Pop Stash */}
        <button
          onClick={onPopStash}
          disabled={loading}
          title="Pop most recent stash"
          className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-300 transition"
        >
          <span>Pop</span>
        </button>

        {/* Fetch */}
        <button
          onClick={onFetch}
          disabled={loading}
          title="Fetch from remotes"
          className="flex items-center space-x-1 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs text-slate-300 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Fetch</span>
        </button>
      </div>

      {/* Right: Quick Launch, AI Agent, Staging Toggle, Settings, Refresh */}
      <div className="flex items-center space-x-2">
        {/* Quick Launch / Command Palette Button */}
        {onOpenQuickLaunch && (
          <button
            onClick={onOpenQuickLaunch}
            title="Quick Launch / Command Palette (Ctrl+P)"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] hover:border-teal-500/50 rounded text-xs text-slate-300 transition group"
          >
            <Search className="w-3.5 h-3.5 text-teal-400 group-hover:scale-110 transition-transform" />
            <span>Quick Launch</span>
            <kbd className="text-[10px] bg-[#14181f] text-slate-500 px-1 rounded border border-[#2a3447]">
              Ctrl+P
            </kbd>
          </button>
        )}

        {/* AI Agent Dock Toggle */}
        <button
          onClick={onToggleAgent}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition shadow-md ${
            isAgentOpen
              ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-teal-500/20'
              : 'bg-[#202735] hover:bg-[#2d384c] border border-teal-500/30 text-teal-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Agent</span>
        </button>

        {/* Staging & Diff Panel Toggle */}
        {onToggleStaging && (
          <button
            onClick={onToggleStaging}
            title={`Toggle Working Tree & Diff (${isStagingOpen ? 'Ctrl+J to hide' : 'Ctrl+J to show'})`}
            className={`p-1.5 rounded transition ${
              isStagingOpen ? 'text-teal-400 bg-[#202735]' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          title="Refresh repository"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202735] rounded transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Settings & Preferences"
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202735] rounded transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
