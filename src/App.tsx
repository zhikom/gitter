import React, { useState, useEffect, useCallback } from 'react';
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
import { PullRequest, Submodule, Worktree } from './types/git';

export const App: React.FC = () => {
  const [repoPath, setRepoPath] = useState<string>('');
  const [repoState, setRepoState] = useState<RepositoryState | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stashes, setStashes] = useState<Stash[]>([]);
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

  // Panels & Modals
  const [isAgentOpen, setIsAgentOpen] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [showQuickLaunch, setShowQuickLaunch] = useState<boolean>(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(() => {
    return localStorage.getItem('gitter_diff_ws') === 'true';
  });

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
    return saved ? Math.max(380, Math.min(950, parseInt(saved, 10))) : 560;
  });
  const [isStagingOpen, setIsStagingOpen] = useState<boolean>(() => {
    return localStorage.getItem('gitter_staging_open') !== 'false';
  });

  const [stagingListWidth, setStagingListWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitter_staging_list_width');
    return saved ? Math.max(180, Math.min(450, parseInt(saved, 10))) : 280;
  });
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
      ]);

      setCommits(fetchedCommits);
      setStatuses(fetchedStatuses);
      setBranches(fetchedBranches);
      setTags(fetchedTags);
      setStashes(fetchedStashes);
      setRemotes(fetchedRemotes);
      setWorktrees(fetchedWorktrees);
      setSubmodules(fetchedSubmodules);
      setPullRequests(fetchedPrs);

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
  }, [repoPath, selectedFile, selectedCommit]);

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
        setIsAgentOpen((prev) => !prev);
      }
      // Ctrl+T: Open Launchpad in new tab
      else if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setShowLaunchpadModal(true);
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
      alert(`Pull successful!\n${res.output || 'Up to date'}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Pull error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async (forceWithLease: boolean = false) => {
    setLoading(true);
    try {
      const res = await api.push(repoPath, 'origin', '', forceWithLease);
      alert(`Push successful!\n${res.output || 'Everything up-to-date'}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Push error: ${e.message}`);
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
      alert(`Fetch error: ${e.message}`);
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
      alert(`Commit error: ${e.message}`);
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
      alert(`AI Review for ${filename}:\n\n${explanation.summary}\n\nRisk: ${explanation.riskAssessment.toUpperCase()}\n${explanation.keyChanges.join('\n')}`);
    } catch (e: any) {
      alert(`Explain error: ${e.message}`);
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
      alert(`Checkout failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranch = async (name: string) => {
    try {
      await api.deleteBranch(repoPath, name, true);
      await refreshRepo();
    } catch (e: any) {
      alert(`Delete branch failed: ${e.message}`);
    }
  };

  const handleRenameBranch = async (oldName: string, newName: string) => {
    setLoading(true);
    try {
      await api.renameBranch(repoPath, oldName, newName);
      await refreshRepo();
    } catch (e: any) {
      alert(`Rename failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePushBranch = async (branchName: string) => {
    setLoading(true);
    try {
      const res = await api.push(repoPath, 'origin', branchName);
      alert(`Pushed ${branchName} to origin!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Push failed: ${e.message}`);
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
      alert(`Merged ${source} into ${target}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Merge error: ${e.message}`);
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
      alert(`Rebased ${source} onto ${target}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Rebase error: ${e.message}`);
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
      alert(`Pushed tag ${tagName} to origin!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Push tag failed: ${e.message}`);
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
      alert(`Applied stash@{${index}}!\n${res.output || ''}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Apply stash failed: ${e.message}`);
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

  const handleOpenExternalDiff = async (file: string, staged: boolean = false) => {
    try {
      const res = await api.openExternalDiff(repoPath, file, staged);
      if (!res.success) {
        alert(`External diff failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`External diff failed: ${e.message}`);
    }
  };

  const handleCreatePatch = async (hash: string) => {
    try {
      const res = await api.createPatch(repoPath, hash);
      alert(`Patch created for commit ${hash.slice(0, 7)}!\n\n${(res.patch || '').slice(0, 500)}...`);
    } catch (e: any) {
      alert(`Create patch failed: ${e.message}`);
    }
  };

  const handleCherryPickToBranch = async (commitHash: string, branchName: string) => {
    setLoading(true);
    try {
      if (repoState?.currentBranch !== branchName) {
        await api.checkoutBranch(repoPath, branchName);
      }
      await api.cherryPick(repoPath, commitHash);
      alert(`Cherry-picked commit ${commitHash.slice(0, 7)} onto ${branchName}!`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Cherry-pick failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTab = (pathToClose: string) => {
    setRepoTabs((prev) => {
      const filtered = prev.filter((t) => t.path.toLowerCase() !== pathToClose.toLowerCase());
      localStorage.setItem('gitter_open_repo_tabs', JSON.stringify(filtered));
      if (pathToClose.toLowerCase() === repoPath.toLowerCase()) {
        if (filtered.length > 0) {
          refreshRepo(filtered[0].path);
        } else {
          setShowLaunchpadModal(true);
        }
      }
      return filtered;
    });
  };

  const handleUndo = async () => {
    setLoading(true);
    try {
      const res = await api.undoLastAction(repoPath);
      alert(`Undo successful: ${res.message}`);
      await refreshRepo();
    } catch (e: any) {
      alert(`Undo failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStagePatch = async (patch: string) => {
    try {
      await api.stagePatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      alert(`Stage patch failed: ${e.message}`);
    }
  };

  const handleUnstagePatch = async (patch: string) => {
    try {
      await api.unstagePatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      alert(`Unstage patch failed: ${e.message}`);
    }
  };

  const handleDiscardPatch = async (patch: string) => {
    try {
      await api.discardPatch(repoPath, patch);
      await refreshRepo();
    } catch (e: any) {
      alert(`Discard patch failed: ${e.message}`);
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
      alert(`Revert failed: ${e.message}`);
    }
  };

  const handleResetCommit = async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    try {
      await api.reset(repoPath, hash, mode);
      await refreshRepo();
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    }
  };

  const handleCherryPick = async (hash: string) => {
    try {
      await api.cherryPick(repoPath, hash);
      await refreshRepo();
    } catch (e: any) {
      alert(`Cherry-pick failed: ${e.message}`);
    }
  };

  // Agent runner
  const handleRunAgentCommand = async (command: string) => {
    // Run git command through client
    await refreshRepo();
  };

  const hasWip = Boolean(repoState && !repoState.isClean);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#14181f] text-slate-200">
      {/* Top Multi-Repo Tab Bar */}
      {repoTabs.length > 0 && (
        <RepoTabBar
          tabs={repoTabs}
          activePath={repoPath}
          onSelectTab={(path) => refreshRepo(path)}
          onCloseTab={handleCloseTab}
          onNewTab={() => setShowLaunchpadModal(true)}
        />
      )}

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
        onToggleAgent={() => setIsAgentOpen(!isAgentOpen)}
        isSidebarOpen={isSidebarOpen}
        isStagingOpen={isStagingOpen}
        isAgentOpen={isAgentOpen}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenRepo={() => setShowOpenModal(true)}
        onCloneRepo={() => setShowCloneModal(true)}
        onInitRepo={async () => {
          const p = prompt('Enter new repo path:');
          if (p) {
            await api.initRepo(p);
            await refreshRepo(p);
          }
        }}
        loading={loading}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        {isSidebarOpen && (
          <>
            <Sidebar
              width={sidebarWidth}
              branches={branches}
              remotes={remotes}
              tags={tags}
              stashes={stashes}
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
              onUpdateSubmodules={async () => {
                try {
                  const res = await api.updateSubmodules(repoPath);
                  alert(res.output || 'Submodules updated!');
                  await refreshRepo();
                } catch (e: any) {
                  alert(`Submodules error: ${e.message}`);
                }
              }}
            />

            {/* Draggable Sidebar Resizer */}
            <div
              className="w-1 hover:w-1.5 cursor-col-resize bg-[#222a3a] hover:bg-teal-500 transition-colors z-20 select-none flex-shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(160, Math.min(500, startWidth + (moveEvent.clientX - startX)));
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <CommitGraph
            commits={commits}
            hasWip={hasWip}
            selectedHash={selectedCommit ? selectedCommit.hash : hasWip ? 'wip' : null}
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
                const startWidth = rightPanelWidth;
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = Math.max(380, Math.min(950, startWidth - (moveEvent.clientX - startX)));
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
              style={{ width: `${rightPanelWidth}px` }}
              className="flex flex-col bg-[#14181f] flex-shrink-0 overflow-hidden"
            >
              <div className="flex-1 flex overflow-hidden">
                {/* Staging file list */}
                <StagingPanel
                  width={stagingListWidth}
                  statuses={statuses}
                  selectedFile={selectedFile}
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
                  onOpenBlame={(file) => setBlameFilePath(file)}
                  onRevealInExplorer={handleRevealInExplorer}
                  onOpenInVsCode={(file) => handleOpenInVsCode(file)}
                  onOpenExternalDiff={handleOpenExternalDiff}
                />

                {/* Splitter between file list and diff viewer */}
                <div
                  className="w-1 hover:w-1.5 cursor-col-resize bg-[#222a3a] hover:bg-teal-500 transition-colors z-10 select-none flex-shrink-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const startWidth = stagingListWidth;
                    const onMouseMove = (moveEvent: MouseEvent) => {
                      const newWidth = Math.max(180, Math.min(450, startWidth + (moveEvent.clientX - startX)));
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
                <DiffViewer
                  diffs={fileDiffs}
                  filePath={selectedFile || ''}
                  isStaged={isSelectedFileStaged}
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
            </div>
          </>
        )}

        {/* Far Right: AI Agent Dock */}
        {isAgentOpen && (
          <AgentSidebar
            repoState={repoState}
            onClose={() => setIsAgentOpen(false)}
            onRunGitCommand={handleRunAgentCommand}
          />
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
        <SettingsModal repoPath={repoPath} onClose={() => setShowSettingsModal(false)} />
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
          onToggleAgent={() => setIsAgentOpen(!isAgentOpen)}
        />
      )}
    </div>
  );
};
