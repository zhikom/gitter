import express from 'express';
import cors from 'cors';
import { gitService } from './gitService';
import { aiService } from './aiService';
import { githubService } from './githubService';
import * as os from './osIntegration';
import { downloadAndInstall, fetchLatestRelease } from './appUpdate';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';
import { fileURLToPath } from 'url';

// The desktop app starts this backend with --desktop: loopback only, a free
// port, a per-launch token the app hands to its webview, and exit when the app
// (--parent-pid) does. Without it, the backend serves the dev UI on port 3001.
const desktop = process.argv.includes('--desktop');
const parentPid = Number(process.argv.find((a) => a.startsWith('--parent-pid='))?.split('=')[1]) || 0;
const token = desktop ? crypto.randomBytes(24).toString('hex') : undefined;

const app = express();

// Chromium-based webviews (WebView2, Edge) ask before a page reaches a loopback
// address (Private Network Access); this header answers yes on the preflight.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors({ origin: true, credentials: true, allowedHeaders: ['Content-Type', 'X-Gitter-Token'] }));

if (token) {
  // EventSource cannot send headers, so the token may also come as ?token=.
  app.use('/api', (req, res, next) => {
    if (req.get('x-gitter-token') === token || req.query.token === token) return next();
    res.status(401).json({ error: 'Missing or invalid Gitter token.' });
  });
}

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
    const root = resolvePath(repoPath);
    await os.revealInFileManager(file ? path.join(root, file) : root);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/open-vscode', async (req, res) => {
  try {
    const { path: repoPath, file } = req.body;
    const root = resolvePath(repoPath);
    await os.openInEditor(file ? path.join(root, file) : root);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/open-terminal', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    await os.openTerminal(resolvePath(repoPath));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/repo/external-diff', async (req, res) => {
  try {
    const { path: repoPath, file, staged, customCmd } = req.body;
    const root = resolvePath(repoPath);
    const baseFile = await gitService.exportBaseVersion(root, file, Boolean(staged));
    await os.openDiffTool(baseFile, path.join(root, file), customCmd);
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
    const { path: repoPath, message, includeUntracked, files, keepWorkingChanges } = req.body;
    await gitService.saveStash(
      resolvePath(repoPath),
      message,
      includeUntracked,
      Array.isArray(files) ? files.map(String) : undefined,
      Boolean(keepWorkingChanges)
    );
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
    res.json(await fetchLatestRelease());
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
    const { title, startIn } = req.body ?? {};
    res.json({ path: await os.pickFolder(title, startIn) });
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

// Multi-Agent Fleet Orchestrator & Collision Radar Endpoints
app.get('/api/agent-fleet', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const fleet = await gitService.getAgentFleet(targetPath);
    res.json(fleet);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agent-activity', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    res.json(await gitService.getAgentActivity(targetPath));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/register', async (req, res) => {
  try {
    const { path: repoPath, agent } = req.body;
    const result = await gitService.registerAgent(resolvePath(repoPath), agent);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/spawn-worktree', async (req, res) => {
  try {
    const { path: repoPath, harness, taskName, baseBranch } = req.body;
    const result = await gitService.spawnAgentWorktree(resolvePath(repoPath), harness, taskName, baseBranch);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/claim', async (req, res) => {
  try {
    const { path: repoPath, agentId, files } = req.body;
    const result = await gitService.claimAgentFiles(resolvePath(repoPath), agentId, files);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/release', async (req, res) => {
  try {
    const { path: repoPath, agentId, removeWorktree } = req.body;
    await gitService.releaseAgent(resolvePath(repoPath), agentId, removeWorktree);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/clear-lock', async (req, res) => {
  try {
    const { path: repoPath } = req.body;
    const cleared = await gitService.clearGitIndexLock(resolvePath(repoPath));
    res.json({ success: true, cleared });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Agent Review Inbox, checkpoints, hunk review, and the live event stream
app.get('/api/agent-review', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    res.json(await gitService.getAgentReview(targetPath));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agent-review/diff', async (req, res) => {
  try {
    const targetPath = resolvePath(req.query.path as string);
    const agentId = req.query.agentId as string;
    const file = (req.query.file as string) || undefined;
    res.json(await gitService.getAgentReviewDiff(targetPath, agentId, file));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/checkpoint', async (req, res) => {
  try {
    const { path: repoPath, agentId, label } = req.body;
    res.json(await gitService.checkpointAgent(resolvePath(repoPath), agentId, label));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/rollback', async (req, res) => {
  try {
    const { path: repoPath, agentId, checkpointId } = req.body;
    res.json(await gitService.rollbackAgent(resolvePath(repoPath), agentId, checkpointId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/approve', async (req, res) => {
  try {
    const { path: repoPath, agentId, message, mode } = req.body;
    res.json(await gitService.approveAgentChanges(resolvePath(repoPath), agentId, message || '', mode === 'merge' ? 'merge' : 'commit'));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/request-changes', async (req, res) => {
  try {
    const { path: repoPath, agentId, feedback } = req.body;
    res.json(await gitService.requestAgentChanges(resolvePath(repoPath), agentId, feedback || ''));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/discard', async (req, res) => {
  try {
    const { path: repoPath, agentId } = req.body;
    res.json(await gitService.discardAgentChanges(resolvePath(repoPath), agentId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-review/hunk', async (req, res) => {
  try {
    const { path: repoPath, agentId, patch, action } = req.body;
    if (action !== 'reject') {
      return res.json(await gitService.getAgentReviewDiff(resolvePath(repoPath), agentId));
    }
    res.json(await gitService.rejectAgentHunk(resolvePath(repoPath), agentId, patch || ''));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agent-fleet/run-command', async (req, res) => {
  try {
    const { path: repoPath, command } = req.body;
    res.json(await gitService.runAgentCommand(resolvePath(repoPath), command || ''));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Server-Sent Events: pushes fleet + review state whenever it changes.
app.get('/api/agent-events', async (req, res) => {
  const targetPath = resolvePath(req.query.path as string);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let lastPayload = '';
  let ticks = 0;

  const send = async () => {
    try {
      const snapshot = await gitService.getAgentReviewSnapshot(targetPath);
      const payload = JSON.stringify({ type: 'state', ...snapshot });
      if (payload !== lastPayload) {
        lastPayload = payload;
        res.write(`data: ${payload}\n\n`);
      } else if (++ticks % 6 === 0) {
        res.write(': keep-alive\n\n');
      }
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    }
  };

  await send();
  const timer = setInterval(send, 2500);
  req.on('close', () => clearInterval(timer));
});

app.post('/api/app/install-update', async (req, res) => {
  try {
    const installerPath = await downloadAndInstall(String(req.body.downloadUrl ?? ''));
    res.json({ installerPath });
    // The installer replaces this executable; exit so the file is not in use.
    if (desktop) setTimeout(() => process.exit(0), 500);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// OS Native URL Opener (Bypasses sandboxed webview restrictions)
app.post('/api/open-url', async (req, res) => {
  try {
    await os.openUrl(String(req.body.url ?? ''));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Running from source after `npm run build`, the backend also serves the UI.
// The desktop app bundles the UI itself and never has a dist folder here.
const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const servesUi = !desktop && fs.existsSync(path.join(distPath, 'index.html'));

// Catch unhandled /api calls to prevent falling into the SPA HTML fallback
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

if (servesUi) {
  app.use(express.static(distPath));
  // Client-side SPA routing fallback for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(desktop ? 0 : Number(process.env.PORT) || 3001, desktop ? '127.0.0.1' : '0.0.0.0', () => {
  const { port } = server.address() as AddressInfo;
  // The desktop app reads this line to learn where to point its webview.
  if (desktop) console.log(`GITTER_READY ${JSON.stringify({ port, token })}`);
  else console.log(`Gitter backend listening on http://localhost:${port}`);
});

if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 2000);
}
