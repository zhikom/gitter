import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Bot, ExternalLink, FolderOpen, GitBranch, Layers, Link2, RefreshCw } from 'lucide-react';
import type { Commit, FileDiff, FileStatus, PullRequest, Stash } from '../../../shared/types/git';
import type { ReviewSnapshot } from '../../../shared/types/review';
import type {
  WorkBranch,
  WorkOverview,
  WorkSession,
  WorkSessionLink,
  WorkSessions,
  WorktreeState,
} from '../../../shared/types/workOverview';
import { api, pickFolder } from '../../api/client';
import { desktopApi } from '../../api/desktop';
import { usePreference } from '../../preferences';
import { loadBitbucketPullRequests, matchBitbucketRemote, type BitbucketTarget } from '../../utils/bitbucketRemote';
import { bitbucketReviewSnapshot } from '../../utils/pullReview';
import { toast } from '../../utils/toast';
import { DiffView } from '../Diff/DiffView';
import { Button, inputClass, Modal } from '../ui/Modal';
import { WorkSummaryPanel } from './WorkSummaryPanel';

interface Props {
  currentRepo: string;
  recent: string[];
  openPaths: string[];
  onClose: () => void;
  onOpen: (path: string) => void;
  onManage: (path: string) => void;
  onOpenStash: (path: string, stash: Stash) => void;
}
interface Row {
  key: string;
  overview: WorkOverview;
  branch?: WorkBranch;
  tree?: WorktreeState;
}
interface PullData {
  pulls: PullRequest[];
  errors: string[];
  loadedAt: number;
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINKS_KEY = 'gitter_work_session_links_v1';
const locationKey = (repo: string, branch: string, tree: string) => JSON.stringify([repo, branch, tree]);
const rowKey = (overview: WorkOverview, branch?: WorkBranch, tree?: WorktreeState) =>
  locationKey(overview.commonDir, `${branch?.remoteName ? 'remote:' : 'local:'}${branch?.name || ''}`, tree?.path || '');
const pathEqual = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/$/, '') === b.replace(/\\/g, '/').replace(/\/$/, '');
const pathInside = (dir: string, root: string) =>
  pathEqual(dir, root) || dir.replace(/\\/g, '/').startsWith(`${root.replace(/\\/g, '/').replace(/\/$/, '')}/`);
function readLinks(): WorkSessionLink[] {
  try {
    const value = JSON.parse(localStorage.getItem(LINKS_KEY) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item &&
              typeof item.repo === 'string' &&
              typeof item.branch === 'string' &&
              typeof item.worktree === 'string' &&
              ['codex', 'claude'].includes(item.provider) &&
              typeof item.id === 'string' &&
              ID.test(item.id),
          )
          .slice(0, 500)
      : [];
  } catch {
    return [];
  }
}
function fileCounts(files: FileStatus[] | null | undefined) {
  const result = { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  for (const file of files || []) {
    if (file.status === 'conflicted') result.conflicts++;
    else if (file.status === 'untracked') result.untracked++;
    else if (file.staged) result.staged++;
    else result.unstaged++;
  }
  return result;
}
const totalChanges = (tree?: WorktreeState) => tree?.files?.length || 0;
const absentCount = (row: Row) => (row.branch ? row.branch.absentFromOrigin : (row.tree?.absentFromOrigin ?? null));
function workRows(overview: WorkOverview, showRemote: boolean): Row[] {
  const branches = showRemote ? [...overview.branches, ...(overview.remoteBranches || [])] : overview.branches;
  const rows = branches.flatMap<Row>((branch) =>
    branch.worktrees.length
      ? branch.worktrees.map((tree) => ({ key: rowKey(overview, branch, tree), overview, branch, tree }))
      : [{ key: rowKey(overview, branch), overview, branch }],
  );
  rows.push(...overview.detached.map((tree) => ({ key: rowKey(overview, undefined, tree), overview, branch: undefined, tree })));
  return rows.sort(
    (a, b) =>
      Number(Boolean(a.branch?.remoteName)) - Number(Boolean(b.branch?.remoteName)) ||
      Number(Boolean(totalChanges(b.tree) || absentCount(b) || 0 || b.tree?.problem)) -
        Number(Boolean(totalChanges(a.tree) || absentCount(a) || 0 || a.tree?.problem)) ||
      (b.branch?.lastCommit || 0) - (a.branch?.lastCommit || 0),
  );
}
function trackLabel(branch?: WorkBranch): string {
  if (branch?.remoteName) return 'Remote-tracking branch';
  const track = branch?.upstream;
  if (!track || track.state === 'none') return 'No upstream';
  if (track.state === 'gone') return `${track.name} is gone`;
  if (track.state === 'unknown') return `${track.name}: unknown`;
  return `${track.name}: ↑${track.ahead} ↓${track.behind}`;
}
function date(value: number) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}
const label = 'text-[11px] font-semibold uppercase tracking-wide text-slate-400';
const panel = 'rounded-lg border border-[#2a3447] bg-[#171c26] p-3';
const detail = 'text-xs text-slate-300';

