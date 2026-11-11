import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from './api/client';
import {
  Branch,
  Commit,
  FileDiff,
  FileStatus,
  Remote,
  RepositoryState,
  Stash,
  Tag,
} from './types/git';
import { HeaderToolbar } from './components/HeaderToolbar';
import { Sidebar } from './components/Sidebar';
import { CommitGraph } from './components/CommitGraph/CommitGraph';
import { StagingPanel } from './components/Staging/StagingPanel';
import { CommitBox } from './components/Staging/CommitBox';
import { DiffViewer } from './components/Staging/DiffViewer';
import { CommitDetailModal } from './components/CommitDetail/CommitDetailModal';
import { AgentSidebar } from './components/Agent/AgentSidebar';
import { CreateBranchModal } from './components/Modals/CreateBranchModal';
import { StashModal } from './components/Modals/StashModal';
import { CloneRepoModal } from './components/Modals/CloneRepoModal';
import { OpenRepoModal } from './components/Modals/OpenRepoModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ThreeWayConflictResolverModal } from './components/ConflictResolver/ThreeWayConflictResolverModal';
import { CommitComparisonModal } from './components/CommitComparison/CommitComparisonModal';
import { ReflogModal } from './components/Modals/ReflogModal';
import { RepoTabBar, RepoTab } from './components/Navigation/RepoTabBar';
import { InteractiveRebaseModal } from './components/Rebase/InteractiveRebaseModal';
import { FileBlameModal } from './components/Blame/FileBlameModal';
import { WorktreesModal } from './components/Worktrees/WorktreesModal';
import { PullRequestModal } from './components/PullRequests/PullRequestModal';
import { BranchActionModal } from './components/Modals/BranchActionModal';
import { QuickLaunchModal } from './components/Modals/QuickLaunchModal';
import { LaunchpadModal } from './components/Modals/LaunchpadModal';
import { StashInspectorModal } from './components/Modals/StashInspectorModal';
import { FileHistoryModal } from './components/Modals/FileHistoryModal';
import { ShelveModal } from './components/Modals/ShelveModal';
import { VirtualBranchPanel } from './components/VirtualBranches/VirtualBranchPanel';
import { UpdateModal } from './components/Modals/UpdateModal';
import { GitflowModal } from './components/Modals/GitflowModal';
import { AgentFleetModal } from './components/Modals/AgentFleetModal';
import { AgentRail } from './components/Agent/AgentRail';
import { AgentReviewInbox } from './components/Agent/AgentReviewInbox';
import { AgentRunDrawer } from './components/Agent/AgentRunDrawer';
import { AgentLens } from './components/Agent/AgentLens';
import { CollisionBar } from './components/Agent/CollisionBar';
import { checkForAppUpdate } from './services/updateService';
import { UpdateInfo } from './types/update';
import { AgentAttentionItem, AgentReviewItem } from './types/agentReview';
import { useAgentLive } from './hooks/useAgentLive';
import { PullRequest, Submodule, Worktree } from './types/git';
import { Shelf } from './types/shelf';

