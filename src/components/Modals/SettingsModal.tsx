// Settings, in three scopes: this installation (Preferences, kept in the
// browser profile), the open repository (its local git config and Gitter's
// per-repo store), and the AI provider (the per-user config file; the key is
// never sent back to the UI).
import React, { useEffect, useState } from 'react';
import { Bot, FolderGit2, Globe, Info, KeyRound, Settings as SettingsIcon, SlidersHorizontal } from 'lucide-react';
import { AI_PROVIDERS, type AiProvider } from '../../../shared/aiProviders';
import { api, pickFolder } from '../../api/client';
import { desktopApi, type SshPublicKey } from '../../api/desktop';
import { usePreference, type Preferences } from '../../preferences';
import { CURRENT_VERSION } from '../../services/updateService';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass, Modal } from '../ui/Modal';
import { IntegrationsPanel } from './IntegrationsPanel';

type Tab = 'general' | 'repository' | 'ssh' | 'integrations' | 'ai' | 'about';
type RepoSettings = Awaited<ReturnType<typeof api.repoSettings>>['settings'];

interface SettingsModalProps {
  repo: string;
  initialTab?: Tab;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onCloneRepository: (url: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ repo, initialTab = 'general', onClose, onCheckForUpdates, onCloneRepository }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; hidden?: boolean }> = [
    { id: 'general', label: 'General', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: 'repository', label: 'This repository', icon: <FolderGit2 className="w-3.5 h-3.5" />, hidden: !repo },
    { id: 'ssh', label: 'SSH keys', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'integrations', label: 'Integrations', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'ai', label: 'AI', icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'about', label: 'About', icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <Modal width="lg" tall icon={<SettingsIcon className="w-4 h-4" />} title="Settings" onClose={onClose}>
      <div className="flex-1 min-h-0 flex">
        <nav className="w-44 flex-shrink-0 border-r border-[#2a3447] p-2 space-y-0.5 bg-[#171c26]">
          {tabs
            .filter((t) => !t.hidden)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium ${tab === t.id ? 'bg-[#263245] text-teal-200' : 'text-slate-400 hover:bg-[#202735] hover:text-slate-200'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          {tab === 'general' && <GeneralSettings />}
          {tab === 'repository' && repo && <RepositorySettings repo={repo} />}
          {tab === 'ssh' && <SshSettings />}
          {tab === 'integrations' && <IntegrationsPanel onCloneRepository={onCloneRepository} />}
          {tab === 'ai' && <AiSettingsForm />}
          {tab === 'about' && (
            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Gitter <span className="font-mono text-slate-100">{CURRENT_VERSION}</span>
              </p>
              <Button onClick={onCheckForUpdates}>Check for updates</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{title}</h3>
    <div className="space-y-3">{children}</div>
  </section>
);

function Toggle<K extends keyof Preferences>({ name, label, hint }: { name: K; label: string; hint?: string }) {
  const [value, setValue] = usePreference(name);
  return (
    <label className="flex items-start gap-2.5 text-xs text-slate-300">
      <input type="checkbox" className="mt-0.5" checked={Boolean(value)} onChange={(e) => setValue(e.target.checked as Preferences[K])} />
      <span>
        {label}
        {hint && <span className="block text-[10px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Choice<K extends keyof Preferences>({ name, label, options }: { name: K; label: string; options: Array<[Preferences[K], string]> }) {
  const [value, setValue] = usePreference(name);
  return (
    <Field label={label}>
      <select value={String(value)} onChange={(e) => setValue(options.find(([v]) => String(v) === e.target.value)![0])} className={`${inputClass} w-56`}>
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

const GeneralSettings: React.FC = () => (
  <>
    <Section title="Repositories">
      <RepositoryFolderSettings />
    </Section>
    <Section title="Diffs">
      <Choice name="diffView" label="Layout" options={[['unified', 'Unified'], ['split', 'Side by side']]} />
      <Choice name="diffFontSize" label="Font size" options={[10, 11, 12, 13, 14, 16].map((n) => [n, `${n} px`])} />
      <Choice name="tabSize" label="Tab width" options={[2, 4, 8].map((n) => [n, `${n} spaces`])} />
      <Toggle name="wordWrap" label="Wrap long lines" />
      <Toggle name="ignoreWhitespace" label="Hide whitespace-only changes" />
    </Section>
    <Section title="Commit graph">
      <Choice name="graphDensity" label="Row height" options={[['compact', 'Compact'], ['normal', 'Normal'], ['comfortable', 'Comfortable']]} />
    </Section>
    <Section title="Safety">
      <Toggle name="confirmDiscard" label="Ask before discarding changes" />
      <Toggle name="confirmDeleteBranch" label="Ask before deleting a branch" />
    </Section>
    <Section title="Background">
      <Choice name="autoFetchMinutes" label="Fetch from remotes" options={[[0, 'Never'], [5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [60, 'Every hour']]} />
      <Toggle name="checkForUpdates" label="Check for Gitter updates at startup" />
    </Section>
  </>
);

const RepositoryFolderSettings: React.FC = () => {
  const [folder, setFolder] = usePreference('cloneFolder');
  const [defaultFolder, setDefaultFolder] = useState('~/repos');
  useEffect(() => { api.defaultRepoFolder().then(setDefaultFolder).catch(() => undefined); }, []);
  return (
    <Field label="Default clone folder" hint={`Leave empty to use ${defaultFolder}.`}>
      <div className="flex gap-2">
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={defaultFolder} className={`${inputClass} font-mono`} />
        <Button type="button" onClick={async () => {
          try { const picked = await pickFolder('Default clone folder'); if (picked) setFolder(picked); }
          catch (e: any) { toast.error(`Could not open the folder picker: ${e.message}`); }
        }}>Browse…</Button>
      </div>
    </Field>
  );
};

const SshSettings: React.FC = () => {
  const [keys, setKeys] = useState<SshPublicKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [remote, setRemote] = useState('');
  const [result, setResult] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => { desktopApi.listSshKeys().then(setKeys).catch((e) => setResult(String(e))).finally(() => setLoading(false)); }, []);
  return (
    <div className="space-y-3 text-xs text-slate-300">
      <p>Git uses your system SSH configuration and agent. Gitter reads public keys only.</p>
      {loading && <p>Loading public keys…</p>}
      {!loading && keys.length === 0 && <p>No public keys were found in ~/.ssh.</p>}
      {keys.map((key) => <div key={key.path} className="p-3 rounded bg-[#14181f] border border-[#2a3447] break-all">
        <div className="font-semibold">{key.path}</div><div>{key.fingerprint}</div>
        <div className="text-slate-500">{key.privateKeyExists ? 'Private key present' : 'No matching private key'} · {key.loadedInAgent ? 'Loaded in SSH agent' : 'Not listed by SSH agent'}</div>
      </div>)}
      <Field label="Test an SSH repository" hint="Uses known hosts without accepting new host keys.">
        <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="git@example.com:project/repository.git" className={`${inputClass} font-mono`} />
      </Field>
      <Button type="button" busy={testing} disabled={!remote.trim()} onClick={async () => {
        setTesting(true); setResult('');
        try { setResult(await desktopApi.testSshRemote(remote.trim())); }
        catch (e) { setResult(String(e)); }
        finally { setTesting(false); }
      }}>{testing ? 'Testing…' : 'Test connection'}</Button>
      {result && <pre className="whitespace-pre-wrap break-all">{result}</pre>}
    </div>
  );
};

const RepositorySettings: React.FC<{ repo: string }> = ({ repo }) => {
  const [settings, setSettings] = useState<RepoSettings | null>(null);
  const [saved, setSaved] = useState<RepoSettings | null>(null);
  const [inherited, setInherited] = useState({ userName: '', userEmail: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .repoSettings({ repo })
      .then((loaded) => {
        setSettings(loaded.settings);
        setSaved(loaded.settings);
        setInherited(loaded.inherited);
      })
      .catch((e) => toast.error(`Could not read the repository settings: ${e.message}`));
  }, [repo]);

  if (!settings) return <div className="text-xs text-slate-500">Loading…</div>;
  const set = <K extends keyof RepoSettings>(key: K, value: RepoSettings[K]) => setSettings({ ...settings, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      // Only what was changed is written, so values inherited from global config
      // (or ones Gitter cannot show exactly, like pull.rebase=merges) stay as they are.
      const changed = Object.fromEntries(
        (Object.keys(settings) as Array<keyof RepoSettings>).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(saved?.[k])).map((k) => [k, settings[k]])
      );
      if (Object.keys(changed).length === 0) {
        toast.info('Nothing changed.');
        return;
      }
      await api.saveRepoSettings({ repo, settings: changed });
      setSaved(settings);
      toast.success('Repository settings saved.');
    } catch (e: any) {
      toast.error(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="mb-4 text-[11px] text-slate-500">Stored in this repository's .git/config, so git on the command line uses them too. Empty fields use your global git settings.</p>
      <Section title="Identity">
        <Field label="Name">
          <input value={settings.userName} onChange={(e) => set('userName', e.target.value)} placeholder={inherited.userName || 'Not set'} className={inputClass} />
        </Field>
        <Field label="Email">
          <input value={settings.userEmail} onChange={(e) => set('userEmail', e.target.value)} placeholder={inherited.userEmail || 'Not set'} className={inputClass} />
        </Field>
      </Section>
      <Section title="Behavior">
        <Field label="Pull">
          <select value={String(settings.pullRebase)} onChange={(e) => set('pullRebase', e.target.value === 'null' ? null : e.target.value === 'true')} className={`${inputClass} w-56`}>
            <option value="null">Git's default</option>
            <option value="false">Merge</option>
            <option value="true">Rebase</option>
          </select>
        </Field>
        <Field label="Line endings (core.autocrlf)">
          <select value={String(settings.autocrlf)} onChange={(e) => set('autocrlf', e.target.value === 'null' ? null : (e.target.value as RepoSettings['autocrlf']))} className={`${inputClass} w-56`}>
            <option value="null">Git's default</option>
            <option value="true">Convert to CRLF on checkout</option>
            <option value="input">Convert to LF on commit</option>
            <option value="false">Leave as they are</option>
          </select>
        </Field>
        <Field label="Diff tool" hint="A command with %1 for the old file and %2 for the new one. Empty tries VS Code, then WinMerge or Beyond Compare (FileMerge on macOS).">
          <input value={settings.diffTool} onChange={(e) => set('diffTool', e.target.value)} placeholder="code --diff %1 %2" className={`${inputClass} font-mono`} />
        </Field>
      </Section>
      <Section title="Signing">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={settings.gpgSign} onChange={(e) => set('gpgSign', e.target.checked)} />
          Sign commits
        </label>
        <Field label="Format">
          <select value={settings.gpgFormat || 'openpgp'} onChange={(e) => set('gpgFormat', e.target.value === 'openpgp' ? '' : e.target.value)} className={`${inputClass} w-56`}>
            <option value="openpgp">OpenPGP (gpg)</option>
            <option value="ssh">SSH key</option>
            <option value="x509">X.509</option>
          </select>
        </Field>
        <Field label="Signing key">
          <input value={settings.signingKey} onChange={(e) => set('signingKey', e.target.value)} placeholder="Key ID, or path to an SSH public key" className={`${inputClass} font-mono`} />
        </Field>
      </Section>
      <Button tone="primary" onClick={save} busy={saving}>
        Save repository settings
      </Button>
    </>
  );
};

const AiSettingsForm: React.FC = () => {
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  useEffect(() => {
    api
      .aiSettings()
      .then((s) => {
        setProvider(s.provider);
        setModel(s.model);
        setBaseUrl(s.baseUrl);
        setHasKey(s.hasKey);
      })
      .catch((e) => toast.error(`Could not read the AI settings: ${e.message}`));
  }, []);

  const info = provider ? AI_PROVIDERS[provider] : null;

  const save = async (removeKey = false) => {
    setBusy('save');
    try {
      // An empty key field keeps the stored key; removing it is explicit.
      await api.saveAiSettings({ provider, model, baseUrl, apiKey: removeKey ? '' : newKey.trim() || undefined });
      setHasKey(removeKey ? false : hasKey || Boolean(newKey.trim()));
      setNewKey('');
      toast.success('AI settings saved.');
    } catch (e: any) {
      toast.error(`Could not save: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      await save();
      const reply = await api.testAiProvider();
      toast.success(`The provider answered: ${reply}`);
    } catch (e: any) {
      toast.error(`The provider did not answer: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Section title="Provider">
        <Field label="Provider">
          <select
            value={provider ?? ''}
            onChange={(e) => {
              const next = (e.target.value || null) as AiProvider | null;
              setProvider(next);
              setModel(next ? AI_PROVIDERS[next].defaultModel : '');
              setBaseUrl('');
            }}
            className={`${inputClass} w-64`}
          >
            <option value="">Off: no AI features</option>
            {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((id) => (
              <option key={id} value={id}>
                {AI_PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </Field>
        {info && (
          <>
            <Field label="Model">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel} className={`${inputClass} font-mono`} />
            </Field>
            {info.protocol === 'openai' && (
              <Field label="API address" hint={info.defaultBaseUrl ? `Empty uses ${info.defaultBaseUrl}` : 'The endpoint base, ending in /v1'}>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.defaultBaseUrl ?? 'https://…/v1'} className={`${inputClass} font-mono`} />
              </Field>
            )}
            <Field label="API key" hint={hasKey ? 'A key is stored. Type a new one to replace it.' : info.needsKey ? 'Required by this provider.' : 'Only if your endpoint needs one.'}>
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={hasKey ? '••••••••' : 'Paste the key'} className={`${inputClass} font-mono`} />
                {hasKey && (
                  <Button type="button" tone="quiet" onClick={() => save(true)}>
                    Remove key
                  </Button>
                )}
              </div>
            </Field>
          </>
        )}
      </Section>
      <p className="mb-4 text-[11px] text-slate-500">Stored in your user profile, not in any repository. Diffs you ask about are sent to the provider.</p>
      <div className="flex gap-2">
        <Button tone="primary" onClick={() => save()} busy={busy === 'save'}>
          Save
        </Button>
        {provider && (
          <Button onClick={test} busy={busy === 'test'}>
            Save and test
          </Button>
        )}
      </div>
    </>
  );
};