async function loadPullRequests(repo: string): Promise<PullData> {
  const remotes = await api.remotes({ repo });
  const connections = isTauri() ? await desktopApi.listIntegrations() : [];
  const targets = remotes
    .map((remote) => matchBitbucketRemote(remote, connections))
    .filter((target): target is BitbucketTarget => Boolean(target));
  const unique = targets.filter(
    (target, index) =>
      targets.findIndex(
        (other) =>
          other.connection.id === target.connection.id &&
          other.projectKey.toLowerCase() === target.projectKey.toLowerCase() &&
          other.slug.toLowerCase() === target.slug.toLowerCase(),
      ) === index,
  );
  const errors: string[] = [];
  const requests: Promise<PullRequest[]>[] = [];
  if (remotes.some((remote) => /github\.com[/:]/i.test(remote.fetchUrl))) requests.push(api.pullRequests({ repo }));
  for (const target of unique) {
    if (!target.connection.authenticated) errors.push(`Connect ${target.connection.label} in Settings to load its pull requests.`);
    else
      requests.push(
        loadBitbucketPullRequests(target, (start) =>
          desktopApi.getBitbucketPullRequests(target.connection.id, target.projectKey, target.slug, start),
        ),
      );
  }
  if (!requests.length && !errors.length) errors.push('No supported, connected GitHub or Bitbucket remote was found.');
  const results = await Promise.allSettled(requests);
  const pulls = results.flatMap((result) => {
    if (result.status === 'fulfilled') return result.value;
    errors.push(String(result.reason?.message || result.reason));
    return [];
  });
  return { pulls, errors, loadedAt: Date.now() };
}

