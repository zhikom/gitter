import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { desktopApi } from '../api/desktop';
import { isTauri } from '@tauri-apps/api/core';
import type { Branch, Commit, FileStatus, PullRequest, Remote, RepositoryState, Stash, Submodule, Tag, Worktree } from '../../shared/types/git';
import { toast } from '../utils/toast';
import { loadBitbucketPullRequests, matchBitbucketRemote, type BitbucketTarget } from '../utils/bitbucketRemote';

export interface RepositoryData {
  state: RepositoryState | null;
  commits: Commit[];
  statuses: FileStatus[];
  branches: Branch[];
  tags: Tag[];
  stashes: Stash[];
  remotes: Remote[];
  worktrees: Worktree[];
  submodules: Submodule[];
  pullRequests: PullRequest[];
}

const EMPTY: RepositoryData = {
  state: null,
  commits: [],
  statuses: [],
  branches: [],
  tags: [],
  stashes: [],
  remotes: [],
  worktrees: [],
  submodules: [],
  pullRequests: [],
};

export interface RunOptions<T> {
  /** Shown when the action succeeds; a function can describe its result. */
  success?: string | ((result: T) => string | undefined);
  /** Most actions change the repository, so they reload it afterwards. */
  refresh?: boolean;
}

export interface Repository extends RepositoryData {
  /** True while an action or a reload is running. */
  busy: boolean;
  /** Why the repository could not be read, e.g. the folder is not a repository. */
  problem: string | null;
  refresh: (options?: { pullRequests?: boolean }) => Promise<void>;
  commitForBranch: (hash: string) => Promise<Commit | null>;
  pullRequestStatus: { supported: boolean; loading: boolean; message: string; needsConnection: boolean; bitbucket: BitbucketTarget | null; github: boolean };
  /**
   * Runs one user action: reports a failure as "<label>: <reason>" and rethrows
   * it (so dialogs can stay open), and reloads the repository either way,
   * since a failed merge or rebase also changes it.
   */
  run: <T>(label: string, action: () => Promise<T>, options?: RunOptions<T>) => Promise<T>;
}

