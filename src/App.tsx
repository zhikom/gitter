// The window: repository tabs, toolbar, sidebar, commit graph, working tree,
// and the agent and assistant panels. Actions live in one command list (see
// commands.ts); git work goes through useRepository's `run`, which reports
// failures and reloads; at most one dialog is open at a time.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
  Columns2,
  DownloadCloud,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  History,
  Inbox,
  Layers,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Undo2,
  Workflow,
} from 'lucide-react';
import type { AIExplanation, Commit, FileDiff, PullRequest, Stash } from '../shared/types/git';
import type { UpdateInfo } from '../shared/types/update';
import { api, pickFolder } from './api/client';
import { type Command, useShortcuts } from './commands';
import { AgentLens } from './components/Agent/AgentLens';
import { AgentRail } from './components/Agent/AgentRail';
import { AgentReviewInbox } from './components/Agent/AgentReviewInbox';
import { AgentRunDrawer } from './components/Agent/AgentRunDrawer';
import type { AttentionItem } from './components/Agent/agentUi';
import { CollisionBar } from './components/Agent/CollisionBar';
import { AssistantPanel } from './components/Assistant/AssistantPanel';
import { FileBlameModal } from './components/Blame/FileBlameModal';
import { CommitComparisonModal } from './components/CommitComparison/CommitComparisonModal';
import { CommitDetailModal } from './components/CommitDetail/CommitDetailModal';
import { CommitGraph } from './components/CommitGraph/CommitGraph';
import { ThreeWayConflictResolverModal } from './components/ConflictResolver/ThreeWayConflictResolverModal';
import { Explanation } from './components/Diff/Explanation';
import { HeaderToolbar } from './components/HeaderToolbar';
import { AgentFleetModal } from './components/Modals/AgentFleetModal';
import { BranchActionModal } from './components/Modals/BranchActionModal';
import { CommandPalette } from './components/Modals/CommandPalette';
import { CreateBranchModal } from './components/Modals/CreateBranchModal';
import { FileHistoryModal } from './components/Modals/FileHistoryModal';
import { GitflowModal } from './components/Modals/GitflowModal';
import { ReflogModal } from './components/Modals/ReflogModal';
import { RepositoriesModal, type RepositoriesTab } from './components/Modals/RepositoriesModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { StashInspectorModal } from './components/Modals/StashInspectorModal';
import { StashModal, type StashSaveOptions } from './components/Modals/StashModal';
import { UpdateModal } from './components/Modals/UpdateModal';
import { RepoTabBar } from './components/Navigation/RepoTabBar';
import { CreatePullRequestModal, PullRequestModal } from './components/PullRequests/PullRequestModal';
import { InteractiveRebaseModal } from './components/Rebase/InteractiveRebaseModal';
import { Sidebar } from './components/Sidebar';
import { CommitBox } from './components/Staging/CommitBox';
import { StagingPanel } from './components/Staging/StagingPanel';
import { type PatchAction, WorkingDiff } from './components/Staging/WorkingDiff';
import { AskHost, ask } from './components/ui/ask';
import { Button, Modal } from './components/ui/Modal';
import { Resizer } from './components/ui/Resizer';
import { VirtualBranchPanel } from './components/VirtualBranches/VirtualBranchPanel';
import { WorktreesModal } from './components/Worktrees/WorktreesModal';
import { useAgentActions } from './hooks/useAgentActions';
import { useAgentLive } from './hooks/useAgentLive';
import { useRepository } from './hooks/useRepository';
import { getPreference, usePreference } from './preferences';
import { checkForAppUpdate } from './services/updateService';
import { toast } from './utils/toast';

/** The one open dialog, if any. */
type Dialog =
  | { kind: 'repositories'; tab?: RepositoriesTab }
  | { kind: 'palette' }
  | { kind: 'settings' }
  | { kind: 'update' }
  | { kind: 'create-branch'; startPoint: string }
  | { kind: 'stash' }
  | { kind: 'stash-inspector'; stash: Stash }
  | { kind: 'commit'; commit: Commit }
  | { kind: 'compare'; base: Commit; target: Commit }
  | { kind: 'reflog' }
  | { kind: 'worktrees' }
  | { kind: 'gitflow' }
  | { kind: 'rebase'; base: string }
  | { kind: 'blame'; file: string }
  | { kind: 'file-history'; file: string }
  | { kind: 'conflict'; file: string }
  | { kind: 'explanation'; file: string; explanation: AIExplanation }
  | { kind: 'branch-drop'; source: string; target: string }
  | { kind: 'pull-request'; pr: PullRequest }
  | { kind: 'create-pull-request' }
  | { kind: 'fleet' }
  | { kind: 'inbox' }
  | { kind: 'agent-run'; agentId: string }
  | { kind: 'agent-lens'; agentId: string };

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
const MAX_RECENT = 30;

