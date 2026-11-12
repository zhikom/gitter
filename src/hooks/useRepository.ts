import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Branch, Commit, FileStatus, PullRequest, Remote, RepositoryState, Stash, Submodule, Tag, Worktree } from '../../shared/types/git';
import { toast } from '../utils/toast';

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
  refresh: () => Promise<void>;
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

  const refresh = useCallback(async () => {
    if (!repo) return;
    setRunning((n) => n + 1);
    try {
      const [state, commits, statuses, branches, tags, stashes, remotes, worktrees, submodules] = await Promise.all([
        api.repoState({ repo }),
        api.commits({ repo, limit: 500 }),
        api.fileStatuses({ repo }),
        api.branches({ repo }),
        api.tags({ repo }),
        api.stashes({ repo }),
        api.remotes({ repo }),
        api.worktrees({ repo }),
        api.submodules({ repo }),
      ]);
      if (current.current !== repo) return; // another repository opened meanwhile
      setData((prev) => ({ ...prev, state, commits, statuses, branches, tags, stashes, remotes, worktrees, submodules }));
      setProblem(null);
    } catch (e: any) {
      if (current.current === repo) setProblem(e.message);
    } finally {
      setRunning((n) => n - 1);
    }
  }, [repo]);

  // Pull requests come from the GitHub CLI, so only repositories with a GitHub remote ask.
  const hasGitHubRemote = data.remotes.some((r) => /github\.com[/:]/i.test(r.fetchUrl));
  useEffect(() => {
    if (!repo || !hasGitHubRemote) {
      setData((prev) => (prev.pullRequests.length ? { ...prev, pullRequests: [] } : prev));
      return;
    }
    api
      .pullRequests({ repo })
      .then((pullRequests) => current.current === repo && setData((prev) => ({ ...prev, pullRequests })))
      .catch(() => current.current === repo && setData((prev) => ({ ...prev, pullRequests: [] })));
  }, [repo, hasGitHubRemote, data.commits]);

  useEffect(() => {
    setData(EMPTY);
    setProblem(null);
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
    return () => window.removeEventListener('focus', onFocus);
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

  return { ...data, busy: running > 0, problem, refresh, run };
}
