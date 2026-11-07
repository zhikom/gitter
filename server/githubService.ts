import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface GitHubUser {
  login: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  author: {
    login: string;
    avatarUrl?: string;
  };
  headRefName: string;
  baseRefName: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  mergeable?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export class GitHubService {
  async runGh(args: string[], cwd?: string): Promise<string> {
    const { stdout } = await execAsync(`gh ${args.join(' ')}`, {
      cwd: cwd || process.cwd(),
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  }

  async getAuthStatus(): Promise<GitHubUser> {
    try {
      const out = await this.runGh(['auth', 'status']);
      const match = out.match(/account\s+([a-zA-Z0-9_\-]+)/i);
      const login = match ? match[1] : 'GitHub User';
      return {
        login,
        isAuthenticated: true,
      };
    } catch (e: any) {
      const stderr = e.stderr || e.stdout || '';
      const match = stderr.match(/account\s+([a-zA-Z0-9_\-]+)/i);
      if (match) {
        return {
          login: match[1],
          isAuthenticated: true,
        };
      }
      return {
        login: '',
        isAuthenticated: false,
      };
    }
  }

  async getRepoSlug(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: repoPath });
      const raw = stdout.trim();
      // Match git@github.com:owner/repo.git or https://github.com/owner/repo.git
      const match = raw.match(/github\.com[:\/]([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+?)(?:\.git)?$/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async getPullRequests(repoPath: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> {
    try {
      const out = await this.runGh(
        [
          'pr',
          'list',
          `--state=${state}`,
          '--json=number,title,author,headRefName,baseRefName,state,url,createdAt,updatedAt,isDraft',
        ],
        repoPath
      );

      const items = JSON.parse(out);
      return items.map((item: any) => ({
        number: item.number,
        title: item.title,
        author: {
          login: item.author?.login || 'ghost',
          avatarUrl: item.author?.avatarUrl,
        },
        headRefName: item.headRefName,
        baseRefName: item.baseRefName,
        state: item.state,
        url: item.url,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isDraft: item.isDraft,
      }));
    } catch (e) {
      console.warn('Failed to fetch PRs via gh CLI:', e);
      return [];
    }
  }

  async getPullRequestDetails(repoPath: string, prNumber: number): Promise<PullRequest | null> {
    try {
      const out = await this.runGh(
        [
          'pr',
          'view',
          String(prNumber),
          '--json=number,title,body,author,headRefName,baseRefName,state,url,createdAt,updatedAt,isDraft,mergeable,additions,deletions,changedFiles',
        ],
        repoPath
      );
      const item = JSON.parse(out);
      return {
        number: item.number,
        title: item.title,
        body: item.body,
        author: {
          login: item.author?.login || 'ghost',
          avatarUrl: item.author?.avatarUrl,
        },
        headRefName: item.headRefName,
        baseRefName: item.baseRefName,
        state: item.state,
        url: item.url,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isDraft: item.isDraft,
        mergeable: item.mergeable,
        additions: item.additions,
        deletions: item.deletions,
        changedFiles: item.changedFiles,
      };
    } catch (e) {
      console.error('Failed to view PR details:', e);
      return null;
    }
  }

  async createPullRequest(
    repoPath: string,
    title: string,
    body: string,
    head: string,
    base: string = 'main',
    isDraft: boolean = false
  ): Promise<{ url: string; number: number }> {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    const draftFlag = isDraft ? '--draft' : '';

    const out = await this.runGh(
      ['pr', 'create', `--title="${escapedTitle}"`, `--body="${escapedBody}"`, `--head="${head}"`, `--base="${base}"`, draftFlag].filter(Boolean),
      repoPath
    );

    const urlMatch = out.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
    const prNumber = urlMatch ? parseInt(urlMatch[1], 10) : 0;
    const url = urlMatch ? urlMatch[0] : out.trim();

    return { url, number: prNumber };
  }

  async checkoutPullRequest(repoPath: string, prNumber: number): Promise<string> {
    return await this.runGh(['pr', 'checkout', String(prNumber)], repoPath);
  }
}

export const githubService = new GitHubService();