function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export const App: React.FC = () => {
  // --- Repositories and tabs -------------------------------------------------
  const [tabs, setTabs] = usePreference('openTabs');
  const [recent, setRecent] = usePreference('recentRepos');
  const [repo, setRepo] = useState(() => getPreference('openTabs')[0]?.path ?? '');
  const repository = useRepository(repo);
  const { state: repoState, statuses, run } = repository;

  /** Opens a repository in a tab (or switches to its tab) once git confirms it is one. */
  const openRepo = useCallback(
    async (path: string) => {
      let root: string;
      try {
        root = (await api.repoState({ repo: path })).path;
      } catch (e: any) {
        toast.error(`Could not open ${path}: ${e.message}`);
        return;
      }
      setTabs((prev) => (prev.some((t) => samePath(t.path, root)) ? prev : [...prev, { path: root, name: folderName(root), branch: '', isClean: true }]));
      setRecent((prev) => [root, ...prev.filter((p) => !samePath(p, root))].slice(0, MAX_RECENT));
      setRepo(root);
    },
    [setTabs, setRecent]
  );

  const closeTab = useCallback(
    (path: string) => {
      const remaining = tabs.filter((t) => !samePath(t.path, path));
      setTabs(remaining);
      if (samePath(path, repo)) setRepo(remaining[0]?.path ?? '');
    },
    [tabs, repo, setTabs]
  );

  const cycleTab = (step: 1 | -1) => {
    if (tabs.length < 2) return;
    const index = tabs.findIndex((t) => samePath(t.path, repo));
    setRepo(tabs[(index + step + tabs.length) % tabs.length].path);
  };

  // The tab shows the branch and whether the tree is clean.
  useEffect(() => {
    if (!repoState) return;
    setTabs((prev) =>
      prev.map((t) => (samePath(t.path, repoState.path) && (t.branch !== repoState.currentBranch || t.isClean !== repoState.isClean) ? { ...t, branch: repoState.currentBranch, isClean: repoState.isClean } : t))
    );
  }, [repoState, setTabs]);

  // A folder dropped on the desktop window opens as a repository.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === 'drop' && event.payload.paths[0]) void openRepo(event.payload.paths[0]);
        })
        .then((stop) => (unlisten = stop))
    );
    return () => unlisten?.();
  }, [openRepo]);

  // --- Layout ------------------------------------------------------------------
  const [sidebarOpen, setSidebarOpen] = usePreference('sidebarOpen');
  const [sidebarWidth, setSidebarWidth] = usePreference('sidebarWidth');
  const [stagingOpen, setStagingOpen] = usePreference('stagingOpen');
  const [rightWidth, setRightWidth] = usePreference('rightPanelWidth');
  const [listWidth, setListWidth] = usePreference('stagingListWidth');
  const [laneMode, setLaneMode] = usePreference('laneMode');
  const [railOpen, setRailOpen] = usePreference('agentRailOpen');
  const [assistantOpen, setAssistantOpen] = usePreference('assistantOpen');
  const windowWidth = useWindowWidth();

  // The graph keeps at least 260px; the side panels give way first on narrow windows.
  const assistantOverlay = windowWidth < 1350;
  const effectiveSidebar = sidebarOpen ? Math.min(sidebarWidth, Math.max(160, Math.floor(windowWidth * 0.28))) : 0;
  const maxRight = Math.max(300, windowWidth - effectiveSidebar - (assistantOpen && !assistantOverlay ? 352 : 0) - (railOpen ? 56 : 0) - 260);
  const effectiveRight = Math.min(rightWidth, maxRight);
  const stacked = effectiveRight < 520;
  const effectiveList = stacked ? effectiveRight : Math.min(listWidth, Math.max(160, effectiveRight - 200));

  // --- Selection ---------------------------------------------------------------
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | undefined>();
  const [ignoreWhitespace] = usePreference('ignoreWhitespace');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = useCallback(() => setDialog(null), []);

  useEffect(() => {
    setSelectedFile(null);
    setSelectedCommit(null);
    setDialog(null);
  }, [repo]);

  // A selected file that is no longer changed (committed, discarded) is dropped;
  // one that moved between staged and unstaged follows to the side it is on now.
  useEffect(() => {
    if (!selectedFile) return;
    const here = statuses.filter((s) => s.path === selectedFile.path);
    if (here.length === 0) setSelectedFile(null);
    else if (!here.some((s) => s.staged === selectedFile.staged)) setSelectedFile({ path: selectedFile.path, staged: here[0].staged });
  }, [statuses, selectedFile]);

  useEffect(() => {
    let current = true;
    if (!selectedFile || !repo) {
      setFileDiff(undefined);
      return;
    }
    api
      .workingDiff({ repo, file: selectedFile.path, staged: selectedFile.staged, ignoreWhitespace })
      .then((diffs) => current && setFileDiff(diffs[0]))
      .catch((e) => current && toast.error(`Could not load the diff: ${e.message}`));
    return () => {
      current = false;
    };
  }, [repo, selectedFile, statuses, ignoreWhitespace]);

  // --- Agents ------------------------------------------------------------------
  const live = useAgentLive(repo);
  const agentActions = useAgentActions(repo, live.apply, live.refresh, repository.refresh);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [assistantSeed, setAssistantSeed] = useState('');
  useEffect(() => setAcknowledged(new Set()), [repo]);
  const waiting = live.reviews.filter((r) => r.status === 'needs-review').length;
  const reviewFor = (agentId: string) => live.reviews.find((r) => r.agentId === agentId) ?? null;

  const selectAttention = (item: AttentionItem) => {
    setAcknowledged((prev) => new Set(prev).add(item.id));
    if (item.agentId) setDialog({ kind: 'agent-run', agentId: item.agentId });
    else setDialog({ kind: 'fleet' });
  };

  const askAssistant = (prompt: string) => {
    setAssistantSeed(prompt);
    setAssistantOpen(true);
    setDialog(null);
  };

  // --- Updates and background fetch ---------------------------------------
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (getPreference('checkForUpdates')) checkForAppUpdate().then(setUpdate, () => undefined);
  }, []);

  const [autoFetch] = usePreference('autoFetchMinutes');
  useEffect(() => {
    if (!repo || !autoFetch) return;
    const timer = setInterval(() => {
      api.fetch({ repo }).then(repository.refresh, () => undefined);
    }, autoFetch * 60_000);
    return () => clearInterval(timer);
  }, [repo, autoFetch, repository.refresh]);

  // --- Git actions ---------------------------------------------------------------
  const ignore = () => undefined; // the failure was already reported by `run`
  const short = (hash: string) => (/^[0-9a-f]{40}$/.test(hash) ? hash.slice(0, 7) : hash);

  const actions = {
    checkout: (target: string) => run(`Could not check out ${short(target)}`, () => api.checkout({ repo, target })),
    pull: (rebase?: boolean) => run('Pull failed', () => api.pull({ repo, rebase }), { success: 'Pulled.' }),
    push: (forceWithLease = false) => run('Push failed', () => api.push({ repo, forceWithLease }), { success: 'Pushed.' }),
    fetch: () => run('Fetch failed', () => api.fetch({ repo }), { success: 'Fetched from all remotes.' }),
    undo: () => run('Nothing was undone', () => api.undo({ repo }), { success: (message) => message }),

    async commit(summary: string, description: string, amend: boolean, then?: 'push' | 'sync') {
      await run('Commit failed', () => api.commit({ repo, summary, description, amend }), { success: amend ? 'Amended the last commit.' : 'Committed.' });
      if (then === 'sync') await actions.pull();
      if (then) await actions.push();
    },

    async generateCommitMessage() {
      const staged = [...new Set(statuses.filter((s) => s.staged).map((s) => s.path))];
      if (staged.length === 0) throw new Error('Stage some changes first.');
      const diffs = await Promise.all(staged.slice(0, 20).map((file) => api.workingDiff({ repo, file, staged: true })));
      return api.commitMessage({ diff: diffs.flat().map((d) => d.rawDiff).join('\n'), files: staged });
    },

    stage: (file: string) => run(`Could not stage ${file}`, () => api.stageFile({ repo, file })),
    unstage: (file: string) => run(`Could not unstage ${file}`, () => api.unstageFile({ repo, file })),
    stageAll: () => run('Could not stage everything', () => api.stageAll({ repo })),
    unstageAll: () => run('Could not unstage everything', () => api.unstageAll({ repo })),

    async discard(file: string) {
      if (getPreference('confirmDiscard') && !(await ask.confirm({ title: `Discard changes to ${file}?`, message: 'They cannot be recovered.', confirmLabel: 'Discard', danger: true }))) return;
      await run(`Could not discard ${file}`, () => api.discardFile({ repo, file }));
    },
    async discardAll() {
      if (!(await ask.confirm({ title: 'Discard all changes?', message: 'Every uncommitted change, untracked files included, is lost.', confirmLabel: 'Discard all', danger: true }))) return;
      await run('Could not discard the changes', () => api.discardAll({ repo }));
    },
    patch: (action: PatchAction, patch: string) => {
      const send = { stage: api.stagePatch, unstage: api.unstagePatch, discard: api.discardPatch }[action];
      return run(`Could not ${action} the selection`, () => send({ repo, patch })).then(() => undefined);
    },

    createBranch: (name: string, startPoint: string, checkout: boolean) =>
      run(`Could not create ${name}`, async () => {
        await api.createBranch({ repo, name, startPoint });
        if (checkout) await api.checkout({ repo, target: name });
      }, { success: `Created ${name}.` }),

    async renameBranch(from: string) {
      const to = await ask.text({ title: 'Rename branch', label: 'New name', initial: from, confirmLabel: 'Rename', validate: (v) => (v === from ? 'That is the current name.' : null) });
      if (to) await run(`Could not rename ${from}`, () => api.renameBranch({ repo, from, to })).catch(ignore);
    },

    async deleteBranch(name: string) {
      if (getPreference('confirmDeleteBranch') && !(await ask.confirm({ title: `Delete ${name}?`, message: 'The branch label goes; its commits stay reachable from the reflog for a while.', confirmLabel: 'Delete', danger: true }))) return;
      try {
        await api.deleteBranch({ repo, name });
        toast.success(`Deleted ${name}.`);
      } catch (e: any) {
        // git refuses to delete unmerged work without -D; ask before forcing it.
        if (!/not fully merged/i.test(e.message)) {
          toast.error(`Could not delete ${name}: ${e.message}`);
        } else if (await ask.confirm({ title: `${name} is not merged`, message: 'Its commits are on no other branch. Delete it anyway?', confirmLabel: 'Delete anyway', danger: true })) {
          await run(`Could not delete ${name}`, () => api.deleteBranch({ repo, name, force: true }), { success: `Deleted ${name}.` }).catch(ignore);
        }
      }
      void repository.refresh();
    },

    merge: async (source: string, target: string) => {
      await run(`Could not merge ${source}`, async () => {
        if (repoState?.currentBranch !== target) await api.checkout({ repo, target });
        await api.merge({ repo, branch: source });
      }, { success: `Merged ${source} into ${target}.` });
    },
    rebase: async (source: string, onto: string) => {
      await run(`Could not rebase ${source}`, async () => {
        if (repoState?.currentBranch !== source) await api.checkout({ repo, target: source });
        await api.rebase({ repo, onto });
      }, { success: `Rebased ${source} onto ${onto}.` });
    },
    async cherryPickOnto(hash: string, branch: string) {
      if (!(await ask.confirm({ title: `Copy ${short(hash)} onto ${branch}?`, message: `${branch} gets checked out and the commit is cherry-picked onto it.`, confirmLabel: 'Cherry-pick' }))) return;
      await run('Cherry-pick failed', async () => {
        if (repoState?.currentBranch !== branch) await api.checkout({ repo, target: branch });
        await api.cherryPick({ repo, hash });
      }, { success: `Cherry-picked ${short(hash)} onto ${branch}.` });
    },
    cherryPick: (hash: string) => run('Cherry-pick failed', () => api.cherryPick({ repo, hash }), { success: `Cherry-picked ${short(hash)}.` }),
    revert: (hash: string) => run('Revert failed', () => api.revert({ repo, hash }), { success: `Reverted ${short(hash)}.` }),
    async reset(hash: string, mode: 'soft' | 'mixed' | 'hard') {
      if (mode === 'hard' && !(await ask.confirm({ title: `Hard reset to ${short(hash)}?`, message: 'The branch moves there and every uncommitted change is lost.', confirmLabel: 'Hard reset', danger: true }))) {
        throw new Error('Cancelled');
      }
      await run('Reset failed', () => api.reset({ repo, hash, mode }), { success: `Reset to ${short(hash)}.` });
    },

    async createTag(target = 'HEAD') {
      const name = await ask.text({ title: `Tag ${short(target)}`, label: 'Tag name', placeholder: 'v1.0.0', confirmLabel: 'Create tag' });
      if (name) await run(`Could not create ${name}`, () => api.createTag({ repo, name, target }), { success: `Tagged ${name}.` }).catch(ignore);
    },
    async deleteTag(name: string) {
      if (await ask.confirm({ title: `Delete tag ${name}?`, message: 'Only the local tag is deleted.', confirmLabel: 'Delete', danger: true })) {
        await run(`Could not delete ${name}`, () => api.deleteTag({ repo, name })).catch(ignore);
      }
    },
    pushTag: (name: string) => run(`Could not push ${name}`, () => api.pushTag({ repo, name }), { success: `Pushed ${name}.` }),
    pushBranch: (branch: string) => run(`Could not push ${branch}`, () => api.push({ repo, branch }), { success: `Pushed ${branch}.` }),

    saveStash: (options: StashSaveOptions) => run('Could not stash', () => api.saveStash({ repo, ...options }), { success: 'Stashed.' }),
    popStash: (index: number) => run('Could not pop the stash', () => api.popStash({ repo, index }), { success: 'Applied and removed the stash.' }).then(ignore),
    applyStash: (index: number) => run('Could not apply the stash', () => api.applyStash({ repo, index }), { success: 'Applied the stash.' }).then(ignore),
    async dropStash(index: number) {
      if (!(await ask.confirm({ title: `Drop stash@{${index}}?`, message: 'Its changes are deleted.', confirmLabel: 'Drop', danger: true }))) throw new Error('Cancelled');
      await run('Could not drop the stash', () => api.dropStash({ repo, index }));
    },

    copyPatch: (hash: string) =>
      run('Could not make the patch', async () => navigator.clipboard.writeText(await api.formatPatch({ repo, hash })), { success: 'Copied the patch.', refresh: false }),
    updateSubmodules: () => run('Could not update submodules', () => api.updateSubmodules({ repo }), { success: 'Submodules updated.' }),
    checkoutPullRequest: (number: number) => run(`Could not check out #${number}`, () => api.checkoutPullRequest({ repo, number }), { success: `Checked out #${number}.` }).then(ignore),
    externalDiff: (file: string, staged: boolean) => run('Could not open the diff tool', () => api.openExternalDiff({ repo, file, staged }), { refresh: false }),
    async explain(diff: FileDiff) {
      try {
        const explanation = await api.explainChanges({ diff: diff.rawDiff, title: `Changes to ${diff.path}` });
        setDialog({ kind: 'explanation', file: diff.path, explanation });
      } catch (e: any) {
        toast.error(`AI review failed: ${e.message}`);
      }
    },
    runConsole: async (command: string) => {
      try {
        return await api.runConsoleCommand({ repo, command });
      } finally {
        void repository.refresh();
      }
    },
  };
  const quietly = (promise: Promise<unknown>) => promise.catch(ignore);

  const defaultBase = useMemo(() => {
    const local = repository.branches.filter((b) => !b.isRemote).map((b) => b.name);
    return ['main', 'master', 'develop'].find((n) => local.includes(n) && n !== repoState?.currentBranch) ?? local.find((n) => n !== repoState?.currentBranch) ?? 'main';
  }, [repository.branches, repoState?.currentBranch]);

  // --- Commands ------------------------------------------------------------------
  const hasRepo = Boolean(repoState);
  const commands: Command[] = [
    { id: 'repositories', title: 'Open repository…', category: 'Repository', icon: FolderOpen, shortcut: 'Mod+L', run: () => setDialog({ kind: 'repositories' }) },
    { id: 'new-tab', title: 'Open repository in a new tab…', category: 'Repository', icon: FolderOpen, shortcut: 'Mod+T', run: () => setDialog({ kind: 'repositories' }) },
    { id: 'close-tab', title: 'Close tab', category: 'Repository', shortcut: 'Mod+W', enabled: hasRepo, run: () => closeTab(repo) },
    { id: 'next-tab', title: 'Next tab', category: 'Repository', shortcut: 'Ctrl+Tab', enabled: tabs.length > 1, run: () => cycleTab(1) },
    { id: 'previous-tab', title: 'Previous tab', category: 'Repository', shortcut: 'Ctrl+Shift+Tab', enabled: tabs.length > 1, run: () => cycleTab(-1) },
    { id: 'refresh', title: 'Reload repository', category: 'Repository', icon: RefreshCw, shortcut: 'F5', enabled: hasRepo, run: () => void repository.refresh() },
    { id: 'pull', title: 'Pull', category: 'Repository', icon: ArrowDownToLine, enabled: hasRepo, run: () => quietly(actions.pull()) },
    { id: 'pull-rebase', title: 'Pull with rebase', category: 'Repository', icon: ArrowDownToLine, enabled: hasRepo, run: () => quietly(actions.pull(true)) },
    { id: 'push', title: 'Push', category: 'Repository', icon: ArrowUpFromLine, enabled: hasRepo, run: () => quietly(actions.push()) },
    { id: 'push-force', title: 'Push with force-with-lease', category: 'Repository', icon: ArrowUpFromLine, enabled: hasRepo, run: () => quietly(actions.push(true)) },
    { id: 'fetch', title: 'Fetch all remotes', category: 'Repository', icon: RefreshCw, enabled: hasRepo, run: () => quietly(actions.fetch()) },
    { id: 'undo', title: 'Undo last action', category: 'Repository', icon: Undo2, shortcut: 'Mod+Z', notInTextFields: true, enabled: hasRepo, run: () => quietly(actions.undo()) },
    { id: 'reflog', title: 'Reflog', category: 'Repository', icon: History, enabled: hasRepo, run: () => setDialog({ kind: 'reflog' }) },
    { id: 'worktrees', title: 'Worktrees', category: 'Repository', icon: Layers, enabled: hasRepo, run: () => setDialog({ kind: 'worktrees' }) },
    { id: 'gitflow', title: 'Gitflow', category: 'Branches', icon: Workflow, enabled: hasRepo, run: () => setDialog({ kind: 'gitflow' }) },
    { id: 'new-branch', title: 'New branch', category: 'Branches', icon: GitBranch, shortcut: 'Mod+Shift+N', enabled: hasRepo, run: () => setDialog({ kind: 'create-branch', startPoint: repoState?.currentBranch || 'HEAD' }) },
    { id: 'pull-request', title: 'New pull request', category: 'Branches', icon: GitPullRequest, enabled: hasRepo && !repoState?.isDetached, run: () => setDialog({ kind: 'create-pull-request' }) },
    { id: 'stash', title: 'Stash changes', category: 'Changes', icon: Archive, shortcut: 'Mod+Shift+S', enabled: hasRepo && !repoState?.isClean, run: () => setDialog({ kind: 'stash' }) },
    { id: 'pop-stash', title: 'Pop latest stash', category: 'Changes', icon: Archive, enabled: repository.stashes.length > 0, run: () => void actions.popStash(0) },
    { id: 'stage-all', title: 'Stage all changes', category: 'Changes', enabled: hasRepo && !repoState?.isClean, run: () => quietly(actions.stageAll()) },
    { id: 'reveal', title: 'Show in file manager', category: 'Repository', icon: FolderOpen, enabled: hasRepo, run: () => quietly(run('Could not open the folder', () => api.revealInFileManager({ repo }), { refresh: false })) },
    { id: 'editor', title: 'Open in editor', category: 'Repository', icon: Code2, enabled: hasRepo, run: () => quietly(run('Could not open the editor', () => api.openInEditor({ repo }), { refresh: false })) },
    { id: 'terminal', title: 'Open terminal', category: 'Repository', icon: Terminal, enabled: hasRepo, run: () => quietly(run('Could not open a terminal', () => api.openTerminal({ repo }), { refresh: false })) },
    { id: 'toggle-sidebar', title: sidebarOpen ? 'Hide sidebar' : 'Show sidebar', category: 'View', icon: PanelLeft, shortcut: 'Mod+B', run: () => setSidebarOpen(!sidebarOpen) },
    { id: 'toggle-staging', title: stagingOpen ? 'Hide working tree' : 'Show working tree', category: 'View', icon: PanelRight, shortcut: 'Mod+J', run: () => setStagingOpen(!stagingOpen) },
    { id: 'lanes', title: laneMode ? 'Stage normally' : 'Group changes into lanes', category: 'View', icon: Layers, enabled: hasRepo, run: () => setLaneMode(!laneMode) },
    { id: 'toggle-assistant', title: assistantOpen ? 'Hide assistant' : 'Ask the assistant', category: 'View', icon: Sparkles, shortcut: 'Mod+Shift+A', run: () => setAssistantOpen(!assistantOpen) },
    { id: 'agent-rail', title: railOpen ? 'Hide agent rail' : 'Show agent rail', category: 'View', icon: Bot, run: () => setRailOpen(!railOpen) },
    { id: 'review-inbox', title: 'Review inbox', category: 'Agents', icon: Inbox, shortcut: 'Mod+Shift+K', enabled: hasRepo, run: () => setDialog({ kind: 'inbox' }) },
    { id: 'fleet', title: 'Agent fleet', category: 'Agents', icon: Bot, shortcut: 'Mod+Shift+F', enabled: hasRepo && Boolean(live.fleet), run: () => setDialog({ kind: 'fleet' }) },
    {
      id: 'next-review',
      title: 'Compare the next agent to review',
      category: 'Agents',
      icon: Columns2,
      shortcut: 'Mod+Shift+L',
      enabled: live.reviews.length > 0,
      run: () => {
        const next = live.reviews.find((r) => r.status === 'needs-review') ?? live.reviews[0];
        if (next) setDialog({ kind: 'agent-lens', agentId: next.agentId });
      },
    },
    { id: 'palette', title: 'Command palette', category: 'Gitter', icon: Search, shortcut: 'Mod+P', run: () => setDialog({ kind: 'palette' }) },
    { id: 'settings', title: 'Settings', category: 'Gitter', icon: Settings, shortcut: 'Mod+,', run: () => setDialog({ kind: 'settings' }) },
    { id: 'check-updates', title: 'Check for updates', category: 'Gitter', icon: DownloadCloud, run: () => setDialog({ kind: 'update' }) },
  ];
  useShortcuts(commands);

  // --- Rendering -----------------------------------------------------------------
  const hasWip = Boolean(repoState && !repoState.isClean);
  const conflicted = Boolean(selectedFile && statuses.some((s) => s.path === selectedFile.path && s.status === 'conflicted'));
  const provenance = selectedFile ? live.reviews.find((r) => r.files.some((f) => f.path === selectedFile.path)) : undefined;

  const assistant = assistantOpen && (
    <AssistantPanel
      key={repo}
      repo={repo}
      repoState={repoState}
      seed={assistantSeed}
      onSeedConsumed={() => setAssistantSeed('')}
      agentsWaiting={waiting}
      onOpenInbox={() => setDialog({ kind: 'inbox' })}
      onClose={() => setAssistantOpen(false)}
      onRunCommand={actions.runConsole}
    />
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#14181f] text-slate-200">
      <RepoTabBar
        tabs={tabs}
        activePath={repo}
        onSelectTab={setRepo}
        onCloseTab={closeTab}
        onCloseOtherTabs={(keep) => {
          setTabs(tabs.filter((t) => samePath(t.path, keep)));
          setRepo(keep);
        }}
        onRevealInExplorer={(path) => quietly(api.revealInFileManager({ repo: path }))}
        onNewTab={() => setDialog({ kind: 'repositories' })}
      />
      <HeaderToolbar
        commands={commands}
        repoState={repoState}
        busy={repository.busy}
        open={{ sidebar: sidebarOpen, staging: stagingOpen, assistant: assistantOpen }}
        agents={{ count: live.fleet?.agents.length ?? 0, waiting, collisions: live.fleet?.collisions.length ?? 0 }}
        attention={live.attention}
        acknowledged={acknowledged}
        onAcknowledge={(id) => setAcknowledged((prev) => new Set(prev).add(id))}
        onAcknowledgeAll={() => setAcknowledged(new Set(live.attention.map((a) => a.id)))}
        onSelectAttention={selectAttention}
        update={update}
      />

      {!repo || (repository.problem && !repoState) ? (
        <Welcome recent={recent} problem={repo ? repository.problem : null} onOpen={openRepo} onChoose={(tab) => setDialog({ kind: 'repositories', tab })} />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {railOpen && (
            <AgentRail
              reviews={live.reviews}
              connected={live.connected}
              selectedAgentId={dialog?.kind === 'agent-run' ? dialog.agentId : null}
              onOpenInbox={() => setDialog({ kind: 'inbox' })}
              onOpenFleet={() => setDialog({ kind: 'fleet' })}
              onSpawn={() => setDialog({ kind: 'fleet' })}
              onSelectAgent={(agentId) => setDialog({ kind: 'agent-run', agentId })}
            />
          )}

          {sidebarOpen && (
            <>
              <Sidebar
                width={effectiveSidebar}
                branches={repository.branches}
                remotes={repository.remotes}
                tags={repository.tags}
                stashes={repository.stashes}
                pullRequests={repository.pullRequests}
                worktrees={repository.worktrees}
                submodules={repository.submodules}
                currentBranch={repoState?.currentBranch ?? ''}
                onCheckoutBranch={(name) => quietly(actions.checkout(name))}
                onDeleteBranch={(name) => void actions.deleteBranch(name)}
                onRenameBranch={(name) => void actions.renameBranch(name)}
                onPushBranch={(name) => quietly(actions.pushBranch(name))}
                onBranchDrop={(source, target) => setDialog({ kind: 'branch-drop', source, target })}
                onCherryPickToBranch={(hash, branch) => quietly(actions.cherryPickOnto(hash, branch))}
                onPopStash={(index) => void actions.popStash(index)}
                onApplyStash={(index) => void actions.applyStash(index)}
                onDropStash={(index) => quietly(actions.dropStash(index))}
                onInspectStash={(index) => {
                  const stash = repository.stashes.find((s) => s.index === index);
                  if (stash) setDialog({ kind: 'stash-inspector', stash });
                }}
                onDeleteTag={(name) => void actions.deleteTag(name)}
                onPushTag={(name) => quietly(actions.pushTag(name))}
                onCreateBranch={() => setDialog({ kind: 'create-branch', startPoint: repoState?.currentBranch || 'HEAD' })}
                onCreateTag={() => void actions.createTag()}
                onViewPr={(pr) => setDialog({ kind: 'pull-request', pr })}
                onCreatePr={() => setDialog({ kind: 'create-pull-request' })}
                onOpenWorktrees={() => setDialog({ kind: 'worktrees' })}
                onSwitchWorktree={(path) => void openRepo(path)}
                onOpenGitflow={() => setDialog({ kind: 'gitflow' })}
                onUpdateSubmodules={() => quietly(actions.updateSubmodules())}
              />
              <Resizer label="Sidebar width" size={effectiveSidebar} direction={1} min={160} max={480} onResize={setSidebarWidth} />
            </>
          )}

          <div className="flex-1 min-w-[240px] flex flex-col overflow-hidden">
            <CollisionBar collisions={live.fleet?.collisions ?? []} agents={live.fleet?.agents ?? []} onOpenInbox={() => setDialog({ kind: 'fleet' })} />
            <CommitGraph
              commits={repository.commits}
              hasWip={hasWip}
              selectedHash={selectedCommit?.hash ?? (hasWip ? 'wip' : null)}
              agentBranchNames={live.reviews.map((r) => r.branchName)}
              hasAgentCollisions={(live.fleet?.collisions.length ?? 0) > 0}
              onSelectCommit={(commit) => {
                if (commit.isWip) {
                  setSelectedCommit(null);
                  setStagingOpen(true);
                } else {
                  setSelectedCommit(commit);
                  setDialog({ kind: 'commit', commit });
                }
              }}
              onCheckout={(hash) => quietly(actions.checkout(hash))}
              onCreateBranchAt={(hash) => setDialog({ kind: 'create-branch', startPoint: hash })}
              onCreateTagAt={(hash) => void actions.createTag(hash)}
              onRevertCommit={(hash) => quietly(actions.revert(hash))}
              onResetCommit={(hash, mode) => quietly(actions.reset(hash, mode))}
              onCherryPick={(hash) => quietly(actions.cherryPick(hash))}
              onInteractiveRebase={(base) => setDialog({ kind: 'rebase', base })}
              onOpenInEditor={() => quietly(run('Could not open the editor', () => api.openInEditor({ repo }), { refresh: false }))}
              onCopyPatch={(hash) => quietly(actions.copyPatch(hash))}
              onCompareCommits={(base, target) => setDialog({ kind: 'compare', base, target })}
            />
          </div>

          {stagingOpen && (
            <>
              <Resizer label="Working tree width" size={effectiveRight} direction={-1} min={300} max={Math.max(300, maxRight)} onResize={setRightWidth} />
              <div style={{ width: effectiveRight }} className="flex flex-col bg-[#14181f] flex-shrink-0 overflow-hidden">
                {laneMode ? (
                  <VirtualBranchPanel
                    repo={repo}
                    currentBranch={repoState?.currentBranch ?? ''}
                    statuses={statuses}
                    selectedFile={selectedFile?.path ?? null}
                    onSelectFile={(path, staged) => setSelectedFile({ path, staged })}
                    onRefresh={repository.refresh}
                    onSwitchToStandardStaging={() => setLaneMode(false)}
                  />
                ) : (
                  <>
                    <div className={`flex-1 flex overflow-hidden ${stacked ? 'flex-col' : 'flex-row'}`}>
                      <div style={stacked ? { height: 220 } : { width: effectiveList }} className="flex-shrink-0 flex flex-col overflow-hidden">
                        <StagingPanel
                          width={effectiveList}
                          statuses={statuses}
                          selectedFile={selectedFile?.path ?? null}
                          collisions={live.fleet?.collisions ?? []}
                          agents={live.fleet?.agents ?? []}
                          onSelectFile={(path, staged) => setSelectedFile({ path, staged })}
                          onStageFile={(file) => quietly(actions.stage(file))}
                          onUnstageFile={(file) => quietly(actions.unstage(file))}
                          onStageAll={() => quietly(actions.stageAll())}
                          onUnstageAll={() => quietly(actions.unstageAll())}
                          onDiscardFile={(file) => quietly(actions.discard(file))}
                          onDiscardAll={() => quietly(actions.discardAll())}
                          onStash={() => setDialog({ kind: 'stash' })}
                          onOpenBlame={(file) => setDialog({ kind: 'blame', file })}
                          onOpenFileHistory={(file) => setDialog({ kind: 'file-history', file })}
                          onRevealInExplorer={(file) => quietly(api.revealInFileManager({ repo, file }))}
                          onOpenInVsCode={(file) => quietly(api.openInEditor({ repo, file }))}
                          onOpenExternalDiff={(file, staged) => quietly(actions.externalDiff(file, staged))}
                          onToggleVirtualBranches={() => setLaneMode(true)}
                        />
                      </div>
                      {stacked ? (
                        <div className="h-1 flex-shrink-0 bg-[#222a3a]" />
                      ) : (
                        <Resizer label="File list width" size={effectiveList} direction={1} min={160} max={Math.max(160, effectiveRight - 200)} onResize={setListWidth} />
                      )}
                      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                        <WorkingDiff
                          diff={fileDiff}
                          staged={selectedFile?.staged ?? false}
                          conflicted={conflicted}
                          banner={provenance && <Provenance review={provenance} file={selectedFile!.path} onOpenLens={() => setDialog({ kind: 'agent-lens', agentId: provenance.agentId })} />}
                          onToggleStaged={() => selectedFile && quietly(selectedFile.staged ? actions.unstage(selectedFile.path) : actions.stage(selectedFile.path))}
                          onPatch={actions.patch}
                          onExplain={(diff) => void actions.explain(diff)}
                          onResolveConflict={(file) => setDialog({ kind: 'conflict', file })}
                          onBlame={(file) => setDialog({ kind: 'blame', file })}
                          onExternalDiff={(file, staged) => quietly(actions.externalDiff(file, staged))}
                        />
                      </div>
                    </div>
                    <CommitBox
                      stagedCount={repoState?.stagedCount ?? 0}
                      currentBranch={repoState?.currentBranch}
                      lastCommit={repository.commits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD ->'))) ?? null}
                      onCommit={actions.commit}
                      onStash={() => setDialog({ kind: 'stash' })}
                      onGenerateAiMessage={actions.generateCommitMessage}
                      loading={repository.busy}
                    />
                  </>
                )}
              </div>
            </>
          )}

          {assistant &&
            (assistantOverlay ? (
              <>
                <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setAssistantOpen(false)} />
                <div className="fixed right-0 top-12 bottom-0 z-40 w-[22rem] max-w-[90vw] shadow-2xl">{assistant}</div>
              </>
            ) : (
              assistant
            ))}
        </div>
      )}

      {dialog && renderDialog()}
      <AskHost />
    </div>
  );

  function renderDialog(): React.ReactNode {
    if (!dialog) return null;
    const afterChange = () => void repository.refresh();
    switch (dialog.kind) {
      case 'repositories':
        return <RepositoriesModal initialTab={dialog.tab} onClose={close} onOpen={(path) => void openRepo(path)} />;
      case 'palette':
        return (
          <CommandPalette
            commands={commands.filter((c) => c.id !== 'palette')}
            branches={repository.branches}
            tags={repository.tags}
            commits={repository.commits}
            agents={live.reviews}
            onClose={close}
            onCheckout={(target) => quietly(actions.checkout(target))}
            onOpenCommit={(commit) => setDialog({ kind: 'commit', commit })}
            onOpenAgent={(agentId) => setDialog({ kind: 'agent-run', agentId })}
          />
        );
      case 'settings':
        return <SettingsModal repo={repo} onClose={close} onCheckForUpdates={() => setDialog({ kind: 'update' })} />;
      case 'update':
        return <UpdateModal initial={null} onClose={close} />;
      case 'create-branch':
        return <CreateBranchModal startPoint={dialog.startPoint} onClose={close} onCreate={(name, start, checkout) => actions.createBranch(name, start, checkout).then(() => undefined)} />;
      case 'stash':
        return <StashModal files={statuses} onClose={close} onSave={(options) => actions.saveStash(options).then(() => undefined)} />;
      case 'stash-inspector':
        return <StashInspectorModal repo={repo} stash={dialog.stash} onClose={close} onApply={actions.applyStash} onPop={actions.popStash} onDrop={actions.dropStash} />;
      case 'commit':
        return (
          <CommitDetailModal
            commit={dialog.commit}
            repo={repo}
            onClose={close}
            onCheckout={(hash) => quietly(actions.checkout(hash).then(close))}
            onCreateBranchAt={(hash) => setDialog({ kind: 'create-branch', startPoint: hash })}
            onRevert={(hash) => quietly(actions.revert(hash).then(close))}
          />
        );
      case 'compare':
        return <CommitComparisonModal base={dialog.base} target={dialog.target} repo={repo} onClose={close} />;
      case 'reflog':
        return (
          <ReflogModal
            repo={repo}
            onClose={close}
            onCheckout={(hash) => actions.checkout(hash).then(() => undefined)}
            onReset={(hash, mode) => actions.reset(hash, mode)}
            onCreateBranchAt={(hash) => setDialog({ kind: 'create-branch', startPoint: hash })}
          />
        );
      case 'worktrees':
        return <WorktreesModal repo={repo} onClose={close} onOpen={(path) => void openRepo(path)} onChanged={afterChange} />;
      case 'gitflow':
        return <GitflowModal repo={repo} onClose={close} onRefresh={afterChange} />;
      case 'rebase':
        return <InteractiveRebaseModal base={dialog.base} repo={repo} onClose={close} onComplete={afterChange} />;
      case 'blame':
        return (
          <FileBlameModal
            file={dialog.file}
            repo={repo}
            onClose={close}
            onOpenHistory={(file) => setDialog({ kind: 'file-history', file })}
            onOpenCommit={(hash) => {
              const commit = repository.commits.find((c) => c.hash === hash);
              if (commit) setDialog({ kind: 'commit', commit });
              else toast.info(`${hash.slice(0, 7)} is not among the loaded commits.`);
            }}
          />
        );
      case 'file-history':
        return (
          <FileHistoryModal
            file={dialog.file}
            repo={repo}
            onClose={close}
            onOpenCommit={(hash) => {
              const commit = repository.commits.find((c) => c.hash === hash);
              if (commit) setDialog({ kind: 'commit', commit });
              else toast.info(`${hash.slice(0, 7)} is not among the loaded commits.`);
            }}
          />
        );
      case 'conflict':
        return <ThreeWayConflictResolverModal file={dialog.file} repo={repo} onClose={close} onResolved={afterChange} />;
      case 'explanation':
        return (
          <Modal width="lg" icon={<Sparkles className="w-4 h-4" />} title="AI review" subtitle={dialog.file} onClose={close} footer={<Button tone="primary" onClick={close}>Close</Button>}>
            <Explanation explanation={dialog.explanation} />
          </Modal>
        );
      case 'branch-drop':
        return <BranchActionModal source={dialog.source} target={dialog.target} onClose={close} onMerge={(s, t) => quietly(actions.merge(s, t))} onRebase={(s, t) => quietly(actions.rebase(s, t))} />;
      case 'pull-request':
        return <PullRequestModal repo={repo} pr={dialog.pr} onClose={close} onCheckout={actions.checkoutPullRequest} />;
      case 'create-pull-request':
        return <CreatePullRequestModal repo={repo} head={repoState?.currentBranch ?? ''} defaultBase={defaultBase} onClose={close} onCreated={afterChange} />;
      case 'fleet':
        return live.fleet ? (
          <AgentFleetModal
            repo={repo}
            fleet={live.fleet}
            actions={agentActions}
            onClose={close}
            onRefresh={() => void live.refresh()}
            onOpenWorktree={(path) => {
              close();
              void openRepo(path);
            }}
            onOpenReview={(agentId) => setDialog({ kind: 'agent-run', agentId })}
          />
        ) : null;
      case 'inbox':
        return (
          <AgentReviewInbox
            reviews={live.reviews}
            actions={agentActions}
            onClose={close}
            onRefresh={() => void live.refresh()}
            onOpenAgent={(agentId) => setDialog({ kind: 'agent-run', agentId })}
            onOpenLens={(agentId) => setDialog({ kind: 'agent-lens', agentId })}
            onOpenFleet={() => setDialog({ kind: 'fleet' })}
          />
        );
      case 'agent-run':
        return (
          <AgentRunDrawer
            repo={repo}
            item={reviewFor(dialog.agentId)}
            actions={agentActions}
            onClose={close}
            onRefresh={() => void live.refresh()}
            onOpenLens={(agentId) => setDialog({ kind: 'agent-lens', agentId })}
            onOpenWorktree={(path) => {
              close();
              void openRepo(path);
            }}
            onAskWhy={askAssistant}
          />
        );
      case 'agent-lens':
        return <AgentLens repo={repo} item={reviewFor(dialog.agentId)} actions={agentActions} onClose={close} onOpenRun={(agentId) => setDialog({ kind: 'agent-run', agentId })} />;
    }
  }
};

