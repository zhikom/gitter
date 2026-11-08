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
    const dir = path.join(repoPath, '.git', 'gitter');
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

  // Shelve & Unshelve (JetBrains Source Control)
  private getShelvesDir(repoPath: string): string {
    const dir = path.join(repoPath, '.git', 'gitter', 'shelves');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async getShelves(repoPath: string): Promise<any[]> {
    try {
      const dir = this.getShelvesDir(repoPath);
      const files = await fs.promises.readdir(dir);
      const shelves: any[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.promises.readFile(path.join(dir, file), 'utf8');
          shelves.push(JSON.parse(content));
        }
      }
      return shelves.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  async shelve(repoPath: string, name: string, filePaths: string[], keepWorkingChanges: boolean = false): Promise<any> {
    const dir = this.getShelvesDir(repoPath);
    const id = `shelf-${Date.now()}`;
    const fileArgs = filePaths.map((f) => `"${f}"`).join(' ');
    const patch = await this.runGitRaw(`diff HEAD -- ${fileArgs}`, repoPath);
    if (!keepWorkingChanges) {
      await this.runGitRaw(`checkout HEAD -- ${fileArgs}`, repoPath);
    }
    const shelf = {
      id,
      name: name.trim() || `Shelf on ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString(),
      timestamp: Date.now(),
      files: filePaths,
      patch,
    };
    await fs.promises.writeFile(path.join(dir, `${id}.json`), JSON.stringify(shelf, null, 2), 'utf8');
    return shelf;
  }

  async unshelve(repoPath: string, shelfId: string, deleteAfter: boolean = false): Promise<void> {
    const dir = this.getShelvesDir(repoPath);
    const shelfFile = path.join(dir, `${shelfId}.json`);
    if (!fs.existsSync(shelfFile)) throw new Error('Shelf not found');
    const content = JSON.parse(await fs.promises.readFile(shelfFile, 'utf8'));
    if (content.patch) {
      await this.stagePatch(repoPath, content.patch);
      // Reset index to leave changes in working tree unstaged
      await this.runGitRaw('reset', repoPath);
    }
    if (deleteAfter) {
      await fs.promises.unlink(shelfFile);
    }
  }

  async deleteShelf(repoPath: string, shelfId: string): Promise<void> {
    const dir = this.getShelvesDir(repoPath);
    const shelfFile = path.join(dir, `${shelfId}.json`);
    if (fs.existsSync(shelfFile)) {
      await fs.promises.unlink(shelfFile);
    }
  }

  // Stash details & Diff Inspector
  async getStashFiles(repoPath: string, index: number = 0): Promise<{
    files: Array<{ path: string; status: string; additions: number; deletions: number }>;
    summary: string;
  }> {
    const stashRef = `stash@{${index}}`;
    const numstat = await this.runGitRaw(`stash show --numstat ${stashRef}`, repoPath);
    const nameStatus = await this.runGitRaw(`stash show --name-status ${stashRef}`, repoPath);

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
    const rawDiff = await this.runGitRaw(`stash show -p ${stashRef} -- "${filePath}"`, repoPath);
    return parseGitDiff(rawDiff);
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
    const configPath = path.join(repoPath, '.git', 'gitter', 'config.json');
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
    const dir = path.join(repoPath, '.git', 'gitter');
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
}

export const gitService = new GitService();
