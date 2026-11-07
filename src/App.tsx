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
import { ConflictModal } from './components/Modals/ConflictModal';
import { InteractiveRebaseModal } from './components/Rebase/InteractiveRebaseModal';
import { FileBlameModal } from './components/Blame/FileBlameModal';
import { WorktreesModal } from './components/Worktrees/WorktreesModal';
import { Submodule, Worktree } from './types/git';

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

  // Selection
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [inspectCommitModal, setInspectCommitModal] = useState<Commit | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isSelectedFileStaged, setIsSelectedFileStaged] = useState<boolean>(false);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);

  // Panels & Modals
  const [isAgentOpen, setIsAgentOpen] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [branchStartPoint, setBranchStartPoint] = useState<string>('HEAD');
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [showStashModal, setShowStashModal] = useState<boolean>(false);
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [showOpenModal, setShowOpenModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showWorktreesModal, setShowWorktreesModal] = useState<boolean>(false);
  const [rebaseBaseHash, setRebaseBaseHash] = useState<string | null>(null);
  const [blameFilePath, setBlameFilePath] = useState<string | null>(null);
  const [conflictModalData, setConflictModalData] = useState<{ rawDiff: string; file: string } | null>(null);

  // Initialize repository
  const refreshRepo = useCallback(async (path?: string) => {
    setLoading(true);
    try {
      const current = path || repoPath;
      const state = await api.getRepoState(current);
      setRepoState(state);
      if (!repoPath || path) setRepoPath(state.path);

      // Fetch all Git data in parallel
      const [
        fetchedCommits,
        fetchedStatuses,
        fetchedBranches,
        fetchedTags,
        fetchedStashes,
        fetchedRemotes,
        fetchedWorktrees,
        fetchedSubmodules,
      ] = await Promise.all([
        api.getCommits(state.path, 300),
        api.getFileStatuses(state.path),
        api.getBranches(state.path),
        api.getTags(state.path),
        api.getStashes(state.path),
        api.getRemotes(state.path),
        api.getWorktrees(state.path),
        api.getSubmodules(state.path),
      ]);

      setCommits(fetchedCommits);
      setStatuses(fetchedStatuses);
      setBranches(fetchedBranches);
      setTags(fetchedTags);
      setStashes(fetchedStashes);
      setRemotes(fetchedRemotes);
      setWorktrees(fetchedWorktrees);
      setSubmodules(fetchedSubmodules);

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

  // Fetch diff when selected file changes
  useEffect(() => {
    if (!selectedFile || !repoPath) {
      setFileDiffs([]);
      return;
    }

    api.getDiff(repoPath, selectedFile, isSelectedFileStaged)
      .then((diffs) => {
        setFileDiffs(diffs);
      })
      .catch((e) => {
        console.error('Diff error:', e);
        setFileDiffs([]);
      });
  }, [selectedFile, isSelectedFileStaged, repoPath, statuses]);

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
  const handleCommit = async (summary: string, description: string, amend: boolean) => {
    setLoading(true);
    try {
      await api.commit(repoPath, summary, description, amend);
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

  // Stash actions
  const handleSaveStash = async (message: string, includeUntracked: boolean) => {
    await api.saveStash(repoPath, message, includeUntracked);
    await refreshRepo();
  };

  const handlePopStash = async (index: number = 0) => {
    await api.popStash(repoPath, index);
    await refreshRepo();
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
      {/* Top Header Toolbar */}
      <HeaderToolbar
        repoState={repoState}
        onRefresh={() => refreshRepo()}
        onPull={handlePull}
        onPush={handlePush}
        onFetch={handleFetch}
        onOpenBranchModal={() => {
          setBranchStartPoint(repoState?.currentBranch || 'HEAD');
          setShowBranchModal(true);
        }}
        onOpenStashModal={() => setShowStashModal(true)}
        onPopStash={() => handlePopStash(0)}
        onToggleAgent={() => setIsAgentOpen(!isAgentOpen)}
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          branches={branches}
          remotes={remotes}
          tags={tags}
          stashes={stashes}
          worktrees={worktrees}
          submodules={submodules}
          currentBranch={repoState?.currentBranch || ''}
          onCheckoutBranch={handleCheckoutBranch}
          onDeleteBranch={handleDeleteBranch}
          onPopStash={handlePopStash}
          onDropStash={handleDropStash}
          onDeleteTag={handleDeleteTag}
          onCreateBranch={() => {
            setBranchStartPoint(repoState?.currentBranch || 'HEAD');
            setShowBranchModal(true);
          }}
          onCreateTag={() => {
            const name = prompt('Enter tag name:');
            if (name) handleCreateTag(name);
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
          />
        </div>

        {/* Right Section: Working Tree / Diff Viewer & Commit Box */}
        <div className="w-[520px] flex flex-col border-l border-[#2a3447] bg-[#14181f]">
          <div className="flex-1 flex overflow-hidden">
            {/* Staging file list */}
            <StagingPanel
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
            />

            {/* Diff Viewer */}
            <DiffViewer
              diffs={fileDiffs}
              filePath={selectedFile || ''}
              isStaged={isSelectedFileStaged}
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
            />
          </div>

          {/* Commit Box at bottom of right panel */}
          <CommitBox
            stagedCount={repoState?.stagedCount || 0}
            onCommit={handleCommit}
            onGenerateAiMessage={handleGenerateAiMessage}
            loading={loading}
          />
        </div>

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

      {showSettingsModal && (
        <SettingsModal repoPath={repoPath} onClose={() => setShowSettingsModal(false)} />
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
        <ConflictModal
          filePath={conflictModalData.file}
          rawDiff={conflictModalData.rawDiff}
          onClose={() => setConflictModalData(null)}
          onApplyResolution={handleApplyConflictResolution}
        />
      )}
    </div>
  );
};
