import React, { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { desktopApi } from '../../api/desktop';
import type { BitbucketRepository, Integration } from '../../types/integration';
import { inputClass } from '../ui/Modal';

/** Search the authenticated server instead of filtering only the first page. */
export const BitbucketClonePicker: React.FC<{ selectedUrl: string; onSelect: (url: string) => void; onConnect: () => void }> = ({ selectedUrl, onSelect, onConnect }) => {
  const [connections, setConnections] = useState<Integration[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [connectionsLoading, setConnectionsLoading] = useState(isTauri());
  const [query, setQuery] = useState('');
  const [repos, setRepos] = useState<BitbucketRepository[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const authenticated = Boolean(connections.find((connection) => connection.id === connectionId)?.authenticated);

  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    desktopApi.listIntegrations().then((items) => {
      if (!live) return;
      const bitbucket = items.filter((item) => item.kind === 'bitbucket_dc');
      setConnections(bitbucket);
      setConnectionId(bitbucket[0]?.id ?? '');
    }).catch((e) => { if (live) setError(`Could not load Bitbucket connections: ${String(e)}`); })
      .finally(() => { if (live) setConnectionsLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const request = ++generation.current;
    setRepos([]); setNext(null);
    if (!connectionId || !authenticated) { setLoading(false); return; }
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      desktopApi.getBitbucketRepositories(connectionId, 0, query.trim()).then((page) => {
        if (generation.current !== request) return;
        setRepos(page.values);
        setNext(page.isLastPage ? null : page.nextPageStart ?? null);
      }).catch((e) => { if (generation.current === request) setError(`Could not load Bitbucket repositories: ${String(e)}`); })
        .finally(() => { if (generation.current === request) setLoading(false); });
    }, query.trim() ? 300 : 0);
    return () => { clearTimeout(timer); generation.current++; };
  }, [connectionId, authenticated, query, retry]);

  const loadMore = async () => {
    if (!connectionId || next === null || loading) return;
    const request = generation.current;
    setLoading(true); setError('');
    try {
      const page = await desktopApi.getBitbucketRepositories(connectionId, next, query.trim());
      if (generation.current !== request) return;
      setRepos((current) => [...current, ...page.values]);
      setNext(page.isLastPage ? null : page.nextPageStart ?? null);
    } catch (e) { if (generation.current === request) setError(`Could not load more repositories: ${String(e)}`); }
    finally { if (generation.current === request) setLoading(false); }
  };

  if (!isTauri()) return null;
  const action = 'rounded border border-[#344257] px-2 py-1 text-[11px] text-teal-300 hover:bg-[#283244] disabled:opacity-40';
  return (
    <section aria-label="Bitbucket repositories" className="space-y-2 rounded-lg border border-[#2a3447] bg-[#171c26] p-3 text-xs text-slate-300">
      <div className="font-semibold text-slate-100">Bitbucket repositories</div>
      {connectionsLoading && <p className="text-slate-500">Loading connections…</p>}
      {error && <p role="alert" className="break-words text-rose-300">{error}</p>}
      {error && connectionId && <button type="button" className={action} onClick={() => setRetry((value) => value + 1)}>Try again</button>}
      {!connectionsLoading && !connections.length && !error && <div className="space-y-2"><p className="text-slate-500">Connect Bitbucket Server or Data Center to browse repositories here.</p><button type="button" className={action} onClick={onConnect}>Connect Bitbucket…</button></div>}
      {connections.length > 0 && <>
        {connections.length === 1 && <p className="truncate text-slate-500">Connected: {connections[0].label}</p>}
        {connections.length > 1 && <select aria-label="Bitbucket connection" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} className={inputClass}>
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select>}
        {!authenticated && <div className="space-y-2"><p className="text-slate-500">Enter your token to connect.</p><button type="button" className={action} onClick={onConnect}>Connect Bitbucket…</button></div>}
        {authenticated && <><input aria-label="Search Bitbucket repositories" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search repositories by name…" className={inputClass} />
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {repos.map((repo) => <div key={`${repo.projectKey}/${repo.slug}`} className="flex flex-wrap items-center gap-2 rounded bg-[#14181f] px-2 py-1.5">
            <span title={`${repo.projectKey}/${repo.slug}`} className="min-w-0 flex-1 truncate">{repo.projectKey}/{repo.name}</span>
            <button type="button" className={`${action} ${repo.sshUrl && selectedUrl === repo.sshUrl ? 'bg-teal-500/20 border-teal-500/60' : ''}`} disabled={!repo.sshUrl} aria-pressed={Boolean(repo.sshUrl && selectedUrl === repo.sshUrl)} onClick={() => repo.sshUrl && onSelect(repo.sshUrl)}>SSH</button>
            <button type="button" className={`${action} ${repo.httpsUrl && selectedUrl === repo.httpsUrl ? 'bg-teal-500/20 border-teal-500/60' : ''}`} disabled={!repo.httpsUrl} aria-pressed={Boolean(repo.httpsUrl && selectedUrl === repo.httpsUrl)} onClick={() => repo.httpsUrl && onSelect(repo.httpsUrl)}>HTTPS</button>
          </div>)}
          {!loading && !error && !repos.length && <p className="p-2 text-slate-500">No matching repositories.</p>}
        </div>
        {loading && <p className="text-slate-500">Loading repositories…</p>}
        {next !== null && <button type="button" className={action} disabled={loading} onClick={() => void loadMore()}>Load more</button>}
        <p className="text-[10px] text-slate-500">Git uses your SSH agent or Git credential helper when cloning.</p>
        </>}
      </>}
    </section>
  );
};
