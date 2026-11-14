// Settings, in three scopes: this installation (Preferences, kept in the
// browser profile), the open repository (its local git config and Gitter's
// per-repo store), and the AI provider (the per-user config file; the key is
// never sent back to the UI).
import React, { useEffect, useState } from 'react';
import { Bot, Download, FileText, FolderGit2, Globe, Info, Keyboard, KeyRound, Package, PanelTop, Search, Settings as SettingsIcon, SlidersHorizontal, Terminal } from 'lucide-react';
import { AI_PROVIDERS, type AiProvider } from '../../../shared/aiProviders';
import { api, pickFolder } from '../../api/client';
import { desktopApi, type SshPublicKey } from '../../api/desktop';
import type { Integration } from '../../types/integration';
import { resetPreference, usePreference, type Preferences } from '../../preferences';
import { searchSettings, SETTINGS, type SettingsSearchResult, type SettingsTab } from '../../settingsCatalog';
import { CURRENT_VERSION } from '../../services/updateService';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass, Modal } from '../ui/Modal';
import { IntegrationsPanel } from './IntegrationsPanel';
import { OpenInSettings } from './OpenInSettings';
import { FontSettings } from './FontSettings';
import { PreferenceReset, SettingAnchor } from './PreferenceReset';
import { SettingsSharing } from './SettingsSharing';
import { KeymapSettings } from './KeymapSettings';
import { LayoutSettings } from './LayoutSettings';
import { ToolbarSettings } from './ToolbarSettings';
import { TemplateSettings } from './TemplateSettings';
import { LocalActionsSettings } from './LocalActionsSettings';
import { PackSettings } from './PackSettings';
import type { Command } from '../../commands';
import type { LocalAction } from '../../../shared/types/localAction';
import { compatiblePack } from '../../dataPacks';

type Tab = SettingsTab;
type RepoSettings = Awaited<ReturnType<typeof api.repoSettings>>['settings'];