import { toast } from './utils/toast';
export const App: React.FC = () => {
  const [repoPath, setRepoPath] = useState<string>('');
  const [repoState, setRepoState] = useState<RepositoryState | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [submodules, setSubmodules] = useState<Submodule[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);

  // Selection
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [inspectCommitModal, setInspectCommitModal] = useState<Commit | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isSelectedFileStaged, setIsSelectedFileStaged] = useState<boolean>(false);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);

  // Panels & Modals - AI Agent dock closed by default on startup
  const [isAgentOpen, setIsAgentOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showQuickLaunch, setShowQuickLaunch] = useState<boolean>(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(() => {
    return localStorage.getItem('gitter_diff_ws') === 'true';
  });

  const handleToggleAgent = useCallback(() => {
    setIsAgentOpen((prev) => {
      const next = !prev;
      localStorage.setItem('gitter_agent_open', next ? 'true' : 'false');
      return next;
    });
  }, []);

  // Dynamic Window Resize Listener
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1200;
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Resizable panels & persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitter_sidebar_width');
    return saved ? Math.max(160, Math.min(500, parseInt(saved, 10))) : 256;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    return localStorage.getItem('gitter_sidebar_open') !== 'false';
  });

  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitter_right_panel_width');
    return saved ? Math.max(300, Math.min(950, parseInt(saved, 10))) : 560;
  });
  const [isStagingOpen, setIsStagingOpen] = useState<boolean>(() => {
    return localStorage.getItem('gitter_staging_open') !== 'false';
  });
  const [isVirtualBranchesMode, setIsVirtualBranchesMode] = useState<boolean>(() => {
    return localStorage.getItem('gitter_vb_mode') === 'true';
  });

  const [stagingListWidth, setStagingListWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitter_staging_list_width');
    return saved ? Math.max(180, Math.min(450, parseInt(saved, 10))) : 280;
  });

  // Dynamic Panel Balancing: ensures central commit graph is never squished
  const isCompactScreen = windowWidth < 1024;
  const isAgentOverlay = windowWidth < 1350;

  const effectiveSidebarWidth = !isSidebarOpen
    ? 0
    : isCompactScreen && isStagingOpen
    ? Math.min(sidebarWidth, 200)
    : Math.min(sidebarWidth, Math.max(160, Math.floor(windowWidth * 0.28)));

  const minCenterGraphWidth = 260;
  const maxAllowedRightPanel = Math.max(
    300,
    windowWidth -
      effectiveSidebarWidth -
      (isAgentOpen && !isAgentOverlay ? 320 : 0) -
      minCenterGraphWidth
  );
  const effectiveRightPanelWidth = Math.min(rightPanelWidth, maxAllowedRightPanel);

  // Staging layout: automatically stack vertically if right panel is narrow (< 520px)
  const isStackedStaging = effectiveRightPanelWidth < 520;
  const effectiveStagingListWidth = isStackedStaging
    ? effectiveRightPanelWidth
    : Math.min(stagingListWidth, Math.max(160, effectiveRightPanelWidth - 200));
  const [branchStartPoint, setBranchStartPoint] = useState<string>('HEAD');
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [showStashModal, setShowStashModal] = useState<boolean>(false);
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [showOpenModal, setShowOpenModal] = useState<boolean>(false);
  const [showLaunchpadModal, setShowLaunchpadModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showWorktreesModal, setShowWorktreesModal] = useState<boolean>(false);
  const [showPrModal, setShowPrModal] = useState<boolean>(false);
  const [selectedPr, setSelectedPr] = useState<PullRequest | null>(null);
  const [prModalMode, setPrModalMode] = useState<'view' | 'create'>('view');
  const [rebaseBaseHash, setRebaseBaseHash] = useState<string | null>(null);
  const [blameFilePath, setBlameFilePath] = useState<string | null>(null);
  const [conflictModalData, setConflictModalData] = useState<{ rawDiff: string; file: string } | null>(null);
  const [branchAction, setBranchAction] = useState<{ source: string; target: string } | null>(null);

  // Multi-Repo Tabs
  const [repoTabs, setRepoTabs] = useState<RepoTab[]>(() => {
    try {
      const stored = localStorage.getItem('gitter_open_repo_tabs');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  // Two-Commit Comparison
  const [comparisonCommits, setComparisonCommits] = useState<{ base: Commit; target: Commit } | null>(null);

  // Reflog Modal
  const [showReflogModal, setShowReflogModal] = useState<boolean>(false);

  // Auto-Update & Gitflow States
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [showGitflowModal, setShowGitflowModal] = useState<boolean>(false);

  // Multi-Agent Fleet Orchestrator & Collision Radar (live SSE + polling fallback)
  const agentLive = useAgentLive(repoPath);
  const agentFleetState = agentLive.fleet;
  const agentReview = agentLive.review;
  const applyAgentFleet = agentLive.applyFleet;
  const applyAgentReview = agentLive.applyReview;
  const refreshAgentLive = agentLive.refresh;
  const [showAgentFleetModal, setShowAgentFleetModal] = useState<boolean>(false);
  const [showReviewInbox, setShowReviewInbox] = useState<boolean>(false);
  const [showAgentRunDrawer, setShowAgentRunDrawer] = useState<boolean>(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentLensId, setAgentLensId] = useState<string | null>(null);
  const [acknowledgedAttention, setAcknowledgedAttention] = useState<Set<string>>(new Set());
  const [agentPromptSeed, setAgentPromptSeed] = useState<string>('');
  const [isAgentRailOpen, setIsAgentRailOpen] = useState<boolean>(() => {
    return localStorage.getItem('gitter_agent_rail_open') !== 'false';
  });

  const toggleAgentRail = useCallback(() => {
    setIsAgentRailOpen((prev) => {
      const next = !prev;
      localStorage.setItem('gitter_agent_rail_open', next ? 'true' : 'false');
      return next;
    });
  }, []);

  // Clear acknowledged attention when switching repositories.
  useEffect(() => {
    setAcknowledgedAttention(new Set());
    setActiveAgentId(null);
    setAgentLensId(null);
    setShowAgentRunDrawer(false);
  }, [repoPath]);

  const acknowledgeAttention = useCallback((id: string) => {
    setAcknowledgedAttention((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const acknowledgeAllAttention = useCallback(() => {
    setAcknowledgedAttention((prev) => {
      const next = new Set(prev);
      (agentReview?.attention ?? []).forEach((item) => next.add(item.id));
      return next;
    });
  }, [agentReview]);

  // Optimistic review-state patch; the server snapshot reconciles shortly after.
  const patchAgentReviewItem = useCallback(
    (agentId: string, patch: Partial<AgentReviewItem>) => {
      applyAgentReview((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.agentId === agentId
                  ? { ...item, ...patch, updatedAt: Date.now() }
                  : item
              ),
            }
          : prev
      );
    },
    [applyAgentReview]
  );

  // JetBrains Shelves & Inspector
  const [showShelveModal, setShowShelveModal] = useState<boolean>(false);
  const [stashInspectorTarget, setStashInspectorTarget] = useState<
    | { type: 'stash'; index: number; name: string }
    | { type: 'shelf'; shelf: Shelf }
    | null
  >(null);
  const [fileHistoryTarget, setFileHistoryTarget] = useState<string | null>(null);

  // Auto-check for updates on startup
  useEffect(() => {
    const autoCheck = localStorage.getItem('gitter_auto_check_updates') !== 'false';
    if (autoCheck) {
      checkForAppUpdate()
        .then((info) => {
          if (info && info.hasUpdate) {
            setAvailableUpdate(info);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleCheckUpdates = async () => {
    try {
      const info = await checkForAppUpdate();
      setAvailableUpdate(info);
      setShowUpdateModal(true);
    } catch (e: any) {
      toast(`Update check failed: ${e.message}`);
    }
  };

  // Initialize repository
  const refreshRepo = useCallback(async (path?: string) => {
    setLoading(true);
    try {
      const current = path || repoPath;
      const state = await api.getRepoState(current);
      setRepoState(state);
      if (!repoPath || path) setRepoPath(state.path);

      // Sync open repository tabs
      setRepoTabs((prev) => {
        const repoName = state.path.split(/[\\/]/).filter(Boolean).pop() || 'repo';
        const exists = prev.some((t) => t.path.toLowerCase() === state.path.toLowerCase());
        let updated: RepoTab[];
        if (exists) {
          updated = prev.map((t) =>
            t.path.toLowerCase() === state.path.toLowerCase()
              ? { ...t, name: repoName, branch: state.currentBranch, isClean: state.isClean }
              : t
          );
        } else {
          updated = [...prev, { path: state.path, name: repoName, branch: state.currentBranch, isClean: state.isClean }];
        }
        localStorage.setItem('gitter_open_repo_tabs', JSON.stringify(updated));
        return updated;
      });

      // Fetch all Git and GitHub data in parallel
      const [
        fetchedCommits,
        fetchedStatuses,
        fetchedBranches,
        fetchedTags,
        fetchedStashes,
        fetchedRemotes,
        fetchedWorktrees,
        fetchedSubmodules,
        fetchedPrs,
        fetchedShelves,
        fetchedFleet,
      ] = await Promise.all([
        api.getCommits(state.path, 300),
        api.getFileStatuses(state.path),
        api.getBranches(state.path),
        api.getTags(state.path),
        api.getStashes(state.path),
        api.getRemotes(state.path),
        api.getWorktrees(state.path),
        api.getSubmodules(state.path),
        api.getPullRequests(state.path).catch(() => []),
        api.getShelves(state.path).catch(() => []),
        api.getAgentFleet(state.path).catch(() => null),
      ]);

      setCommits(fetchedCommits);
      setStatuses(fetchedStatuses);
      setBranches(fetchedBranches);
      setTags(fetchedTags);
      setStashes(fetchedStashes);
      setShelves(fetchedShelves);
      setRemotes(fetchedRemotes);
      setWorktrees(fetchedWorktrees);
      setSubmodules(fetchedSubmodules);
      setPullRequests(fetchedPrs);
      if (fetchedFleet) applyAgentFleet(fetchedFleet);

      // Auto-select WIP if changes exist, otherwise first commit
      if (!state.isClean) {
        if (fetchedStatuses.length > 0 && !selectedFile) {
          setSelectedFile(fetchedStatuses[0].path);
          setIsSelectedFileStaged(fetchedStatuses[0].staged);
        }
      } else if (fetchedCommits.length > 0 && !selectedCommit) {
        setSelectedCommit(fetchedCommits[0]);
      }
    } catch (e: any) {
      console.error('Error refreshing repo:', e);
    } finally {
      setLoading(false);
    }
  }, [repoPath, selectedFile, selectedCommit, applyAgentFleet]);

  useEffect(() => {
    refreshRepo();
  }, []);

  // Window drag-and-drop to open repository folders
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const potentialPath = (files[0] as any).path;
        if (potentialPath) {
          refreshRepo(potentialPath);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [refreshRepo]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P or Ctrl+Shift+P: Quick Launch
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowQuickLaunch((prev) => !prev);
      }
      // Ctrl+L / Cmd+L: Repository Launchpad
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        setShowLaunchpadModal((prev) => !prev);
      }
      // Ctrl+B: Toggle Left Sidebar
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarOpen((prev) => {
          const next = !prev;
          localStorage.setItem('gitter_sidebar_open', next ? 'true' : 'false');
          return next;
        });
      }
      // Ctrl+J: Toggle Staging Panel
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsStagingOpen((prev) => {
          const next = !prev;
          localStorage.setItem('gitter_staging_open', next ? 'true' : 'false');
          return next;
        });
      }
      // Ctrl+Shift+A: Toggle AI Agent
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleToggleAgent();
      }
      // Ctrl+T: Open Launchpad in new tab
      else if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setShowLaunchpadModal(true);
      }
      // Ctrl+W: Close Current Tab (when more than 1 tab)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W') && !e.shiftKey) {
        if (repoTabs.length > 1 && repoPath) {
          e.preventDefault();
          handleCloseTab(repoPath);
        }
      }
      // Ctrl+Tab / Ctrl+Shift+Tab: Cycle open repository tabs
      else if (e.ctrlKey && e.key === 'Tab') {
        if (repoTabs.length > 1) {
          e.preventDefault();
          const currentIndex = repoTabs.findIndex(
            (t) => t.path.toLowerCase() === repoPath.toLowerCase()
          );
          if (currentIndex !== -1) {
            const nextIndex = e.shiftKey
              ? (currentIndex - 1 + repoTabs.length) % repoTabs.length
              : (currentIndex + 1) % repoTabs.length;
            handleSelectTab(repoTabs[nextIndex].path);
          }
        }
      }
      // Ctrl+Z: 1-Click Undo (only when not in textarea/input)
      else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'z' || e.key === 'Z') &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch diff when selected file changes
  useEffect(() => {
    if (!selectedFile || !repoPath) {
      setFileDiffs([]);
      return;
    }

    api.getDiff(repoPath, selectedFile, isSelectedFileStaged, ignoreWhitespace)
      .then((diffs) => {
        setFileDiffs(diffs);
      })
      .catch((e) => {
        console.error('Diff error:', e);
        setFileDiffs([]);
      });
  }, [selectedFile, isSelectedFileStaged, repoPath, statuses, ignoreWhitespace]);

  // Network operations
  const handlePull = async (rebase: boolean = false) => {
    setLoading(true);
    try {
      const res = await api.pull(repoPath, 'origin', '', rebase);
      toast(`Pull successful!\n${res.output || 'Up to date'}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Pull error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async (forceWithLease: boolean = false) => {
    setLoading(true);
    try {
      const res = await api.push(repoPath, 'origin', '', forceWithLease);
      toast(`Push successful!\n${res.output || 'Everything up-to-date'}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Push error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async () => {
    setLoading(true);
    try {
      await api.fetchRepo(repoPath);
      await refreshRepo();
    } catch (e: any) {
      toast(`Fetch error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Staging operations
  const handleStageFile = async (file: string) => {
    await api.stageFile(repoPath, file);
    await refreshRepo();
  };

  const handleUnstageFile = async (file: string) => {
    await api.unstageFile(repoPath, file);
    await refreshRepo();
  };

  const handleStageAll = async () => {
    await api.stageAll(repoPath);
    await refreshRepo();
  };

  const handleUnstageAll = async () => {
    await api.unstageAll(repoPath);
    await refreshRepo();
  };

  const handleDiscardFile = async (file: string) => {
    await api.discardFile(repoPath, file);
    await refreshRepo();
  };

  const handleDiscardAll = async () => {
    if (confirm('Discard all working directory changes permanently?')) {
      await api.discardAll(repoPath);
      await refreshRepo();
    }
  };

  // Commit
  const handleCommit = async (
    summary: string,
    description: string,
    amend: boolean,
    postAction?: 'push' | 'sync'
  ) => {
    setLoading(true);
    try {
      await api.commit(repoPath, summary, description, amend);
      if (postAction === 'push') {
        await api.push(repoPath, 'origin', repoState?.currentBranch || '');
      } else if (postAction === 'sync') {
        await api.pull(repoPath, 'origin', repoState?.currentBranch || '');
        await api.push(repoPath, 'origin', repoState?.currentBranch || '');
      }
      await refreshRepo();
    } catch (e: any) {
      toast(`Commit error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // AI Commit message generator
  const handleGenerateAiMessage = async (): Promise<{ summary: string; description: string }> => {
    const stagedFiles = statuses.filter((s) => s.staged).map((s) => s.path);
    if (stagedFiles.length === 0) {
      throw new Error('Please stage files before generating commit message.');
    }

    // Accumulate diffs from staged files
    let accumulatedDiff = '';
    for (const f of stagedFiles.slice(0, 5)) {
      const diffs = await api.getDiff(repoPath, f, true);
      if (diffs.length > 0) {
        accumulatedDiff += `\nFile: ${f}\n` + diffs[0].rawDiff;
      }
    }

    return await api.generateCommitMessage(accumulatedDiff, stagedFiles);
  };

  // AI Explain
  const handleExplainFile = async (rawDiff: string, filename: string) => {
    try {
      const explanation = await api.explainChanges(rawDiff, `File: ${filename}`);
      toast(`AI Review for ${filename}:\n\n${explanation.summary}\n\nRisk: ${explanation.riskAssessment.toUpperCase()}\n${explanation.keyChanges.join('\n')}`);
    } catch (e: any) {
      toast(`Explain error: ${e.message}`);
    }
  };

  // AI Conflict Resolve
  const handleOpenConflictModal = (rawDiff: string, file: string) => {
    setConflictModalData({ rawDiff, file });
  };

  const handleApplyConflictResolution = async (content: string) => {
    if (!conflictModalData) return;
    // We stage the resolved file
    await api.stageFile(repoPath, conflictModalData.file);
    await refreshRepo();
  };

  // Branch & Tag actions
  const handleCheckoutBranch = async (name: string) => {
    setLoading(true);
    try {
      await api.checkoutBranch(repoPath, name);
      await refreshRepo();
    } catch (e: any) {
      toast(`Checkout failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranch = async (name: string) => {
    try {
      await api.deleteBranch(repoPath, name, true);
      await refreshRepo();
    } catch (e: any) {
      toast(`Delete branch failed: ${e.message}`);
    }
  };

  const handleRenameBranch = async (oldName: string, newName: string) => {
    setLoading(true);
    try {
      await api.renameBranch(repoPath, oldName, newName);
      await refreshRepo();
    } catch (e: any) {
      toast(`Rename failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePushBranch = async (branchName: string) => {
    setLoading(true);
    try {
      const res = await api.push(repoPath, 'origin', branchName);
      toast(`Pushed ${branchName} to origin!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Push failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMergeBranch = async (source: string, target: string) => {
    setLoading(true);
    try {
      if (repoState?.currentBranch !== target) {
        await api.checkoutBranch(repoPath, target);
      }
      const res = await api.merge(repoPath, source);
      toast(`Merged ${source} into ${target}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Merge error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRebaseBranch = async (source: string, target: string) => {
    setLoading(true);
    try {
      if (repoState?.currentBranch !== source) {
        await api.checkoutBranch(repoPath, source);
      }
      const res = await api.rebase(repoPath, target);
      toast(`Rebased ${source} onto ${target}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Rebase error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (name: string, startPoint: string) => {
    await api.createBranch(repoPath, name, startPoint);
    await refreshRepo();
  };

  const handleCreateTag = async (name: string, hash: string = 'HEAD') => {
    await api.createTag(repoPath, name, hash);
    await refreshRepo();
  };

  const handleDeleteTag = async (name: string) => {
    await api.deleteTag(repoPath, name);
    await refreshRepo();
  };

  const handlePushTag = async (tagName: string) => {
    setLoading(true);
    try {
      const res = await api.pushTag(repoPath, tagName);
      toast(`Pushed tag ${tagName} to origin!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Push tag failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Stash actions
  const handleSaveStash = async (message: string, includeUntracked: boolean) => {
    await api.saveStash(repoPath, message, includeUntracked);
    await refreshRepo();
  };

  const handlePopStash = async (index: number = 0) => {
    await api.popStash(repoPath, index);
    await refreshRepo();
  };

  const handleApplyStash = async (index: number = 0) => {
    setLoading(true);
    try {
      const res = await api.applyStash(repoPath, index);
      toast(`Applied stash@{${index}}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Apply stash failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // JetBrains Shelves actions
  const handleShelve = async (name: string, files: string[], keepWorkingChanges: boolean) => {
    setLoading(true);
    try {
      await api.shelve(repoPath, name, files, keepWorkingChanges);
      await refreshRepo();
    } catch (e: any) {
      toast(`Shelve failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnshelve = async (shelfId: string) => {
    setLoading(true);
    try {
      await api.unshelve(repoPath, shelfId, false);
      await refreshRepo();
    } catch (e: any) {
      toast(`Unshelve failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShelf = async (shelfId: string) => {
    if (!confirm('Are you sure you want to delete this shelf?')) return;
    setLoading(true);
    try {
      await api.deleteShelf(repoPath, shelfId);
      await refreshRepo();
    } catch (e: any) {
      toast(`Delete shelf failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevealInExplorer = async (file?: string) => {
    try {
      await api.revealInExplorer(repoPath, file);
    } catch (e: any) {
      console.error('Reveal error:', e);
    }
  };

  const handleOpenInVsCode = async (file?: string) => {
    try {
      await api.openInVsCode(repoPath, file);
    } catch (e: any) {
      console.error('Open in VS Code failed:', e);
    }
  };

  const handleOpenTerminal = async () => {
    try {
      await api.openInTerminal(repoPath);
    } catch (e: any) {
      console.error('Open in Terminal failed:', e);
    }
  };

  const handleOpenExternalDiff = async (file: string, staged: boolean = false) => {
    try {
      const res = await api.openExternalDiff(repoPath, file, staged);
      if (!res.success) {
        toast(`External diff failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      toast(`External diff failed: ${e.message}`);
    }
  };

  const handleCreatePatch = async (hash: string) => {
    try {
      const res = await api.createPatch(repoPath, hash);
      toast(`Patch created for commit ${hash.slice(0, 7)}!\n\n${(res.patch || '').slice(0, 500)}...`);
    } catch (e: any) {
      toast(`Create patch failed: ${e.message}`);
    }
  };

  const handleCherryPickToBranch = async (commitHash: string, branchName: string) => {
    setLoading(true);
    try {
      if (repoState?.currentBranch !== branchName) {
        await api.checkoutBranch(repoPath, branchName);
      }
      await api.cherryPick(repoPath, commitHash);
      toast(`Cherry-picked commit ${commitHash.slice(0, 7)} onto ${branchName}!`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Cherry-pick failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTab = (path: string) => {
    if (path.toLowerCase() === repoPath.toLowerCase()) return;
    setSelectedCommit(null);
    setSelectedFile(null);
    setFileDiffs([]);
    setComparisonCommits(null);
    setConflictModalData(null);
    refreshRepo(path);
  };

  const handleCloseTab = (pathToClose: string) => {
    setRepoTabs((prev) => {
      const filtered = prev.filter((t) => t.path.toLowerCase() !== pathToClose.toLowerCase());
      localStorage.setItem('gitter_open_repo_tabs', JSON.stringify(filtered));
      if (pathToClose.toLowerCase() === repoPath.toLowerCase()) {
        if (filtered.length > 0) {
          handleSelectTab(filtered[0].path);
        } else {
          setShowLaunchpadModal(true);
        }
      }
      return filtered;
    });
  };

  const handleCloseOtherTabs = (keepPath: string) => {
    setRepoTabs((prev) => {
      const filtered = prev.filter((t) => t.path.toLowerCase() === keepPath.toLowerCase());
      localStorage.setItem('gitter_open_repo_tabs', JSON.stringify(filtered));
      if (keepPath.toLowerCase() !== repoPath.toLowerCase()) {
        handleSelectTab(keepPath);
      }
      return filtered;
    });
  };

  const handleUndo = async () => {
    setLoading(true);
    try {
      const res = await api.undoLastAction(repoPath);
      toast(`Undo successful: ${res.message}`);
      await refreshRepo();
    } catch (e: any) {
      toast(`Undo failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStagePatch = async (patch: string) => {
    try {
      await api.stagePatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      toast(`Stage patch failed: ${e.message}`);
    }
  };

  const handleUnstagePatch = async (patch: string) => {
    try {
      await api.unstagePatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      toast(`Unstage patch failed: ${e.message}`);
    }
  };

  const handleDiscardPatch = async (patch: string) => {
    try {
      await api.discardPatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      toast(`Discard patch failed: ${e.message}`);
    }
  };

  const handleDropStash = async (index: number = 0) => {
    await api.dropStash(repoPath, index);
    await refreshRepo();
  };

  // History operations
  const handleRevertCommit = async (hash: string) => {
    try {
      await api.revert(repoPath, hash);
      await refreshRepo();
    } catch (e: any) {
      toast(`Revert failed: ${e.message}`);
    }
  };

  const handleResetCommit = async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    try {
      await api.reset(repoPath, hash, mode);
      await refreshRepo();
    } catch (e: any) {
      toast(`Reset failed: ${e.message}`);
    }
  };

  const handleCherryPick = async (hash: string) => {
    try {
      await api.cherryPick(repoPath, hash);
      await refreshRepo();
    } catch (e: any) {
      toast(`Cherry-pick failed: ${e.message}`);
    }
  };

  // Agent runner & review actions
  const handleRunAgentCommand = async (command: string): Promise<string> => {
    const res = await api.runAgentCommand(repoPath, command);
    await refreshRepo();
    return res.output;
  };

  const agentItemFor = (agentId: string | null) =>
    agentId ? agentReview?.items.find((item) => item.agentId === agentId) ?? null : null;

  const handleOpenAgentRun = (agentId: string) => {
    setActiveAgentId(agentId);
    setShowAgentRunDrawer(true);
  };

  const handleOpenLens = (agentId: string) => {
    setAgentLensId(agentId);
    setShowReviewInbox(false);
  };

  const handleSelectAttention = (item: AgentAttentionItem) => {
    if (item.agentId) {
      handleOpenAgentRun(item.agentId);
    } else {
      setShowReviewInbox(true);
    }
  };

  const handleAskAgent = (prompt: string) => {
    setAgentPromptSeed(prompt);
    setShowAgentRunDrawer(false);
    setIsAgentOpen(true);
    localStorage.setItem('gitter_agent_open', 'true');
  };

  const handleApproveAgent = async (agentId: string, mode: 'commit' | 'merge') => {
    patchAgentReviewItem(agentId, { status: mode === 'merge' ? 'merged' : 'approved' });
    try {
      const res = await api.approveAgentChanges(repoPath, agentId, '', mode);
      applyAgentReview(res.review);
      toast.success(res.message);
      await refreshRepo();
    } catch (e: any) {
      void refreshAgentLive();
      toast.error(`Approve failed: ${e.message}`);
    }
  };

  const handleRequestAgentChanges = async (agentId: string, feedback: string) => {
    patchAgentReviewItem(agentId, { status: 'changes-requested', feedback });
    try {
      const review = await api.requestAgentChanges(repoPath, agentId, feedback);
      applyAgentReview(review);
      toast.success('Review feedback saved for the agent.');
    } catch (e: any) {
      void refreshAgentLive();
      toast.error(`Request changes failed: ${e.message}`);
    }
  };

  const handleDiscardAgent = async (agentId: string) => {
    patchAgentReviewItem(agentId, { status: 'queued', feedback: 'Discarding agent changes…' });
    try {
      const review = await api.discardAgentChanges(repoPath, agentId);
      applyAgentReview(review);
      toast.success('Agent changes discarded.');
      await refreshRepo();
    } catch (e: any) {
      void refreshAgentLive();
      toast.error(`Discard failed: ${e.message}`);
    }
  };

  const handleCheckpointAgent = async (agentId: string) => {
    try {
      const review = await api.checkpointAgent(repoPath, agentId);
      applyAgentReview(review);
      toast.success('Checkpoint created for the agent worktree.');
    } catch (e: any) {
      toast.error(`Checkpoint failed: ${e.message}`);
    }
  };

  const handleRollbackAgent = async (agentId: string) => {
    patchAgentReviewItem(agentId, { status: 'queued', feedback: 'Rolling back to checkpoint…' });
    try {
      const review = await api.rollbackAgent(repoPath, agentId);
      applyAgentReview(review);
      toast.success('Agent rolled back to its checkpoint.');
      await refreshRepo();
    } catch (e: any) {
      void refreshAgentLive();
      toast.error(`Rollback failed: ${e.message}`);
    }
  };

  const handleRejectAgentHunk = async (agentId: string, patch: string) => {
    try {
      await api.rejectAgentHunk(repoPath, agentId, patch);
      await refreshAgentLive();
      toast.success('Hunk rejected from the agent worktree.');
    } catch (e: any) {
      toast.error(`Reject hunk failed: ${e.message}`);
    }
  };

  const activeAgentItem = agentItemFor(activeAgentId);
  const lensAgentItem = agentItemFor(agentLensId);

  // Agent workflow shortcuts
  useEffect(() => {
    const handleAgentKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setShowReviewInbox((prev) => !prev);
      } else if (key === 'f') {
        e.preventDefault();
        setShowAgentFleetModal((prev) => !prev);
      } else if (key === 'l') {
        e.preventDefault();
        const target =
          agentReview?.items.find((item) => item.status === 'needs-review') ??
          agentReview?.items[0];
        if (target) setAgentLensId(target.agentId);
      }
    };
    window.addEventListener('keydown', handleAgentKeyDown);
    return () => window.removeEventListener('keydown', handleAgentKeyDown);
  }, [agentReview]);

  const hasWip = Boolean(repoState && !repoState.isClean);

  const provenanceItem = selectedFile
    ? (agentReview?.items ?? []).find((item) =>
        item.files.some((file) => file.path === selectedFile)
      ) ?? null
    : null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#14181f] text-slate-200">
      {/* Top Multi-Repo Tab Bar */}
      <RepoTabBar
        tabs={
          repoTabs.length > 0
            ? repoTabs
            : repoState
            ? [
                {
                  path: repoState.path,
                  name: repoState.path.split(/[\\/]/).filter(Boolean).pop() || 'repo',
                  branch: repoState.currentBranch,
                  isClean: repoState.isClean,
                },
              ]
            : []
        }
        activePath={repoPath}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onRevealInExplorer={(p) => api.revealInExplorer(p)}
        onNewTab={() => setShowLaunchpadModal(true)}
      />

      {/* Top Header Toolbar */}
      <HeaderToolbar
        repoState={repoState}
        onRefresh={() => refreshRepo()}
        onPull={handlePull}
        onPush={handlePush}
        onFetch={handleFetch}
        onUndo={handleUndo}
        onOpenReflog={() => setShowReflogModal(true)}
        onOpenBranchModal={() => {
          setBranchStartPoint(repoState?.currentBranch || 'HEAD');
          setShowBranchModal(true);
        }}
        onOpenStashModal={() => setShowStashModal(true)}
        onPopStash={() => handlePopStash(0)}
        onOpenQuickLaunch={() => setShowQuickLaunch(true)}
        onOpenLaunchpad={() => setShowLaunchpadModal(true)}
        onToggleSidebar={() => {
          setIsSidebarOpen((prev) => {
            const next = !prev;
            localStorage.setItem('gitter_sidebar_open', next ? 'true' : 'false');
            return next;
          });
        }}
        onToggleStaging={() => {
          setIsStagingOpen((prev) => {
            const next = !prev;
            localStorage.setItem('gitter_staging_open', next ? 'true' : 'false');
            return next;
          });
        }}
        onToggleAgent={handleToggleAgent}
        isSidebarOpen={isSidebarOpen}
        isStagingOpen={isStagingOpen}
        isAgentOpen={isAgentOpen}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenRepo={() => setShowOpenModal(true)}
        onBrowseNative={async () => {
          try {
            const res = await api.pickNativeFolder();
            if (res && res.path) {
              handleSelectTab(res.path);
            }
          } catch (e: any) {
            toast(`Browse error: ${e.message}`);
          }
        }}
        onRevealInExplorer={() => handleRevealInExplorer()}
        onOpenVsCode={() => handleOpenInVsCode()}
        onOpenTerminal={handleOpenTerminal}
        onCloneRepo={() => setShowCloneModal(true)}
        onInitRepo={async () => {
          const p = prompt('Enter new repo path:');
          if (p) {
            await api.initRepo(p);
            await refreshRepo(p);
          }
        }}
        availableUpdate={availableUpdate}
        onCheckUpdates={handleCheckUpdates}
        fleetState={agentFleetState}
        onOpenAgentFleet={() => setShowAgentFleetModal(true)}
        review={agentReview}
        acknowledgedAttention={acknowledgedAttention}
        onAcknowledgeAttention={acknowledgeAttention}
        onAcknowledgeAllAttention={acknowledgeAllAttention}
        onSelectAttention={handleSelectAttention}
        onOpenReviewInbox={() => setShowReviewInbox(true)}
        onToggleAgentRail={toggleAgentRail}
        isAgentRailOpen={isAgentRailOpen}
        loading={loading}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Persistent Agent Rail */}
        {isAgentRailOpen && (
          <AgentRail
            fleet={agentFleetState}
            review={agentReview}
            connected={agentLive.connected}
            selectedAgentId={activeAgentId}
            onOpenInbox={() => setShowReviewInbox(true)}
            onOpenFleet={() => setShowAgentFleetModal(true)}
            onSpawn={() => setShowAgentFleetModal(true)}
            onSelectAgent={handleOpenAgentRun}
          />
        )}

        {/* Left Sidebar */}
        {isSidebarOpen && (
          <>
            <Sidebar
              width={effectiveSidebarWidth}
              branches={branches}
              remotes={remotes}
              tags={tags}
              stashes={stashes}
              shelves={shelves}
              pullRequests={pullRequests}
              worktrees={worktrees}
              submodules={submodules}
              currentBranch={repoState?.currentBranch || ''}
              onCheckoutBranch={handleCheckoutBranch}
              onDeleteBranch={handleDeleteBranch}
              onRenameBranch={handleRenameBranch}
              onPushBranch={handlePushBranch}
              onBranchDrop={(source, target) => setBranchAction({ source, target })}
              onCherryPickToBranch={handleCherryPickToBranch}
              onPopStash={handlePopStash}
              onApplyStash={handleApplyStash}
              onDropStash={handleDropStash}
              onInspectStash={(index, name) => setStashInspectorTarget({ type: 'stash', index, name })}
              onInspectShelf={(shelf) => setStashInspectorTarget({ type: 'shelf', shelf })}
              onUnshelve={handleUnshelve}
              onDeleteShelf={handleDeleteShelf}
              onShelve={() => setShowShelveModal(true)}
              onDeleteTag={handleDeleteTag}
              onPushTag={handlePushTag}
              onCreateBranch={() => {
                setBranchStartPoint(repoState?.currentBranch || 'HEAD');
                setShowBranchModal(true);
              }}
              onCreateTag={() => {
                const name = prompt('Enter tag name:');
                if (name) handleCreateTag(name);
              }}
              onViewPr={(pr) => {
                setSelectedPr(pr);
                setPrModalMode('view');
                setShowPrModal(true);
              }}
              onCreatePr={() => {
                setSelectedPr(null);
                setPrModalMode('create');
                setShowPrModal(true);
              }}
              onOpenWorktrees={() => setShowWorktreesModal(true)}
              onSwitchWorktree={(path) => refreshRepo(path)}
              onOpenGitflow={() => setShowGitflowModal(true)}
              onUpdateSubmodules={async () => {
                try {
                  const res = await api.updateSubmodules(repoPath);
                  toast(res.output || 'Submodules updated!');
                  await refreshRepo();
                } catch (e: any) {
                  toast(`Submodules error: ${e.message}`);
                }
              }}
            />

            {/* Draggable Sidebar Resizer */}
            <div
              className="w-1 hover:w-1.5 cursor-col-resize bg-[#222a3a] hover:bg-teal-500 transition-colors z-20 select-none flex-shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = effectiveSidebarWidth;
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(160, Math.min(480, startWidth + (moveEvent.clientX - startX)));
                  setSidebarWidth(newWidth);
                  localStorage.setItem('gitter_sidebar_width', newWidth.toString());
                };
                const onMouseUp = () => {
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
            />
          </>
        )}

        {/* Center: Interactive Commit Graph */}
        <div className="flex-1 min-w-[240px] flex flex-col overflow-hidden">
          <CollisionBar
            collisions={agentFleetState?.collisions ?? []}
            onOpenInbox={() => setShowReviewInbox(true)}
          />
          <CommitGraph
            commits={commits}
            hasWip={hasWip}
            selectedHash={selectedCommit ? selectedCommit.hash : hasWip ? 'wip' : null}
            agentBranchNames={(agentReview?.items ?? []).map((item) => item.branchName)}
            hasAgentCollisions={(agentFleetState?.collisions.length ?? 0) > 0}
            onSelectCommit={(commit) => {
              if (commit.isWip) {
                setSelectedCommit(null);
              } else {
                setSelectedCommit(commit);
                setInspectCommitModal(commit);
              }
            }}
            onCheckout={handleCheckoutBranch}
            onCreateBranchAt={(hash) => {
              setBranchStartPoint(hash);
              setShowBranchModal(true);
            }}
            onCreateTagAt={(hash) => {
              const name = prompt('Enter tag name:');
              if (name) handleCreateTag(name, hash);
            }}
            onRevertCommit={handleRevertCommit}
            onResetCommit={handleResetCommit}
            onCherryPick={handleCherryPick}
            onInteractiveRebase={(baseHash) => setRebaseBaseHash(baseHash)}
            onOpenInVsCode={(hash) => handleOpenInVsCode()}
            onCreatePatch={handleCreatePatch}
            onCompareCommits={(base, target) => setComparisonCommits({ base, target })}
          />
        </div>

        {/* Right Section: Working Tree / Diff Viewer & Commit Box */}
        {isStagingOpen && (
          <>
            {/* Draggable Staging Resizer */}
            <div
              className="w-1 hover:w-1.5 cursor-col-resize bg-[#222a3a] hover:bg-teal-500 transition-colors z-20 select-none flex-shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = effectiveRightPanelWidth;
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(300, Math.min(950, startWidth - (moveEvent.clientX - startX)));
                  setRightPanelWidth(newWidth);
                  localStorage.setItem('gitter_right_panel_width', newWidth.toString());
                };
                const onMouseUp = () => {
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
            />

            <div
              style={{ width: `${effectiveRightPanelWidth}px` }}
              className="flex flex-col bg-[#14181f] flex-shrink-0 overflow-hidden"
            >
              {isVirtualBranchesMode ? (
                <VirtualBranchPanel
                  repoPath={repoPath}
                  currentBranch={repoState?.currentBranch || 'main'}
                  statuses={statuses}
                  selectedFile={selectedFile}
                  onSelectFile={(f, staged) => {
                    setSelectedFile(f);
                    setIsSelectedFileStaged(staged);
                  }}
                  onRefresh={() => refreshRepo()}
                  onSwitchToStandardStaging={() => {
                    setIsVirtualBranchesMode(false);
                    localStorage.setItem('gitter_vb_mode', 'false');
                  }}
                />
              ) : (
                <>
                  <div className={`flex-1 flex overflow-hidden ${isStackedStaging ? 'flex-col' : 'flex-row'}`}>
                    {/* Staging file list */}
                    <div
                      style={isStackedStaging ? { height: '220px', width: '100%' } : { width: `${effectiveStagingListWidth}px` }}
                      className="flex-shrink-0 flex flex-col overflow-hidden"
                    >
                      <StagingPanel
                        width={effectiveStagingListWidth}
                        statuses={statuses}
                        selectedFile={selectedFile}
                        collisions={agentFleetState?.collisions ?? []}
                        agents={agentFleetState?.agents ?? []}
                        onSelectFile={(f, staged) => {
                          setSelectedFile(f);
                          setIsSelectedFileStaged(staged);
                        }}
                        onStageFile={handleStageFile}
                        onUnstageFile={handleUnstageFile}
                        onStageAll={handleStageAll}
                        onUnstageAll={handleUnstageAll}
                        onDiscardFile={handleDiscardFile}
                        onDiscardAll={handleDiscardAll}
                        onStash={() => setShowStashModal(true)}
                        onShelve={() => setShowShelveModal(true)}
                        onOpenBlame={(file) => setBlameFilePath(file)}
                        onOpenFileHistory={(file) => setFileHistoryTarget(file)}
                        onRevealInExplorer={handleRevealInExplorer}
                        onOpenInVsCode={(file) => handleOpenInVsCode(file)}
                        onOpenExternalDiff={handleOpenExternalDiff}
                        onToggleVirtualBranches={() => {
                          setIsVirtualBranchesMode(true);
                          localStorage.setItem('gitter_vb_mode', 'true');
                        }}
                      />
                    </div>

                    {/* Splitter between file list and diff viewer */}
                    <div
                      className={`${isStackedStaging ? 'h-1 hover:h-1.5 cursor-row-resize' : 'w-1 hover:w-1.5 cursor-col-resize'} bg-[#222a3a] hover:bg-teal-500 transition-colors z-10 select-none flex-shrink-0`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (isStackedStaging) return;
                        const startX = e.clientX;
                        const startWidth = effectiveStagingListWidth;
                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const newWidth = Math.max(160, Math.min(effectiveRightPanelWidth - 200, startWidth + (moveEvent.clientX - startX)));
                          setStagingListWidth(newWidth);
                          localStorage.setItem('gitter_staging_list_width', newWidth.toString());
                        };
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove);
                          window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                      }}
                    />

                    {/* Diff Viewer */}
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                      <DiffViewer
                        diffs={fileDiffs}
                        filePath={selectedFile || ''}
                        isStaged={isSelectedFileStaged}
                        provenance={
                          provenanceItem ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-[10px]">
                              <span
                                className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold ring-1 ring-inset ring-white/10 flex-shrink-0"
                                style={{
                                  backgroundColor: `${provenanceItem.color}22`,
                                  color: provenanceItem.color,
                                }}
                              >
                                A
                              </span>
                              <span className="text-slate-300">
                                <span className="font-semibold">{provenanceItem.agentName}</span>{' '}
                                also changed this file on{' '}
                                <span className="font-mono text-slate-400">
                                  {provenanceItem.branchName}
                                </span>
                              </span>
                              {provenanceItem.collisions.includes(selectedFile || '') && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  collision
                                </span>
                              )}
                              <button
                                onClick={() => handleOpenLens(provenanceItem.agentId)}
                                className="ml-auto px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-semibold text-teal-300 transition-colors"
                              >
                                Open lens
                              </button>
                            </div>
                          ) : undefined
                        }
                        ignoreWhitespace={ignoreWhitespace}
                        onToggleIgnoreWhitespace={() => {
                          const next = !ignoreWhitespace;
                          setIgnoreWhitespace(next);
                          localStorage.setItem('gitter_diff_ws', next ? 'true' : 'false');
                        }}
                        onToggleStage={() => {
                          if (!selectedFile) return;
                          if (isSelectedFileStaged) {
                            handleUnstageFile(selectedFile);
                            setIsSelectedFileStaged(false);
                          } else {
                            handleStageFile(selectedFile);
                            setIsSelectedFileStaged(true);
                          }
                        }}
                        onExplainFile={handleExplainFile}
                        onResolveConflict={handleOpenConflictModal}
                        onOpenBlame={(file) => setBlameFilePath(file)}
                        onOpenExternalDiff={handleOpenExternalDiff}
                        onStagePatch={handleStagePatch}
                        onUnstagePatch={handleUnstagePatch}
                        onDiscardPatch={handleDiscardPatch}
                      />
                    </div>
                  </div>

                  {/* Commit Box at bottom of right panel */}
                  <CommitBox
                    stagedCount={repoState?.stagedCount || 0}
                    currentBranch={repoState?.currentBranch || 'main'}
                    lastCommit={commits.length > 0 ? commits[0] : null}
                    onCommit={handleCommit}
                    onStash={() => setShowStashModal(true)}
                    onGenerateAiMessage={handleGenerateAiMessage}
                    loading={loading}
                  />
                </>
              )}
            </div>
          </>
        )}

        {/* Far Right: AI Agent Dock - docked on wide screens, slide-out overlay drawer on compact screens */}
        {isAgentOpen && (
          isAgentOverlay ? (
            <>
              {/* Semi-transparent Backdrop for small screens */}
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity"
                onClick={() => {
                  setIsAgentOpen(false);
                  localStorage.setItem('gitter_agent_open', 'false');
                }}
              />
              <div className="fixed right-0 top-12 bottom-0 z-40 w-[22rem] max-w-[90vw] shadow-2xl">
                <AgentSidebar
                  repoState={repoState}
                  repoPath={repoPath}
                  promptSeed={agentPromptSeed}
                  onPromptSeedConsumed={() => setAgentPromptSeed('')}
                  review={agentReview}
                  onOpenReview={handleOpenAgentRun}
                  onClose={() => {
                    setIsAgentOpen(false);
                    localStorage.setItem('gitter_agent_open', 'false');
                  }}
                  onRunGitCommand={handleRunAgentCommand}
                />
              </div>
            </>
          ) : (
            <AgentSidebar
              repoState={repoState}
              repoPath={repoPath}
              promptSeed={agentPromptSeed}
              onPromptSeedConsumed={() => setAgentPromptSeed('')}
              review={agentReview}
              onOpenReview={handleOpenAgentRun}
              onClose={() => {
                setIsAgentOpen(false);
                localStorage.setItem('gitter_agent_open', 'false');
              }}
              onRunGitCommand={handleRunAgentCommand}
            />
          )
        )}
      </div>

      {/* Modals */}
      {inspectCommitModal && (
        <CommitDetailModal
          commit={inspectCommitModal}
          repoPath={repoPath}
          onClose={() => setInspectCommitModal(null)}
          onCheckout={handleCheckoutBranch}
          onCreateBranchAt={(hash) => {
            setBranchStartPoint(hash);
            setShowBranchModal(true);
          }}
          onRevertCommit={handleRevertCommit}
        />
      )}

      {showBranchModal && (
        <CreateBranchModal
          startPoint={branchStartPoint}
          onClose={() => setShowBranchModal(false)}
          onCreate={handleCreateBranch}
        />
      )}

      {showStashModal && (
        <StashModal
          onClose={() => setShowStashModal(false)}
          onSave={handleSaveStash}
        />
      )}

      {showCloneModal && (
        <CloneRepoModal
          onClose={() => setShowCloneModal(false)}
          onClone={async (url, target) => {
            await api.cloneRepo(url, target);
            await refreshRepo(target);
          }}
        />
      )}

      {showOpenModal && (
        <OpenRepoModal
          currentPath={repoPath}
          onClose={() => setShowOpenModal(false)}
          onOpen={(path) => refreshRepo(path)}
        />
      )}

      {showLaunchpadModal && (
        <LaunchpadModal
          currentPath={repoPath}
          onClose={() => setShowLaunchpadModal(false)}
          onOpenRepo={(path) => {
            setShowLaunchpadModal(false);
            refreshRepo(path);
          }}
          onCloneRepo={() => {
            setShowLaunchpadModal(false);
            setShowCloneModal(true);
          }}
          onInitRepo={() => {
            setShowLaunchpadModal(false);
            setShowOpenModal(true);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          repoPath={repoPath}
          onClose={() => setShowSettingsModal(false)}
          onCheckUpdates={handleCheckUpdates}
        />
      )}

      {showUpdateModal && (
        <UpdateModal
          updateInfo={availableUpdate}
          onClose={() => setShowUpdateModal(false)}
        />
      )}

      {showGitflowModal && (
        <GitflowModal
          repoPath={repoPath}
          onClose={() => setShowGitflowModal(false)}
          onRefresh={() => refreshRepo()}
        />
      )}

      {showAgentFleetModal && agentFleetState && (
        <AgentFleetModal
          repoPath={repoPath}
          fleetState={agentFleetState}
          onClose={() => setShowAgentFleetModal(false)}
          onRefresh={() => {
            void refreshAgentLive();
          }}
          onOpenReview={(agentId) => {
            setShowAgentFleetModal(false);
            handleOpenAgentRun(agentId);
          }}
          onOpenWorktreeTab={(wtPath) => {
            handleSelectTab(wtPath);
            setShowAgentFleetModal(false);
          }}
        />
      )}

      {showReviewInbox && (
        <AgentReviewInbox
          review={agentReview}
          fleet={agentFleetState}
          acknowledged={acknowledgedAttention}
          onClose={() => setShowReviewInbox(false)}
          onRefresh={() => {
            void refreshAgentLive();
          }}
          onOpenAgent={handleOpenAgentRun}
          onOpenLens={handleOpenLens}
          onOpenFleet={() => {
            setShowReviewInbox(false);
            setShowAgentFleetModal(true);
          }}
          onAcknowledge={acknowledgeAttention}
          onAcknowledgeAll={acknowledgeAllAttention}
          onApprove={handleApproveAgent}
          onRequestChanges={handleRequestAgentChanges}
          onDiscard={handleDiscardAgent}
          onCheckpoint={handleCheckpointAgent}
          onRollback={handleRollbackAgent}
        />
      )}

      {showAgentRunDrawer && (
        <AgentRunDrawer
          repoPath={repoPath}
          item={activeAgentItem}
          onClose={() => setShowAgentRunDrawer(false)}
          onRefresh={() => {
            void refreshAgentLive();
          }}
          onOpenLens={handleOpenLens}
          onOpenWorktreeTab={(wtPath) => {
            handleSelectTab(wtPath);
            setShowAgentRunDrawer(false);
          }}
          onApprove={handleApproveAgent}
          onRequestChanges={handleRequestAgentChanges}
          onDiscard={handleDiscardAgent}
          onCheckpoint={handleCheckpointAgent}
          onRollback={handleRollbackAgent}
          onAskWhy={handleAskAgent}
        />
      )}

      {agentLensId && (
        <AgentLens
          repoPath={repoPath}
          item={lensAgentItem}
          onClose={() => setAgentLensId(null)}
          onRefresh={() => {
            void refreshAgentLive();
          }}
          onOpenRun={handleOpenAgentRun}
          onRejectHunk={handleRejectAgentHunk}
        />
      )}

      {showPrModal && (
        <PullRequestModal
          repoPath={repoPath}
          currentBranch={repoState?.currentBranch || 'main'}
          selectedPr={selectedPr}
          mode={prModalMode}
          onClose={() => setShowPrModal(false)}
          onRefresh={() => refreshRepo()}
        />
      )}

      {showWorktreesModal && (
        <WorktreesModal
          repoPath={repoPath}
          onClose={() => setShowWorktreesModal(false)}
          onSwitchWorktree={(path) => refreshRepo(path)}
        />
      )}

      {rebaseBaseHash && (
        <InteractiveRebaseModal
          baseHash={rebaseBaseHash}
          repoPath={repoPath}
          onClose={() => setRebaseBaseHash(null)}
          onComplete={() => refreshRepo()}
        />
      )}

      {blameFilePath && (
        <FileBlameModal
          filePath={blameFilePath}
          repoPath={repoPath}
          onClose={() => setBlameFilePath(null)}
          onSelectCommit={(hash) => {
            const match = commits.find((c) => c.hash === hash || c.shortHash === hash);
            if (match) {
              setBlameFilePath(null);
              setInspectCommitModal(match);
            }
          }}
        />
      )}

      {conflictModalData && (
        <ThreeWayConflictResolverModal
          filePath={conflictModalData.file}
          rawDiff={conflictModalData.rawDiff}
          repoPath={repoPath}
          onClose={() => setConflictModalData(null)}
          onResolved={() => {
            setConflictModalData(null);
            refreshRepo();
          }}
        />
      )}

      {comparisonCommits && (
        <CommitComparisonModal
          baseCommit={comparisonCommits.base}
          targetCommit={comparisonCommits.target}
          repoPath={repoPath}
          onClose={() => setComparisonCommits(null)}
        />
      )}

      {showReflogModal && (
        <ReflogModal
          repoPath={repoPath}
          onClose={() => setShowReflogModal(false)}
          onRefresh={() => refreshRepo()}
          onCreateBranchAt={(hash) => {
            setBranchStartPoint(hash);
            setShowBranchModal(true);
          }}
        />
      )}

      {branchAction && (
        <BranchActionModal
          sourceBranch={branchAction.source}
          targetBranch={branchAction.target}
          onClose={() => setBranchAction(null)}
          onMerge={handleMergeBranch}
          onRebase={handleRebaseBranch}
        />
      )}

      {showQuickLaunch && (
        <QuickLaunchModal
          branches={branches}
          tags={tags}
          commits={commits}
          onClose={() => setShowQuickLaunch(false)}
          onCheckoutBranch={handleCheckoutBranch}
          onSelectCommit={(c) => {
            setSelectedCommit(c);
            setInspectCommitModal(c);
          }}
          onPull={() => handlePull(false)}
          onPush={() => handlePush(false)}
          onFetch={handleFetch}
          onStash={() => setShowStashModal(true)}
          onPopStash={() => handlePopStash(0)}
          onUndo={handleUndo}
          onOpenReflog={() => setShowReflogModal(true)}
          onCreateBranch={() => {
            setBranchStartPoint(repoState?.currentBranch || 'HEAD');
            setShowBranchModal(true);
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenWorktrees={() => setShowWorktreesModal(true)}
          onCreatePr={() => {
            setSelectedPr(null);
            setPrModalMode('create');
            setShowPrModal(true);
          }}
          onToggleSidebar={() => {
            setIsSidebarOpen((prev) => {
              const next = !prev;
              localStorage.setItem('gitter_sidebar_open', next ? 'true' : 'false');
              return next;
            });
          }}
          onToggleStaging={() => {
            setIsStagingOpen((prev) => {
              const next = !prev;
              localStorage.setItem('gitter_staging_open', next ? 'true' : 'false');
              return next;
            });
          }}
          onToggleAgent={handleToggleAgent}
          agents={agentReview?.items ?? []}
          onOpenReviewInbox={() => setShowReviewInbox(true)}
          onOpenAgentFleet={() => setShowAgentFleetModal(true)}
          onOpenAgent={handleOpenAgentRun}
          onAskAgent={handleAskAgent}
        />
      )}

      {showShelveModal && (
        <ShelveModal
          files={statuses}
          onClose={() => setShowShelveModal(false)}
          onShelve={handleShelve}
        />
      )}

      {stashInspectorTarget && (
        <StashInspectorModal
          repoPath={repoPath}
          target={stashInspectorTarget}
          onClose={() => setStashInspectorTarget(null)}
          onRefresh={() => refreshRepo()}
        />
      )}

      {fileHistoryTarget && (
        <FileHistoryModal
          filePath={fileHistoryTarget}
          repoPath={repoPath}
          onClose={() => setFileHistoryTarget(null)}
          onSelectCommit={(hash) => {
            const c = commits.find((x) => x.hash.startsWith(hash));
            if (c) setSelectedCommit(c);
          }}
        />
      )}
    </div>
  );
};
