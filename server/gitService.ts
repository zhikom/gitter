import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  BlameLine,
  Branch,
  Commit,
  FileCommitHistory,
  FileDiff,
  FileStatus,
  GitConfig,
  GitFileState,
  RebaseCommitItem,
  Remote,
  RepositoryState,
  Stash,
  Submodule,
  Tag,
  Worktree,
} from '../src/types/git';
import {
  AgentActivityEvent,
  AgentActivityState,
  AgentFileChange,
  AgentFileOwnership,
  AgentFleetState,
  AgentHarness,
  AgentInstance,
} from '../src/types/agentFleet';
import {
  AgentAttentionItem,
  AgentCheckpoint,
  AgentDiffResponse,
  AgentReviewItem,
  AgentReviewSnapshot,
  AgentReviewState,
  AgentReviewStatus,
} from '../src/types/agentReview';
import { parseGitDiff } from '../src/utils/diffParser';
import { AGENT_BRANCH_PREFIX, HARNESS_REGISTRY, detectCollisions, harnessColor, harnessFromBranch } from '../src/utils/agentFleet';

const execAsync = promisify(exec);

// The UI polls status, diffs and the agent fleet every few seconds. Without this,
// each `git status` briefly takes .git/index.lock and can make a concurrent
// write (stash, commit, checkout) fail with "index.lock: File exists".
// Only optional locks are skipped; operations that write still lock as usual.
process.env.GIT_OPTIONAL_LOCKS = '0';


interface AgentReviewStoreEntry {
  status?: AgentReviewStatus;
  feedback?: string;
  updatedAt: number;
  checkpoint?: AgentCheckpoint;
}

type AgentReviewStore = Record<string, AgentReviewStoreEntry>;

// "added\tdeleted\tpath" from `git diff --numstat`; binary files report "-" and count as 0.
function parseNumstatLine(line: string): AgentFileChange | null {
  const [adds, dels, ...rest] = line.split('\t');
  const filePath = rest.join('\t').trim();
  if (!filePath) return null;
  return {
    path: filePath,
    additions: Number(adds) || 0,
    deletions: Number(dels) || 0,
    status: 'M',
  };
}

// Split a command line into arguments, honouring single and double quotes.
function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) tokens.push(current);
      current = '';
      hasToken = false;
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (quote) throw new Error('Unterminated quote in command.');
  if (hasToken) tokens.push(current);
  return tokens;
}

export class GitService {
  async runGit(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${args.join(' ')}`, {
        cwd,
        maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large diffs and logs
        windowsHide: true,
      });
      return stdout;
    } catch (error: any) {
      const stderr = error.stderr || error.message || '';
      throw new Error(stderr.trim() || error.message);
    }
  }

  async runGitRaw(rawCommand: string, cwd: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${rawCommand}`, {
        cwd,
        maxBuffer: 100 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout;
    } catch (error: any) {
      const stderr = error.stderr || error.message || '';
      throw new Error(stderr.trim() || error.message);
    }
  }

  async isGitRepo(targetPath: string): Promise<boolean> {
    try {
      await this.runGit(['rev-parse', '--is-inside-work-tree'], targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async getRepoRoot(targetPath: string): Promise<string> {
    const out = await this.runGit(['rev-parse', '--show-toplevel'], targetPath);
    return out.trim().replace(/\\/g, '/');
  }

  async getRepoState(repoPath: string): Promise<RepositoryState> {
    const root = await this.getRepoRoot(repoPath);
    const repoName = path.basename(root);

    // Current branch or detached HEAD
    let currentBranch = 'HEAD';
    let isDetached = false;
    try {
      const branchOut = await this.runGit(['branch', '--show-current'], root);
      currentBranch = branchOut.trim();
      if (!currentBranch) {
        // Detached head
        const headSha = await this.runGit(['rev-parse', '--short', 'HEAD'], root);
        currentBranch = `HEAD (${headSha.trim()})`;
        isDetached = true;
      }
    } catch {
      currentBranch = 'main';
    }

    // Git Status
    const statusOut = await this.runGit(['status', '--porcelain=v1', '-uall'], root);
    const lines = statusOut.split('\n').filter(l => l.trim().length > 0);

    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;
    let conflictedCount = 0;

    for (const line of lines) {
      const x = line[0];
      const y = line[1];

      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        conflictedCount++;
      } else {
        if (x !== ' ' && x !== '?') stagedCount++;
        if (y !== ' ' && y !== '?') unstagedCount++;
        if (x === '?' && y === '?') untrackedCount++;
      }
    }

    const isClean = stagedCount === 0 && unstagedCount === 0 && untrackedCount === 0 && conflictedCount === 0;

    // Check if rebase / merge in progress
    const gitDir = path.join(root, '.git');
    const isRebasing = fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'));
    const isMerging = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));

    return {
      path: root,
      name: repoName,
      currentBranch,
      isDetached,
      isClean,
      stagedCount,
      unstagedCount,
      untrackedCount,
      conflictedCount,
      isRebasing,
      isMerging,
    };
  }

  async getFileStatuses(repoPath: string): Promise<FileStatus[]> {
    const out = await this.runGit(['status', '--porcelain=v1', '-uall'], repoPath);
    const lines = out.split('\n').filter(l => l.length >= 3);
    const statuses: FileStatus[] = [];

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const rawPath = line.substring(3).trim();

      let filePath = rawPath;
      let oldPath: string | undefined;

      if (rawPath.includes(' -> ')) {
        const parts = rawPath.split(' -> ');
        oldPath = parts[0].replace(/^"|"$/g, '');
        filePath = parts[1].replace(/^"|"$/g, '');
      } else {
        filePath = rawPath.replace(/^"|"$/g, '');
      }

      // Staged entry if X has a change
      if (x !== ' ' && x !== '?') {
        let status: GitFileState = 'modified';
        if (x === 'A') status = 'added';
        else if (x === 'D') status = 'deleted';
        else if (x === 'R') status = 'renamed';
        else if (x === 'U') status = 'conflicted';

        statuses.push({
          path: filePath,
          oldPath,
          status,
          staged: true,
        });
      }

      // Unstaged entry if Y has a change
      if (y !== ' ') {
        let status: GitFileState = 'modified';
        if (y === '?') status = 'untracked';
        else if (y === 'D') status = 'deleted';
        else if (y === 'A') status = 'added';
        else if (y === 'U') status = 'conflicted';

        statuses.push({
          path: filePath,
          oldPath,
          status,
          staged: false,
        });
      }
    }