interface SettingsModalProps {
  repo: string;
  initialTab?: Tab;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onCloneRepository: (url: string) => void;
  onCreateGitHub: () => void;
  commands: Command[];
  onRunLocalAction: (action: LocalAction) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ repo, initialTab = 'general', onClose, onCheckForUpdates, onCloneRepository, onCreateGitHub, commands, onRunLocalAction }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [navigation, setNavigation] = useState<SettingsSearchResult | null>(null);
  const results = searchSettings(search, Boolean(repo));
  const openResult = (result: ReturnType<typeof searchSettings>[number]) => {
    setTab(result.tab);
    setSearch('');
    setNavigation(result);
  };
  useEffect(() => {
    if (!navigation || search || navigation.tab !== tab) return;
    const page = document.getElementById(`settings-tab-${tab}`);
    const focus = (target: HTMLElement | null, requireControl = false) => {
      if (!target) return false;
      const selector = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)';
      const control = target.matches(selector) ? target : target.querySelector<HTMLElement>(selector);
      if (requireControl && !control) return false;
      target.scrollIntoView({ block: 'nearest' });
      (control ?? target).focus();
      return true;
    };
    if (!navigation.target) { focus(page); setNavigation(null); return; }
    const find = () => focus(document.getElementById(`setting-${navigation.target}`), true);
    if (find()) { setNavigation(null); return; }
    // Repository settings arrive asynchronously; wait for the actual control.
    const observer = new MutationObserver(() => { if (find()) setNavigation(null); });
    if (page) observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    const timer = setTimeout(() => { focus(page); setNavigation(null); }, 2000);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [navigation, search, tab]);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; hidden?: boolean }> = [
    { id: 'general', label: 'General', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: 'repository', label: 'This repository', icon: <FolderGit2 className="w-3.5 h-3.5" />, hidden: !repo },
    { id: 'ssh', label: 'SSH keys', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'integrations', label: 'Integrations', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'open-in', label: 'Open in', icon: <FolderGit2 className="w-3.5 h-3.5" /> },
    { id: 'ai', label: 'AI', icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'keymap', label: 'Keyboard shortcuts', icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'layouts', label: 'Panel layouts', icon: <PanelTop className="w-3.5 h-3.5" /> },
    { id: 'toolbar', label: 'Toolbar actions', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: 'templates', label: 'Templates', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'local-actions', label: 'Local actions', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'packs', label: 'Extension packs', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'sharing', label: 'Settings backup', icon: <Download className="w-3.5 h-3.5" /> },
    { id: 'about', label: 'About', icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <Modal width="lg" tall icon={<SettingsIcon className="w-4 h-4" />} title="Settings" onClose={onClose}>
      <div className="flex-1 min-h-0 flex">
        <nav aria-label="Settings sections" className="w-44 flex-shrink-0 min-h-0 overflow-y-auto border-r border-[#2a3447] p-2 space-y-0.5 bg-[#171c26]">
          <div className="relative mb-3"><Search aria-hidden="true" className="absolute top-2 left-2 w-3.5 h-3.5 text-slate-500" /><input aria-label="Search settings" value={search} onChange={(e) => { setNavigation(null); setSearch(e.target.value); }} placeholder="Search settings" className={`${inputClass} pl-7`} /></div>
          {tabs
            .filter((t) => !t.hidden)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => { setNavigation(null); setTab(t.id); setSearch(''); }}
                aria-current={tab === t.id}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium ${tab === t.id ? 'bg-[#263245] text-teal-200' : 'text-slate-400 hover:bg-[#202735] hover:text-slate-200'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          {search.trim() ? <div aria-live="polite" className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">Settings matching “{search.trim()}”</h3>
            {results.length === 0 && <p className="text-xs text-slate-500">No settings found. Try another search.</p>}
            {results.map((result) => <button type="button" key={`${result.tab}-${result.id}`} onClick={() => openResult(result)} className="block w-full text-left rounded border border-[#2a3447] px-3 py-2 hover:bg-[#202735] focus-visible:outline focus-visible:outline-teal-400"><span className="block text-xs text-slate-200">{result.label}</span><span className="block mt-1 text-[10px] text-slate-500">{result.detail}</span></button>)}
          </div> : <div id={`settings-tab-${tab}`} tabIndex={-1} className="outline-none">
          {['general', 'open-in', 'keymap', 'layouts', 'toolbar', 'local-actions', 'packs', 'sharing'].includes(tab) && <p className="mb-4 text-[11px] text-slate-500">Applies to this Gitter installation.</p>}
          {tab === 'general' && <GeneralSettings />}
          {tab === 'repository' && repo && <RepositorySettings repo={repo} />}
          {tab === 'ssh' && <SshSettings />}
          {tab === 'integrations' && <IntegrationsPanel onCloneRepository={onCloneRepository} onCreateGitHub={onCreateGitHub} />}
          {tab === 'open-in' && <OpenInSettings />}
          {tab === 'ai' && <AiSettingsForm />}
          {tab === 'keymap' && <KeymapSettings commands={commands} />}
          {tab === 'layouts' && <LayoutSettings />}
          {tab === 'toolbar' && <ToolbarSettings commands={commands} />}
          {tab === 'templates' && <TemplateSettings repo={repo} />}
          {tab === 'local-actions' && <LocalActionsSettings repo={repo} onRun={onRunLocalAction} />}
          {tab === 'packs' && <PackSettings />}
          {tab === 'sharing' && <SettingsSharing />}
          {tab === 'about' && (
            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Gitter <span className="font-mono text-slate-100">{CURRENT_VERSION}</span>
              </p>
              <Button onClick={onCheckForUpdates}>Check for updates</Button>
              <Button onClick={() => void api.openUrl({ url: 'https://github.com/zhikom/gitter/blob/main/docs/USER_GUIDE.md' }).catch((error) => toast.error(`Could not open the guide: ${error.message}`))}>Open visual user guide</Button>
            </div>
          )}
          </div>}
        </div>
      </div>
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <div className="flex items-center justify-between mb-3"><h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>{SETTINGS.some((setting) => setting.section === title) && <button type="button" onClick={() => { SETTINGS.filter((setting) => setting.section === title).forEach((setting) => resetPreference(setting.key)); if (title === 'Appearance') resetPreference('themePack'); }} className="text-[10px] text-slate-400 hover:text-teal-300" aria-label={`Reset ${title} settings`}>Reset section</button>}</div>
    <div className="space-y-3">{children}</div>
  </section>
);

function Toggle<K extends keyof Preferences>({ name, label, hint }: { name: K; label: string; hint?: string }) {
  const [value, setValue] = usePreference(name);
  return (
    <SettingAnchor name={name}><div className="flex justify-between gap-2"><label className="flex items-start gap-2.5 text-xs text-slate-300">
      <input type="checkbox" className="mt-0.5" checked={Boolean(value)} onChange={(e) => setValue(e.target.checked as Preferences[K])} />
      <span>
        {label}
        {hint && <span className="block text-[10px] text-slate-500">{hint}</span>}
      </span>
    </label><PreferenceReset name={name} label={label} /></div></SettingAnchor>
  );
}

function Choice<K extends keyof Preferences>({ name, label, options }: { name: K; label: string; options: Array<[Preferences[K], string]> }) {
  const [value, setValue] = usePreference(name);
  return (
    <SettingAnchor name={name}><div className="flex justify-between items-center mb-1"><label htmlFor={`choice-${name}`} className="text-[11px] font-semibold text-slate-400">{label}</label><PreferenceReset name={name} label={label} /></div>
      <select id={`choice-${name}`} value={String(value)} onChange={(e) => setValue(options.find(([v]) => String(v) === e.target.value)![0])} className={`${inputClass} w-56`}>
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </SettingAnchor>
  );
}

const GeneralSettings: React.FC = () => (
  <>
    <Section title="Appearance">
      <SettingAnchor name="theme"><div className="flex justify-between items-center mb-1"><span className="text-[11px] font-semibold text-slate-400">Theme</span><ThemeReset /></div><ThemePicker /></SettingAnchor>
      <FontSettings />
      <Choice name="interfaceScale" label="Interface scale" options={[[85, '85%'], [100, '100%'], [115, '115%'], [125, '125%']]} />
      <p className="text-[10px] text-slate-500">Scales the whole interface, including icons, panels, and code. Use View → Actual Size to reset it.</p>
      <Choice name="interfaceTextScale" label="Interface text size" options={[[85, '85%'], [100, '100%'], [115, '115%'], [125, '125%']]} />
      <p className="text-[10px] text-slate-500">Changes interface text independently of the code and diff size.</p>
    </Section>
    <Section title="Repositories">
      <SettingAnchor name="cloneFolder"><div className="flex justify-end"><PreferenceReset name="cloneFolder" label="default clone folder" /></div><RepositoryFolderSettings /></SettingAnchor>
    </Section>
    <Section title="Diffs">
      <Choice name="diffView" label="Layout" options={[['unified', 'Unified'], ['split', 'Side by side']]} />
      <Choice name="diffFontSize" label="Code and diff size" options={Array.from({ length: 15 }, (_, index) => index + 10).map((n) => [n, `${n} px`])} />
      <Choice name="codeLineHeight" label="Code line height" options={[[1.2, 'Tight'], [1.4, 'Compact'], [1.625, 'Normal'], [1.8, 'Relaxed']]} />
      <p className="text-[10px] text-slate-500">Code size and line height also apply to pull request reviews, blame, selection history, and conflict resolution.</p>
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

const ThemeReset: React.FC = () => {
  const [theme] = usePreference('theme');
  const [themePack] = usePreference('themePack');
  return <button type="button" disabled={theme === 'classic' && !themePack} onClick={() => { resetPreference('themePack'); resetPreference('theme'); }} aria-label="Reset theme" className="shrink-0 text-[10px] text-slate-400 hover:text-teal-300 disabled:opacity-30 disabled:cursor-default">Reset</button>;
};

const ThemePicker: React.FC = () => {
  const [theme, setTheme] = usePreference('theme');
  const [themePack, setThemePack] = usePreference('themePack');
  const [packs] = usePreference('dataPacks');
  const selectedPack = packs.some((pack) => pack.enabled && pack.manifest.id === themePack && compatiblePack(pack.manifest, CURRENT_VERSION) && pack.manifest.contributions.theme);
  const choices: Array<{ id: Preferences['theme']; name: string; description: string; surface: string; panel: string; text: string; accent: string }> = [
    { id: 'classic', name: 'Gitter dark', description: 'The original look', surface: '#14181f', panel: '#202735', text: '#e2e8f0', accent: '#14b8a6' },
    { id: 'codex', name: 'Codex', description: 'Neutral dark', surface: '#1c1c1c', panel: '#303030', text: '#f1f1ef', accent: '#8baee8' },
    { id: 'claude', name: 'Claude', description: 'Warm light', surface: '#faf9f5', panel: '#e8e4da', text: '#2b2722', accent: '#a44a2d' },
  ];
  return <><div role="group" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    {choices.map((choice) => <button key={choice.id} type="button" aria-pressed={!selectedPack && theme === choice.id} onClick={() => { setThemePack(''); setTheme(choice.id); }} className={`rounded-lg border p-2 text-left transition ${!selectedPack && theme === choice.id ? 'border-teal-500 ring-1 ring-teal-500/40' : 'border-[#2a3447] hover:border-teal-500/50'}`}>
      <div aria-hidden="true" className="h-12 rounded flex overflow-hidden border border-black/10" style={{ background: choice.surface, color: choice.text }}>
        <div className="w-1/3 p-1.5" style={{ background: choice.panel }}><div className="w-full h-1 rounded" style={{ background: choice.accent }} /><div className="w-3/4 h-1 rounded mt-1 opacity-40" style={{ background: choice.text }} /></div>
        <div className="p-1.5 flex-1"><div className="text-[10px] leading-3" style={{ fontFamily: choice.id === 'claude' ? 'Georgia, serif' : 'system-ui, sans-serif' }}>Aa</div><div className="w-3/4 h-1 rounded mt-1 opacity-25" style={{ background: choice.text }} /></div>
      </div>
      <span className="block mt-2 text-xs font-semibold text-slate-200">{choice.name}</span><span className="block text-[10px] text-slate-500">{choice.description}</span>
    </button>)}
  </div><button type="button" aria-pressed={!selectedPack && theme === 'system'} onClick={() => { setThemePack(''); setTheme('system'); }} className={`mt-2 px-3 py-1.5 rounded border text-xs ${!selectedPack && theme === 'system' ? 'border-teal-500 text-teal-200' : 'border-[#2a3447] text-slate-300 hover:border-teal-500/50'}`}>Follow system appearance</button><p className="text-[10px] text-slate-500 mt-1">Uses Gitter dark for dark mode and Claude for light mode.</p></>;
};

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
  const [connections, setConnections] = useState<Integration[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [githubAuthenticated, setGithubAuthenticated] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [keyName, setKeyName] = useState('id_ed25519');
  const [comment, setComment] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [remote, setRemote] = useState('');
  const [result, setResult] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    let live = true;
    desktopApi.listSshKeys().then((items) => { if (live) setKeys(items); }).catch((e) => { if (live) setResult(String(e)); }).finally(() => { if (live) setLoading(false); });
    desktopApi.listIntegrations().then((items) => {
      if (!live) return;
      const bitbucket = items.filter((item) => item.kind === 'bitbucket_dc');
      setConnections(bitbucket); setConnectionId(bitbucket[0]?.id ?? '');
    }).catch(() => undefined);
    api.githubStatus().then((status) => { if (live) setGithubAuthenticated(status.authenticated); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const connection = connections.find((item) => item.id === connectionId);
  const generateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passphrase !== confirmPassphrase) { setResult('The passphrases do not match.'); return; }
    const secret = passphrase;
    setPassphrase(''); setConfirmPassphrase(''); setResult(''); setGenerating(true);
    try {
      const path = await desktopApi.generateSshKey(keyName.trim(), comment.trim(), secret);
      setShowGenerate(false);
      toast.success(`Created SSH key ${path}.`);
      try { setKeys(await desktopApi.listSshKeys()); }
      catch (e) { setResult(`The key was created, but the list could not be refreshed: ${String(e)}`); }
    } catch (e) { setResult(`Could not create the SSH key: ${String(e)}`); }
    finally { setGenerating(false); }
  };
  const copyKey = async (key: SshPublicKey, destination: 'bitbucket' | 'github' | null) => {
    try {
      await desktopApi.copySshPublicKey(key.publicKey);
      if (destination === 'github') {
        try { await api.openUrl({ url: 'https://github.com/settings/ssh/new' }); toast.success('Public key copied. Paste it into GitHub.'); }
        catch (e) { toast.error(`Public key copied, but GitHub could not be opened: ${String(e)}`); }
      } else if (destination === 'bitbucket' && connection) {
        try {
          await api.openUrl({ url: `${connection.baseUrl.replace(/\/+$/, '')}/plugins/servlet/ssh/account/keys/add` });
          toast.success('Public key copied. Paste it into Bitbucket.');
        } catch (e) { toast.error(`Public key copied, but Bitbucket could not be opened: ${String(e)}`); }
      } else toast.success('Public key copied.');
    } catch (e) { toast.error(`Could not copy the public key: ${String(e)}`); }
  };
  return (
    <div className="space-y-3 text-xs text-slate-300">
      <p>Git and Gitter use your system SSH configuration and agent. Gitter shows public keys; private keys stay on your computer.</p>
      {loading && <p>Loading public keys…</p>}
      {!loading && keys.length === 0 && <p>No public keys were found in ~/.ssh. Generate a key or add an existing one.</p>}
      {!loading && <div id="setting-ssh-generate" className="flex flex-wrap gap-2"><Button type="button" onClick={() => { setShowGenerate((value) => !value); setResult(''); setPassphrase(''); setConfirmPassphrase(''); }}>{showGenerate ? 'Cancel' : 'Generate SSH key…'}</Button><Button type="button" onClick={async () => {
        setLoading(true); setResult('');
        try { setKeys(await desktopApi.listSshKeys()); }
        catch (e) { setResult(String(e)); }
        finally { setLoading(false); }
      }}>Refresh keys</Button></div>}
      {showGenerate && <form onSubmit={generateKey} className="space-y-3 rounded border border-[#2a3447] bg-[#14181f] p-3">
        <p>An Ed25519 key will be saved in ~/.ssh. Existing keys are never overwritten.</p>
        {result && <p role="alert" className="whitespace-pre-wrap break-words text-rose-300">{result}</p>}
        <Field label="Key filename" hint="The default id_ed25519 is automatically discovered by OpenSSH. Other names need SSH configuration or an agent."><input aria-label="Key filename" value={keyName} onChange={(event) => setKeyName(event.target.value)} className={`${inputClass} font-mono`} required /></Field>
        <Field label="Comment (optional)"><input aria-label="SSH key comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Email or label" className={inputClass} /></Field>
        <Field label="Passphrase (optional)" hint="Leave blank for an unencrypted key. A protected key may need to be unlocked in your SSH agent before Git can use it."><input aria-label="SSH key passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} className={inputClass} /></Field>
        <Field label="Confirm passphrase"><input aria-label="Confirm SSH key passphrase" type="password" autoComplete="new-password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} className={inputClass} /></Field>
        <Button type="submit" tone="primary" busy={generating} disabled={!keyName.trim()}>{generating ? 'Generating…' : 'Generate key'}</Button>
      </form>}
      {connections.length > 1 && <Field label="Bitbucket connection"><select aria-label="Bitbucket connection for SSH keys" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} className={inputClass}>{connections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>}
      {connection && keys.length > 0 && <p className="text-slate-500">Copy a public key and open {connection.label}'s SSH keys page to paste it. Your browser may ask you to sign in.</p>}
      {keys.map((key) => <div key={key.path} className="p-3 rounded bg-[#14181f] border border-[#2a3447] break-all">
        <div className="font-semibold">{key.path}</div><div>{key.fingerprint}</div>
        <div className="text-slate-500">{key.privateKeyExists ? 'Private key present' : 'No matching private key'} · {key.loadedInAgent ? 'Loaded in SSH agent' : 'Not listed by SSH agent'}</div>
        <div className="mt-2 flex flex-wrap gap-2"><Button type="button" onClick={() => void copyKey(key, null)}>Copy public key</Button>{connection && <Button type="button" onClick={() => void copyKey(key, 'bitbucket')}>Copy and open Bitbucket</Button>}{githubAuthenticated && <Button type="button" onClick={() => void copyKey(key, 'github')}>Copy and open GitHub</Button>}</div>
      </div>)}
      <Field id="setting-ssh-test" label="Test an SSH repository" hint="Uses known hosts without accepting new host keys.">
        <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="git@example.com:project/repository.git" className={`${inputClass} font-mono`} />
      </Field>
      <Button type="button" busy={testing} disabled={!remote.trim()} onClick={async () => {
        setTesting(true); setResult('');
        try { setResult(await desktopApi.testSshRemote(remote.trim())); }
        catch (e) { setResult(String(e)); }
        finally { setTesting(false); }
      }}>{testing ? 'Testing…' : 'Test connection'}</Button>
      {result && !showGenerate && <pre className="whitespace-pre-wrap break-all">{result}</pre>}
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
      <p className="mb-4 text-[11px] text-slate-500">Identity, behavior, and signing use Git configuration, which command-line Git also reads. The diff tool is stored in Gitter's local repository data. Linked worktrees share repository data, but Git can also have per-worktree overrides. Empty Git fields inherit other configured values.</p>
      <Section title="Identity">
        <Field id="setting-repo-name" label="Name">
          <input value={settings.userName} onChange={(e) => set('userName', e.target.value)} placeholder={inherited.userName || 'Not set'} className={inputClass} />
        </Field>
        <Field id="setting-repo-email" label="Email">
          <input value={settings.userEmail} onChange={(e) => set('userEmail', e.target.value)} placeholder={inherited.userEmail || 'Not set'} className={inputClass} />
        </Field>
      </Section>
      <Section title="Behavior">
        <Field id="setting-repo-pull" label="Pull">
          <select value={String(settings.pullRebase)} onChange={(e) => set('pullRebase', e.target.value === 'null' ? null : e.target.value === 'true')} className={`${inputClass} w-56`}>
            <option value="null">Git's default</option>
            <option value="false">Merge</option>
            <option value="true">Rebase</option>
          </select>
        </Field>
        <Field id="setting-repo-line-endings" label="Line endings (core.autocrlf)">
          <select value={String(settings.autocrlf)} onChange={(e) => set('autocrlf', e.target.value === 'null' ? null : (e.target.value as RepoSettings['autocrlf']))} className={`${inputClass} w-56`}>
            <option value="null">Git's default</option>
            <option value="true">Convert to CRLF on checkout</option>
            <option value="input">Convert to LF on commit</option>
            <option value="false">Leave as they are</option>
          </select>
        </Field>
        <Field id="setting-repo-diff-tool" label="Diff tool" hint="A command with %1 for the old file and %2 for the new one. Empty tries VS Code, then WinMerge or Beyond Compare (FileMerge on macOS).">
          <input value={settings.diffTool} onChange={(e) => set('diffTool', e.target.value)} placeholder="code --diff %1 %2" className={`${inputClass} font-mono`} />
        </Field>
      </Section>
      <Section title="Signing">
        <label id="setting-repo-sign" className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={settings.gpgSign} onChange={(e) => set('gpgSign', e.target.checked)} />
          Sign commits
        </label>
        <Field id="setting-repo-sign-format" label="Format">
          <select value={settings.gpgFormat || 'openpgp'} onChange={(e) => set('gpgFormat', e.target.value === 'openpgp' ? '' : e.target.value)} className={`${inputClass} w-56`}>
            <option value="openpgp">OpenPGP (gpg)</option>
            <option value="ssh">SSH key</option>
            <option value="x509">X.509</option>
          </select>
        </Field>
        <Field id="setting-repo-sign-key" label="Signing key">
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
        <Field id="setting-ai-provider" label="Provider">
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
            <Field id="setting-ai-model" label="Model">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel} className={`${inputClass} font-mono`} />
            </Field>
            {info.protocol === 'openai' && (
              <Field id="setting-ai-address" label="API address" hint={info.defaultBaseUrl ? `Empty uses ${info.defaultBaseUrl}` : 'The endpoint base, ending in /v1'}>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.defaultBaseUrl ?? 'https://…/v1'} className={`${inputClass} font-mono`} />
              </Field>
            )}
            <Field id="setting-ai-key" label="API key" hint={hasKey ? 'A key is stored. Type a new one to replace it.' : info.needsKey ? 'Required by this provider.' : 'Only if your endpoint needs one.'}>
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
