import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  GitBranch,
  Terminal,
  RotateCcw,
  Archive,
  Download,
  Upload,
  RefreshCw,
  Settings,
  Plus,
  Layers,
  FileCode,
  GitPullRequest,
  Check,
  Tag as TagIcon,
  Sparkles,
  Undo2,
  History,
  Bot,
  Inbox,
} from 'lucide-react';
import { Branch, Commit, Tag } from '../../types/git';
import { AgentReviewItem } from '../../types/agentReview';

interface QuickLaunchModalProps {
  branches: Branch[];
  tags: Tag[];
  commits: Commit[];
  onClose: () => void;
  onCheckoutBranch: (name: string) => void;
  onSelectCommit: (commit: Commit) => void;
  onPull: () => void;
  onPush: () => void;
  onFetch: () => void;
  onStash: () => void;
  onPopStash: () => void;
  onUndo?: () => void;
  onOpenReflog?: () => void;
  onCreateBranch: () => void;
  onOpenSettings: () => void;
  onOpenWorktrees: () => void;
  onCreatePr: () => void;
  onToggleSidebar: () => void;
  onToggleStaging: () => void;
  onToggleAgent: () => void;
  agents?: AgentReviewItem[];
  onOpenReviewInbox?: () => void;
  onOpenAgentFleet?: () => void;
  onOpenAgent?: (agentId: string) => void;
  onAskAgent?: (prompt: string) => void;
}

