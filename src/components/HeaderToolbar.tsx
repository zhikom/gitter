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
  LayoutGrid,
  Undo2,
  History,
  FolderSearch,
  Code2,
  Bot,
  AlertTriangle,
  MoreHorizontal,
} from 'lucide-react';
import { RepositoryState } from '../types/git';
import { UpdateInfo } from '../types/update';
import { AgentFleetState } from '../types/agentFleet';

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
  onOpenLaunchpad?: () => void;
  onUndo?: () => void;
  onOpenReflog?: () => void;
  onToggleSidebar?: () => void;
  onToggleStaging?: () => void;
  onToggleAgent: () => void;
  isSidebarOpen?: boolean;
  isStagingOpen?: boolean;
  isAgentOpen: boolean;
  onOpenSettings: () => void;
  onCheckUpdates?: () => void;
  availableUpdate?: UpdateInfo | null;
  fleetState?: AgentFleetState | null;
  onOpenAgentFleet?: () => void;
  onOpenRepo: () => void;
  onBrowseNative?: () => void;
  onRevealInExplorer?: () => void;
  onOpenVsCode?: () => void;
  onOpenTerminal?: () => void;
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
  onOpenLaunchpad,
  onUndo,
  onOpenReflog,
  onToggleSidebar,
  onToggleStaging,
  onToggleAgent,
  isSidebarOpen = true,
  isStagingOpen = true,
  isAgentOpen,
  onOpenSettings,
  onCheckUpdates,
  availableUpdate,
  fleetState,
  onOpenAgentFleet,
  onOpenRepo,
  onBrowseNative,
  onRevealInExplorer,
  onOpenVsCode,
  onOpenTerminal,
  onCloneRepo,
  onInitRepo,
  loading,
}) => {
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);
  const [showPushMenu, setShowPushMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

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

        <div className="flex items-center space-x-2 mr-1 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-teal-500/20 flex-shrink-0">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent hidden sm:inline">
            GITTER
          </span>
        </div>

        {/* Current Repository Dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowRepoMenu(!showRepoMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
            <span className="max-w-[100px] sm:max-w-[140px] truncate">{repoState?.name || 'No Repository'}</span>
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
              {onOpenLaunchpad && (
                <button
                  onClick={onOpenLaunchpad}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300 font-semibold"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
                  <span>Repository Launchpad...</span>
                </button>
              )}
              <button
                onClick={onOpenRepo}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                <span>Open Local Repository...</span>
              </button>
              {onBrowseNative && (
                <button
                  onClick={onBrowseNative}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
                >
                  <FolderSearch className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Browse Native Folder...</span>
                </button>
              )}
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

              {onCheckUpdates && (
                <>
                  <div className="border-t border-[#2a3447] my-1" />
                  <button
                    onClick={onCheckUpdates}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-teal-400" />
                    <span>Check for Updates...</span>
                  </button>
                </>
              )}

              {repoState && (
                <div className="border-t border-[#2a3447] mt-1 pt-1 px-3 py-1 text-[11px] text-slate-400 truncate">
                  Path: {repoState.path}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Launchpad Button */}
        {onOpenLaunchpad && (
          <button
            onClick={onOpenLaunchpad}
            title="Repository Launchpad (Ctrl+L)"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition flex-shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden xl:inline">Launchpad</span>
          </button>
        )}

        {/* Current Branch Indicator */}
        {repoState && (
          <div className="flex items-center space-x-1 px-2 py-1 rounded bg-[#14181f] border border-[#2a3447] text-xs font-mono text-teal-300 flex-shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
            <span className="font-semibold truncate max-w-[80px] sm:max-w-[120px] md:max-w-[160px]">{repoState.currentBranch}</span>
            {repoState.isRebasing && (
              <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">REBASE</span>
            )}
            {repoState.isMerging && (
              <span className="ml-1 text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">MERGE</span>
            )}
          </div>
        )}
      </div>

      {/* Center: Main Git Action Controls */}
      <div className="flex items-center space-x-1 flex-shrink-0 mx-1">
        {/* Pull Button with Menu */}
        <div className="relative">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => onPull(false)}
              disabled={loading}
              title="Pull from remote"
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded-l text-xs font-medium text-slate-200 transition disabled:opacity-50"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">Pull</span>
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
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded-l text-xs font-medium text-slate-200 transition disabled:opacity-50"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Push</span>
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
          className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-200 transition"
        >
          <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">Branch</span>
        </button>

        {/* Stash Button */}
        <button
          onClick={onOpenStashModal}
          disabled={loading}
          title="Save changes to stash"
          className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-200 transition"
        >
          <Archive className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline">Stash</span>
        </button>

        {/* Inline Secondary Actions (shown on wide screens) */}
        <button
          onClick={onPopStash}
          disabled={loading}
          title="Pop most recent stash"
          className="hidden xl:flex items-center space-x-1.5 px-2 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs font-medium text-slate-300 transition"
        >
          <span>Pop</span>
        </button>

        <button
          onClick={onFetch}
          disabled={loading}
          title="Fetch from remotes"
          className="hidden xl:flex items-center space-x-1 px-2 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs text-slate-300 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Fetch</span>
        </button>

        {onUndo && (
          <button
            onClick={onUndo}
            disabled={loading}
            title="1-Click Undo last action (Ctrl+Z)"
            className="hidden 2xl:flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs text-amber-300 hover:text-amber-200 transition disabled:opacity-50"
          >
            <Undo2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Undo</span>
          </button>
        )}

        {onOpenReflog && (
          <button
            onClick={onOpenReflog}
            title="View Git Reflog & History Timeline"
            className="hidden 2xl:flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] rounded text-xs text-slate-300 hover:text-teal-300 transition"
          >
            <History className="w-3.5 h-3.5 text-teal-400" />
            <span>Reflog</span>
          </button>
        )}

        {/* Dynamic More ("...") Overflow Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="More Operations & External Tools"
            className="p-1.5 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300 hover:text-white transition"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div
              className="absolute top-full mt-1.5 right-0 md:left-0 w-52 bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl py-1.5 z-50 text-xs select-none"
              onClick={() => setShowMoreMenu(false)}
            >
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Git Operations
              </div>
              <button
                onClick={onPopStash}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <Archive className="w-3.5 h-3.5 text-amber-400" />
                <span>Pop Most Recent Stash</span>
              </button>
              <button
                onClick={onFetch}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                <span>Fetch from All Remotes</span>
              </button>
              {onUndo && (
                <button
                  onClick={onUndo}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-amber-300"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>1-Click Undo (Ctrl+Z)</span>
                </button>
              )}
              {onOpenReflog && (
                <button
                  onClick={onOpenReflog}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
                >
                  <History className="w-3.5 h-3.5 text-teal-400" />
                  <span>View Reflog Timeline</span>
                </button>
              )}

              <div className="border-t border-[#2a3447] my-1" />
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                External Tools
              </div>
              {onRevealInExplorer && (
                <button
                  onClick={onRevealInExplorer}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                  <span>Open in File Explorer / Finder</span>
                </button>
              )}
              {onOpenVsCode && (
                <button
                  onClick={onOpenVsCode}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
                >
                  <Code2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Open in Visual Studio Code</span>
                </button>
              )}
              {onOpenTerminal && (
                <button
                  onClick={onOpenTerminal}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-200"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open in Terminal</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Quick Launch, AI Agent, Staging Toggle, Settings, Refresh */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {/* External Tools Launcher (File Explorer, VS Code, Terminal) - shown on wider screens */}
        {repoState && (
          <div className="hidden lg:flex items-center space-x-0.5 border-r border-[#2a3447] pr-1.5 mr-0.5">
            {onRevealInExplorer && (
              <button
                onClick={onRevealInExplorer}
                title="Open Repository in OS File Manager / File Explorer"
                className="p-1.5 text-slate-400 hover:text-teal-300 hover:bg-[#202735] rounded transition"
              >
                <FolderOpen className="w-4 h-4 text-teal-400" />
              </button>
            )}
            {onOpenVsCode && (
              <button
                onClick={onOpenVsCode}
                title="Open in Visual Studio Code"
                className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-[#202735] rounded transition"
              >
                <Code2 className="w-4 h-4 text-blue-400" />
              </button>
            )}
            {onOpenTerminal && (
              <button
                onClick={onOpenTerminal}
                title="Open in Terminal"
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-[#202735] rounded transition"
              >
                <Terminal className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>
        )}

        {/* Quick Launch / Command Palette Button */}
        {onOpenQuickLaunch && (
          <button
            onClick={onOpenQuickLaunch}
            title="Quick Launch / Command Palette (Ctrl+P)"
            className="flex items-center space-x-1 px-2 py-1.5 bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] hover:border-teal-500/50 rounded text-xs text-slate-300 transition group"
          >
            <Search className="w-3.5 h-3.5 text-teal-400 group-hover:scale-110 transition-transform" />
            <span className="hidden 2xl:inline">Quick Launch</span>
            <kbd className="hidden 2xl:inline text-[10px] bg-[#14181f] text-slate-500 px-1 rounded border border-[#2a3447]">
              Ctrl+P
            </kbd>
          </button>
        )}

        {/* Multi-Agent Fleet Orchestrator & Collision Radar Pill */}
        {onOpenAgentFleet && (
          fleetState && fleetState.collisions.length > 0 ? (
            <button
              onClick={onOpenAgentFleet}
              title={`${fleetState.collisions.length} collision(s) detected across active agents! Click to resolve.`}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold animate-pulse shadow-md transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{fleetState.collisions.length} Collision{fleetState.collisions.length > 1 ? 's' : ''}!</span>
            </button>
          ) : fleetState && fleetState.agents.length > 0 ? (
            <button
              onClick={onOpenAgentFleet}
              title={`Agent Fleet Active: ${fleetState.agents.length} agent(s) running with 0 collisions.`}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full bg-[#202735] hover:bg-[#2c374b] border border-teal-500/40 text-teal-300 text-xs font-semibold shadow-sm transition"
            >
              <Bot className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">{fleetState.agents.length} Agent{fleetState.agents.length > 1 ? 's' : ''}</span>
            </button>
          ) : (
            <button
              onClick={onOpenAgentFleet}
              title="Multi-Agent Fleet Orchestrator (Claude Code, Antigravity, Codex, Grok)"
              className="flex items-center space-x-1 px-2 py-1.5 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300 hover:text-white text-xs font-medium transition"
            >
              <Bot className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Fleet</span>
            </button>
          )
        )}

        {/* AI Agent Dock Toggle */}
        <button
          onClick={onToggleAgent}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition shadow-md ${
            isAgentOpen
              ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-teal-500/20'
              : 'bg-[#202735] hover:bg-[#2d384c] border border-teal-500/30 text-teal-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AI Agent</span>
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

        {/* Available Update Notification Badge */}
        {availableUpdate && availableUpdate.hasUpdate && onCheckUpdates && (
          <button
            onClick={onCheckUpdates}
            title={`Gitter v${availableUpdate.latestVersion} is available! Click to view changelog and download.`}
            className="flex items-center space-x-1 px-2 py-1 rounded-full bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-teal-300 border border-teal-500/40 text-xs font-semibold hover:border-teal-400 hover:bg-teal-500/30 transition shadow-sm animate-pulse"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden md:inline">v{availableUpdate.latestVersion}</span>
          </button>
        )}

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