export const WorkOverviewModal: React.FC<Props> = ({ currentRepo, recent, openPaths, onClose, onOpen, onManage, onOpenStash }) => {
  const [cloneFolder] = usePreference('cloneFolder');
  const [folder, setFolder] = useState('');
  const [overviews, setOverviews] = useState<WorkOverview[]>([]);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const [showRemote, setShowRemote] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [selectedKey, setSelectedKey] = useState('');
  const [links, setLinks] = useState<WorkSessionLink[]>(readLinks);
  const [sessions, setSessions] = useState<WorkSessions | null>(null);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [manualProvider, setManualProvider] = useState<'codex' | 'claude'>('codex');
  const [manualId, setManualId] = useState('');
  const [history, setHistory] = useState<Commit[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [pullsByRepo, setPullsByRepo] = useState<Record<string, PullData>>({});
  const [pullBusy, setPullBusy] = useState(false);
  const [reviews, setReviews] = useState<Record<string, ReviewSnapshot | string>>({});
  const runId = useRef(0);

  const scan = useCallback(
    async (requestedFolder?: string) => {
      const id = ++runId.current;
      setScanning(true);
      setScanErrors([]);
      setOverviews([]);
      setPullsByRepo({});
      try {
        const directory = requestedFolder || cloneFolder || (await api.defaultRepoFolder());
        if (runId.current !== id) return;
        setFolder(directory);
        let found: string[] = [];
        try {
          found = (await api.scanRepositories({ folder: directory })).map((entry) => entry.path);
        } catch (error: any) {
          if (runId.current === id) setScanErrors([`Could not scan ${directory}: ${error.message}`]);
        }
        const paths = [...new Set([currentRepo, ...openPaths, ...recent, ...found].filter(Boolean))];
        let index = 0;
        const results: WorkOverview[] = [];
        const errors: string[] = [];
        await Promise.all(
          Array.from({ length: Math.min(paths.length, 3) }, async () => {
            while (index < paths.length && runId.current === id) {
              const path = paths[index++];
              try {
                const value = await api.workOverview({ repo: path });
                if (!results.some((other) => pathEqual(other.commonDir, value.commonDir))) results.push(value);
                if (runId.current === id) setOverviews([...results].sort((a, b) => a.name.localeCompare(b.name)));
              } catch (error: any) {
                errors.push(`${path}: ${String(error?.message || error)}`);
                if (runId.current === id) setScanErrors((prior) => [...prior, errors[errors.length - 1]]);
              }
            }
          }),
        );
      } finally {
        if (runId.current === id) setScanning(false);
      }
    },
    [cloneFolder, currentRepo, openPaths, recent],
  );
  // Inputs are fixed for the lifetime of this dialog; refreshing is explicit.
  useEffect(() => {
    void scan();
    return () => {
      runId.current++;
    };
  }, []);

  const rows = useMemo(() => overviews.flatMap((overview) => workRows(overview, showRemote)), [overviews, showRemote]);
  const visibleRows = rows.filter((row) => {
    const text = `${row.overview.name} ${row.overview.root} ${row.branch?.name || ''} ${row.tree?.path || ''}`.toLowerCase();
    const attention =
      totalChanges(row.tree) ||
      row.tree?.problem ||
      row.tree?.rebase ||
      row.tree?.merge ||
      absentCount(row) === null ||
      (absentCount(row) || 0) > 0 ||
      (row.branch && !row.branch.remoteName && row.branch.upstream.state !== 'known');
    return text.includes(query.trim().toLowerCase()) && (filter === 'all' || attention);
  });
  const selected =
    rows.find((row) => row.key === selectedKey) || rows.find((row) => row.tree && pathEqual(row.tree.path, currentRepo)) || rows[0];
  const selectionId = selected?.key || '';
  const currentSelection = useRef('');
  currentSelection.current = selectionId;
  const repo = selected?.overview.root || '';
  const tree = selected?.tree;
  const branch = selected?.branch;
  const branchName = branch?.name || '';
  const sourceBranch =
    branch?.remoteName && branchName.startsWith(`${branch.remoteName}/`) ? branchName.slice(branch.remoteName.length + 1) : branchName;
  const selectedLinks = links.filter(
    (link) =>
      selected &&
      pathEqual(link.repo, selected.overview.commonDir) &&
      link.branch === branchName &&
      pathEqual(link.worktree, tree?.path || ''),
  );
  const possibleSessions = (sessions?.sessions || []).filter(
    (session) =>
      showAllSessions ||
      (tree && pathInside(session.cwd, tree.path)) ||
      (branchName && session.branch === branchName) ||
      selectedLinks.some((link) => link.provider === session.provider && link.id === session.id),
  );
  const sessionOptions: WorkSession[] = [...possibleSessions];
  for (const link of selectedLinks)
    if (!sessionOptions.some((session) => session.provider === link.provider && session.id === link.id)) {
      sessionOptions.push({
        id: link.id,
        provider: link.provider,
        title: 'Manually linked session',
        cwd: tree?.path || '',
        updatedAt: 0,
        source: 'Manual link',
      });
    }

  useEffect(() => {
    setDiff(null);
    setHistory([]);
    setHistoryError('');
    setShowAllSessions(false);
    setManualId('');
  }, [selectionId]);
  useEffect(() => {
    let active = true;
    setSessions(null);
    setSessionsBusy(Boolean(repo));
    if (repo)
      void api
        .workSessions({ repo })
        .then((result) => {
          if (active) setSessions(result);
        })
        .catch((error) => {
          if (active) setSessions({ sessions: [], warnings: [String(error?.message || error)] });
        })
        .finally(() => {
          if (active) setSessionsBusy(false);
        });
    return () => {
      active = false;
    };
  }, [repo]);
  useEffect(() => {
    let active = true;
    const head = branch?.head || tree?.head;
    if (repo && head && /^[0-9a-f]{40,64}$/i.test(head))
      void api
        .branchHistory({ repo, hash: head })
        .then((items) => {
          if (active) setHistory(items.slice(0, 12));
        })
        .catch((error) => {
          if (active) setHistoryError(String(error?.message || error));
        });
    return () => {
      active = false;
    };
  }, [repo, selectionId, branch?.head, tree?.head]);

  const saveLinks = (next: WorkSessionLink[]) => {
    setLinks(next);
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(next));
    } catch {
      toast.error('Could not save the session link on this device.');
    }
  };
  const toggleLink = (session: WorkSession) => {
    if (!selected || !tree) return;
    const exists = selectedLinks.some((link) => link.provider === session.provider && link.id === session.id);
    const next = links.filter(
      (link) =>
        !(
          pathEqual(link.repo, selected.overview.commonDir) &&
          link.branch === branchName &&
          pathEqual(link.worktree, tree.path) &&
          link.provider === session.provider &&
          link.id === session.id
        ),
    );
    if (!exists)
      next.push({ repo: selected.overview.commonDir, branch: branchName, worktree: tree.path, provider: session.provider, id: session.id });
    saveLinks(next);
  };
  const addManual = () => {
    if (!ID.test(manualId.trim())) {
      toast.error('Enter a session UUID, for example 12345678-1234-1234-1234-123456789abc.');
      return;
    }
    const id = manualId.trim().toLowerCase();
    if (!selectedLinks.some((link) => link.provider === manualProvider && link.id === id))
      toggleLink({ id, provider: manualProvider, title: '', cwd: tree?.path || '', updatedAt: 0, source: 'Manual link' });
    setManualId('');
  };
  const continueSession = async (session: WorkSession) => {
    if (!tree || !selected) return;
    const directory = pathInside(session.cwd, tree.path) ? session.cwd : tree.path;
    try {
      await api.resumeWorkSession({ repo, directory, provider: session.provider, id: session.id });
      toast.success(`Opening the ${session.provider === 'codex' ? 'Codex' : 'Claude'} desktop session.`);
    } catch (error: any) {
      toast.error(`${String(error?.message || error)} Use the displayed terminal command if desktop resume is unavailable.`);
    }
  };
  const preview = async (file: FileStatus) => {
    if (!tree) return;
    const requested = selectionId;
    try {
      const [result] = await api.workingDiff({ repo: tree.path, file: file.path, staged: file.staged });
      if (currentSelection.current !== requested) return;
      if (result) setDiff(result);
      else toast.info('No text diff is available for this file.');
    } catch (error: any) {
      toast.error(`Could not load the diff: ${error.message}`);
    }
  };
  const openStash = async (stash: Stash) => {
    try {
      // Stash indices can change while the overview is open. Resolve the same
      // commit again before opening it, so another stash is never selected.
      const current = (await api.stashes({ repo })).find((entry) => entry.hash === stash.hash);
      if (!current) throw new Error('This stash is no longer present. Refresh the overview.');
      onClose();
      onOpenStash(repo, current);
    } catch (error: any) {
      toast.error(String(error?.message || error));
    }
  };
  const loadPulls = async () => {
    if (!selected) return;
    setPullBusy(true);
    try {
      const result = await loadPullRequests(repo);
      setPullsByRepo((prior) => ({ ...prior, [selected.overview.commonDir]: result }));
    } catch (error: any) {
      toast.error(`Could not load pull requests: ${error.message}`);
    } finally {
      setPullBusy(false);
    }
  };
  const loadReview = async (pr: PullRequest) => {
    const key = pr.url;
    try {
      const provider = pr.provider;
      const value = provider
        ? bitbucketReviewSnapshot(await desktopApi.getBitbucketReview(provider.connectionId, provider.projectKey, provider.slug, pr.number))
        : await api.githubReview({ repo, url: pr.url, number: pr.number });
      setReviews((prior) => ({ ...prior, [key]: value }));
    } catch (error: any) {
      setReviews((prior) => ({ ...prior, [key]: String(error?.message || error) }));
    }
  };
  const pullData = selected && pullsByRepo[selected.overview.commonDir];
  const relatedPulls = (pullData?.pulls || []).filter(
    (pr) => pr.headRefName === sourceBranch && (!branch?.remoteName || !pr.provider || pr.provider.remoteName === branch.remoteName),
  );
  const counts = fileCounts(tree?.files);

  return (
    <Modal
      title="Work overview"
      subtitle="Local work across repositories, branches and worktrees"
      icon={<Layers className="w-4 h-4" />}
      width="full"
      tall
      onClose={onClose}
      actions={
        <>
          <Button onClick={() => void scan(folder)} busy={scanning}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button
            onClick={() =>
              void pickFolder('Choose a folder containing repositories')
                .then((chosen) => {
                  if (chosen) void scan(chosen);
                })
                .catch((error) => toast.error(error.message))
            }
          >
            <FolderOpen className="w-3.5 h-3.5" /> Folder
          </Button>
        </>
      }
    >
      {diff ? (
        <DiffView
          diff={diff}
          title={<span className="font-mono text-xs text-slate-200">{diff.path}</span>}
          backLabel="Back to work overview"
          onBack={() => setDiff(null)}
        />
      ) : (
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <aside className="w-full md:w-[40%] lg:w-[35%] min-h-0 flex flex-col border-b md:border-b-0 md:border-r border-[#2a3447]">
            <div className="p-3 border-b border-[#2a3447] space-y-2">
              <div className="text-[11px] text-slate-400 break-words">
                Scanning {folder || 'default folder'} plus open and recent repositories. No fetch or checkout.
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Search work"
                  placeholder="Search repositories or branches…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLimits({});
                  }}
                  className={inputClass}
                />
                <select
                  aria-label="Filter work"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as 'all' | 'attention');
                    setLimits({});
                  }}
                  className={`${inputClass} max-w-[140px]`}
                >
                  <option value="all">All work</option>
                  <option value="attention">Needs attention</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={showRemote}
                  onChange={(event) => {
                    setShowRemote(event.target.checked);
                    setLimits({});
                  }}
                />
                Include remote-tracking branches from the last fetch
              </label>
              {scanning && <div className="text-[11px] text-teal-300">Scanning local repositories… {overviews.length} found</div>}
              {scanErrors.length > 0 && (
                <details className="text-[11px] text-amber-300">
                  <summary>
                    {scanErrors.length} folder{scanErrors.length === 1 ? '' : 's'} could not be read
                  </summary>
                  <div className="mt-1 break-all">
                    {scanErrors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {overviews.map((overview) => {
                const group = visibleRows.filter((row) => row.overview.commonDir === overview.commonDir);
                return group.length ? (
                  <section key={overview.commonDir}>
                    <div
                      title={overview.root}
                      className="sticky top-0 bg-[#202735] border-y border-[#2a3447] px-3 py-1.5 text-[11px] text-slate-300 font-semibold truncate"
                    >
                      {overview.name}{' '}
                      <span className="font-normal text-slate-500">
                        · {group.length}
                        {overview.stashes?.length ? ` · ${overview.stashes.length} stashes` : ''}
                      </span>
                    </div>
                    {group.slice(0, limits[overview.commonDir] || 50).map((row) => {
                      const changes = fileCounts(row.tree?.files);
                      const absent = absentCount(row);
                      return (
                        <button
                          key={row.key}
                          onClick={() => setSelectedKey(row.key)}
                          aria-pressed={row.key === selected?.key}
                          className={`w-full text-left px-3 py-2 border-b border-[#222a38] hover:bg-white/[0.04] ${row.key === selected?.key ? 'bg-teal-500/10 border-l-2 border-l-teal-400' : 'border-l-2 border-l-transparent'}`}
                        >
                          <div className="flex gap-2 items-center">
                            <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />
                            <span className="text-xs text-slate-100 truncate font-medium">
                              {row.branch?.name || `Detached ${row.tree?.head.slice(0, 8) || 'HEAD'}`}
                            </span>
                          </div>
                          <div
                            className="pl-5 mt-1 text-[11px] text-slate-400 truncate"
                            title={
                              row.tree?.path ||
                              (row.branch?.remoteName ? 'Remote-tracking ref from the last fetch' : 'Branch is not checked out')
                            }
                          >
                            {row.tree?.path || (row.branch?.remoteName ? 'Remote-tracking branch · last fetch' : 'No worktree')}
                          </div>
                          <div className="pl-5 mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
                            {row.tree?.problem ? (
                              <span className="text-amber-300">Unavailable</span>
                            ) : (
                              row.tree &&
                              (totalChanges(row.tree) ? (
                                <span className="text-amber-300">
                                  {changes.staged} staged · {changes.unstaged} unstaged · {changes.untracked} untracked
                                  {changes.conflicts ? ` · ${changes.conflicts} conflicts` : ''}
                                </span>
                              ) : (
                                <span className="text-slate-500">Clean</span>
                              ))
                            )}
                            {absent === null || absent === undefined ? (
                              <span className="text-slate-500">Origin unknown</span>
                            ) : absent > 0 ? (
                              <span className="text-purple-300">{absent} not on fetched origin</span>
                            ) : null}
                            {row.tree?.rebase && <span className="text-amber-300">Rebase</span>}
                            {row.tree?.merge && <span className="text-amber-300">Merge</span>}
                          </div>
                        </button>
                      );
                    })}
                    {group.length > (limits[overview.commonDir] || 50) && (
                      <button
                        className="px-3 py-2 text-xs text-teal-300 hover:text-teal-200"
                        onClick={() => setLimits((prior) => ({ ...prior, [overview.commonDir]: (prior[overview.commonDir] || 50) + 50 }))}
                      >
                        Show more branches ({group.length - (limits[overview.commonDir] || 50)} remaining)
                      </button>
                    )}
                  </section>
                ) : null;
              })}
              {!scanning && !visibleRows.length && (
                <p className="p-5 text-xs text-slate-500">No matching branches or worktrees. Try a different folder or filter.</p>
              )}
            </div>
          </aside>
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 space-y-3">
            {!selected ? (
              <div className="text-sm text-slate-500">Select a branch or worktree to inspect it.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <GitBranch className="w-4 h-4 text-teal-400" /> {branchName || `Detached ${tree?.head.slice(0, 8) || 'HEAD'}`}
                    </div>
                    <div className="text-[11px] text-slate-400 break-all mt-1">
                      {tree?.path || 'This branch is not checked out in a worktree.'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tree && !tree.problem && (
                      <Button
                        tone="primary"
                        onClick={() => {
                          onClose();
                          onOpen(tree.path);
                        }}
                      >
                        Open worktree
                      </Button>
                    )}
                    {tree && (
                      <Button
                        onClick={() => void api.revealInFileManager({ repo: tree.path }).catch((error) => toast.error(error.message))}
                      >
                        Reveal
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        onClose();
                        onManage(tree?.problem ? repo : tree?.path || repo);
                      }}
                    >
                      Manage worktrees
                    </Button>
                  </div>
                </div>
                <div className={panel}>
                  <div className={label}>Git status</div>
                  <div className={`${detail} mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2`}>
                    <div>
                      <strong className="text-slate-200">Working directory:</strong>{' '}
                      {!tree
                        ? branch?.remoteName
                          ? 'Remote-tracking refs have no working directory'
                          : 'Not checked out'
                        : tree.problem
                          ? `Unavailable: ${tree.problem}`
                          : tree.files === null
                            ? 'Unknown'
                            : `${counts.staged} staged, ${counts.unstaged} unstaged, ${counts.untracked} untracked, ${counts.conflicts} conflicts`}
                      {tree?.locked ? ' · Locked' : ''}
                      {tree?.prunable ? ' · Prunable' : ''}
                    </div>
                    <div title="Upstream and push target can be different branches.">
                      <strong className="text-slate-200">Upstream:</strong> {trackLabel(branch)}
                    </div>
                    <div title="Commits not reachable from any locally known origin branch, as of the last fetch.">
                      <strong className="text-slate-200">Absent from fetched origin:</strong>{' '}
                      {absentCount(selected) == null
                        ? selected.overview.origin === 'no-remote'
                          ? 'Unknown — no origin remote'
                          : selected.overview.origin === 'not-fetched'
                            ? 'Unknown — origin refs not available'
                            : 'Unknown — comparison unavailable'
                        : absentCount(selected)}
                    </div>
                    <div>
                      <strong className="text-slate-200">Push target:</strong>{' '}
                      {branch?.remoteName
                        ? 'Not applicable to remote-tracking branches'
                        : branch?.push.name
                          ? `${branch.push.name} (${branch.push.state === 'known' ? `↑${branch.push.ahead} ↓${branch.push.behind}` : branch.push.state})`
                          : 'Not configured or unknown'}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Remote comparisons use locally stored refs from the last fetch. They do not prove whether work is complete. Checked{' '}
                    {date(selected.overview.checkedAt)}.
                  </p>
                  {selected.overview.warnings.map((warning) => (
                    <p key={warning} className="text-[11px] text-amber-300 mt-1">
                      {warning}
                    </p>
                  ))}
                </div>
                {selected.overview.stashes?.length > 0 && (
                  <div className={panel}>
                    <div className={label}>Saved stashes · shared by this repository</div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Stashes can contain unfinished work and are not assigned to a worktree. Inspect one before applying or dropping it.
                    </p>
                    <div className="mt-2 max-h-36 overflow-y-auto">
                      {selected.overview.stashes.map((stash) => (
                        <button
                          key={stash.hash}
                          onClick={() => void openStash(stash)}
                          className="block w-full text-left text-xs text-slate-300 hover:text-teal-300 py-1 break-words"
                        >
                          <span className="font-mono text-teal-400 mr-2">{stash.name}</span>
                          {stash.message}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {tree?.files && tree.files.length > 0 && (
                  <div className={panel}>
                    <div className={label}>Changed files · click to inspect</div>
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      {tree.files.map((file, index) => (
                        <button
                          key={`${file.path}:${file.staged}:${index}`}
                          onClick={() => void preview(file)}
                          className="w-full text-left flex gap-2 py-1 hover:text-teal-300 text-xs text-slate-300"
                        >
                          <span className="w-20 flex-shrink-0 text-[10px] text-slate-500">
                            {file.status === 'untracked'
                              ? 'untracked'
                              : file.status === 'conflicted'
                                ? 'conflict'
                                : file.staged
                                  ? 'staged'
                                  : 'unstaged'}
                          </span>
                          <span className="font-mono break-all">{file.path}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={panel}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={label}>Recent commits</span>
                    <span className="text-[10px] text-slate-500">Branch tip history</span>
                  </div>
                  {historyError ? (
                    <p className="text-xs text-amber-300 mt-2">{historyError}</p>
                  ) : history.length ? (
                    <div className="mt-2 space-y-1">
                      {history.slice(0, 6).map((commit) => (
                        <div key={commit.hash} className="text-xs text-slate-300 truncate" title={commit.summary}>
                          <span className="font-mono text-teal-400 mr-2">{commit.shortHash}</span>
                          {commit.summary}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">No commit history available.</p>
                  )}
                </div>
                <div className={panel}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={label}>Pull requests and checks</span>
                    <Button onClick={() => void loadPulls()} busy={pullBusy}>
                      {pullData ? 'Reload' : 'Load pull requests'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Loads from connected providers on request; branch names are possible matches.
                  </p>
                  {pullData?.errors.map((error) => (
                    <p key={error} className="text-xs text-amber-300 mt-1 break-words">
                      {error}
                    </p>
                  ))}
                  {pullData && !relatedPulls.length && (
                    <p className="text-xs text-slate-400 mt-2">No open pull request with this source branch was found.</p>
                  )}
                  {relatedPulls.map((pr) => (
                    <div key={pr.url} className="mt-2 border-t border-[#2a3447] pt-2">
                      <div className="flex gap-2 items-start">
                        <button
                          className="text-xs text-teal-300 text-left flex-1"
                          onClick={() => void api.openUrl({ url: pr.url }).catch((error) => toast.error(error.message))}
                        >
                          #{pr.number} {pr.title} <ExternalLink className="inline w-3 h-3" />
                        </button>
                        <Button onClick={() => void loadReview(pr)}>Load checks</Button>
                      </div>
                      {typeof reviews[pr.url] === 'string' ? (
                        <p className="text-xs text-amber-300 mt-1">{reviews[pr.url] as string}</p>
                      ) : (
                        reviews[pr.url] && (
                          <div className="text-[11px] text-slate-400 mt-1">
                            {(reviews[pr.url] as ReviewSnapshot).checks.map((check) => `${check.name}: ${check.state}`).join(' · ') ||
                              'No build checks reported'}{' '}
                            · {(reviews[pr.url] as ReviewSnapshot).approvals.filter((item) => item.state === 'APPROVED').length} approvals
                            {(reviews[pr.url] as ReviewSnapshot).warnings.length
                              ? ` · ${(reviews[pr.url] as ReviewSnapshot).warnings.join(' ')}`
                              : ''}
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
                <div className={panel}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={label}>Codex & Claude sessions</span>
                    {sessionsBusy && <span className="text-[11px] text-slate-500">Searching local history…</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Matches by folder or recorded branch are suggestions, not proof. Session activity is unknown. Claude desktop-only or
                    cloud chats may not appear.
                  </p>
                  {sessions?.warnings.map((warning) => (
                    <p key={warning} className="text-[11px] text-amber-300 mt-1">
                      {warning}
                    </p>
                  ))}
                  {tree ? (
                    <>
                      <label className="flex items-center gap-2 text-[11px] text-slate-400 mt-2">
                        <input type="checkbox" checked={showAllSessions} onChange={(event) => setShowAllSessions(event.target.checked)} />{' '}
                        Show all sessions found for this repository
                      </label>
                      <div className="space-y-2 mt-2">
                        {sessionOptions.map((session) => {
                          const linked = selectedLinks.some((item) => item.provider === session.provider && item.id === session.id);
                          return (
                            <div key={`${session.provider}:${session.id}`} className="rounded border border-[#2a3447] p-2">
                              <div className="flex items-start gap-2">
                                <Bot className="w-3.5 h-3.5 mt-0.5 text-purple-300 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-slate-200 break-words">{session.title}</div>
                                  <div className="text-[10px] text-slate-500 break-all">
                                    {session.provider === 'codex' ? 'Codex' : 'Claude Code'} · {linked ? 'Linked by you' : 'Possible match'}{' '}
                                    · {session.branch || 'branch unknown'} · {date(session.updatedAt)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 break-all">
                                    {session.cwd} · {session.id}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                <Button onClick={() => void continueSession(session)}>
                                  Continue in {session.provider === 'codex' ? 'Codex desktop' : 'Claude desktop'}
                                </Button>
                                <Button onClick={() => toggleLink(session)}>
                                  <Link2 className="w-3 h-3" /> {linked ? 'Unlink' : 'Link to worktree'}
                                </Button>
                                <Button
                                  onClick={() => {
                                    void navigator.clipboard
                                      .writeText(
                                        `${session.provider} ${session.provider === 'codex' ? 'resume' : '--resume'} ${session.id}`,
                                      )
                                      .then(() => toast.success('Terminal resume command copied.'))
                                      .catch(() => toast.error('Could not copy the command.'));
                                  }}
                                >
                                  Copy terminal resume
                                </Button>
                                <Button
                                  onClick={() =>
                                    void api
                                      .openTerminal({ repo: pathInside(session.cwd, tree.path) ? session.cwd : tree.path })
                                      .catch((error) => toast.error(error.message))
                                  }
                                >
                                  Open terminal
                                </Button>
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 font-mono select-text">
                                Run in this worktree: {session.provider} {session.provider === 'codex' ? 'resume' : '--resume'} {session.id}
                              </div>
                            </div>
                          );
                        })}
                        {!sessionsBusy && !sessionOptions.length && (
                          <p className="text-xs text-slate-500">No matching local sessions were found. You can link one by its ID.</p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select
                          aria-label="Session provider"
                          value={manualProvider}
                          onChange={(event) => setManualProvider(event.target.value as 'codex' | 'claude')}
                          className={`${inputClass} max-w-[110px]`}
                        >
                          <option value="codex">Codex</option>
                          <option value="claude">Claude</option>
                        </select>
                        <input
                          aria-label="Session ID"
                          placeholder="Session UUID"
                          value={manualId}
                          onChange={(event) => setManualId(event.target.value)}
                          className={`${inputClass} flex-1 min-w-[190px] font-mono`}
                        />
                        <Button onClick={addManual}>Link ID</Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">Select a worktree to link or resume a session.</p>
                  )}
                </div>
                <WorkSummaryPanel key={selectionId} repo={repo} branch={branch} tree={tree} sessions={sessionOptions} />
              </>
            )}
          </main>
        </div>
      )}
    </Modal>
  );
};