/** Everything the window shows about one repository, kept current. */
export function useRepository(repo: string): Repository {
  const [data, setData] = useState<RepositoryData>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(0);
  const current = useRef(repo);
  current.current = repo;
  // Refreshes can overlap (two quick clicks); only the newest one's answer is shown.
  const latestRefresh = useRef(0);
  const historyLimit = useRef(500);
  const [pullRequestTick, setPullRequestTick] = useState(0);
  const [pullRequestStatus, setPullRequestStatus] = useState<Repository['pullRequestStatus']>({ supported: false, loading: false, message: '', needsConnection: false, bitbucket: null, github: false });
  const pullRequestsLoadedAt = useRef(0);

  /** `pullRequests`: reload them now, not just when the last load is a minute old. */
  const refresh = useCallback(async (options?: { pullRequests?: boolean }) => {
    // A refresh for a repository that is no longer open (after a slow action) must not supersede the open one's.
    if (!repo || current.current !== repo) return;
    const id = ++latestRefresh.current;
    setRunning((n) => n + 1);
    // gh is slow and rate-limited, so pull requests reload at most once a minute unless asked.
    if (options?.pullRequests === true || Date.now() - pullRequestsLoadedAt.current > 60_000) setPullRequestTick((t) => t + 1);
    try {
      const [state, commits, statuses, branches, tags, stashes, remotes, worktrees, submodules] = await Promise.all([
        api.repoState({ repo }),
        api.commits({ repo, limit: historyLimit.current }),
        api.fileStatuses({ repo }),
        api.branches({ repo }),
        api.tags({ repo }),
        api.stashes({ repo }),
        api.remotes({ repo }),
        api.worktrees({ repo }),
        api.submodules({ repo }),
      ]);
      if (current.current !== repo || id !== latestRefresh.current) return; // superseded
      setData((prev) => ({ ...prev, state, commits, statuses, branches, tags, stashes, remotes, worktrees, submodules }));
      setProblem(null);
    } catch (e: any) {
      if (current.current === repo && id === latestRefresh.current) setProblem(e.message);
    } finally {
      setRunning((n) => n - 1);
    }
  }, [repo]);

  const commitForBranch = useCallback(async (hash: string): Promise<Commit | null> => {
    const existing = data.commits.find((commit) => commit.hash === hash);
    if (existing) return existing;
    ++latestRefresh.current;
    const commits = await api.commitsThrough({ repo, hash });
    if (current.current !== repo) return null;
    historyLimit.current = Math.max(historyLimit.current, commits.length);
    setData((previous) => ({ ...previous, commits }));
    return commits.find((commit) => commit.hash === hash) ?? null;
  }, [repo, data.commits]);

  // Load each supported provider independently; report failures rather than hiding them as an empty list.
  const hasGitHubRemote = data.remotes.some((r) => /github\.com[/:]/i.test(r.fetchUrl));
  const remotesKey = JSON.stringify(data.remotes.map((remote) => [remote.name, remote.fetchUrl]));
  useEffect(() => {
    let live = true;
    if (!repo || data.remotes.length === 0) {
      setPullRequestStatus({ supported: false, loading: false, message: '', needsConnection: false, bitbucket: null, github: false });
      setData((prev) => prev.pullRequests.length ? { ...prev, pullRequests: [] } : prev);
      return () => { live = false; };
    }
    pullRequestsLoadedAt.current = Date.now();
    setPullRequestStatus((previous) => ({ ...previous, loading: true, message: '' }));
    void (async () => {
      const connections = isTauri() ? await desktopApi.listIntegrations() : [];
      const targets = data.remotes.map((remote) => matchBitbucketRemote(remote, connections)).filter((target): target is BitbucketTarget => Boolean(target));
      const unique = targets.filter((target, index) => targets.findIndex((item) => item.connection.id === target.connection.id && item.projectKey.toLowerCase() === target.projectKey.toLowerCase() && item.slug.toLowerCase() === target.slug.toLowerCase()) === index);
      const looksLikeBitbucket = data.remotes.some((remote) => /(?:^|[@/:.])bitbucket[.:-]/i.test(remote.fetchUrl));
      const needsConnection = unique.some((target) => !target.connection.authenticated) || (looksLikeBitbucket && unique.length === 0);
      const supported = hasGitHubRemote || unique.length > 0 || looksLikeBitbucket;
      const errors: string[] = [];
      if (looksLikeBitbucket && unique.length === 0) errors.push('Connect this Bitbucket server in Settings to see pull requests.');
      const requests: Promise<PullRequest[]>[] = [];
      if (hasGitHubRemote) {
        void api.githubStatus().catch(() => undefined);
        requests.push(api.pullRequests({ repo }));
      }
      for (const target of unique) {
        if (!target.connection.authenticated) { errors.push(`Connect ${target.connection.label} for this session to see pull requests.`); continue; }
        requests.push(loadBitbucketPullRequests(target, (start) => desktopApi.getBitbucketPullRequests(target.connection.id, target.projectKey, target.slug, start)));
      }
      const results = await Promise.allSettled(requests);
      const pulls = results.flatMap((result) => {
        if (result.status === 'fulfilled') return result.value;
        errors.push(`Could not load pull requests: ${String(result.reason?.message || result.reason)}`); return [];
      });
      if (!live || current.current !== repo) return;
      setData((prev) => ({ ...prev, pullRequests: pulls }));
      setPullRequestStatus({ supported, loading: false, message: errors.join(' '), needsConnection, bitbucket: unique[0] ?? null, github: hasGitHubRemote });
    })().catch((error) => {
      if (live && current.current === repo) setPullRequestStatus({ supported: true, loading: false, message: `Could not load pull requests: ${String(error?.message || error)}`, needsConnection: false, bitbucket: null, github: hasGitHubRemote });
    });
    return () => { live = false; };
  }, [repo, remotesKey, hasGitHubRemote, pullRequestTick]);

  useEffect(() => {
    setData(EMPTY);
    setProblem(null);
    historyLimit.current = 500;
    pullRequestsLoadedAt.current = 0;
    void refresh();
  }, [refresh]);

  // Changes made outside Gitter (an editor, a terminal) show up when the window is used again.
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      if (Date.now() - last < 2000) return;
      last = Date.now();
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    const onIntegrationsChanged = () => void refresh({ pullRequests: true });
    window.addEventListener('gitter:integrations-changed', onIntegrationsChanged);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('gitter:integrations-changed', onIntegrationsChanged); };
  }, [refresh]);

  const run = useCallback(
    async <T>(label: string, action: () => Promise<T>, { success, refresh: reload = true }: RunOptions<T> = {}): Promise<T> => {
      setRunning((n) => n + 1);
      try {
        const result = await action();
        const message = typeof success === 'function' ? success(result) : success;
        if (message) toast.success(message);
        return result;
      } catch (e: any) {
        toast.error(`${label}: ${e.message}`);
        throw e;
      } finally {
        setRunning((n) => n - 1);
        if (reload) void refresh();
      }
    },
    [refresh]
  );

  return { ...data, busy: running > 0, problem, refresh, commitForBranch, run, pullRequestStatus };
}