    return statuses;
  }

  async getCommits(repoPath: string, limit: number = 300): Promise<Commit[]> {
    try {
      // Record separator: 0x1e (ascii 30), Field separator: 0x1f (ascii 31)
      const format = '%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%at%x1f%s%x1f%b%x1f%D%x1e';
      const out = await this.runGitRaw(
        `log --all --topo-order -n ${limit} --pretty=format:"${format}" --date=iso`,
        repoPath
      );

      const records = out.split('\x1e').filter(r => r.trim().length > 0);
      const commits: Commit[] = [];

      for (const rec of records) {
        const fields = rec.split('\x1f');
        if (fields.length < 9) continue;

        const hash = fields[0].trim();
        const shortHash = fields[1].trim();
        const parents = fields[2].trim() ? fields[2].trim().split(' ') : [];
        const authorName = fields[3].trim();
        const authorEmail = fields[4].trim();
        const date = fields[5].trim();
        const timestamp = parseInt(fields[6].trim(), 10) * 1000 || Date.now();
        const summary = fields[7].trim();
        const body = fields[8].trim();
        const rawRefs = fields[9] ? fields[9].trim() : '';

        const refs: string[] = [];
        if (rawRefs) {
          rawRefs.split(',').forEach(r => {
            const clean = r.trim();
            if (clean) refs.push(clean);
          });
        }

        commits.push({
          hash,
          shortHash,
          parents,
          author: { name: authorName, email: authorEmail },
          date,
          timestamp,
          summary,
          body,
          message: body ? `${summary}\n\n${body}` : summary,
          refs,
        });
      }

      return commits;
    } catch (e: any) {
      console.error('Error fetching commits:', e);
      return [];
    }
  }

  async getDiff(repoPath: string, filePath: string, staged: boolean = false, ignoreWhitespace: boolean = false): Promise<FileDiff[]> {
    try {
      const wsFlag = ignoreWhitespace ? '-w' : '';
      if (staged) {
        const out = await this.runGitRaw(`diff --cached ${wsFlag} -- "${filePath}"`, repoPath);
        return parseGitDiff(out);
      } else {
        // First check if file is untracked
        const statuses = await this.getFileStatuses(repoPath);
        const isUntracked = statuses.some(s => s.path === filePath && s.status === 'untracked');

        if (isUntracked) {
          // Untracked file: generate a synthetic diff
          const fullPath = path.join(repoPath, filePath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            const hunkLines = lines.map((text, idx) => `+${text}`).join('\n');
            const syntheticDiff = [
              `diff --git a/${filePath} b/${filePath}`,
              `new file mode 100644`,
              `--- /dev/null`,
              `+++ b/${filePath}`,
              `@@ -0,0 +1,${lines.length} @@`,
              hunkLines,
            ].join('\n');
            return parseGitDiff(syntheticDiff);
          }
        }

        const out = await this.runGitRaw(`diff ${wsFlag} -- "${filePath}"`, repoPath);
        return parseGitDiff(out);
      }
    } catch (e: any) {
      console.error('Diff error:', e);
      return [];
    }
  }

  async getCommitDiff(repoPath: string, commitHash: string): Promise<{ files: string[]; rawDiff: string }> {
    const rawDiff = await this.runGitRaw(`show --patch ${commitHash}`, repoPath);
    const filesOut = await this.runGitRaw(`show --name-only --format="" ${commitHash}`, repoPath);
    const files = filesOut.split('\n').map(f => f.trim()).filter(Boolean);
    return { files, rawDiff };
  }

  async stageFile(repoPath: string, filePath: string): Promise<void> {
    await this.runGitRaw(`add -- "${filePath}"`, repoPath);
  }

  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    await this.runGitRaw(`restore --staged -- "${filePath}"`, repoPath);
  }

  async stageAll(repoPath: string): Promise<void> {
    await this.runGitRaw('add -A', repoPath);
  }

  async unstageAll(repoPath: string): Promise<void> {
    await this.runGitRaw('reset', repoPath);
  }

  async discardFile(repoPath: string, filePath: string): Promise<void> {
    const fullPath = path.join(repoPath, filePath);
    // Check if untracked
    const statuses = await this.getFileStatuses(repoPath);
    const isUntracked = statuses.some(s => s.path === filePath && s.status === 'untracked');

    if (isUntracked) {
      if (fs.existsSync(fullPath)) {
        if (fs.lstatSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    } else {
      await this.runGitRaw(`restore -- "${filePath}"`, repoPath);
    }
  }

  async discardAll(repoPath: string): Promise<void> {
    await this.runGitRaw('restore .', repoPath);
    await this.runGitRaw('clean -fd', repoPath);
  }

  async commit(repoPath: string, summary: string, description: string = '', amend: boolean = false): Promise<string> {
    const escapedSummary = summary.replace(/"/g, '\\"');
    const escapedDesc = description.replace(/"/g, '\\"');
    let cmd = `commit -m "${escapedSummary}"`;
    if (description.trim()) {
      cmd += ` -m "${escapedDesc}"`;
    }
    if (amend) {
      cmd += ' --amend';
    }
    return await this.runGitRaw(cmd, repoPath);
  }

  async getBranches(repoPath: string): Promise<Branch[]> {
    const out = await this.runGitRaw('branch -a -vv --format="%(refname:short)|||%(HEAD)|||%(upstream:short)|||%(upstream:track)|||%(objectname:short)"', repoPath);
    const lines = out.split('\n').filter(l => l.trim().length > 0);
    const branches: Branch[] = [];

    for (const line of lines) {
      const parts = line.split('|||');
      if (parts.length < 5) continue;

      const rawName = parts[0].trim();
      const isCurrent = parts[1].trim() === '*';
      const upstream = parts[2].trim() || undefined;
      const track = parts[3].trim();
      const targetHash = parts[4].trim();

      let cleanName = rawName;
      let isRemote = false;
      let remoteName: string | undefined;

      if (rawName.startsWith('remotes/')) {
        cleanName = rawName.replace('remotes/', '');
        isRemote = true;
        remoteName = cleanName.split('/')[0];
      } else if (rawName.startsWith('origin/')) {
        isRemote = true;
        remoteName = 'origin';
      }

      let ahead = 0;
      let behind = 0;

      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }

      branches.push({
        name: cleanName,
        current: isCurrent,
        isRemote,
        remoteName,
        upstream,
        ahead,
        behind,
        targetHash,
      });
    }

    return branches;
  }

  async createBranch(repoPath: string, branchName: string, startPoint: string = 'HEAD'): Promise<void> {
    await this.runGitRaw(`branch "${branchName}" ${startPoint}`, repoPath);
  }

  async checkout(repoPath: string, target: string): Promise<void> {
    await this.runGitRaw(`checkout "${target}"`, repoPath);
  }

  async deleteBranch(repoPath: string, branchName: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.runGitRaw(`branch ${flag} "${branchName}"`, repoPath);
  }

  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    await this.runGitRaw(`branch -m "${oldName}" "${newName}"`, repoPath);
  }

  async revealInExplorer(repoPath: string, filePath?: string): Promise<void> {
    const target = filePath ? path.join(repoPath, filePath) : repoPath;
    if (process.platform === 'win32') {
      execAsync(`explorer /select,"${target.replace(/\//g, '\\')}"`).catch(() => {
        execAsync(`explorer "${target.replace(/\//g, '\\')}"`).catch(() => {});
      });
    } else if (process.platform === 'darwin') {
      execAsync(`open -R "${target}"`).catch(() => {});
    } else {
      execAsync(`xdg-open "${path.dirname(target)}"`).catch(() => {});
    }
  }

  async openInVsCode(repoPath: string, filePath?: string): Promise<void> {
    const target = filePath ? path.join(repoPath, filePath) : repoPath;
    try {
      await execAsync(`code "${target}"`);
    } catch {
      try {
        await execAsync(`cursor "${target}"`);
      } catch {
        await execAsync(`windsurf "${target}"`).catch(() => {});
      }
    }
  }

  async openInTerminal(repoPath: string): Promise<void> {
    if (process.platform === 'win32') {
      execAsync(`start powershell -NoExit -Command "Set-Location -LiteralPath '${repoPath.replace(/'/g, "''")}'"`).catch(() => {});
    } else if (process.platform === 'darwin') {
      execAsync(`open -a Terminal "${repoPath}"`).catch(() => {});
    } else {
      execAsync(`x-terminal-emulator --working-directory="${repoPath}"`).catch(() => {});
    }
  }

  async openExternalDiff(repoPath: string, filePath: string, staged: boolean = false, customDiffCmd?: string): Promise<void> {
    const fullPath = path.join(repoPath, filePath);
    const tempDir = os.tmpdir();
    const baseName = path.basename(filePath);
    const tempFile = path.join(tempDir, `gitter-diff-${staged ? 'HEAD' : 'INDEX'}-${Date.now()}-${baseName}`);

    try {
      const gitRef = staged ? `HEAD:${filePath}` : `:${filePath}`;
      const baseContent = await this.runGitRaw(`show ${gitRef}`, repoPath);
      fs.writeFileSync(tempFile, baseContent, 'utf8');
    } catch {
      fs.writeFileSync(tempFile, '', 'utf8');
    }

    if (customDiffCmd && customDiffCmd.trim()) {
      const cmd = customDiffCmd.replace('%1', `"${tempFile}"`).replace('%2', `"${fullPath}"`);
      await execAsync(cmd).catch(() => {});
      return;
    }

    try {
      await execAsync(`code --diff "${tempFile}" "${fullPath}"`);
    } catch {
      if (process.platform === 'win32') {
        execAsync(`WinMergeU "${tempFile}" "${fullPath}"`).catch(() => {
          execAsync(`bcomp "${tempFile}" "${fullPath}"`).catch(() => {});
        });
      } else {
        execAsync(`meld "${tempFile}" "${fullPath}"`).catch(() => {});
      }
    }
  }

  async getReflog(repoPath: string, limit = 50): Promise<Array<{ hash: string; selector: string; action: string; message: string; date: string }>> {
    const out = await this.runGitRaw(`reflog -n ${limit} --format="%H|||%gD|||%gs|||%ci"`, repoPath);
    const lines = out.split('\n').filter(Boolean);
    return lines.map((l) => {
      const p = l.split('|||');
      return {
        hash: p[0]?.trim() || '',
        selector: p[1]?.trim() || '',
        action: p[2]?.trim() || '',
        message: p[2]?.trim() || '',
        date: p[3]?.trim() || '',
      };
    });
  }

  async createPatch(repoPath: string, commitHash: string): Promise<string> {
    return await this.runGitRaw(`format-patch -1 ${commitHash} --stdout`, repoPath);
  }

  async getRemotes(repoPath: string): Promise<Remote[]> {
    const out = await this.runGitRaw('remote -v', repoPath);
    const lines = out.split('\n').filter(Boolean);
    const map = new Map<string, { fetch: string; push: string }>();

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const name = parts[0];
        const url = parts[1];
        const type = parts[2];
        const current = map.get(name) || { fetch: '', push: '' };
        if (type.includes('fetch')) current.fetch = url;
        if (type.includes('push')) current.push = url;
        map.set(name, current);
      }
    }

    const remotes: Remote[] = [];
    for (const [name, urls] of map.entries()) {
      remotes.push({
        name,
        fetchUrl: urls.fetch,
        pushUrl: urls.push,
      });
    }
    return remotes;
  }

  async fetch(repoPath: string, remote: string = 'origin'): Promise<string> {
    return await this.runGitRaw(`fetch ${remote}`, repoPath);
  }

  async pull(repoPath: string, remote: string = 'origin', branch: string = '', rebase: boolean = false): Promise<string> {
    const flag = rebase ? '--rebase' : '';
    return await this.runGitRaw(`pull ${flag} ${remote} ${branch}`.trim(), repoPath);
  }

  async push(repoPath: string, remote: string = 'origin', branch: string = '', forceWithLease: boolean = false): Promise<string> {
    const flag = forceWithLease ? '--force-with-lease' : '';
    return await this.runGitRaw(`push ${flag} ${remote} ${branch}`.trim(), repoPath);
  }

  async getStashes(repoPath: string): Promise<Stash[]> {
    const out = await this.runGitRaw('stash list --format="%gd|||%gs|||%H|||%ci"', repoPath);
    const lines = out.split('\n').filter(Boolean);
    const stashes: Stash[] = [];

    lines.forEach((l, idx) => {
      const p = l.split('|||');
      if (p.length >= 4) {
        stashes.push({
          index: idx,
          name: p[0].trim(),
          message: p[1].trim(),
          hash: p[2].trim(),
          date: p[3].trim(),
        });
      }
    });

    return stashes;
  }

  async saveStash(
    repoPath: string,
    message: string = '',
    includeUntracked: boolean = true,
    files?: string[],
    keepWorkingChanges: boolean = false
  ): Promise<void> {
    // Arguments go to git without a shell, so messages and paths need no quoting.
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);
    if (files && files.length > 0) args.push('--', ...files);
    await this.waitForIndexLock(repoPath);
    await this.runGitWithStdin(args, '', repoPath);
    if (keepWorkingChanges) {
      // Snapshot only: restore the stashed changes (and staged state) right away.
      await this.waitForIndexLock(repoPath);
      try {
        await this.runGitWithStdin(['stash', 'apply', '--index', 'stash@{0}'], '', repoPath);
      } catch (e: any) {
        throw new Error(
          `Stash saved, but restoring the working tree failed: ${e.message}\nYour changes are safe in stash@{0}; apply it to get them back.`
        );
      }
    }
  }

  // Another git process (an IDE, a terminal, an agent) may briefly hold the index
  // lock. Wait for it to clear rather than failing a two-step operation halfway.
  private async waitForIndexLock(repoPath: string, timeoutMs = 3000): Promise<void> {
    const lock = path.join(this.resolveGitDir(repoPath), 'index.lock');
    const deadline = Date.now() + timeoutMs;
    while (fs.existsSync(lock) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async popStash(repoPath: string, index: number = 0): Promise<void> {
    await this.runGitRaw(`stash pop stash@{${index}}`, repoPath);
  }

  async applyStash(repoPath: string, index: number = 0): Promise<string> {
    return await this.runGitRaw(`stash apply stash@{${index}}`, repoPath);
  }

  async dropStash(repoPath: string, index: number = 0): Promise<void> {
    await this.runGitRaw(`stash drop stash@{${index}}`, repoPath);
  }

  async getTags(repoPath: string): Promise<Tag[]> {
    const out = await this.runGitRaw('tag -l --format="%(refname:short)|||%(objectname:short)|||%(contents:subject)"', repoPath);
    const lines = out.split('\n').filter(Boolean);
    const tags: Tag[] = [];

    for (const line of lines) {
      const p = line.split('|||');
      if (p.length >= 2) {
        tags.push({
          name: p[0].trim(),
          targetHash: p[1].trim(),
          message: p[2]?.trim(),
        });
      }
    }
    return tags;
  }

  async createTag(repoPath: string, tagName: string, commitHash: string = 'HEAD', message?: string): Promise<void> {
    if (message) {
      await this.runGitRaw(`tag -a "${tagName}" ${commitHash} -m "${message.replace(/"/g, '\\"')}"`, repoPath);
    } else {
      await this.runGitRaw(`tag "${tagName}" ${commitHash}`, repoPath);
    }
  }

  async deleteTag(repoPath: string, tagName: string): Promise<void> {
    await this.runGitRaw(`tag -d "${tagName}"`, repoPath);
  }

  async pushTag(repoPath: string, remote: string = 'origin', tagName: string): Promise<string> {
    return await this.runGitRaw(`push "${remote}" "${tagName}"`, repoPath);
  }

  async revert(repoPath: string, commitHash: string): Promise<void> {
    await this.runGitRaw(`revert --no-edit ${commitHash}`, repoPath);
  }

  async reset(repoPath: string, commitHash: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
    await this.runGitRaw(`reset --${mode} ${commitHash}`, repoPath);
  }

  async cherryPick(repoPath: string, commitHash: string): Promise<void> {
    await this.runGitRaw(`cherry-pick ${commitHash}`, repoPath);
  }

  async merge(repoPath: string, branchName: string): Promise<string> {
    return await this.runGitRaw(`merge "${branchName}"`, repoPath);
  }

  async rebase(repoPath: string, upstream: string): Promise<string> {
    return await this.runGitRaw(`rebase "${upstream}"`, repoPath);
  }

  async initRepo(targetPath: string): Promise<void> {
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    await this.runGitRaw('init', targetPath);
  }

  async cloneRepo(url: string, targetPath: string): Promise<void> {
    await execAsync(`git clone "${url}" "${targetPath}"`);
  }

  // File Blame with Heatmap
  async getFileBlame(repoPath: string, filePath: string): Promise<BlameLine[]> {
    try {
      const out = await this.runGitRaw(`blame --line-porcelain -- "${filePath}"`, repoPath);
      const lines = out.split('\n');
      const blameResults: BlameLine[] = [];

      let currentCommit = '';
      let currentAuthor = '';
      let currentSummary = '';
      let currentTimestamp = 0;
      let lineNumber = 1;

      const timestamps: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^[0-9a-f]{40}\s+\d+\s+(\d+)/)) {
          const parts = line.split(' ');
          currentCommit = parts[0];
          lineNumber = parseInt(parts[2], 10);
        } else if (line.startsWith('author ')) {
          currentAuthor = line.slice(7).trim();
        } else if (line.startsWith('author-time ')) {
          currentTimestamp = parseInt(line.slice(12).trim(), 10) * 1000;
          timestamps.push(currentTimestamp);
        } else if (line.startsWith('summary ')) {
          currentSummary = line.slice(8).trim();
        } else if (line.startsWith('\t')) {
          const code = line.slice(1);
          blameResults.push({
            lineNumber,
            code,
            commitHash: currentCommit,
            shortHash: currentCommit.slice(0, 7),
            author: currentAuthor,
            date: new Date(currentTimestamp).toISOString().split('T')[0],
            summary: currentSummary,
            agePercent: 0, // will compute below
          });
        }
      }

      // Calculate heatmap percent
      if (timestamps.length > 0) {
        const minT = Math.min(...timestamps);
        const maxT = Math.max(...timestamps);
        const range = maxT - minT || 1;

        for (const item of blameResults) {
          const t = new Date(item.date).getTime();
          item.agePercent = Math.max(0.1, (t - minT) / range);
        }
      }

      return blameResults;
    } catch (e: any) {
      console.error('Blame error:', e);
      return [];
    }
  }

  // File History
  async getFileHistory(repoPath: string, filePath: string): Promise<FileCommitHistory[]> {
    try {
      const out = await this.runGitRaw(`log --follow --pretty=format:"%H|||%h|||%an|||%ad|||%s" --date=short -- "${filePath}"`, repoPath);
      const lines = out.split('\n').filter(Boolean);
      return lines.map((l) => {
        const [hash, shortHash, author, date, summary] = l.split('|||');
        return { hash, shortHash, author, date, summary };
      });
    } catch (e: any) {
      console.error('File history error:', e);
      return [];
    }
  }

  // Worktrees
  async getWorktrees(repoPath: string): Promise<Worktree[]> {
    try {
      const out = await this.runGitRaw('worktree list --porcelain', repoPath);
      const blocks = out.split('\n\n').filter(Boolean);
      const currentRoot = await this.getRepoRoot(repoPath);

      return blocks.map((block) => {
        const lines = block.split('\n');
        let wtPath = '';
        let head = '';
        let branch: string | undefined;
        let isBare = false;

        for (const l of lines) {
          if (l.startsWith('worktree ')) wtPath = l.slice(9).trim();
          else if (l.startsWith('HEAD ')) head = l.slice(5).trim();
          else if (l.startsWith('branch ')) branch = l.slice(7).replace('refs/heads/', '').trim();
          else if (l === 'bare') isBare = true;
        }

        const isCurrent = path.resolve(wtPath).toLowerCase() === path.resolve(currentRoot).toLowerCase();
        return { path: wtPath, head, branch, isBare, isCurrent };
      });
    } catch {
      return [];
    }
  }

  async addWorktree(repoPath: string, targetPath: string, branch: string): Promise<void> {
    await this.runGitRaw(`worktree add "${targetPath}" "${branch}"`, repoPath);
  }

  async removeWorktree(repoPath: string, targetPath: string): Promise<void> {
    await this.runGitRaw(`worktree remove "${targetPath}"`, repoPath);
  }

  // Submodules
  async getSubmodules(repoPath: string): Promise<Submodule[]> {
    try {
      const out = await this.runGitRaw('submodule status', repoPath);
      const lines = out.split('\n').filter(Boolean);
      return lines.map((l) => {
        const parts = l.trim().split(/\s+/);
        const commitHash = parts[0].replace(/^[-+U]/, '');
        const subPath = parts[1];
        const branchMatch = l.match(/\((.*?)\)/);
        return {
          name: path.basename(subPath),
          path: subPath,
          commitHash,
          branch: branchMatch ? branchMatch[1] : undefined,
        };
      });
    } catch {
      return [];
    }
  }

  async updateSubmodules(repoPath: string): Promise<string> {
    return await this.runGitRaw('submodule update --init --recursive', repoPath);
  }

  // Interactive Rebase Commits Preview
  async getRebaseCommits(repoPath: string, baseHash: string): Promise<RebaseCommitItem[]> {
    try {
      const out = await this.runGitRaw(`log --reverse --pretty=format:"%H|||%h|||%an|||%s" ${baseHash}..HEAD`, repoPath);
      const lines = out.split('\n').filter(Boolean);
      return lines.map((l) => {
        const [hash, shortHash, author, summary] = l.split('|||');
        return {
          hash,
          shortHash,
          author,
          summary,
          action: 'pick',
        };
      });
    } catch (e: any) {
      console.error('Error fetching rebase commits:', e);
      return [];
    }
  }

  // Execute Rebase Plan
  async executeRebasePlan(repoPath: string, baseHash: string, plan: RebaseCommitItem[]): Promise<string> {
    // Save current branch name
    const branchName = (await this.runGitRaw('branch --show-current', repoPath)).trim();
    const backupBranch = `backup-rebase-${Date.now()}`;
    await this.runGitRaw(`branch ${backupBranch}`, repoPath);

    try {
      // Reset HEAD to base
      await this.runGitRaw(`reset --hard ${baseHash}`, repoPath);

      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];

        if (item.action === 'drop') {
          continue;
        }

        if (item.action === 'pick') {
          await this.runGitRaw(`cherry-pick ${item.hash}`, repoPath);
        } else if (item.action === 'reword') {
          await this.runGitRaw(`cherry-pick ${item.hash}`, repoPath);
          const msg = (item.newSummary || item.summary).replace(/"/g, '\\"');
          await this.runGitRaw(`commit --amend -m "${msg}"`, repoPath);
        } else if (item.action === 'squash' || item.action === 'fixup') {
          // Cherry pick without commit, or cherry pick and amend
          await this.runGitRaw(`cherry-pick -n ${item.hash}`, repoPath);
          if (item.action === 'squash') {
            const currentMsg = (await this.runGitRaw('log -1 --pretty=%B', repoPath)).trim();
            const squashedMsg = `${currentMsg}\n\n* ${item.newSummary || item.summary}`.replace(/"/g, '\\"');
            await this.runGitRaw(`commit --amend -m "${squashedMsg}"`, repoPath);
          } else {
            await this.runGitRaw('commit --amend --no-edit', repoPath);
          }
        }
      }

      // Rebase succeeded - clean up backup branch
      await this.runGitRaw(`branch -D ${backupBranch}`, repoPath);
      return `Successfully completed interactive rebase on branch ${branchName}`;
    } catch (err: any) {
      // Restore on failure
      await this.runGitRaw(`reset --hard ${backupBranch}`, repoPath);
      await this.runGitRaw(`branch -D ${backupBranch}`, repoPath);
      throw new Error(`Interactive rebase failed and was aborted: ${err.message}`);
    }
  }

  // Git Config & Signing
  async getGitConfig(repoPath: string): Promise<GitConfig> {
    try {
      const out = await this.runGitRaw('config -l', repoPath);
      const lines = out.split('\n');
      const config: GitConfig = {};

      for (const l of lines) {
        const [key, ...vals] = l.split('=');
        const val = vals.join('=');
        if (key === 'user.name') config.userName = val;
        else if (key === 'user.email') config.userEmail = val;
        else if (key === 'user.signingkey') config.signingKey = val;
        else if (key === 'commit.gpgsign') config.gpgSign = val === 'true';
        else if (key === 'gpg.format') config.gpgFormat = val;
      }
      return config;
    } catch {
      return {};
    }
  }

  async setGitConfig(repoPath: string, key: string, value: string): Promise<void> {
    await this.runGitRaw(`config ${key} "${value}"`, repoPath);
  }

  runGitWithStdin(args: string[], stdinData: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `Git exited with code ${code}`));
      });
      child.on('error', (err) => reject(err));
      child.stdin.write(stdinData);
      child.stdin.end();
    });
  }

  // Patch operations for hunk and line staging/discarding
  async stagePatch(repoPath: string, patch: string): Promise<void> {
    await this.runGitWithStdin(['apply', '--cached', '--unidiff-zero', '--whitespace=nowarn', '-'], patch, repoPath);
  }

  async unstagePatch(repoPath: string, patch: string): Promise<void> {
    await this.runGitWithStdin(['apply', '--cached', '--reverse', '--unidiff-zero', '--whitespace=nowarn', '-'], patch, repoPath);
  }

  async discardPatch(repoPath: string, patch: string): Promise<void> {
    await this.runGitWithStdin(['apply', '--reverse', '--unidiff-zero', '--whitespace=nowarn', '-'], patch, repoPath);
  }

  // Commit Comparison / Range Diff
  async compareCommits(repoPath: string, baseHash: string, targetHash: string): Promise<{
    files: Array<{ path: string; status: string; additions: number; deletions: number }>;
    summary: string;
  }> {
    const rawNumstat = await this.runGitRaw(`diff --numstat ${baseHash} ${targetHash}`, repoPath);
    const rawStatus = await this.runGitRaw(`diff --name-status ${baseHash} ${targetHash}`, repoPath);
    
    const statusMap = new Map<string, string>();
    for (const line of rawStatus.split('\n')) {
      const parts = line.trim().split(/\t+/);
      if (parts.length >= 2) {
        statusMap.set(parts[1], parts[0]);
      }
    }

    const files: Array<{ path: string; status: string; additions: number; deletions: number }> = [];
    let totalAdd = 0;
    let totalDel = 0;

    for (const line of rawNumstat.split('\n')) {
      const parts = line.trim().split(/\t+/);
      if (parts.length >= 3) {
        const add = parseInt(parts[0], 10) || 0;
        const del = parseInt(parts[1], 10) || 0;
        const filePath = parts[2];
        const status = statusMap.get(filePath) || 'M';
        files.push({ path: filePath, status, additions: add, deletions: del });
        totalAdd += add;
        totalDel += del;
      }
    }

    const summary = `${files.length} files changed, +${totalAdd} -${totalDel}`;
    return { files, summary };
  }

  async getComparisonFileDiff(repoPath: string, baseHash: string, targetHash: string, filePath: string): Promise<FileDiff[]> {
    const rawDiff = await this.runGitRaw(`diff ${baseHash} ${targetHash} -- "${filePath}"`, repoPath);
    return parseGitDiff(rawDiff);
  }

  // File content at git ref (e.g. :1:path, :2:path, :3:path, HEAD:path)
  async getFileAtRef(repoPath: string, ref: string, filePath: string): Promise<string> {
    try {
      return await this.runGitRaw(`show ${ref}:"${filePath}"`, repoPath);
    } catch {
      return '';
    }
  }

  // Save manual conflict resolution & optionally stage
  async saveConflictResolution(repoPath: string, filePath: string, content: string, stage: boolean = true): Promise<void> {
    const fullPath = path.resolve(repoPath, filePath);
    await fs.promises.writeFile(fullPath, content, 'utf8');
    if (stage) {
      await this.runGitRaw(`add "${filePath}"`, repoPath);
    }
  }

  // Undo last action using Reflog
  async undoLastAction(repoPath: string): Promise<{ success: boolean; message: string; action: string }> {
    const reflogOut = await this.runGitRaw('reflog -2 --format="%H %gd %gs"', repoPath);
    const entries = reflogOut.trim().split('\n');
    if (entries.length < 2) {
      throw new Error('No previous action found in reflog to undo');
    }

    const currentEntry = entries[0];
    const actionDesc = currentEntry.split(' ').slice(2).join(' ');

    // If last action was a commit (e.g. "commit: ..."), undo with soft reset to preserve working tree changes
    if (actionDesc.startsWith('commit:') || actionDesc.startsWith('commit (amend):')) {
      await this.runGitRaw('reset --soft HEAD@{1}', repoPath);
      return { success: true, message: `Undid commit: "${actionDesc}". Changes kept in staging area.`, action: actionDesc };
    }

    // If last action was checkout
    if (actionDesc.startsWith('checkout:')) {
      const match = actionDesc.match(/moving from (.+?) to (.+)/);
      if (match) {
        const previousBranch = match[1];
        await this.runGitRaw(`checkout ${previousBranch}`, repoPath);
        return { success: true, message: `Returned back to ${previousBranch}`, action: actionDesc };
      }
    }

    // Otherwise soft reset to HEAD@{1}
    await this.runGitRaw('reset --soft HEAD@{1}', repoPath);
    return { success: true, message: `Rolled back to HEAD@{1} (${actionDesc})`, action: actionDesc };
  }

  // Virtual Branches (GitButler Innovation)
  private getVirtualBranchesFilePath(repoPath: string): string {
    const dir = path.join(this.resolveGitDir(repoPath), 'gitter');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'virtual-branches.json');
  }

  async getVirtualBranches(repoPath: string): Promise<any[]> {
    try {
      const filePath = this.getVirtualBranchesFilePath(repoPath);
      if (fs.existsSync(filePath)) {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
      }
      return [];
    } catch {
      return [];
    }
  }

  async saveVirtualBranches(repoPath: string, branches: any[]): Promise<void> {
    const filePath = this.getVirtualBranchesFilePath(repoPath);
    await fs.promises.writeFile(filePath, JSON.stringify(branches, null, 2), 'utf8');
  }

  async commitVirtualBranch(
    repoPath: string,
    payload: {
      branchName: string;
      files: string[];
      summary: string;
      description?: string;
      targetBranch?: string;
      pushUpstream?: boolean;
    }
  ): Promise<{ commitHash: string; branchName: string }> {
    const { branchName, files, summary, description, pushUpstream } = payload;
    if (!files || files.length === 0) {
      throw new Error('No files specified to commit for this virtual branch');
    }

    const currentBranch = (await this.runGitRaw('rev-parse --abbrev-ref HEAD', repoPath)).trim();

    // Stage only the specified files
    for (const f of files) {
      await this.runGitRaw(`add "${f}"`, repoPath);
    }

    const fullMessage = description ? `${summary}\n\n${description}` : summary;
    const msgFile = path.join(os.tmpdir(), `gitter_commit_${Date.now()}.txt`);
    await fs.promises.writeFile(msgFile, fullMessage, 'utf8');

    // If already on the target branch:
    if (currentBranch === branchName) {
      try {
        await this.runGitRaw(`commit -F "${msgFile}"`, repoPath);
      } finally {
        await fs.promises.unlink(msgFile).catch(() => {});
      }
      const hash = (await this.runGitRaw('rev-parse HEAD', repoPath)).trim();
      if (pushUpstream) {
        await this.runGitRaw(`push -u origin ${branchName}`, repoPath).catch(() => {});
      }
      return { commitHash: hash, branchName };
    }

    // If committing to a new or different branch:
    let branchExists = false;
    try {
      await this.runGitRaw(`rev-parse --verify "${branchName}"`, repoPath);
      branchExists = true;
    } catch {
      branchExists = false;
    }

    if (!branchExists) {
      // Create branch at current HEAD, switch to it, commit, then switch back
      await this.runGitRaw(`checkout -b "${branchName}"`, repoPath);
      try {
        await this.runGitRaw(`commit -F "${msgFile}"`, repoPath);
      } finally {
        await fs.promises.unlink(msgFile).catch(() => {});
      }
      const hash = (await this.runGitRaw('rev-parse HEAD', repoPath)).trim();
      if (pushUpstream) {
        await this.runGitRaw(`push -u origin ${branchName}`, repoPath).catch(() => {});
      }
      await this.runGitRaw(`checkout "${currentBranch}"`, repoPath);
      return { commitHash: hash, branchName };
    } else {
      // Branch exists: switch to it, commit, switch back
      await this.runGitRaw(`checkout "${branchName}"`, repoPath);
      try {
        await this.runGitRaw(`commit -F "${msgFile}"`, repoPath);
      } finally {
        await fs.promises.unlink(msgFile).catch(() => {});
      }
      const hash = (await this.runGitRaw('rev-parse HEAD', repoPath)).trim();
      if (pushUpstream) {
        await this.runGitRaw(`push -u origin ${branchName}`, repoPath).catch(() => {});
      }
      await this.runGitRaw(`checkout "${currentBranch}"`, repoPath);
      return { commitHash: hash, branchName };
    }
  }

  async stashVirtualBranch(repoPath: string, files: string[]): Promise<string> {
    if (!files || files.length === 0) return '';
    const fileArgs = files.map((f) => `"${f}"`).join(' ');
    const patch = await this.runGitRaw(`diff HEAD -- ${fileArgs}`, repoPath);
    await this.runGitRaw(`checkout HEAD -- ${fileArgs}`, repoPath);
    return patch;
  }

  // Stash details & Diff Inspector
  async getStashFiles(repoPath: string, index: number = 0): Promise<{
    files: Array<{ path: string; status: string; additions: number; deletions: number }>;
    summary: string;
  }> {
    const stashRef = `stash@{${index}}`;
    // --include-untracked lists files saved with `stash push -u`, which plain `stash show` hides.
    const [numstat, nameStatus] = await Promise.all([
      this.runGitWithStdin(['stash', 'show', '--include-untracked', '--numstat', stashRef], '', repoPath),
      this.runGitWithStdin(['stash', 'show', '--include-untracked', '--name-status', stashRef], '', repoPath),
    ]);

    const statusMap = new Map<string, string>();
    for (const line of nameStatus.split('\n')) {
      const parts = line.trim().split(/\t+/);
      if (parts.length >= 2) statusMap.set(parts[1], parts[0]);
    }

    const files: Array<{ path: string; status: string; additions: number; deletions: number }> = [];
    let totalAdd = 0;
    let totalDel = 0;

    for (const line of numstat.split('\n')) {
      const parts = line.trim().split(/\t+/);
      if (parts.length >= 3) {
        const add = parseInt(parts[0], 10) || 0;
        const del = parseInt(parts[1], 10) || 0;
        const filePath = parts[2];
        const status = statusMap.get(filePath) || 'M';
        files.push({ path: filePath, status, additions: add, deletions: del });
        totalAdd += add;
        totalDel += del;
      }
    }
    return { files, summary: `${files.length} files changed, +${totalAdd} -${totalDel}` };
  }

  async getStashFileDiff(repoPath: string, index: number, filePath: string): Promise<FileDiff[]> {
    const stashRef = `stash@{${index}}`;
    // `git stash show` takes no pathspec, so diff the stash commit against its base.
    const tracked = await this.runGitWithStdin(['diff', `${stashRef}^1`, stashRef, '--', filePath], '', repoPath);
    if (tracked.trim()) return parseGitDiff(tracked);

    // Untracked files live in the stash's third parent; diff them against an empty tree.
    const hasUntracked = await this.runGitWithStdin(['rev-parse', '--verify', '--quiet', `${stashRef}^3`], '', repoPath)
      .then(() => true)
      .catch(() => false);
    if (!hasUntracked) return [];
    const emptyTree = (await this.runGitWithStdin(['hash-object', '-t', 'tree', '--stdin'], '', repoPath)).trim();
    const untracked = await this.runGitWithStdin(['diff', emptyTree, `${stashRef}^3`, '--', filePath], '', repoPath);
    return parseGitDiff(untracked);
  }

  // File Commit Diff (for File History Timeline)
  async getFileCommitDiff(repoPath: string, hash: string, filePath: string): Promise<FileDiff[]> {
    const rawDiff = await this.runGitRaw(`show ${hash} -- "${filePath}"`, repoPath);
    return parseGitDiff(rawDiff);
  }

  // Scan folder for Git repositories (depth 1 and 2)
  async scanRepositories(folderPath: string): Promise<Array<{
    name: string;
    path: string;
    currentBranch: string;
    isClean: boolean;
    lastCommit?: string;
    lastCommitDate?: string;
  }>> {
    const cleanInput = folderPath.replace(/^["']|["']$/g, '').trim();
    const resolved = path.resolve(cleanInput);
    const repos: Array<{
      name: string;
      path: string;
      currentBranch: string;
      isClean: boolean;
      lastCommit?: string;
      lastCommitDate?: string;
    }> = [];

    const IGNORED_DIRS = new Set([
      'node_modules',
      'target',
      'dist',
      'build',
      'vendor',
      '.git',
      '.cache',
      '.vscode',
      '.idea',
      'AppData',
      'bin',
      'obj',
      'venv',
      '.venv',
      'env',
      '__pycache__',
    ]);

    const checkAndAddRepo = async (dirPath: string, name: string) => {
      try {
        const gitDir = path.join(dirPath, '.git');
        const stat = await fs.promises.stat(gitDir).catch(() => null);
        if (stat) {
          let currentBranch = 'unknown';
          let isClean = true;
          let lastCommit = '';
          let lastCommitDate = '';

          try {
            // Read HEAD directly or use git rev-parse with timeout
            const headPath = path.join(dirPath, '.git', 'HEAD');
            try {
              const headContent = await fs.promises.readFile(headPath, 'utf8');
              const match = headContent.trim().match(/^ref: refs\/heads\/(.+)$/);
              if (match) {
                currentBranch = match[1];
              } else {
                currentBranch = headContent.trim().slice(0, 7) || 'detached';
              }
            } catch {
              currentBranch = (await this.runGitRaw('rev-parse --abbrev-ref HEAD', dirPath)).trim();
            }

            const statusOut = await this.runGitRaw('status --porcelain', dirPath).catch(() => '');
            isClean = statusOut.trim().length === 0;
            const logOut = await this.runGitRaw('log -1 --format="%s (%cr)"', dirPath).catch(() => '');
            lastCommit = logOut.trim();
          } catch {}

          repos.push({
            name,
            path: dirPath.replace(/\\/g, '/'),
            currentBranch,
            isClean,
            lastCommit,
            lastCommitDate,
          });
          return true;
        }
      } catch {}
      return false;
    };

    try {
      // First, check if the scanned directory itself is a git repository!
      const isRootRepo = await checkAndAddRepo(resolved, path.basename(resolved) || 'root');
      if (isRootRepo) {
        return repos;
      }

      const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
        const subPath = path.join(resolved, entry.name);
        const isRepo = await checkAndAddRepo(subPath, entry.name);

        // If not a repo and not ignored, look 1-2 levels deeper
        if (!isRepo && !entry.name.startsWith('.')) {
          try {
            const nested = await fs.promises.readdir(subPath, { withFileTypes: true });
            for (const n of nested) {
              if (!n.isDirectory() || IGNORED_DIRS.has(n.name) || n.name.startsWith('.')) continue;
              const nestedPath = path.join(subPath, n.name);
              const isNestedRepo = await checkAndAddRepo(nestedPath, `${entry.name}/${n.name}`);

              if (!isNestedRepo) {
                try {
                  const subNested = await fs.promises.readdir(nestedPath, { withFileTypes: true });
                  for (const sn of subNested) {
                    if (sn.isDirectory() && !IGNORED_DIRS.has(sn.name) && !sn.name.startsWith('.')) {
                      await checkAndAddRepo(path.join(nestedPath, sn.name), `${entry.name}/${n.name}/${sn.name}`);
                    }
                  }
                } catch {}
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      throw new Error(`Failed to scan folder: ${e.message}`);
    }

    return repos;
  }

  // Native folder picker per OS
  async pickNativeFolder(): Promise<string | null> {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWindows) {
      try {
        const candidatePaths = [
          path.resolve(__dirname, 'pickFolder.ps1'),
          path.resolve(__dirname, 'server', 'pickFolder.ps1'),
          path.resolve(__dirname, '..', 'pickFolder.ps1'),
          path.resolve(process.cwd(), 'server', 'pickFolder.ps1'),
          path.resolve(process.cwd(), 'pickFolder.ps1'),
        ];
        const scriptPath = candidatePaths.find((p) => fs.existsSync(p));

        const cmd = scriptPath
          ? `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "${scriptPath}"`
          : `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $true; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; $f.Opacity = 0; $f.Show(); if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($d.SelectedPath) }; $f.Dispose(); $d.Dispose()"`;

        const { stdout } = await execAsync(cmd, { timeout: 60000 });
        const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const selected = lines.length > 0 ? lines[lines.length - 1].replace(/\\/g, '/') : null;
        return selected || null;
      } catch (err: any) {
        console.error('Failed to invoke Windows folder dialog:', err);
        return null;
      }
    } else if (isMac) {
      try {
        const { stdout } = await execAsync(
          `osascript -e 'POSIX path of (choose folder with prompt "Select Git Repository Folder")'`,
          { timeout: 60000 }
        );
        return stdout.trim() || null;
      } catch {
        return null;
      }
    } else {
      // Linux
      try {
        const { stdout } = await execAsync(
          `zenity --file-selection --directory --title="Select Git Repository Folder"`,
          { timeout: 60000 }
        );
        return stdout.trim() || null;
      } catch {
        try {
          const { stdout } = await execAsync(`kdialog --getexistingdirectory`, { timeout: 60000 });
          return stdout.trim() || null;
        } catch {
          return null;
        }
      }
    }
  }

  // Per-repository configuration (.git/gitter/config.json)
  async getRepoConfig(repoPath: string): Promise<any> {
    const configPath = path.join(this.resolveGitDir(repoPath), 'gitter', 'config.json');
    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      return JSON.parse(content);
    } catch {
      // Default per-repo settings
      return {
        defaultTargetBranch: 'main',
        userName: '',
        userEmail: '',
        gitflow: {
          initialized: false,
          masterBranch: 'main',
          developBranch: 'develop',
          featurePrefix: 'feature/',
          releasePrefix: 'release/',
          hotfixPrefix: 'hotfix/',
          bugfixPrefix: 'bugfix/',
          supportPrefix: 'support/',
        },
        hiddenSections: [],
      };
    }
  }

  async saveRepoConfig(repoPath: string, config: any): Promise<void> {
    const dir = path.join(this.resolveGitDir(repoPath), 'gitter');
    await fs.promises.mkdir(dir, { recursive: true });
    const configPath = path.join(dir, 'config.json');
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    // If userName or userEmail are supplied, update local git config
    if (config.userName) {
      await this.runGitRaw(`config user.name "${config.userName}"`, repoPath).catch(() => {});
    }
    if (config.userEmail) {
      await this.runGitRaw(`config user.email "${config.userEmail}"`, repoPath).catch(() => {});
    }
  }

  // Gitflow Integration
  async getGitflowStatus(repoPath: string): Promise<{
    initialized: boolean;
    config: any;
    currentBranch: string;
    features: string[];
    releases: string[];
    hotfixes: string[];
  }> {
    const repoConfig = await this.getRepoConfig(repoPath);
    const gfConfig = repoConfig.gitflow || {
      initialized: false,
      masterBranch: 'main',
      developBranch: 'develop',
      featurePrefix: 'feature/',
      releasePrefix: 'release/',
      hotfixPrefix: 'hotfix/',
    };

    const branches = await this.getBranches(repoPath);
    const branchNames = branches.map((b) => b.name);
    const currentBranch = (await this.runGitRaw('rev-parse --abbrev-ref HEAD', repoPath)).trim();

    const hasMaster = branchNames.includes(gfConfig.masterBranch);
    const hasDevelop = branchNames.includes(gfConfig.developBranch);
    const isInitialized = gfConfig.initialized || (hasMaster && hasDevelop);

    const featurePrefix = gfConfig.featurePrefix || 'feature/';
    const releasePrefix = gfConfig.releasePrefix || 'release/';
    const hotfixPrefix = gfConfig.hotfixPrefix || 'hotfix/';

    const features = branchNames.filter((b) => b.startsWith(featurePrefix)).map((b) => b.replace(featurePrefix, ''));
    const releases = branchNames.filter((b) => b.startsWith(releasePrefix)).map((b) => b.replace(releasePrefix, ''));
    const hotfixes = branchNames.filter((b) => b.startsWith(hotfixPrefix)).map((b) => b.replace(hotfixPrefix, ''));

    return {
      initialized: isInitialized,
      config: gfConfig,
      currentBranch,
      features,
      releases,
      hotfixes,
    };
  }

  async gitflowInit(repoPath: string, config: any): Promise<void> {
    const branches = await this.getBranches(repoPath);
    const branchNames = branches.map((b) => b.name);

    const masterBranch = config.masterBranch || 'main';
    const developBranch = config.developBranch || 'develop';

    // Ensure develop branch exists
    if (!branchNames.includes(developBranch)) {
      if (branchNames.includes(masterBranch)) {
        await this.runGitRaw(`branch ${developBranch} ${masterBranch}`, repoPath);
      } else {
        await this.runGitRaw(`branch ${developBranch} HEAD`, repoPath);
      }
    }

    const repoConfig = await this.getRepoConfig(repoPath);
    repoConfig.gitflow = {
      initialized: true,
      masterBranch,
      developBranch,
      featurePrefix: config.featurePrefix || 'feature/',
      releasePrefix: config.releasePrefix || 'release/',
      hotfixPrefix: config.hotfixPrefix || 'hotfix/',
      bugfixPrefix: config.bugfixPrefix || 'bugfix/',
      supportPrefix: config.supportPrefix || 'support/',
    };

    await this.saveRepoConfig(repoPath, repoConfig);
  }

  async gitflowStart(repoPath: string, type: 'feature' | 'release' | 'hotfix', name: string): Promise<string> {
    const gfStatus = await this.getGitflowStatus(repoPath);
    const gfConfig = gfStatus.config;
    const cleanName = name.trim().replace(/\s+/g, '-');

    if (type === 'feature') {
      const fullBranch = `${gfConfig.featurePrefix || 'feature/'}${cleanName}`;
      await this.runGitRaw(`checkout -b ${fullBranch} ${gfConfig.developBranch || 'develop'}`, repoPath);
      return fullBranch;
    } else if (type === 'release') {
      const fullBranch = `${gfConfig.releasePrefix || 'release/'}${cleanName}`;
      await this.runGitRaw(`checkout -b ${fullBranch} ${gfConfig.developBranch || 'develop'}`, repoPath);
      return fullBranch;
    } else if (type === 'hotfix') {
      const fullBranch = `${gfConfig.hotfixPrefix || 'hotfix/'}${cleanName}`;
      await this.runGitRaw(`checkout -b ${fullBranch} ${gfConfig.masterBranch || 'main'}`, repoPath);
      return fullBranch;
    }

    throw new Error(`Unknown Gitflow type: ${type}`);
  }

  async gitflowFinish(repoPath: string, type: 'feature' | 'release' | 'hotfix', name: string): Promise<{ success: boolean; message: string }> {
    const gfStatus = await this.getGitflowStatus(repoPath);
    const gfConfig = gfStatus.config;
    const cleanName = name.trim();

    if (type === 'feature') {
      const fullBranch = `${gfConfig.featurePrefix || 'feature/'}${cleanName}`;
      const develop = gfConfig.developBranch || 'develop';
      // Checkout develop and merge feature with --no-ff
      await this.runGitRaw(`checkout ${develop}`, repoPath);
      await this.runGitRaw(`merge --no-ff ${fullBranch} -m "Merge feature '${cleanName}' into ${develop}"`, repoPath);
      // Delete feature branch
      await this.runGitRaw(`branch -d ${fullBranch}`, repoPath).catch(() => {});
      return { success: true, message: `Finished feature '${cleanName}': merged into '${develop}' and deleted branch.` };
    } else if (type === 'release') {
      const fullBranch = `${gfConfig.releasePrefix || 'release/'}${cleanName}`;
      const master = gfConfig.masterBranch || 'main';
      const develop = gfConfig.developBranch || 'develop';

      // 1. Merge into master and tag
      await this.runGitRaw(`checkout ${master}`, repoPath);
      await this.runGitRaw(`merge --no-ff ${fullBranch} -m "Release ${cleanName}"`, repoPath);
      await this.runGitRaw(`tag -a v${cleanName.replace(/^v/, '')} -m "Release ${cleanName}"`, repoPath).catch(() => {});

      // 2. Merge into develop
      await this.runGitRaw(`checkout ${develop}`, repoPath);
      await this.runGitRaw(`merge --no-ff ${fullBranch} -m "Merge release '${cleanName}' into ${develop}"`, repoPath);

      // 3. Delete release branch
      await this.runGitRaw(`branch -d ${fullBranch}`, repoPath).catch(() => {});
      return { success: true, message: `Finished release '${cleanName}': merged into '${master}' (tagged) and '${develop}'.` };
    } else if (type === 'hotfix') {
      const fullBranch = `${gfConfig.hotfixPrefix || 'hotfix/'}${cleanName}`;
      const master = gfConfig.masterBranch || 'main';
      const develop = gfConfig.developBranch || 'develop';

      // 1. Merge into master and tag
      await this.runGitRaw(`checkout ${master}`, repoPath);
      await this.runGitRaw(`merge --no-ff ${fullBranch} -m "Hotfix ${cleanName}"`, repoPath);
      await this.runGitRaw(`tag -a v${cleanName.replace(/^v/, '')} -m "Hotfix ${cleanName}"`, repoPath).catch(() => {});

      // 2. Merge into develop
      await this.runGitRaw(`checkout ${develop}`, repoPath);
      await this.runGitRaw(`merge --no-ff ${fullBranch} -m "Merge hotfix '${cleanName}' into ${develop}"`, repoPath);

      // 3. Delete hotfix branch
      await this.runGitRaw(`branch -d ${fullBranch}`, repoPath).catch(() => {});
      return { success: true, message: `Finished hotfix '${cleanName}': merged into '${master}' (tagged) and '${develop}'.` };
    }

    throw new Error(`Unknown Gitflow type: ${type}`);
  }

  // Multi-Agent Fleet Orchestrator & Collision Radar
  // Resolve the real Git metadata directory. In a linked worktree `.git` is a file
  // containing `gitdir: <path>`, so writing under `<repo>/.git/...` would fail.
  private resolveGitDir(repoPath: string): string {
    const dotGit = path.join(repoPath, '.git');
    try {
      const stat = fs.statSync(dotGit);
      if (stat.isDirectory()) return dotGit;
      if (stat.isFile()) {
        const content = fs.readFileSync(dotGit, 'utf8');
        const match = content.match(/^gitdir:\s*(.+)$/m);
        if (match) {
          const raw = match[1].trim();
          return path.isAbsolute(raw) ? raw : path.resolve(repoPath, raw);
        }
      }
    } catch {
      // Fall back to the conventional location below.
    }
    return dotGit;
  }

  private getAgentFleetFilePath(repoPath: string): string {
    const dir = path.join(this.resolveGitDir(repoPath), 'gitter');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'agent-fleet.json');
  }

  async getAgentFleet(repoPath: string): Promise<AgentFleetState> {
    const indexLockDetected = fs.existsSync(path.join(this.resolveGitDir(repoPath), 'index.lock'));
    const worktrees = await this.getWorktrees(repoPath).catch(() => []);
    const agents = await this.discoverAgents(repoPath, worktrees);
    await this.refreshAgentFiles(repoPath, agents);
    await this.saveAgents(repoPath, agents);

    return {
      agents,
      collisions: detectCollisions(agents),
      activeWorktrees: worktrees.map((w) => w.path),
      indexLockDetected,
    };
  }

  async getAgentActivity(repoPath: string): Promise<AgentActivityState> {
    const fleet = await this.getAgentFleet(repoPath);
    const baseBranch = await this.getBaseBranch(repoPath);
    const events: AgentActivityEvent[] = [];

    for (const agent of fleet.agents) {
      const meta = { agentId: agent.id, agentName: agent.name, harness: agent.harness, color: agent.color };
      const log = await this.runGitRaw(
        `log ${baseBranch}..${agent.branchName} --no-merges --no-renames --numstat --format=%x1e%H%x1f%at%x1f%s`,
        repoPath
      ).catch(() => '');

      for (const block of log.split('\x1e').filter((b) => b.trim())) {
        const [header, ...statLines] = block.split('\n');
        const [hash, at, subject] = header.split('\x1f');
        events.push({
          id: hash,
          ...meta,
          kind: 'commit',
          hash,
          subject,
          timestamp: Number(at) * 1000,
          files: statLines.map(parseNumstatLine).filter((f): f is AgentFileChange => f !== null),
        });
      }

      // Live edits only count for the agent's own worktree; the main checkout belongs to the human.
      if (agent.worktreePath && fs.existsSync(agent.worktreePath)) {
        const live = await this.getLiveChanges(agent.worktreePath);
        if (live.length > 0) {
          events.push({
            id: `live-${agent.id}`,
            ...meta,
            kind: 'uncommitted',
            subject: 'Uncommitted changes in worktree',
            timestamp: Date.now(),
            files: live,
          });
        }
      }
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    const ownership = new Map<string, AgentFileOwnership>();
    for (const event of events) {
      for (const file of event.files) {
        const entry = ownership.get(file.path) ?? { filePath: file.path, agentIds: [], additions: 0, deletions: 0 };
        if (!entry.agentIds.includes(event.agentId)) entry.agentIds.push(event.agentId);
        entry.additions += file.additions;
        entry.deletions += file.deletions;
        ownership.set(file.path, entry);
      }
    }

    return {
      generatedAt: Date.now(),
      events: events.slice(0, 200),
      fileOwnership: Array.from(ownership.values()).sort(
        (a, b) => b.agentIds.length - a.agentIds.length || a.filePath.localeCompare(b.filePath)
      ),
    };
  }

  private async getBaseBranch(repoPath: string): Promise<string> {
    const state = await this.getRepoState(repoPath).catch(() => null);
    return state?.currentBranch || 'main';
  }

  private resolveAgentDir(repoPath: string, agent: AgentInstance): string {
    return agent.worktreePath && fs.existsSync(agent.worktreePath) ? agent.worktreePath : repoPath;
  }

  private async getLiveChanges(dir: string): Promise<AgentFileChange[]> {
    const [numstat, status] = await Promise.all([
      this.runGitRaw('diff --numstat --no-renames HEAD', dir).catch(() => ''),
      this.runGitRaw('status --porcelain --no-renames', dir).catch(() => ''),
    ]);
    const byPath = new Map<string, AgentFileChange>();

    for (const line of status.split('\n').filter(Boolean)) {
      const code = line.slice(0, 2).trim() || 'M';
      const filePath = line.slice(3).trim();
      byPath.set(filePath, { path: filePath, additions: 0, deletions: 0, status: code === '??' ? '?' : code });
    }
    for (const line of numstat.split('\n').filter(Boolean)) {
      const parsed = parseNumstatLine(line);
      if (!parsed) continue;
      const existing = byPath.get(parsed.path);
      if (existing) {
        existing.additions = parsed.additions;
        existing.deletions = parsed.deletions;
      } else {
        byPath.set(parsed.path, parsed);
      }
    }
    return Array.from(byPath.values());
  }

  private async discoverAgents(repoPath: string, worktrees: Worktree[]): Promise<AgentInstance[]> {
    const stored = await this.loadStoredAgents(repoPath);
    const branches = await this.getBranches(repoPath).catch(() => []);

    for (const b of branches.filter((b) => b.name.startsWith(AGENT_BRANCH_PREFIX))) {
      if (stored.some((a) => a.branchName === b.name)) continue;
      const harness = harnessFromBranch(b.name);
      stored.push({
        id: `auto-${b.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
        name: `${HARNESS_REGISTRY[harness].label} (${b.name.slice(AGENT_BRANCH_PREFIX.length)})`,
        harness,
        status: 'running',
        branchName: b.name,
        taskDescription: `Autonomous task running on ${b.name}`,
        claimedFiles: [],
        modifiedFiles: [],
        lastHeartbeat: Date.now(),
        color: harnessColor(harness),
      });
    }

    for (const agent of stored) {
      const wt = worktrees.find(
        (w) => w.branch === agent.branchName || (agent.worktreePath && w.path === agent.worktreePath)
      );
      if (wt) agent.worktreePath = wt.path;
    }

    // Collapse duplicate agents that track the same branch. Prefer the explicitly
    // registered agent over one that branch discovery invented.
    const deduped: AgentInstance[] = [];
    for (const agent of stored) {
      const key = agent.branchName || agent.id;
      const existingIndex = deduped.findIndex((a) => (a.branchName || a.id) === key);
      if (existingIndex === -1) {
        deduped.push(agent);
        continue;
      }
      const existing = deduped[existingIndex];
      if (existing.id.startsWith('auto-') && !agent.id.startsWith('auto-')) {
        deduped[existingIndex] = agent;
      }
    }
    return deduped;
  }

  private async refreshAgentFiles(repoPath: string, agents: AgentInstance[]): Promise<void> {
    const baseBranch = await this.getBaseBranch(repoPath);
    for (const agent of agents) {
      const dir = this.resolveAgentDir(repoPath, agent);
      const [diffOut, statusOut] = await Promise.all([
        this.runGitRaw(`diff --name-only ${baseBranch}...${agent.branchName}`, dir).catch(() => null),
        this.runGitRaw('status --porcelain', dir).catch(() => null),
      ]);
      if (diffOut === null || statusOut === null) continue; // keep last known state on failure

      const branchFiles = diffOut.split('\n').map((f) => f.trim()).filter(Boolean);
      const uncommitted = statusOut.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
      agent.modifiedFiles = Array.from(new Set([...branchFiles, ...uncommitted]));
    }
  }

  private async loadStoredAgents(repoPath: string): Promise<AgentInstance[]> {
    const fleetPath = this.getAgentFleetFilePath(repoPath);
    if (!fs.existsSync(fleetPath)) return [];
    try {
      return JSON.parse(await fs.promises.readFile(fleetPath, 'utf8'));
    } catch {
      return [];
    }
  }

  private async saveAgents(repoPath: string, agents: AgentInstance[]): Promise<void> {
    await fs.promises.writeFile(this.getAgentFleetFilePath(repoPath), JSON.stringify(agents, null, 2), 'utf8');
  }

  async registerAgent(repoPath: string, payload: Partial<AgentInstance>): Promise<AgentInstance> {
    const fleetPath = this.getAgentFleetFilePath(repoPath);
    // Read the stored agents directly. Calling getAgentFleet here would run branch
    // discovery, which sees the branch we just created and invents a phantom agent.
    const stored = await this.loadStoredAgents(repoPath);

    const harness = payload.harness || 'custom';

    const newAgent: AgentInstance = {
      id: payload.id || `agent-${Date.now()}`,
      name: payload.name || `${harness.toUpperCase()} Worker`,
      harness,
      status: payload.status || 'running',
      branchName: payload.branchName || `agent/${harness}-${Date.now().toString(36)}`,
      worktreePath: payload.worktreePath,
      taskDescription: payload.taskDescription || 'Autonomous development task',
      claimedFiles: payload.claimedFiles || [],
      modifiedFiles: payload.modifiedFiles || [],
      lastHeartbeat: Date.now(),
      color: payload.color || harnessColor(harness),
    };

    const updated = [...stored.filter((a) => a.id !== newAgent.id && a.branchName !== newAgent.branchName), newAgent];
    await fs.promises.writeFile(fleetPath, JSON.stringify(updated, null, 2), 'utf8');
    return newAgent;
  }

  async spawnAgentWorktree(
    repoPath: string,
    harness: AgentHarness,
    taskName: string,
    baseBranch = 'HEAD'
  ): Promise<{ agent: AgentInstance; worktreePath: string }> {
    const cleanTask = taskName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30);
    const branchName = `agent/${harness}-${cleanTask}`;
    const repoName = path.basename(repoPath);
    const targetPath = path.resolve(repoPath, '..', `${repoName}-${harness}-${cleanTask}`);

    // Create branch if not exists
    await this.runGitRaw(`branch ${branchName} ${baseBranch}`, repoPath).catch(() => {});

    // Create worktree
    await this.runGitRaw(`worktree add "${targetPath}" "${branchName}"`, repoPath);

    const agent = await this.registerAgent(repoPath, {
      name: `${harness === 'claude-code' ? 'Claude Code' : harness === 'antigravity' ? 'Antigravity' : harness.toUpperCase()} (${cleanTask})`,
      harness,
      branchName,
      worktreePath: targetPath.replace(/\\/g, '/'),
      taskDescription: `Task: ${taskName}`,
      status: 'running',
    });

    return { agent, worktreePath: targetPath.replace(/\\/g, '/') };
  }

  async claimAgentFiles(repoPath: string, agentId: string, files: string[]): Promise<AgentFleetState> {
    const fleetPath = this.getAgentFleetFilePath(repoPath);
    const fleet = await this.getAgentFleet(repoPath);

    const target = fleet.agents.find((a) => a.id === agentId);
    if (target) {
      target.claimedFiles = Array.from(new Set(files));
      await fs.promises.writeFile(fleetPath, JSON.stringify(fleet.agents, null, 2), 'utf8');
    }

    return this.getAgentFleet(repoPath);
  }

  async releaseAgent(repoPath: string, agentId: string, removeWorktree: boolean): Promise<void> {
    const fleetPath = this.getAgentFleetFilePath(repoPath);
    const fleet = await this.getAgentFleet(repoPath);

    const agent = fleet.agents.find((a) => a.id === agentId);
    if (agent && agent.worktreePath && removeWorktree) {
      await this.runGitRaw(`worktree remove "${agent.worktreePath}" --force`, repoPath).catch(() => {});
    }

    const filtered = fleet.agents.filter((a) => a.id !== agentId);
    await fs.promises.writeFile(fleetPath, JSON.stringify(filtered, null, 2), 'utf8');
  }

  async clearGitIndexLock(repoPath: string): Promise<boolean> {
    const lockPath = path.join(this.resolveGitDir(repoPath), 'index.lock');
    if (fs.existsSync(lockPath)) {
      await fs.promises.unlink(lockPath);
      return true;
    }
    return false;
  }

  // Agent Review Inbox, checkpoints, and the review last mile
  private getAgentReviewFilePath(repoPath: string): string {
    const dir = path.join(this.resolveGitDir(repoPath), 'gitter');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'agent-review.json');
  }

  private async loadReviewStore(repoPath: string): Promise<AgentReviewStore> {
    const file = this.getAgentReviewFilePath(repoPath);
    if (!fs.existsSync(file)) return {};
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8')) as AgentReviewStore;
    } catch {
      return {};
    }
  }

  private async saveReviewStore(repoPath: string, store: AgentReviewStore): Promise<void> {
    await fs.promises.writeFile(this.getAgentReviewFilePath(repoPath), JSON.stringify(store, null, 2), 'utf8');
  }

  private resolveAgentOrThrow(fleet: AgentFleetState, agentId: string): AgentInstance {
    const agent = fleet.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent '${agentId}' was not found in this repository.`);
    return agent;
  }

  private deriveReviewStatus(
    agent: AgentInstance,
    files: AgentFileChange[],
    commitsAhead: number
  ): AgentReviewStatus {
    if (agent.status === 'stalled') return 'failed';
    if (files.length > 0 || commitsAhead > 0) {
      if (agent.status === 'running' && Date.now() - agent.lastHeartbeat < 10 * 60 * 1000) {
        return 'running';
      }
      return 'needs-review';
    }
    return agent.status === 'running' ? 'running' : 'queued';
  }

  private async buildReviewState(repoPath: string, fleet: AgentFleetState): Promise<AgentReviewState> {
    const store = await this.loadReviewStore(repoPath);
    const baseBranch = await this.getBaseBranch(repoPath);

    const collisionFilesByAgent = new Map<string, string[]>();
    for (const collision of fleet.collisions) {
      for (const name of collision.contendingAgents) {
        const list = collisionFilesByAgent.get(name) ?? [];
        if (!list.includes(collision.filePath)) list.push(collision.filePath);
        collisionFilesByAgent.set(name, list);
      }
    }

    const items: AgentReviewItem[] = [];
    for (const agent of fleet.agents) {
      const branchStat = await this.runGitRaw(
        `diff --numstat ${baseBranch}...${agent.branchName}`,
        repoPath
      ).catch(() => '');
      const live =
        agent.worktreePath && fs.existsSync(agent.worktreePath)
          ? await this.getLiveChanges(agent.worktreePath)
          : [];

      const byPath = new Map<string, AgentFileChange>();
      for (const line of branchStat.split('\n').filter(Boolean)) {
        const parsed = parseNumstatLine(line);
        if (parsed) byPath.set(parsed.path, parsed);
      }
      for (const file of live) {
        const existing = byPath.get(file.path);
        byPath.set(
          file.path,
          existing
            ? {
                ...existing,
                additions: existing.additions + file.additions,
                deletions: existing.deletions + file.deletions,
                status: file.status,
              }
            : file
        );
      }
      const files = Array.from(byPath.values());
      const commitsAhead =
        Number(
          (
            await this.runGitRaw(`rev-list --count ${baseBranch}..${agent.branchName}`, repoPath).catch(
              () => '0'
            )
          ).trim()
        ) || 0;

      const stored = store[agent.id];
      // 'queued' (after rollback/discard) and 'changes-requested' are waiting on the
      // agent; once it reports a newer heartbeat, derive the status from its work again.
      const superseded =
        (stored?.status === 'queued' || stored?.status === 'changes-requested') &&
        agent.lastHeartbeat > stored.updatedAt;
      const status =
        stored?.status && !superseded ? stored.status : this.deriveReviewStatus(agent, files, commitsAhead);

      items.push({
        id: agent.id,
        agentId: agent.id,
        agentName: agent.name,
        harness: agent.harness,
        color: agent.color,
        branchName: agent.branchName,
        worktreePath: agent.worktreePath,
        taskDescription: agent.taskDescription,
        status,
        agentStatus: agent.status,
        files,
        additions: files.reduce((n, f) => n + f.additions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
        commitsAhead,
        collisions: collisionFilesByAgent.get(agent.name) ?? [],
        checkpoint: stored?.checkpoint,
        feedback: stored?.feedback,
        createdAt: stored?.checkpoint?.createdAt ?? agent.lastHeartbeat,
        updatedAt: stored?.updatedAt ?? agent.lastHeartbeat,
        lastHeartbeat: agent.lastHeartbeat,
      });
    }

    const priority: Record<AgentReviewStatus, number> = {
      'needs-review': 0,
      failed: 1,
      'changes-requested': 2,
      running: 3,
      approved: 4,
      merged: 5,
      queued: 6,
    };
    items.sort((a, b) => priority[a.status] - priority[b.status] || b.updatedAt - a.updatedAt);

    const attention: AgentAttentionItem[] = [];
    for (const item of items) {
      if (item.status === 'needs-review') {
        attention.push({
          id: `review:${item.id}`,
          kind: 'review',
          severity: 'high',
          title: `${item.agentName} is ready for review`,
          detail: `${item.files.length} file${item.files.length === 1 ? '' : 's'} · +${item.additions} / −${item.deletions}`,
          agentId: item.id,
          createdAt: item.updatedAt,
        });
      }
      if (item.status === 'failed') {
        attention.push({
          id: `failed:${item.id}`,
          kind: 'error',
          severity: 'high',
          title: `${item.agentName} looks stalled`,
          detail: item.feedback || 'The agent stopped reporting progress. Check its worktree or restart the run.',
          agentId: item.id,
          createdAt: item.updatedAt,
        });
      }
      if (item.status === 'changes-requested') {
        attention.push({
          id: `changes:${item.id}`,
          kind: 'review',
          severity: 'medium',
          title: `Changes requested from ${item.agentName}`,
          detail: item.feedback || 'Waiting for the agent to address review feedback.',
          agentId: item.id,
          createdAt: item.updatedAt,
        });
      }
    }
    for (const collision of fleet.collisions) {
      attention.push({
        id: `collision:${collision.filePath}`,
        kind: 'collision',
        severity: collision.severity,
        title: `Collision on ${collision.filePath}`,
        detail: collision.suggestedAction,
        createdAt: Date.now(),
      });
    }
    if (fleet.indexLockDetected) {
      attention.push({
        id: 'index-lock',
        kind: 'index-lock',
        severity: 'high',
        title: 'Stale .git/index.lock detected',
        detail: 'A stalled agent or process is holding the Git index lock.',
        createdAt: Date.now(),
      });
    }

    return { generatedAt: Date.now(), baseBranch, items, attention };
  }

  async getAgentReviewSnapshot(repoPath: string): Promise<AgentReviewSnapshot> {
    const fleet = await this.getAgentFleet(repoPath);
    const review = await this.buildReviewState(repoPath, fleet);
    return { fleet, review };
  }

  async getAgentReview(repoPath: string): Promise<AgentReviewState> {
    return (await this.getAgentReviewSnapshot(repoPath)).review;
  }

  async getAgentReviewDiff(repoPath: string, agentId: string, file?: string): Promise<AgentDiffResponse> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    const baseBranch = snapshot.review.baseBranch;
    const hasWorktree = Boolean(agent.worktreePath && fs.existsSync(agent.worktreePath));
    const dir = hasWorktree ? agent.worktreePath! : repoPath;
    const range = hasWorktree ? baseBranch : `${baseBranch}...${agent.branchName}`;
    const pathArg = file ? ` -- "${file.replace(/"/g, '\\"')}"` : '';

    // `git diff` skips untracked files, which hides new files an agent created.
    // Mark them intent-to-add for the duration of the diff, then restore the index.
    let intentAdded: string[] = [];
    if (hasWorktree) {
      const untracked = (await this.runGitRaw('ls-files --others --exclude-standard', dir).catch(() => ''))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      intentAdded = file ? untracked.filter((f) => f === file) : untracked;
      if (intentAdded.length > 0) {
        const args = intentAdded.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        await this.runGitRaw(`add -N -- ${args}`, dir).catch(() => {
          intentAdded = [];
        });
      }
    }

    try {
      const [rawDiff, numstat] = await Promise.all([
        this.runGitRaw(`diff ${range}${pathArg}`, dir).catch(() => ''),
        this.runGitRaw(`diff --numstat ${range}${pathArg}`, dir).catch(() => ''),
      ]);

      const files = numstat
        .split('\n')
        .filter(Boolean)
        .map((line) => parseNumstatLine(line))
        .filter((f): f is AgentFileChange => f !== null)
        .map((f) => ({ path: f.path, status: f.status, additions: f.additions, deletions: f.deletions }));

      return { agentId, baseBranch, files, rawDiff };
    } finally {
      if (intentAdded.length > 0) {
        const args = intentAdded.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        await this.runGitRaw(`reset -q -- ${args}`, dir).catch(() => {});
      }
    }
  }

  async checkpointAgent(repoPath: string, agentId: string, label?: string): Promise<AgentReviewState> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    if (!agent.worktreePath || !fs.existsSync(agent.worktreePath)) {
      throw new Error('Checkpoints require a dedicated agent worktree.');
    }
    const dir = agent.worktreePath;
    const head = (await this.runGitRaw('rev-parse HEAD', dir)).trim();
    const dirty = (await this.runGitRaw('status --porcelain', dir)).trim();
    const worktreeHead = dirty
      ? (await this.runGitRaw('stash create', dir).catch(() => '')).trim() || undefined
      : undefined;

    const checkpoint: AgentCheckpoint = {
      id: `cp-${Date.now().toString(36)}`,
      agentId,
      createdAt: Date.now(),
      head,
      worktreeHead,
      baseBranch: snapshot.review.baseBranch,
      label: label?.trim() || 'Pre-run checkpoint',
    };

    await this.runGitRaw(
      `update-ref refs/gitter/checkpoints/${agentId.replace(/[^a-zA-Z0-9_-]/g, '-')}/${checkpoint.id} ${head}`,
      repoPath
    ).catch(() => {});

    const store = await this.loadReviewStore(repoPath);
    store[agentId] = { ...store[agentId], checkpoint, updatedAt: Date.now() };
    await this.saveReviewStore(repoPath, store);
    return this.getAgentReview(repoPath);
  }

  async rollbackAgent(repoPath: string, agentId: string, checkpointId?: string): Promise<AgentReviewState> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    if (!agent.worktreePath || !fs.existsSync(agent.worktreePath)) {
      throw new Error('Rollback requires a dedicated agent worktree.');
    }
    const store = await this.loadReviewStore(repoPath);
    const stored = store[agentId];
    const checkpoint = checkpointId
      ? stored?.checkpoint?.id === checkpointId
        ? stored.checkpoint
        : undefined
      : stored?.checkpoint;
    if (!checkpoint) {
      throw new Error('No checkpoint exists for this agent yet. Create one before running the agent.');
    }

    const dir = agent.worktreePath;
    await this.runGitRaw(`reset --hard ${checkpoint.head}`, dir);
    if (checkpoint.worktreeHead) {
      await this.runGitRaw(`stash apply ${checkpoint.worktreeHead}`, dir).catch(() => {});
    }
    store[agentId] = {
      ...stored,
      status: 'queued',
      feedback: `Rolled back to checkpoint ${checkpoint.id}.`,
      updatedAt: Date.now(),
    };
    await this.saveReviewStore(repoPath, store);
    return this.getAgentReview(repoPath);
  }

  async approveAgentChanges(
    repoPath: string,
    agentId: string,
    message: string,
    mode: 'commit' | 'merge' = 'commit'
  ): Promise<{
    review: AgentReviewState;
    committed: boolean;
    merged: boolean;
    commitHash?: string;
    message: string;
  }> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    if (!agent.worktreePath || !fs.existsSync(agent.worktreePath)) {
      throw new Error('Approving agent work requires a dedicated agent worktree.');
    }
    const dir = agent.worktreePath;
    const commitMessage =
      message.trim() ||
      `chore(agent): accept ${agent.name} changes\n\nAgent-Harness: ${agent.harness}\nAgent-Branch: ${agent.branchName}`;

    let committed = false;
    let commitHash: string | undefined;
    const dirty = (await this.runGitRaw('status --porcelain', dir)).trim();
    if (dirty) {
      await this.runGitRaw('add -A', dir);
      await this.runGitRaw(`commit -m ${JSON.stringify(commitMessage)}`, dir);
      committed = true;
      commitHash = (await this.runGitRaw('rev-parse HEAD', dir)).trim();
    }

    let merged = false;
    let note = committed ? 'Committed agent changes on its branch.' : 'No uncommitted changes to commit.';
    if (mode === 'merge') {
      const mainDirty = (await this.runGitRaw('status --porcelain', repoPath)).trim();
      if (mainDirty) {
        note += ' Merge skipped because the main working tree has uncommitted changes.';
      } else {
        const currentBranch = (await this.runGitRaw('rev-parse --abbrev-ref HEAD', repoPath)).trim();
        await this.runGitRaw(
          `merge --no-ff ${agent.branchName} -m ${JSON.stringify(
            `Merge ${agent.branchName} into ${currentBranch}`
          )}`,
          repoPath
        );
        merged = true;
        note += ` Merged into ${currentBranch}.`;
      }
    }

    const store = await this.loadReviewStore(repoPath);
    store[agentId] = {
      ...store[agentId],
      status: merged ? 'merged' : 'approved',
      feedback: note,
      updatedAt: Date.now(),
    };
    await this.saveReviewStore(repoPath, store);

    return {
      review: await this.getAgentReview(repoPath),
      committed,
      merged,
      commitHash,
      message: note,
    };
  }

  async requestAgentChanges(repoPath: string, agentId: string, feedback: string): Promise<AgentReviewState> {
    const trimmed = feedback.trim();
    if (!trimmed) throw new Error('Describe the changes you want the agent to make.');
    const store = await this.loadReviewStore(repoPath);
    store[agentId] = {
      ...store[agentId],
      status: 'changes-requested',
      feedback: trimmed,
      updatedAt: Date.now(),
    };
    await this.saveReviewStore(repoPath, store);

    try {
      const dir = path.join(this.resolveGitDir(repoPath), 'gitter', 'agent-feedback');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, `${agentId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${Date.now()}.md`),
        `# Review feedback\n\n${trimmed}\n`,
        'utf8'
      );
    } catch {
      // Feedback is already persisted in the review store.
    }
    return this.getAgentReview(repoPath);
  }

  async discardAgentChanges(repoPath: string, agentId: string): Promise<AgentReviewState> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    if (!agent.worktreePath || !fs.existsSync(agent.worktreePath)) {
      throw new Error('Discarding agent work requires a dedicated agent worktree.');
    }
    const store = await this.loadReviewStore(repoPath);
    const checkpoint = store[agentId]?.checkpoint;
    if (checkpoint) {
      return this.rollbackAgent(repoPath, agentId, checkpoint.id);
    }

    const dir = agent.worktreePath;
    await this.runGitRaw(`reset --hard ${snapshot.review.baseBranch}`, dir);
    await this.runGitRaw('clean -fd', dir).catch(() => {});
    store[agentId] = {
      ...store[agentId],
      status: 'queued',
      feedback: 'Discarded all agent changes.',
      updatedAt: Date.now(),
    };
    await this.saveReviewStore(repoPath, store);
    return this.getAgentReview(repoPath);
  }

  async rejectAgentHunk(repoPath: string, agentId: string, patch: string): Promise<AgentDiffResponse> {
    const snapshot = await this.getAgentReviewSnapshot(repoPath);
    const agent = this.resolveAgentOrThrow(snapshot.fleet, agentId);
    if (!agent.worktreePath || !fs.existsSync(agent.worktreePath)) {
      throw new Error('Hunk review requires a dedicated agent worktree.');
    }
    await this.runGitWithStdin(['apply', '-R', '--whitespace=nowarn', '-'], patch, agent.worktreePath);
    return this.getAgentReviewDiff(repoPath, agentId);
  }

  async runAgentCommand(
    repoPath: string,
    command: string
  ): Promise<{ success: boolean; output: string }> {
    const cmd = command.trim();
    if (!cmd) throw new Error('No command provided.');
    if ([...cmd].some((ch) => ch.charCodeAt(0) < 0x20)) throw new Error('Agent commands must be a single line.');
    const tokens = tokenizeCommand(cmd);
    if (tokens[0] !== 'git' || tokens.length < 2) {
      throw new Error('Only git commands can be executed from the agent dock.');
    }
    const args = tokens.slice(1);
    // Global options before the subcommand (-c, -C, --exec-path, ...) can redirect
    // git to run arbitrary programs, so the subcommand must come first.
    const sub = args[0];
    const allowed = new Set([
      'status', 'log', 'diff', 'show', 'branch', 'fetch', 'pull', 'push', 'add', 'commit',
      'checkout', 'switch', 'restore', 'stash', 'merge', 'rebase', 'cherry-pick', 'revert',
      'tag', 'remote', 'worktree', 'blame', 'shortlog', 'describe', 'rev-parse', 'ls-files',
    ]);
    if (!allowed.has(sub)) {
      throw new Error(`'git ${sub}' is not available from the agent dock. Use the dedicated Git actions in the UI instead.`);
    }
    const blockedFlag = (arg: string) =>
      // Flags that force history rewrites or hand git an external program to run.
      /^--(force|force-with-lease|force-if-includes|mirror|exec|extcmd|tool|output|upload-pack|receive-pack|exec-path|config-env)(=|$)/.test(arg) ||
      (['push', 'rebase', 'checkout', 'switch'].includes(sub) && /^-[a-zA-Z]*[fx][a-zA-Z]*$/.test(arg)) ||
      (sub === 'push' && arg.startsWith('+')) ||
      (sub === 'branch' && /^-[a-zA-Z]*D/.test(arg)) ||
      arg === '-c' ||
      arg.startsWith('-c=');
    if (args.slice(1).some(blockedFlag)) {
      throw new Error('That destructive command is blocked. Use the dedicated Git actions in the UI instead.');
    }
    if (sub === 'worktree' && args[1] && args[1] !== 'list') {
      throw new Error('Only `git worktree list` is available from the agent dock.');
    }

    const output = await new Promise<string>((resolve, reject) => {
      // No shell: arguments go straight to git, so metacharacters are inert.
      const child = spawn('git', args, { cwd: repoPath, windowsHide: true, shell: false });
      let out = '';
      const timer = setTimeout(() => child.kill(), 30_000);
      child.stdout.on('data', (d) => { if (out.length < 10 * 1024 * 1024) out += d.toString(); });
      child.stderr.on('data', (d) => { if (out.length < 10 * 1024 * 1024) out += d.toString(); });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out.trim());
        else reject(new Error(out.trim() || `git exited with code ${code}`));
      });
    });
    return { success: true, output: output || 'Command completed with no output.' };
  }

  // Zero-Friction In-Place Software Updater
  async performInPlaceUpdate(
    targetVersion: string,
    downloadUrl?: string,
    assetName?: string
  ): Promise<{ success: boolean; method: string; message: string }> {
    const cwd = process.cwd();
    let isGitRepo = false;

    try {
      const remoteUrl = await this.runGitRaw('config --get remote.origin.url', cwd);
      if (remoteUrl && remoteUrl.includes('gitter')) {
        isGitRepo = true;
      }
    } catch {
      isGitRepo = false;
    }

    // Mode A: Running from Git clone (Local Dev / Source Installation)
    if (isGitRepo) {
      try {
        await this.runGitRaw('fetch origin --tags', cwd);
        await this.runGitRaw('pull origin main', cwd);
        await execAsync('npm run build', { cwd });
        return {
          success: true,
          method: 'git-rebuild',
          message: `In-place update to v${targetVersion} pulled & compiled successfully! Reloading...`,
        };
      } catch (err: any) {
        console.warn('Git in-place update fallback to binary download:', err);
      }
    }

    // Mode B: Packaged binary / Installer update
    if (!downloadUrl) {
      throw new Error(`No direct download URL available for v${targetVersion} on this platform.`);
    }

    const tempDir = os.tmpdir();
    const filename = assetName || `gitter-update-${targetVersion}.exe`;
    const tempFilePath = path.join(tempDir, filename);

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download update binary from GitHub (${res.status} ${res.statusText})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(tempFilePath, buffer);

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWindows) {
      if (filename.endsWith('.exe')) {
        // NSIS installer silent update with /S
        exec(`start "" "${tempFilePath}" /S`);
      } else if (filename.endsWith('.msi')) {
        exec(`msiexec /i "${tempFilePath}" /passive`);
      } else {
        exec(`start "" "${tempFilePath}"`);
      }
    } else if (isMac) {
      exec(`open "${tempFilePath}"`);
    } else {
      if (filename.endsWith('.AppImage')) {
        await execAsync(`chmod +x "${tempFilePath}"`);
        exec(`"${tempFilePath}"`);
      } else if (filename.endsWith('.deb')) {
        exec(`xdg-open "${tempFilePath}"`);
      }
    }

    return {
      success: true,
      method: 'installer-launched',
      message: `Update package saved to ${tempFilePath}. Installer launched automatically!`,
    };
  }
}

export const gitService = new GitService();
