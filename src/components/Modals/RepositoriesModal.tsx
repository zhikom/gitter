// Getting to a repository: recently opened ones, a scan of a folder, a clone,
// or a new empty repository. Opening goes through the app, which remembers it.
import React, { useEffect, useState } from 'react';
import { DownloadCloud, ExternalLink, FolderOpen, FolderPlus, FolderSearch, History, Terminal, X } from 'lucide-react';
import { api, pickFolder } from '../../api/client';
import { usePreference } from '../../preferences';
import { toast } from '../../utils/toast';
import { joinRepoFolder, repositoryNameFromUrl } from '../../utils/repositoryPaths';
import { Button, Field, inputClass, Modal } from '../ui/Modal';

export type RepositoriesTab = 'recent' | 'scan' | 'clone' | 'create';

interface RepositoriesModalProps {
  initialTab?: RepositoriesTab;
  initialCloneUrl?: string;
  onClose: () => void;
  /** Opens the repository at `path` in a tab. */
  onOpen: (path: string) => void;
}

type ScannedRepo = Awaited<ReturnType<typeof api.scanRepositories>>[number];

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

async function browse(title: string): Promise<string | null> {
  try {
    return await pickFolder(title);
  } catch (e: any) {
    toast.error(`Could not open the folder picker: ${e.message}`);
    return null;
  }
}

export const RepositoriesModal: React.FC<RepositoriesModalProps> = ({ initialTab = 'recent', initialCloneUrl = '', onClose, onOpen }) => {
  const [tab, setTab] = useState<RepositoriesTab>(initialTab);
  const open = (path: string) => {
    onOpen(path);
    onClose();
  };

  const tabs: Array<{ id: RepositoriesTab; label: string; icon: React.ReactNode }> = [
    { id: 'recent', label: 'Recent', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'scan', label: 'Find in folder', icon: <FolderSearch className="w-3.5 h-3.5" /> },
    { id: 'clone', label: 'Clone', icon: <DownloadCloud className="w-3.5 h-3.5" /> },
    { id: 'create', label: 'New', icon: <FolderPlus className="w-3.5 h-3.5" /> },
  ];

  return (
    <Modal
      width="lg"
      tall
      icon={<FolderOpen className="w-4 h-4" />}
      title="Repositories"
      onClose={onClose}
      actions={
        <Button
          tone="primary"
          onClick={async () => {
            const picked = await browse('Open a repository');
            if (picked) open(picked);
          }}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open folder…
        </Button>
      }
    >
      <div role="tablist" className="flex items-center gap-1 px-4 pt-3 border-b border-[#2a3447]">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${
              tab === t.id ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'recent' && <RecentRepositories onOpen={open} onScan={() => setTab('scan')} />}
        {tab === 'scan' && <ScanFolder onOpen={open} />}
        {tab === 'clone' && <CloneRepository onOpen={open} initialUrl={initialCloneUrl} />}
        {tab === 'create' && <CreateRepository onOpen={open} />}
      </div>
    </Modal>
  );
};

