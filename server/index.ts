import express from 'express';
import cors from 'cors';
import { gitService } from './gitService';
import { aiService } from './aiService';
import { githubService } from './githubService';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper to sanitize path
const resolvePath = (p?: string): string => {
  return p ? path.resolve(p) : process.cwd();
};

// Repository State
app.get('/api/repo/state', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const state = await gitService.getRepoState(targetPath);
    res.json(state);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// File Statuses (Staged & Unstaged)
app.get('/api/repo/statuses', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const statuses = await gitService.getFileStatuses(targetPath);
    res.json(statuses);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Commits
app.get('/api/repo/commits', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const limit = parseInt(req.query.limit as string, 10) || 300;
    const commits = await gitService.getCommits(targetPath, limit);
    res.json(commits);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// File Diff
app.get('/api/repo/diff', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const file = req.query.file as string;
    const staged = req.query.staged === 'true';
    const ignoreWhitespace = req.query.ignoreWhitespace === 'true';
    const diffs = await gitService.getDiff(targetPath, file, staged, ignoreWhitespace);
    res.json(diffs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Commit Diff
app.get('/api/repo/commit-diff', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const hash = req.query.hash as string;
    const diffData = await gitService.getCommitDiff(targetPath, hash);
    res.json(diffData);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Staging actions
app.post('/api/repo/stage', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    await gitService.stageFile(resolvePath(repoPath), file);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/unstage', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    await gitService.unstageFile(resolvePath(repoPath), file);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/stage-all', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    await gitService.stageAll(resolvePath(repoPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/unstage-all', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    await gitService.unstageAll(resolvePath(repoPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/discard', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    await gitService.discardFile(resolvePath(repoPath), file);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/discard-all', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    await gitService.discardAll(resolvePath(repoPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Commit action
app.post('/api/repo/commit', async (req, res) => {
  try {
    const { path: repoPath, summary, description, amend } = req.body;
    const output = await gitService.commit(resolvePath(repoPath), summary, description, amend);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Branches
app.get('/api/repo/branches', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const branches = await gitService.getBranches(targetPath);
    res.json(branches);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/branch/create', async (req, res) => {
  try {
    const { path: repoPath, name, startPoint } = req.body;
    await gitService.createBranch(resolvePath(repoPath), name, startPoint);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/branch/checkout', async (req, res) => {
  try {
    const { path: repoPath, name } = req.body;
    await gitService.checkout(resolvePath(repoPath), name);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/branch/delete', async (req, res) => {
  try {
    const { path: repoPath, name, force } = req.body;
    await gitService.deleteBranch(resolvePath(repoPath), name, force);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/branch/rename', async (req, res) => {
  try {
    const { path: repoPath, oldName, newName } = req.body;
    await gitService.renameBranch(resolvePath(repoPath), oldName, newName);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/reveal', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    await gitService.revealInExplorer(resolvePath(repoPath), file);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/open-vscode', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    await gitService.openInVsCode(resolvePath(repoPath), file);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/open-terminal', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    await gitService.openInTerminal(resolvePath(repoPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/external-diff', async (req, res) => {
  try {
    const { path: repoPath, file, staged, customCmd } = req.body;
    await gitService.openExternalDiff(resolvePath(repoPath), file, staged, customCmd);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/repo/reflog', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const reflog = await gitService.getReflog(targetPath, limit);
    res.json(reflog);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/create-patch', async (req, res) => {
  try {
    const { path: repoPath, hash } = req.body;
    const patch = await gitService.createPatch(resolvePath(repoPath), hash);
    res.json({ success: true, patch });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Patch staging, unstaging, and discarding for line/hunk operations
app.post('/api/repo/patch/stage', async (req, res) => {
  try {
    const { path: repoPath, patch } = req.body;
    await gitService.stagePatch(resolvePath(repoPath), patch);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/patch/unstage', async (req, res) => {
  try {
    const { path: repoPath, patch } = req.body;
    await gitService.unstagePatch(resolvePath(repoPath), patch);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/patch/discard', async (req, res) => {
  try {
    const { path: repoPath, patch } = req.body;
    await gitService.discardPatch(resolvePath(repoPath), patch);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Commit Comparison / Range Diff
app.get('/api/repo/compare', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const base = req.query.base as string;
    const target = req.query.target as string;
    const comparison = await gitService.compareCommits(targetPath, base, target);
    res.json(comparison);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/repo/compare/file', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const base = req.query.base as string;
    const target = req.query.target as string;
    const file = req.query.file as string;
    const diff = await gitService.getComparisonFileDiff(targetPath, base, target, file);
    res.json(diff);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// File content at git ref (:1:, :2:, :3:, HEAD:)
app.get('/api/repo/file/ref', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const ref = req.query.ref as string;
    const file = req.query.file as string;
    const content = await gitService.getFileAtRef(targetPath, ref, file);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Save manual conflict resolution
app.post('/api/repo/conflict/resolve-manual', async (req, res) => {
  try {
    const { path: repoPath, file, content, stage } = req.body;
    await gitService.saveConflictResolution(resolvePath(repoPath), file, content, stage !== false);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 1-Click Undo last action
app.post('/api/repo/undo', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    const result = await gitService.undoLastAction(resolvePath(repoPath));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Virtual Branches (GitButler Innovation)
app.get('/api/repo/virtual-branches', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const branches = await gitService.getVirtualBranches(targetPath);
    res.json(branches);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/virtual-branches', async (req, res) => {
  try {
    const { path: repoPath, branches } = req.body;
    await gitService.saveVirtualBranches(resolvePath(repoPath), branches);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/virtual-branch/commit', async (req, res) => {
  try {
    const { path: repoPath, payload } = req.body;
    const result = await gitService.commitVirtualBranch(resolvePath(repoPath), payload);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/virtual-branch/stash', async (req, res) => {
  try {
    const { path: repoPath, files } = req.body;
    const patch = await gitService.stashVirtualBranch(resolvePath(repoPath), files);
    res.json({ success: true, patch });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/virtual-branch/apply', async (req, res) => {
  try {
    const { path: repoPath, patch } = req.body;
    await gitService.stagePatch(resolvePath(repoPath), patch);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Shelve & Unshelve (JetBrains Source Control)
app.get('/api/repo/shelves', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const shelves = await gitService.getShelves(targetPath);
    res.json(shelves);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/shelves', async (req, res) => {
  try {
    const { path: repoPath, name, files, keepWorkingChanges } = req.body;
    const shelf = await gitService.shelve(resolvePath(repoPath), name, files, keepWorkingChanges);
    res.json(shelf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/shelve/unshelve', async (req, res) => {
  try {
    const { path: repoPath, shelfId, deleteAfter } = req.body;
    await gitService.unshelve(resolvePath(repoPath), shelfId, deleteAfter);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/shelve/delete', async (req, res) => {
  try {
    const { path: repoPath, shelfId } = req.body;
    await gitService.deleteShelf(resolvePath(repoPath), shelfId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stash Inspector (Preview stash contents and file diffs)
app.get('/api/repo/stash/inspect', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const data = await gitService.getStashFiles(targetPath, index);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/repo/stash/inspect/diff', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const index = req.query.index ? parseInt(req.query.index as string, 10) : 0;
    const file = req.query.file as string;
    const diff = await gitService.getStashFileDiff(targetPath, index, file);
    res.json(diff);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// File Commit Diff (for File History Timeline)
app.get('/api/repo/file-history/diff', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const hash = req.query.hash as string;
    const file = req.query.file as string;
    const diff = await gitService.getFileCommitDiff(targetPath, hash, file);
    res.json(diff);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Remotes & Network (Fetch, Pull, Push)
app.get('/api/repo/remotes', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const remotes = await gitService.getRemotes(targetPath);
    res.json(remotes);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/fetch', async (req, res) => {
  try {
    const { path: repoPath, remote } = req.body;
    const output = await gitService.fetch(resolvePath(repoPath), remote);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/pull', async (req, res) => {
  try {
    const { path: repoPath, remote, branch, rebase } = req.body;
    const output = await gitService.pull(resolvePath(repoPath), remote, branch, rebase);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/push', async (req, res) => {
  try {
    const { path: repoPath, remote, branch, forceWithLease } = req.body;
    const output = await gitService.push(resolvePath(repoPath), remote, branch, forceWithLease);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stashes
app.get('/api/repo/stashes', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const stashes = await gitService.getStashes(targetPath);
    res.json(stashes);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/stash/save', async (req, res) => {
  try {
    const { path: repoPath, message, includeUntracked } = req.body;
    await gitService.saveStash(resolvePath(repoPath), message, includeUntracked);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/stash/pop', async (req, res) => {
  try {
    const { path: repoPath, index } = req.body;
    await gitService.popStash(resolvePath(repoPath), index);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/stash/apply', async (req, res) => {
  try {
    const { path: repoPath, index } = req.body;
    const output = await gitService.applyStash(resolvePath(repoPath), index);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/stash/drop', async (req, res) => {
  try {
    const { path: repoPath, index } = req.body;
    await gitService.dropStash(resolvePath(repoPath), index);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Tags
app.get('/api/repo/tags', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const tags = await gitService.getTags(targetPath);
    res.json(tags);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/tag/create', async (req, res) => {
  try {
    const { path: repoPath, name, commitHash, message } = req.body;
    await gitService.createTag(resolvePath(repoPath), name, commitHash, message);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/tag/delete', async (req, res) => {
  try {
    const { path: repoPath, name } = req.body;
    await gitService.deleteTag(resolvePath(repoPath), name);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/tag/push', async (req, res) => {
  try {
    const { path: repoPath, remote, tag } = req.body;
    const output = await gitService.pushTag(resolvePath(repoPath), remote || 'origin', tag);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// History Actions (Revert, Reset, Cherry-Pick, Merge, Rebase)
app.post('/api/repo/revert', async (req, res) => {
  try {
    const { path: repoPath, hash } = req.body;
    await gitService.revert(resolvePath(repoPath), hash);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/reset', async (req, res) => {
  try {
    const { path: repoPath, hash, mode } = req.body;
    await gitService.reset(resolvePath(repoPath), hash, mode);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/cherry-pick', async (req, res) => {
  try {
    const { path: repoPath, hash } = req.body;
    await gitService.cherryPick(resolvePath(repoPath), hash);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/merge', async (req, res) => {
  try {
    const { path: repoPath, branch } = req.body;
    const output = await gitService.merge(resolvePath(repoPath), branch);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/rebase', async (req, res) => {
  try {
    const { path: repoPath, upstream } = req.body;
    const output = await gitService.rebase(resolvePath(repoPath), upstream);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Repository Init & Clone
app.post('/api/repo/init', async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    await gitService.initRepo(resolvePath(targetPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/clone', async (req, res) => {
  try {
    const { url, targetPath } = req.body;
    await gitService.cloneRepo(url, resolvePath(targetPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// File Blame & File History
app.get('/api/repo/blame', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const file = req.query.file as string;
    const blame = await gitService.getFileBlame(targetPath, file);
    res.json(blame);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/repo/file-history', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const file = req.query.file as string;
    const history = await gitService.getFileHistory(targetPath, file);
    res.json(history);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Worktrees
app.get('/api/repo/worktrees', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const worktrees = await gitService.getWorktrees(targetPath);
    res.json(worktrees);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/worktree/add', async (req, res) => {
  try {
    const { path: repoPath, targetPath, branch } = req.body;
    await gitService.addWorktree(resolvePath(repoPath), targetPath, branch);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/worktree/remove', async (req, res) => {
  try {
    const { path: repoPath, targetPath } = req.body;
    await gitService.removeWorktree(resolvePath(repoPath), targetPath);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Submodules
app.get('/api/repo/submodules', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const submodules = await gitService.getSubmodules(targetPath);
    res.json(submodules);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/submodule/update', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    const output = await gitService.updateSubmodules(resolvePath(repoPath));
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Interactive Rebase
app.get('/api/repo/rebase/commits', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const base = req.query.base as string;
    const rebaseCommits = await gitService.getRebaseCommits(targetPath, base);
    res.json(rebaseCommits);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/rebase/execute', async (req, res) => {
  try {
    const { path: repoPath, baseHash, plan } = req.body;
    const output = await gitService.executeRebasePlan(resolvePath(repoPath), baseHash, plan);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Git Config
app.get('/api/repo/config', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const config = await gitService.getGitConfig(targetPath);
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/config', async (req, res) => {
  try {
    const { path: repoPath, key, value } = req.body;
    await gitService.setGitConfig(resolvePath(repoPath), key, value);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// AI Endpoints
app.post('/api/ai/commit-message', async (req, res) => {
  try {
    const { diffText, stagedFiles } = req.body;
    const result = await aiService.generateCommitMessage(diffText || '', stagedFiles || []);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/explain', async (req, res) => {
  try {
    const { diffText, contextTitle } = req.body;
    const result = await aiService.explainChanges(diffText || '', contextTitle || 'Changes');
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/conflict-resolve', async (req, res) => {
  try {
    const { fileContent, filePath } = req.body;
    const result = await aiService.resolveConflict(fileContent || '', filePath || '');
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, repoContext } = req.body;
    const result = await aiService.chatWithAgent(message, repoContext || { branch: '', status: '', recentCommits: '' });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/config', (req, res) => {
  res.json(aiService.getConfig());
});

app.post('/api/ai/config', (req, res) => {
  aiService.setConfig(req.body);
  res.json(aiService.getConfig());
});

// GitHub Provider Endpoints
app.get('/api/github/status', async (req, res) => {
  try {
    const status = await githubService.getAuthStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/github/prs', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const state = (req.query.state as 'open' | 'closed' | 'all') || 'open';
    const prs = await githubService.getPullRequests(targetPath, state);
    res.json(prs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/github/pr-details', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const prNumber = parseInt(req.query.number as string, 10);
    const details = await githubService.getPullRequestDetails(targetPath, prNumber);
    res.json(details);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/github/pr/create', async (req, res) => {
  try {
    const { path: repoPath, title, body, head, base, isDraft } = req.body;
    const result = await githubService.createPullRequest(resolvePath(repoPath), title, body, head, base, isDraft);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/github/pr/checkout', async (req, res) => {
  try {
    const { path: repoPath, number: prNumber } = req.body;
    const output = await githubService.checkoutPullRequest(resolvePath(repoPath), prNumber);
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/pr-description', async (req, res) => {
  try {
    const { commits, diffSummary } = req.body;
    const result = await aiService.generatePrDescription(commits || [], diffSummary || '');
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// App Auto-Update & GitHub Releases Proxy
app.get('/api/app/check-update', async (req, res) => {
  try {
    const response = await fetch('https://api.github.com/repos/zhikom/gitter/releases/latest', {
      headers: {
        'User-Agent': 'Gitter-App',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `GitHub API error: ${response.statusText}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Scan folder for Git repositories
app.get('/api/repo/scan', async (req, res) => {
  try {
    const targetFolder = resolvePath(req.query.path as string);
    const repos = await gitService.scanRepositories(targetFolder);
    res.json(repos);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Native OS folder picker dialog
app.post('/api/dialog/pick-folder', async (req, res) => {
  try {
    const selectedPath = await gitService.pickNativeFolder();
    res.json({ path: selectedPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Per-Repository Configuration
app.get('/api/repo/config', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const config = await gitService.getRepoConfig(targetPath);
    res.json(config);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/config', async (req, res) => {
  try {
    const { path: repoPath, config } = req.body;
    await gitService.saveRepoConfig(resolvePath(repoPath), config);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Gitflow Integration Endpoints
app.get('/api/repo/gitflow', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const status = await gitService.getGitflowStatus(targetPath);
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/gitflow/init', async (req, res) => {
  try {
    const { path: repoPath, config } = req.body;
    await gitService.gitflowInit(resolvePath(repoPath), config);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/gitflow/start', async (req, res) => {
  try {
    const { path: repoPath, type, name } = req.body;
    const branch = await gitService.gitflowStart(resolvePath(repoPath), type, name);
    res.json({ success: true, branch });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/gitflow/finish', async (req, res) => {
  try {
    const { path: repoPath, type, name } = req.body;
    const result = await gitService.gitflowFinish(resolvePath(repoPath), type, name);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gitter backend server running on http://localhost:${PORT}`);
});
