import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
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
import { parseGitDiff } from '../src/utils/diffParser';

const execAsync = promisify(exec);

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

  async getDiff(repoPath: string, filePath: string, staged: boolean = false): Promise<FileDiff[]> {
    try {
      if (staged) {
        const out = await this.runGitRaw(`diff --cached -- "${filePath}"`, repoPath);
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

        const out = await this.runGitRaw(`diff -- "${filePath}"`, repoPath);
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

  async saveStash(repoPath: string, message: string = '', includeUntracked: boolean = true): Promise<void> {
    const uFlag = includeUntracked ? '-u' : '';
    const mFlag = message ? `-m "${message.replace(/"/g, '\\"')}"` : '';
    await this.runGitRaw(`stash push ${uFlag} ${mFlag}`.trim(), repoPath);
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
}

export const gitService = new GitService();