const RecentRepositories: React.FC<{ onOpen: (path: string) => void; onScan: () => void }> = ({ onOpen, onScan }) => {
  const [recent, setRecent] = usePreference('recentRepos');
  const [filter, setFilter] = useState('');
  const shown = recent.filter((p) => p.toLowerCase().includes(filter.toLowerCase()));
  const iconButton = 'p-1.5 rounded text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]';
  const quietly = (run: Promise<unknown>) => run.catch((e) => toast.error(e.message));

  if (recent.length === 0) {
    return (
      <div className="text-center py-14 text-xs text-slate-400 space-y-3">
        <p>Repositories you open show up here.</p>
        <Button onClick={onScan}>
          <FolderSearch className="w-3.5 h-3.5" />
          Find repositories in a folder
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {recent.length > 6 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" aria-label="Filter recent repositories" className={inputClass} />}
      {shown.map((path) => (
        <div key={path} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[#181d26] border border-[#222a38] hover:border-teal-500/40">
          <button onClick={() => onOpen(path)} className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-slate-100 truncate">{folderName(path)}</div>
            <div className="text-[10px] text-slate-500 font-mono truncate">{path}</div>
          </button>
          <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button title="Show in folder" className={iconButton} onClick={() => quietly(api.revealInFileManager({ repo: path }))}>
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
            <button title="Open a terminal here" className={iconButton} onClick={() => quietly(api.openTerminal({ repo: path }))}>
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button title="Open in your editor" className={iconButton} onClick={() => quietly(api.openInEditor({ repo: path }))}>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button title="Remove from this list" aria-label={`Forget ${path}`} className={iconButton} onClick={() => setRecent(recent.filter((p) => p !== path))}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const ScanFolder: React.FC<{ onOpen: (path: string) => void }> = ({ onOpen }) => {
  const [folder, setFolder] = usePreference('scanFolder');
  const [found, setFound] = useState<ScannedRepo[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async (target: string) => {
    if (!target.trim()) return;
    setFolder(target.trim());
    setScanning(true);
    try {
      setFound(await api.scanRepositories({ folder: target.trim() }));
    } catch (e: any) {
      toast.error(`Could not scan ${target}: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void scan(folder);
        }}
        className="flex gap-2"
      >
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder to search, three levels deep" aria-label="Folder to scan" className={`${inputClass} font-mono`} />
        <Button
          type="button"
          onClick={async () => {
            const picked = await browse('Folder to search for repositories');
            if (picked) void scan(picked);
          }}
        >
          Browse…
        </Button>
        <Button type="submit" tone="primary" busy={scanning} disabled={!folder.trim()}>
          {scanning ? 'Scanning…' : 'Scan'}
        </Button>
      </form>
      {found?.length === 0 && <div className="text-center py-8 text-xs text-slate-500">No repositories in that folder.</div>}
      {found?.map((repo) => (
        <button key={repo.path} onClick={() => onOpen(repo.path)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[#181d26] border border-[#222a38] hover:border-teal-500/40 text-left">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">{repo.name}</div>
            <div className="text-[10px] text-slate-500 font-mono truncate">{repo.path}</div>
          </div>
          <span className="text-[10px] font-mono text-teal-300">{repo.currentBranch}</span>
          <span className={`text-[10px] ${repo.isClean ? 'text-emerald-400' : 'text-amber-300'}`}>{repo.isClean ? 'clean' : 'changes'}</span>
        </button>
      ))}
    </div>
  );
};

const CloneRepository: React.FC<{ onOpen: (path: string) => void; initialUrl: string }> = ({ onOpen, initialUrl }) => {
  const [url, setUrl] = useState(initialUrl);
  const [defaultFolder] = usePreference('cloneFolder');
  const [parent, setParent] = useState(defaultFolder);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!defaultFolder) api.defaultRepoFolder().then((folder) => setParent((current) => current || folder)).catch((e) => toast.error(e.message));
  }, [defaultFolder]);
  const guessed = repositoryNameFromUrl(url);
  const chosenName = name.trim() || guessed;
  const validName = chosenName && chosenName !== '.' && chosenName !== '..' && !/[\\/\0]/.test(chosenName);
  const target = parent.trim() && validName ? joinRepoFolder(parent.trim(), chosenName) : '';

  const clone = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.cloneRepo({ url: url.trim(), folder: target });
      toast.success(`Cloned into ${target}.`);
      onOpen(target);
    } catch (err: any) {
      toast.error(`Clone failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={clone} className="space-y-3 max-w-xl">
      <Field label="URL" hint="HTTPS or SSH; private repositories use your git credentials">
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/project.git" className={`${inputClass} font-mono`} />
      </Field>
      <Field label="Into folder">
        <div className="flex gap-2">
          <input value={parent} onChange={(e) => setParent(e.target.value)} placeholder="Parent folder" className={`${inputClass} font-mono`} />
          <Button
            type="button"
            onClick={async () => {
              const picked = await browse('Folder to clone into');
              if (picked) setParent(picked);
            }}
          >
            Browse…
          </Button>
        </div>
      </Field>
      <Field label="Name" hint={target && `Clones to ${target}`}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={guessed || 'project'} className={`${inputClass} font-mono`} />
      </Field>
      <Button type="submit" tone="primary" busy={busy} disabled={!url.trim() || !target}>
        <DownloadCloud className="w-3.5 h-3.5" />
        {busy ? 'Cloning…' : 'Clone'}
      </Button>
    </form>
  );
};

const CreateRepository: React.FC<{ onOpen: (path: string) => void }> = ({ onOpen }) => {
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.initRepo({ folder: folder.trim() });
      toast.success(`Created a repository in ${folder.trim()}.`);
      onOpen(folder.trim());
    } catch (err: any) {
      toast.error(`Could not create the repository: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={create} className="space-y-3 max-w-xl">
      <Field label="Folder" hint="Created if it does not exist; an existing folder keeps its files">
        <div className="flex gap-2">
          <input autoFocus value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder for the new repository" className={`${inputClass} font-mono`} />
          <Button
            type="button"
            onClick={async () => {
              const picked = await browse('Folder for the new repository');
              if (picked) setFolder(picked);
            }}
          >
            Browse…
          </Button>
        </div>
      </Field>
      <Button type="submit" tone="primary" busy={busy} disabled={!folder.trim()}>
        <FolderPlus className="w-3.5 h-3.5" />
        Create repository
      </Button>
    </form>
  );
};
