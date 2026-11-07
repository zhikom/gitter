import express from 'express';
import cors from 'cors';
import { gitService } from './gitService';
import { aiService } from './aiService';
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
    const diffs = await gitService.getDiff(targetPath, file, staged);
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

app.listen(PORT, () => {
  console.log(`Gitter backend server running on http://localhost:${PORT}`);
});