/** Shown above a working file's diff when an agent also changed that file. */
const Provenance: React.FC<{ review: { agentName: string; branchName: string; collisions: string[] }; file: string; onOpenLens: () => void }> = ({ review, file, onOpenLens }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-[10px]">
    <Bot className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
    <span className="text-slate-300">
      <span className="font-semibold">{review.agentName}</span> also changed this file on <span className="font-mono text-slate-400">{review.branchName}</span>
    </span>
    {review.collisions.includes(file) && (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">
        <AlertTriangle className="w-2.5 h-2.5" />
        shared with another agent
      </span>
    )}
    <button onClick={onOpenLens} className="ml-auto px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-semibold text-teal-300">
      Compare
    </button>
  </div>
);

/** The window with no repository open, or one that could not be read. */
const Welcome: React.FC<{ recent: string[]; problem: string | null; onOpen: (path: string) => void; onChoose: (tab: RepositoriesTab) => void }> = ({ recent, problem, onOpen, onChoose }) => (
  <div className="flex-1 flex items-center justify-center p-6">
    <div className="w-full max-w-lg space-y-5 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 flex items-center justify-center">
        <GitMerge className="w-7 h-7 text-white" />
      </div>
      {problem ? (
        <p className="text-sm text-rose-300">{problem}</p>
      ) : (
        <p className="text-sm text-slate-300">Open a repository to start.</p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          tone="primary"
          onClick={async () => {
            try {
              const picked = await pickFolder('Open a repository');
              if (picked) onOpen(picked);
            } catch (e: any) {
              toast.error(`Could not open the folder picker: ${e.message}`);
            }
          }}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open folder…
        </Button>
        <Button onClick={() => onChoose('clone')}>Clone…</Button>
        <Button onClick={() => onChoose('scan')}>Find repositories…</Button>
        <Button onClick={() => onChoose('create')}>New repository…</Button>
      </div>
      {recent.length > 0 && (
        <div className="text-left space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">Recent</div>
          {recent.slice(0, 8).map((path) => (
            <button key={path} onClick={() => onOpen(path)} className="w-full px-3 py-2 rounded-lg bg-[#181d26] border border-[#222a38] hover:border-teal-500/40 text-left">
              <div className="text-xs font-semibold text-slate-100">{folderName(path)}</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">{path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);
