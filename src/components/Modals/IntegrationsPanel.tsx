import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { desktopApi } from '../../api/desktop';
import { BitbucketPullRequest, BitbucketRepository, Integration } from '../../types/integration';
import { toast } from '../../utils/toast';

interface Props {
  onCloneRepository?: (url: string) => void;
}

const field = 'w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500';
const button = 'px-3 py-1.5 rounded border border-[#2a3447] text-teal-300 hover:bg-[#202735] disabled:opacity-40';

export const IntegrationsPanel: React.FC<Props> = ({ onCloneRepository }) => {
  const [connections, setConnections] = useState<Integration[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState<Integration | null>(null);
  const [repos, setRepos] = useState<BitbucketRepository[]>([]);
  const [repoNext, setRepoNext] = useState<number | null>(null);
  const [repoFilter, setRepoFilter] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<BitbucketRepository | null>(null);
  const [pulls, setPulls] = useState<BitbucketPullRequest[]>([]);
  const [pullNext, setPullNext] = useState<number | null>(null);
  const [showCreatePull, setShowCreatePull] = useState(false);
  const [pullTitle, setPullTitle] = useState('');
  const [pullDescription, setPullDescription] = useState('');
  const [pullSource, setPullSource] = useState('');
  const [pullTarget, setPullTarget] = useState('');
  const [gitUsername, setGitUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => setConnections(await desktopApi.listIntegrations());
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await desktopApi.connectIntegration('bitbucket_dc', baseUrl.trim(), label.trim(), token);
      setToken(''); setBaseUrl(''); setLabel('');
      await refresh();
      toast.success('Integration connected.');
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const disconnect = async (connection: Integration) => {
    if (!confirm(`Disconnect ${connection.label} and remove its saved token from Keychain?`)) return;
    setBusy(true); setError('');
    try {
      await desktopApi.disconnectIntegration(connection.id);
      if (selected?.id === connection.id) { setSelected(null); setSelectedRepo(null); }
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const loadRepos = async (connection: Integration, start = 0) => {
    setBusy(true); setError('');
    try {
      const page = await desktopApi.getBitbucketRepositories(connection.id, start);
      setRepos((current) => start === 0 ? page.values : [...current, ...page.values]);
      setRepoNext(page.isLastPage ? null : page.nextPageStart ?? null);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const loadPulls = async (connection: Integration, repository: BitbucketRepository, start = 0) => {
    setBusy(true); setError('');
    try {
      const page = await desktopApi.getBitbucketPullRequests(connection.id, repository.projectKey, repository.slug, start);
      setPulls((current) => start === 0 ? page.values : [...current, ...page.values]);
      setPullNext(page.isLastPage ? null : page.nextPageStart ?? null);
      setSelectedRepo(repository);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const openConnection = (connection: Integration) => {
    setSelected(connection); setSelectedRepo(null); setRepos([]); setPulls([]); setShowCreatePull(false);
    loadRepos(connection);
  };

  const openExternal = async (url?: string | null) => {
    if (!url) return;
    try { await api.openUrl({ url }); }
    catch (e) { setError(String(e)); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-slate-400">Connect Bitbucket Server / Data Center using a personal access token. Tokens are stored in macOS Keychain.</p>
      {error && <div role="alert" className="p-2 border border-red-500/40 rounded text-red-300 whitespace-pre-wrap break-words">{error}</div>}
      {connections.map((connection) => (
        <div key={connection.id} className="p-3 bg-[#14181f] border border-[#2a3447] rounded-lg flex flex-wrap items-center justify-between gap-2">
          <div><div className="font-semibold text-slate-100">{connection.label}</div><div className="text-slate-500 break-all">Bitbucket Server / Data Center · {connection.baseUrl}</div></div>
          <div className="flex gap-2"><button type="button" className={button} disabled={busy} onClick={() => openConnection(connection)}>Browse</button><button type="button" className={button} disabled={busy} onClick={() => disconnect(connection)}>Disconnect</button></div>
        </div>
      ))}

      {selected?.kind === 'bitbucket_dc' && (
        <div className="p-3 border border-teal-500/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between"><strong>{selected.label}</strong><button type="button" className={button} onClick={() => { setSelected(null); setSelectedRepo(null); }}>Close</button></div>
          {selectedRepo ? <>
            <div className="flex justify-between gap-2"><span>Open pull requests for {selectedRepo.projectKey}/{selectedRepo.slug}</span><div className="flex gap-2"><button type="button" className={button} onClick={() => setShowCreatePull((current) => !current)}>Create pull request</button><button type="button" className={button} onClick={() => { setSelectedRepo(null); setShowCreatePull(false); }}>Back</button></div></div>
            {showCreatePull && <form className="p-2 border border-[#2a3447] rounded space-y-2" onSubmit={async (event) => {
              event.preventDefault(); setBusy(true); setError('');
              try {
                const pull = await desktopApi.createBitbucketPullRequest(selected.id, selectedRepo.projectKey, selectedRepo.slug, { title: pullTitle, description: pullDescription, source: pullSource, target: pullTarget });
                setPulls((current) => [pull, ...current]); setPullTitle(''); setPullDescription(''); setPullSource(''); setPullTarget(''); setShowCreatePull(false);
                toast.success(`Created pull request #${pull.id}.`);
              } catch (e) { setError(String(e)); } finally { setBusy(false); }
            }}>
              <p className="text-slate-400">Create a pull request between branches in this repository. Push the source branch first.</p>
              <input className={field} value={pullTitle} onChange={(e) => setPullTitle(e.target.value)} placeholder="Title" aria-label="Pull request title" required />
              <div className="flex gap-2"><input className={field} value={pullSource} onChange={(e) => setPullSource(e.target.value)} placeholder="Source branch" aria-label="Source branch" required /><input className={field} value={pullTarget} onChange={(e) => setPullTarget(e.target.value)} placeholder="Target branch" aria-label="Target branch" required /></div>
              <textarea className={field} value={pullDescription} onChange={(e) => setPullDescription(e.target.value)} placeholder="Description (optional)" aria-label="Pull request description" rows={3} />
              <button type="submit" className={button} disabled={busy}>Create pull request</button>
            </form>}
            {!busy && pulls.length === 0 && <p className="text-slate-500">No open pull requests.</p>}
            {pulls.map((pull) => <div key={pull.id} className="p-2 rounded bg-[#14181f]"><button type="button" className="text-teal-300 text-left" onClick={() => openExternal(pull.url)}>#{pull.id} {pull.title}</button><div className="text-slate-500">{pull.author} · {pull.source} → {pull.target}</div></div>)}
            {pullNext !== null && <button type="button" className={button} disabled={busy} onClick={() => loadPulls(selected, selectedRepo, pullNext)}>Load more</button>}
          </> : <>
            <input className={field} value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)} placeholder="Filter loaded repositories" />
            {!busy && repos.length === 0 && <p className="text-slate-500">No repositories returned.</p>}
            {repos.filter((repo) => `${repo.projectKey}/${repo.name}`.toLowerCase().includes(repoFilter.toLowerCase())).map((repo) => <div key={`${repo.projectKey}/${repo.slug}`} className="p-2 rounded bg-[#14181f] flex flex-wrap items-center justify-between gap-2"><span>{repo.projectKey}/{repo.name}</span><div className="flex gap-1"><button type="button" className={button} disabled={!repo.httpsUrl || !onCloneRepository} onClick={() => repo.httpsUrl && onCloneRepository?.(repo.httpsUrl)}>Clone HTTPS</button><button type="button" className={button} disabled={!repo.sshUrl || !onCloneRepository} onClick={() => repo.sshUrl && onCloneRepository?.(repo.sshUrl)}>Clone SSH</button><button type="button" className={button} disabled={busy} onClick={() => loadPulls(selected, repo)}>Pull requests</button></div></div>)}
            {repoNext !== null && <button type="button" className={button} disabled={busy} onClick={() => loadRepos(selected, repoNext)}>Load more</button>}
            <p className="text-slate-500">Git over HTTPS uses your configured Git credential helper. SSH uses your system SSH configuration.</p>
            <div className="p-2 border border-[#2a3447] rounded space-y-2">
              <label className="block text-slate-400">Use this personal token for Git HTTPS (optional)</label>
              <p className="text-slate-500">This saves a separate credential in macOS Keychain for Git. Your existing Git configuration is unchanged; disconnecting this integration will not remove that Git credential.</p>
              <div className="flex gap-2"><input className={field} value={gitUsername} onChange={(e) => setGitUsername(e.target.value)} placeholder="Bitbucket username" autoComplete="username" /><button type="button" className={button} disabled={busy || !gitUsername.trim()} onClick={async () => { setBusy(true); setError(''); try { await desktopApi.saveGitHttpsCredential(selected.id, gitUsername.trim()); setGitUsername(''); toast.success('Git HTTPS credential saved in Keychain.'); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>Save for Git</button></div>
            </div>
          </>}
        </div>
      )}

      <form onSubmit={connect} className="p-3 bg-[#14181f] border border-[#2a3447] rounded-lg space-y-2">
        <strong>Connect a self-hosted server</strong>
        <input className={field} type="url" required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://server.example.com" />
        <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Connection name (optional)" />
        <input className={field} type="password" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Personal access token" autoComplete="off" />
        <button type="submit" className={button} disabled={busy || !baseUrl || !token}>{busy ? 'Connecting…' : 'Connect'}</button>
      </form>
    </div>
  );
};
