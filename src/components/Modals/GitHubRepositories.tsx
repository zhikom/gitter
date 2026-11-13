import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass } from '../ui/Modal';

type Status = Awaited<ReturnType<typeof api.githubStatus>>;
type Repository = Awaited<ReturnType<typeof api.githubRepositories>>['repositories'][number];
const action = 'rounded border border-[#344257] px-2 py-1 text-[11px] text-teal-300 hover:bg-[#283244] disabled:opacity-40';

function useGitHubStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = () => {
    setLoading(true); setStatus(null);
    return api.githubStatus().then(setStatus).catch((error) => setStatus({ installed: false, authenticated: false, login: '', error: error.message })).finally(() => setLoading(false));
  };
  useEffect(() => { void refresh(); }, []);
  return { status, loading, refresh };
}

const GitHubStatus: React.FC<{ status: Status | null; loading: boolean; refresh: () => void }> = ({ status, loading, refresh }) => (
  <div className="space-y-1">
    {loading ? <p className="text-slate-500">Checking GitHub CLI…</p> : status?.authenticated ? <p className="text-slate-400">GitHub CLI connected as <strong className="text-slate-200">{status.login}</strong>.</p> : <>
      <p className="text-slate-400">{status?.installed ? 'GitHub CLI is installed, but GitHub authentication is unavailable.' : 'GitHub CLI is not available.'}</p>
      <p className="text-slate-500">Use an existing gh login, or set GH_TOKEN before launching Gitter.</p>
      {status?.error && <p role="alert" className="text-rose-300 break-words">{status.error}</p>}
      <button type="button" className={action} onClick={refresh}>Check again</button>
    </>}
  </div>
);

export const GitHubIntegration: React.FC<{ onClone?: () => void; onCreate?: () => void }> = ({ onClone, onCreate }) => {
  const { status, loading, refresh } = useGitHubStatus();
  return <section className="space-y-2 p-3 bg-[#14181f] border border-[#2a3447] rounded-lg">
    <strong>GitHub</strong>
    <GitHubStatus status={status} loading={loading} refresh={() => void refresh()} />
    {status?.authenticated && <div className="flex flex-wrap gap-2"><button type="button" className={action} onClick={onClone}>Browse and clone</button><button type="button" className={action} onClick={onCreate}>Create repository</button><button type="button" className={action} onClick={() => void refresh()}>Refresh account</button></div>}
  </section>;
};

export const GitHubClonePicker: React.FC<{ selectedUrl: string; onSelect: (url: string) => void; onAuthChange: (authenticated: boolean) => void }> = ({ selectedUrl, onSelect, onAuthChange }) => {
  const { status, loading: checking, refresh } = useGitHubStatus();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { onAuthChange(Boolean(status?.authenticated)); }, [status?.authenticated]);
  useEffect(() => {
    if (!status?.authenticated) { setRepos([]); setNext(null); return; }
    let active = true;
    setLoading(true); setError('');
    api.githubRepositories({ page: 1 }).then((result) => { if (active) { setRepos(result.repositories); setNext(result.nextPage); } })
      .catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status?.authenticated, status?.login]);

  const loadMore = async () => {
    if (!next || loading) return;
    setLoading(true); setError('');
    try { const page = await api.githubRepositories({ page: next }); setRepos((current) => [...current, ...page.repositories]); setNext(page.nextPage); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  const shown = repos.filter((repo) => repo.fullName.toLowerCase().includes(filter.toLowerCase()));
  return <section aria-label="GitHub repositories" className="space-y-2 rounded-lg border border-[#2a3447] bg-[#171c26] p-3 text-xs text-slate-300">
    <div className="font-semibold text-slate-100">GitHub repositories</div>
    <GitHubStatus status={status} loading={checking} refresh={() => void refresh()} />
    {status?.authenticated && <>
      <input aria-label="Filter loaded GitHub repositories" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter loaded repositories…" className={inputClass} />
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {shown.map((repo) => <div key={repo.fullName} className="flex flex-wrap items-center gap-2 rounded bg-[#14181f] px-2 py-1.5">
          <span title={repo.description || repo.fullName} className="min-w-0 flex-1 truncate">{repo.fullName} {repo.private && <span className="text-slate-500">· private</span>}</span>
          {(['sshUrl', 'httpsUrl'] as const).map((kind) => <button key={kind} type="button" className={`${action} ${selectedUrl === repo[kind] ? 'bg-teal-500/20 border-teal-500/60' : ''}`} disabled={!repo[kind]} aria-pressed={Boolean(repo[kind] && selectedUrl === repo[kind])} onClick={() => onSelect(repo[kind])}>{kind === 'sshUrl' ? 'SSH' : 'HTTPS'}</button>)}
        </div>)}
        {!loading && !error && !shown.length && <p className="p-2 text-slate-500">No matching loaded repositories.</p>}
      </div>
      {error && <p role="alert" className="text-rose-300 break-words">{error}</p>}
      {loading && <p className="text-slate-500">Loading repositories…</p>}
      {next !== null && <button type="button" className={action} disabled={loading} onClick={() => void loadMore()}>Load more</button>}
      {error && <button type="button" className={action} onClick={() => void refresh()}>Try again</button>}
      <p className="text-[10px] text-slate-500">HTTPS uses gh authentication; SSH uses your SSH agent.</p>
    </>}
  </section>;
};

export const GitHubCreateRepository: React.FC<{ onClone: (url: string) => void }> = ({ onClone }) => {
  const { status, loading, refresh } = useGitHubStatus();
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [addReadme, setAddReadme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Awaited<ReturnType<typeof api.githubCreateRepository>> | null>(null);
  useEffect(() => { if (status?.login) setOwner((current) => current || status.login); }, [status?.login]);
  return <div className="space-y-3 max-w-xl text-xs text-slate-300">
    <GitHubStatus status={status} loading={loading} refresh={() => void refresh()} />
    {created ? <div className="space-y-2 rounded border border-teal-500/40 p-3">
      <p>Created <strong>{created.fullName}</strong> on GitHub.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => onClone(created.httpsUrl)}>Clone HTTPS</Button><Button type="button" onClick={() => onClone(created.sshUrl)}>Clone SSH</Button><Button type="button" onClick={() => void api.openUrl({ url: created.webUrl }).catch((e) => toast.error(e.message))}>Open on GitHub</Button><Button type="button" onClick={() => { setCreated(null); setName(''); }}>Create another</Button></div>
    </div> : status?.authenticated && <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true);
      try { setCreated(await api.githubCreateRepository({ owner, name, description, visibility, addReadme })); toast.success('GitHub repository created.'); }
      catch (error: any) { toast.error(`Could not create GitHub repository: ${error.message}`); } finally { setBusy(false); }
    }}>
      <Field label="Owner or organization"><input className={inputClass} aria-label="GitHub owner" value={owner} onChange={(e) => setOwner(e.target.value)} required /></Field>
      <Field label="Repository name"><input className={inputClass} aria-label="GitHub repository name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label="Description (optional)"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} /></Field>
      <Field label="Visibility"><select className={inputClass} value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}><option value="private">Private</option><option value="public">Public</option></select></Field>
      <label className="flex items-center gap-2"><input type="checkbox" checked={addReadme} onChange={(e) => setAddReadme(e.target.checked)} /> Add a README</label>
      <Button type="submit" tone="primary" busy={busy} disabled={!owner.trim() || !name.trim()}>Create on GitHub</Button>
    </form>}
  </div>;
};