interface ActionItem {
  id: string;
  category: 'Commands' | 'Branches' | 'Commits' | 'Tags' | 'Agents';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const QuickLaunchModal: React.FC<QuickLaunchModalProps> = ({
  branches,
  tags,
  commits,
  onClose,
  onCheckoutBranch,
  onSelectCommit,
  onPull,
  onPush,
  onFetch,
  onStash,
  onPopStash,
  onUndo,
  onOpenReflog,
  onCreateBranch,
  onOpenSettings,
  onOpenWorktrees,
  onCreatePr,
  onToggleSidebar,
  onToggleStaging,
  onToggleAgent,
  agents = [],
  onOpenReviewInbox,
  onOpenAgentFleet,
  onOpenAgent,
  onAskAgent,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Built-in commands
  const defaultCommands: ActionItem[] = [
    {
      id: 'cmd-pull',
      category: 'Commands',
      title: 'Git: Pull from origin',
      subtitle: 'Fetch and integrate remote changes',
      icon: <Download className="w-4 h-4 text-teal-400" />,
      run: () => {
        onPull();
        onClose();
      },
    },
    {
      id: 'cmd-push',
      category: 'Commands',
      title: 'Git: Push to origin',
      subtitle: 'Publish local commits to remote',
      icon: <Upload className="w-4 h-4 text-blue-400" />,
      run: () => {
        onPush();
        onClose();
      },
    },
    {
      id: 'cmd-fetch',
      category: 'Commands',
      title: 'Git: Fetch all remotes',
      subtitle: 'Download objects and refs from all remotes',
      icon: <RefreshCw className="w-4 h-4 text-cyan-400" />,
      run: () => {
        onFetch();
        onClose();
      },
    },
    {
      id: 'cmd-branch-new',
      category: 'Commands',
      title: 'Git: Create Branch...',
      subtitle: 'Create a new branch from current HEAD or commit',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      run: () => {
        onCreateBranch();
        onClose();
      },
    },
    {
      id: 'cmd-stash-save',
      category: 'Commands',
      title: 'Git: Stash changes',
      subtitle: 'Save local uncommitted changes to stash list',
      icon: <Archive className="w-4 h-4 text-amber-400" />,
      run: () => {
        onStash();
        onClose();
      },
    },
    {
      id: 'cmd-stash-pop',
      category: 'Commands',
      title: 'Git: Pop latest stash',
      subtitle: 'Restore and remove latest stash@{0}',
      icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
      run: () => {
        onPopStash();
        onClose();
      },
    },
    {
      id: 'cmd-undo',
      category: 'Commands',
      title: 'Git: 1-Click Undo Last Action',
      subtitle: 'Rollback commit, rebase, or checkout safely (Ctrl+Z)',
      icon: <Undo2 className="w-4 h-4 text-amber-400" />,
      run: () => {
        onUndo?.();
        onClose();
      },
    },
    {
      id: 'cmd-reflog',
      category: 'Commands',
      title: 'Git: View Reflog Timeline...',
      subtitle: 'Inspect HEAD history and recover lost commits',
      icon: <History className="w-4 h-4 text-teal-400" />,
      run: () => {
        onOpenReflog?.();
        onClose();
      },
    },
    {
      id: 'cmd-pr-create',
      category: 'Commands',
      title: 'GitHub: Create Pull Request...',
      subtitle: 'Open pull request modal with AI generator',
      icon: <GitPullRequest className="w-4 h-4 text-purple-400" />,
      run: () => {
        onCreatePr();
        onClose();
      },
    },
    {
      id: 'cmd-worktrees',
      category: 'Commands',
      title: 'Git: Manage Worktrees...',
      subtitle: 'Switch or create linked working trees',
      icon: <Layers className="w-4 h-4 text-teal-400" />,
      run: () => {
        onOpenWorktrees();
        onClose();
      },
    },
    {
      id: 'cmd-toggle-sidebar',
      category: 'Commands',
      title: 'View: Toggle Left Sidebar',
      subtitle: 'Expand or collapse branch and repository sidebar',
      icon: <Terminal className="w-4 h-4 text-slate-400" />,
      run: () => {
        onToggleSidebar();
        onClose();
      },
    },
    {
      id: 'cmd-toggle-staging',
      category: 'Commands',
      title: 'View: Toggle Staging & Diff Panel',
      subtitle: 'Expand or collapse working tree panel',
      icon: <FileCode className="w-4 h-4 text-slate-400" />,
      run: () => {
        onToggleStaging();
        onClose();
      },
    },
    {
      id: 'cmd-toggle-agent',
      category: 'Commands',
      title: 'View: Toggle AI Git Assistant Dock',
      subtitle: 'Open or close the interactive agent sidebar',
      icon: <Sparkles className="w-4 h-4 text-teal-300" />,
      run: () => {
        onToggleAgent();
        onClose();
      },
    },
    {
      id: 'cmd-settings',
      category: 'Commands',
      title: 'Preferences: Open Settings...',
      subtitle: 'Configure Git, Appearance, Diff, AI models, and shortcuts',
      icon: <Settings className="w-4 h-4 text-slate-300" />,
      run: () => {
        onOpenSettings();
        onClose();
      },
    },
  ];

  // Agent workflow commands and per-agent review
  const agentCommands: ActionItem[] = [
    ...(onOpenReviewInbox
      ? [
          {
            id: 'agent-review-inbox',
            category: 'Agents' as const,
            title: 'Agent: Open Review Inbox',
            subtitle: 'Approve, request changes, or merge agent work (Ctrl+Shift+K)',
            icon: <Inbox className="w-4 h-4 text-amber-400" />,
            run: () => {
              onOpenReviewInbox();
              onClose();
            },
          },
        ]
      : []),
    ...(onOpenAgentFleet
      ? [
          {
            id: 'agent-fleet',
            category: 'Agents' as const,
            title: 'Agent: Open Fleet Orchestrator',
            subtitle: 'Spawn agents, inspect worktrees, and resolve collisions',
            icon: <Bot className="w-4 h-4 text-purple-400" />,
            run: () => {
              onOpenAgentFleet();
              onClose();
            },
          },
        ]
      : []),
    ...(onAskAgent
      ? [
          {
            id: 'agent-ask',
            category: 'Agents' as const,
            title: 'Agent: Ask about current changes',
            subtitle: 'Open the chat dock with repository context',
            icon: <Sparkles className="w-4 h-4 text-teal-300" />,
            run: () => {
              onAskAgent('Explain the current working tree changes and what I should verify before committing.');
              onClose();
            },
          },
        ]
      : []),
    ...agents.map((agent) => ({
      id: `agent-${agent.agentId}`,
      category: 'Agents' as const,
      title: `Agent: Review ${agent.agentName}`,
      subtitle: `${agent.status.replace('-', ' ')} · ${agent.files.length} file${
        agent.files.length === 1 ? '' : 's'
      } · ${agent.branchName}`,
      icon: <Bot className="w-4 h-4" style={{ color: agent.color }} />,
      run: () => {
        onOpenAgent?.(agent.agentId);
        onClose();
      },
    })),
  ];

  // Dynamic branch items
  const branchItems: ActionItem[] = branches.map((b) => ({
    id: `branch-${b.name}`,
    category: 'Branches',
    title: `Checkout branch: ${b.name}`,
    subtitle: b.isRemote ? 'Remote branch' : `Local branch (${b.ahead} ahead, ${b.behind} behind)`,
    icon: <GitBranch className="w-4 h-4 text-teal-400" />,
    run: () => {
      onCheckoutBranch(b.name);
      onClose();
    },
  }));

  // Dynamic tag items
  const tagItems: ActionItem[] = tags.map((t) => ({
    id: `tag-${t.name}`,
    category: 'Tags',
    title: `Checkout tag: ${t.name}`,
    subtitle: t.targetHash ? `Points to ${t.targetHash.slice(0, 7)}` : 'Git tag',
    icon: <TagIcon className="w-4 h-4 text-yellow-400" />,
    run: () => {
      onCheckoutBranch(t.name);
      onClose();
    },
  }));

  // Dynamic commit items (top 30 recent commits)
  const commitItems: ActionItem[] = commits.slice(0, 30).map((c) => ({
    id: `commit-${c.hash}`,
    category: 'Commits',
    title: `${c.shortHash}: ${c.summary}`,
    subtitle: `by ${c.author.name} • ${c.date}`,
    icon: <Check className="w-4 h-4 text-slate-400" />,
    run: () => {
      onSelectCommit(c);
      onClose();
    },
  }));

  const allItems = [...defaultCommands, ...agentCommands, ...branchItems, ...tagItems, ...commitItems];

  const filteredItems = allItems.filter((item) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#1b212c] border border-[#2a3447] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[550px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="relative border-b border-[#2a3447] p-3 flex items-center space-x-3 bg-[#151a23]">
          <Search className="w-5 h-5 text-teal-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Quick Launch: Type a command, branch name, commit SHA, or tag..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <span className="text-[10px] text-slate-500 font-mono bg-[#202735] px-1.5 py-0.5 rounded border border-[#2a3447]">
            ESC to close
          </span>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs italic">
              No matching commands, branches, or commits found
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.run()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-teal-500/20 to-blue-500/10 text-white border border-teal-500/40'
                      : 'hover:bg-[#202735] text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div
                      className={`p-1.5 rounded ${
                        isSelected ? 'bg-teal-500/30 text-teal-300' : 'bg-[#151a23] text-slate-400'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ml-2 flex-shrink-0 ${
                      item.category === 'Commands'
                        ? 'bg-blue-500/20 text-blue-300'
                        : item.category === 'Branches'
                        ? 'bg-teal-500/20 text-teal-300'
                        : item.category === 'Tags'
                        ? 'bg-yellow-500/20 text-yellow-300'
                        : item.category === 'Agents'
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-slate-700/50 text-slate-400'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="bg-[#151a23] border-t border-[#2a3447] px-4 py-2 flex items-center justify-between text-[11px] text-slate-500 select-none">
          <div className="flex items-center space-x-3">
            <span><kbd className="px-1 py-0.5 bg-[#202735] rounded border border-[#2a3447]">↑</kbd> <kbd className="px-1 py-0.5 bg-[#202735] rounded border border-[#2a3447]">↓</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 bg-[#202735] rounded border border-[#2a3447]">↵</kbd> select</span>
          </div>
          <span>Gitter Quick Launch (GitKraken parity)</span>
        </div>
      </div>
    </div>
  );
};
