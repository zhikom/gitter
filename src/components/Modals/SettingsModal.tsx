import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Sparkles,
  Key,
  Globe,
  Shield,
  User,
  Sliders,
  FileCode,
  Keyboard,
  Palette,
  Terminal,
  Check,
  RotateCcw,
  Copy,
  DownloadCloud,
  RefreshCw,
  FolderGit2,
  Workflow,
} from 'lucide-react';
import { api } from '../../api/client';
import { CURRENT_VERSION } from '../../services/updateService';

import { toast } from '../../utils/toast';
interface SettingsModalProps {
  repoPath?: string;
  onClose: () => void;
  onCheckUpdates?: () => void;
}

type TabType =
  | 'repo'
  | 'general'
  | 'git'
  | 'signing'
  | 'ssh'
  | 'appearance'
  | 'diff'
  | 'ai'
  | 'integrations'
  | 'shortcuts';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  repoPath = '',
  onClose,
  onCheckUpdates,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(() => (repoPath ? 'repo' : 'general'));

  // Repo-Specific Settings (GitKraken style: .git/gitter/config.json)
  const [overrideIdentity, setOverrideIdentity] = useState(false);
  const [repoAuthorName, setRepoAuthorName] = useState('');
  const [repoAuthorEmail, setRepoAuthorEmail] = useState('');
  const [repoDefaultBranch, setRepoDefaultBranch] = useState('');
  const [repoPullStrategy, setRepoPullStrategy] = useState<'rebase' | 'merge' | 'ff-only'>('rebase');
  const [repoAutocrlf, setRepoAutocrlf] = useState<'input' | 'true' | 'false'>('input');
  const [repoBypassHooks, setRepoBypassHooks] = useState(false);
  const [repoLfsPatterns, setRepoLfsPatterns] = useState('*.zip, *.onnx, *.pt, *.bin, *.tar.gz');
  const [repoExternalDiffCmd, setRepoExternalDiffCmd] = useState('');
  const [gitflowDevelopBranch, setGitflowDevelopBranch] = useState('develop');
  const [gitflowMasterBranch, setGitflowMasterBranch] = useState('main');
  const [gitflowFeaturePrefix, setGitflowFeaturePrefix] = useState('feature/');
  const [gitflowReleasePrefix, setGitflowReleasePrefix] = useState('release/');
  const [gitflowHotfixPrefix, setGitflowHotfixPrefix] = useState('hotfix/');

  // General Config
  const [defaultBranch, setDefaultBranch] = useState(
    () => localStorage.getItem('gitter_default_branch') || 'main'
  );
  const [autoFetchInterval, setAutoFetchInterval] = useState(
    () => localStorage.getItem('gitter_auto_fetch') || '5'
  );
  const [confirmDiscard, setConfirmDiscard] = useState(
    () => localStorage.getItem('gitter_confirm_discard') !== 'false'
  );
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState(
    () => localStorage.getItem('gitter_confirm_delete_branch') !== 'false'
  );
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(
    () => localStorage.getItem('gitter_auto_check_updates') !== 'false'
  );

  // Git Identity
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [commitTemplate, setCommitTemplate] = useState('');

  // Commit Signing
  const [gpgSign, setGpgSign] = useState(false);
  const [signingKey, setSigningKey] = useState('');
  const [gpgFormat, setGpgFormat] = useState('openpgp');

  // SSH
  const [sshKeyPath, setSshKeyPath] = useState('~/.ssh/id_ed25519');
  const [sshPublicKey, setSshPublicKey] = useState(
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGitterDefaultKeyExampleUser@localhost'
  );

  // Appearance
  const [theme, setTheme] = useState(
    () => localStorage.getItem('gitter_theme') || 'dark-kraken'
  );
  const [graphDensity, setGraphDensity] = useState(
    () => localStorage.getItem('gitter_graph_density') || 'comfortable'
  );
  const [dateFormat, setDateFormat] = useState(
    () => localStorage.getItem('gitter_date_format') || 'relative'
  );

  // Diff & Editor
  const [defaultDiffView, setDefaultDiffView] = useState(
    () => localStorage.getItem('gitter_diff_view') || 'unified'
  );
  const [defaultIgnoreWs, setDefaultIgnoreWs] = useState(
    () => localStorage.getItem('gitter_diff_ws') === 'true'
  );
  const [tabSize, setTabSize] = useState(
    () => localStorage.getItem('gitter_tab_size') || '2'
  );
  const [diffFontSize, setDiffFontSize] = useState(
    () => localStorage.getItem('gitter_diff_font_size') || '12'
  );

  // AI Config
  const [provider, setProvider] = useState<
    'builtin' | 'anthropic' | 'gemini' | 'openai' | 'ollama' | 'deepseek' | 'custom'
  >('builtin');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-3-7-sonnet-20250219');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState('0.7');

  // Integrations
  const [ghStatus, setGhStatus] = useState('Authenticated via local gh CLI (zhikom)');

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load AI config
    api.getAiConfig().then((cfg) => {
      if (cfg) {
        setProvider(cfg.provider || 'builtin');
        setApiKey(cfg.apiKey || '');
        setModel(cfg.model || 'gemini-1.5-flash');
        setBaseUrl(cfg.baseUrl || '');
      }
    });

    // Load Git config & Repo config if repoPath present
    if (repoPath) {
      api.getGitConfig(repoPath).then((cfg) => {
        if (cfg.userName) setUserName(cfg.userName);
        if (cfg.userEmail) setUserEmail(cfg.userEmail);
        if (cfg.gpgSign) setGpgSign(cfg.gpgSign);
        if (cfg.signingKey) setSigningKey(cfg.signingKey);
        if (cfg.gpgFormat) setGpgFormat(cfg.gpgFormat);
      });

      api.getRepoConfig(repoPath).then((cfg) => {
        if (cfg) {
          if (cfg.authorName || cfg.authorEmail) {
            setOverrideIdentity(true);
            setRepoAuthorName(cfg.authorName || '');
            setRepoAuthorEmail(cfg.authorEmail || '');
          }
          if (cfg.defaultBranch) setRepoDefaultBranch(cfg.defaultBranch);
          if (cfg.pullStrategy) setRepoPullStrategy(cfg.pullStrategy);
          if (cfg.autocrlf) setRepoAutocrlf(cfg.autocrlf);
          if (cfg.bypassHooks !== undefined) setRepoBypassHooks(cfg.bypassHooks);
          if (cfg.lfsPatterns) setRepoLfsPatterns(cfg.lfsPatterns);
          if (cfg.externalDiffCmd) setRepoExternalDiffCmd(cfg.externalDiffCmd);
          if (cfg.gitflow) {
            if (cfg.gitflow.masterBranch) setGitflowMasterBranch(cfg.gitflow.masterBranch);
            if (cfg.gitflow.developBranch) setGitflowDevelopBranch(cfg.gitflow.developBranch);
            if (cfg.gitflow.featurePrefix) setGitflowFeaturePrefix(cfg.gitflow.featurePrefix);
            if (cfg.gitflow.releasePrefix) setGitflowReleasePrefix(cfg.gitflow.releasePrefix);
            if (cfg.gitflow.hotfixPrefix) setGitflowHotfixPrefix(cfg.gitflow.hotfixPrefix);
          }
        }
      });
    }
  }, [repoPath]);

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      // Save local preferences
      localStorage.setItem('gitter_default_branch', defaultBranch);
      localStorage.setItem('gitter_auto_fetch', autoFetchInterval);
      localStorage.setItem('gitter_confirm_discard', confirmDiscard ? 'true' : 'false');
      localStorage.setItem('gitter_confirm_delete_branch', confirmDeleteBranch ? 'true' : 'false');
      localStorage.setItem('gitter_theme', theme);
      localStorage.setItem('gitter_graph_density', graphDensity);
      localStorage.setItem('gitter_date_format', dateFormat);
      localStorage.setItem('gitter_diff_view', defaultDiffView);
      localStorage.setItem('gitter_diff_ws', defaultIgnoreWs ? 'true' : 'false');
      localStorage.setItem('gitter_tab_size', tabSize);
      localStorage.setItem('gitter_diff_font_size', diffFontSize);

      // Save AI Config
      await api.saveAiConfig({
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      });

      // Save Git Config & Per-Repo Config if repo present
      if (repoPath) {
        if (userName) await api.setGitConfig(repoPath, 'user.name', userName.trim());
        if (userEmail) await api.setGitConfig(repoPath, 'user.email', userEmail.trim());
        await api.setGitConfig(repoPath, 'commit.gpgsign', gpgSign ? 'true' : 'false');
        if (signingKey) await api.setGitConfig(repoPath, 'user.signingkey', signingKey.trim());
        if (gpgFormat) await api.setGitConfig(repoPath, 'gpg.format', gpgFormat);

        // Per-Repo Config (.git/gitter/config.json)
        await api.saveRepoConfig(repoPath, {
          authorName: overrideIdentity ? repoAuthorName.trim() : undefined,
          authorEmail: overrideIdentity ? repoAuthorEmail.trim() : undefined,
          defaultBranch: repoDefaultBranch.trim() || undefined,
          pullStrategy: repoPullStrategy,
          autocrlf: repoAutocrlf,
          bypassHooks: repoBypassHooks,
          lfsPatterns: repoLfsPatterns.trim() || undefined,
          externalDiffCmd: repoExternalDiffCmd.trim() || undefined,
          gitflow: {
            masterBranch: gitflowMasterBranch.trim() || 'main',
            developBranch: gitflowDevelopBranch.trim() || 'develop',
            featurePrefix: gitflowFeaturePrefix.trim() || 'feature/',
            releasePrefix: gitflowReleasePrefix.trim() || 'release/',
            hotfixPrefix: gitflowHotfixPrefix.trim() || 'hotfix/',
          },
        });

        // Sync with local git config
        await api.setGitConfig(repoPath, 'core.autocrlf', repoAutocrlf);
        await api.setGitConfig(repoPath, 'pull.rebase', repoPullStrategy === 'rebase' ? 'true' : 'false');
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 700);
    } catch (e: any) {
      toast(`Save error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    ...(repoPath
      ? [{ id: 'repo' as TabType, label: 'Repository', icon: <FolderGit2 className="w-4 h-4 text-emerald-400" /> }]
      : []),
    { id: 'general', label: 'General', icon: <Sliders className="w-4 h-4" /> },
    { id: 'git', label: 'Git Identity', icon: <User className="w-4 h-4" /> },
    { id: 'signing', label: 'Commit Signing', icon: <Shield className="w-4 h-4" /> },
    { id: 'ssh', label: 'SSH Keys', icon: <Key className="w-4 h-4" /> },
    { id: 'appearance', label: 'UI & Theme', icon: <Palette className="w-4 h-4" /> },
    { id: 'diff', label: 'Diff & Editor', icon: <FileCode className="w-4 h-4" /> },
    { id: 'ai', label: 'AI & Models', icon: <Sparkles className="w-4 h-4 text-teal-400" /> },
    { id: 'integrations', label: 'Integrations', icon: <Globe className="w-4 h-4" /> },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: <Keyboard className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#181d26] border border-[#2a3447] rounded-xl shadow-2xl overflow-hidden flex h-[620px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Navigation Sidebar */}
        <div className="w-56 bg-[#14181f] border-r border-[#2a3447] flex flex-col p-3">
          <div className="flex items-center space-x-2 px-2 py-3 border-b border-[#2a3447] mb-2">
            <Settings className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-sm text-slate-100">Preferences</span>
          </div>

          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400'
                      : 'hover:bg-[#202735] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#2a3447] text-[10px] text-slate-600 text-center">
            Gitter Settings v1.0
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col h-full bg-[#1b212c]">
          {/* Top Header */}
          <div className="h-12 border-b border-[#2a3447] flex items-center justify-between px-6 flex-shrink-0">
            <span className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[#252f40] text-slate-400 hover:text-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-300">
            {/* REPOSITORY-SPECIFIC SETTINGS (GitKraken Style) */}
            {activeTab === 'repo' && (
              <div className="space-y-5 max-w-xl">
                <div className="p-3 bg-[#14181f] border border-[#2a3447] rounded-lg">
                  <div className="text-slate-400 font-semibold mb-1 flex items-center space-x-2">
                    <FolderGit2 className="w-4 h-4 text-emerald-400" />
                    <span>Current Repository</span>
                  </div>
                  <div className="font-mono text-emerald-400 text-[11px] truncate">{repoPath}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Custom configuration is saved directly to <span className="font-mono text-slate-400">.git/gitter/config.json</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={overrideIdentity}
                      onChange={(e) => setOverrideIdentity(e.target.checked)}
                      className="rounded bg-[#14181f] border-[#2a3447] text-emerald-500"
                    />
                    <span>Override Author Identity for this repository</span>
                  </label>

                  {overrideIdentity && (
                    <div className="pl-6 space-y-3 border-l-2 border-emerald-500/30">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Local Author Name</label>
                        <input
                          type="text"
                          value={repoAuthorName}
                          onChange={(e) => setRepoAuthorName(e.target.value)}
                          placeholder="e.g. Jane Doe"
                          className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Local Author Email</label>
                        <input
                          type="email"
                          value={repoAuthorEmail}
                          onChange={(e) => setRepoAuthorEmail(e.target.value)}
                          placeholder="e.g. jane@company.com"
                          className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#2a3447] space-y-3">
                  <div className="font-semibold text-slate-200 flex items-center space-x-2">
                    <Workflow className="w-4 h-4 text-indigo-400" />
                    <span>Gitflow Configuration</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Production / Main Branch</label>
                      <input
                        type="text"
                        value={gitflowMasterBranch}
                        onChange={(e) => setGitflowMasterBranch(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Development Branch</label>
                      <input
                        type="text"
                        value={gitflowDevelopBranch}
                        onChange={(e) => setGitflowDevelopBranch(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Feature Prefix</label>
                      <input
                        type="text"
                        value={gitflowFeaturePrefix}
                        onChange={(e) => setGitflowFeaturePrefix(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Release Prefix</label>
                      <input
                        type="text"
                        value={gitflowReleasePrefix}
                        onChange={(e) => setGitflowReleasePrefix(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Hotfix Prefix</label>
                      <input
                        type="text"
                        value={gitflowHotfixPrefix}
                        onChange={(e) => setGitflowHotfixPrefix(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* PULL & MERGE STRATEGY */}
                <div className="pt-3 border-t border-[#2a3447] space-y-3">
                  <div className="font-semibold text-slate-200 flex items-center space-x-2">
                    <RotateCcw className="w-4 h-4 text-cyan-400" />
                    <span>Pull & Merge Behavior</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Pull Strategy</label>
                      <select
                        value={repoPullStrategy}
                        onChange={(e) => setRepoPullStrategy(e.target.value as any)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="rebase">Rebase local commits onto upstream (Recommended)</option>
                        <option value="merge">Create merge commit on pull</option>
                        <option value="ff-only">Fast-forward only (Reject divergent branches)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Line Endings (core.autocrlf)</label>
                      <select
                        value={repoAutocrlf}
                        onChange={(e) => setRepoAutocrlf(e.target.value as any)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        <option value="input">input (Commit LF, checkout as-is — Cross-Platform)</option>
                        <option value="true">true (Commit LF, checkout CRLF — Windows standard)</option>
                        <option value="false">false (Preserve exact working tree line endings)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* HOOKS & LFS */}
                <div className="pt-3 border-t border-[#2a3447] space-y-3">
                  <div className="font-semibold text-slate-200 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Hooks & Large File Storage (LFS)</span>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={repoBypassHooks}
                      onChange={(e) => setRepoBypassHooks(e.target.checked)}
                      className="rounded bg-[#14181f] border-[#2a3447] text-amber-500"
                    />
                    <span>Bypass Git pre-commit & commit-msg hooks (--no-verify)</span>
                  </label>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Git LFS Tracked Patterns</label>
                    <input
                      type="text"
                      value={repoLfsPatterns}
                      onChange={(e) => setRepoLfsPatterns(e.target.value)}
                      placeholder="*.zip, *.onnx, *.pt, *.bin, *.tar.gz"
                      className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Comma-separated glob patterns tracked by Git LFS.</p>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Custom External Diff Tool Command</label>
                    <input
                      type="text"
                      value={repoExternalDiffCmd}
                      onChange={(e) => setRepoExternalDiffCmd(e.target.value)}
                      placeholder="e.g. code --diff $LOCAL $REMOTE or bcomp $LOCAL $REMOTE"
                      className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#2a3447]">
                  <label className="block text-slate-400 font-semibold mb-1">Default Branch Override</label>
                  <input
                    type="text"
                    value={repoDefaultBranch}
                    onChange={(e) => setRepoDefaultBranch(e.target.value)}
                    placeholder="Leave empty to use global default"
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Default Branch Name for New Repositories
                  </label>
                  <input
                    type="text"
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Standard is 'main' (or 'master').
                  </p>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Auto-fetch Interval
                  </label>
                  <select
                    value={autoFetchInterval}
                    onChange={(e) => setAutoFetchInterval(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="0">Never / Manual only</option>
                    <option value="1">Every 1 minute</option>
                    <option value="5">Every 5 minutes (Recommended)</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-[#2a3447] space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmDiscard}
                      onChange={(e) => setConfirmDiscard(e.target.checked)}
                      className="rounded bg-[#14181f] border-[#2a3447] text-teal-500"
                    />
                    <span>Ask for confirmation before discarding changes permanently</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmDeleteBranch}
                      onChange={(e) => setConfirmDeleteBranch(e.target.checked)}
                      className="rounded bg-[#14181f] border-[#2a3447] text-teal-500"
                    />
                    <span>Ask for confirmation before deleting a branch</span>
                  </label>
                </div>

                {/* SOFTWARE UPDATES SECTION */}
                <div className="pt-4 border-t border-[#2a3447] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center space-x-2">
                        <DownloadCloud className="w-4 h-4 text-teal-400" />
                        <span>Software Updates</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Current version: <span className="font-mono text-slate-300">v{CURRENT_VERSION}</span>
                      </div>
                    </div>
                    {onCheckUpdates && (
                      <button
                        type="button"
                        onClick={onCheckUpdates}
                        className="px-3 py-1.5 rounded bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 font-semibold text-xs transition flex items-center space-x-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check for Updates...</span>
                      </button>
                    )}
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoCheckUpdates}
                      onChange={(e) => {
                        setAutoCheckUpdates(e.target.checked);
                        localStorage.setItem('gitter_auto_check_updates', e.target.checked ? 'true' : 'false');
                      }}
                      className="rounded bg-[#14181f] border-[#2a3447] text-teal-500"
                    />
                    <span>Automatically check for new releases on startup</span>
                  </label>
                </div>
              </div>
            )}

            {/* GIT IDENTITY TAB */}
            {activeTab === 'git' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Author Name (user.name)</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Author Email (user.email)</label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="e.g. john@example.com"
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Commit Message Template (Optional)
                  </label>
                  <textarea
                    value={commitTemplate}
                    onChange={(e) => setCommitTemplate(e.target.value)}
                    placeholder="[type]: [subject]&#10;&#10;[body]&#10;&#10;Fixes #[issue]"
                    rows={4}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono resize-none"
                  />
                </div>
              </div>
            )}

            {/* COMMIT SIGNING TAB */}
            {activeTab === 'signing' && (
              <div className="space-y-4 max-w-xl">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gpgSign}
                    onChange={(e) => setGpgSign(e.target.checked)}
                    className="rounded bg-[#14181f] border-[#2a3447] text-teal-500"
                  />
                  <span className="font-semibold text-slate-200">Sign Commits with GPG or SSH (commit.gpgsign)</span>
                </label>

                {gpgSign && (
                  <div className="space-y-3 p-3 bg-[#14181f] border border-[#2a3447] rounded-lg">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Signing Format</label>
                      <select
                        value={gpgFormat}
                        onChange={(e) => setGpgFormat(e.target.value)}
                        className="w-full bg-[#1b212c] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      >
                        <option value="openpgp">OpenPGP (Standard GPG Key)</option>
                        <option value="ssh">SSH Key (git 2.34+)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Signing Key ID (user.signingkey)</label>
                      <input
                        type="text"
                        value={signingKey}
                        onChange={(e) => setSigningKey(e.target.value)}
                        placeholder={gpgFormat === 'ssh' ? '~/.ssh/id_ed25519.pub' : 'e.g. 3AA5C34371567BD2'}
                        className="w-full bg-[#1b212c] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SSH TAB */}
            {activeTab === 'ssh' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">SSH Key Path</label>
                  <input
                    type="text"
                    value={sshKeyPath}
                    onChange={(e) => setSshKeyPath(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-semibold">Public Key</label>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(sshPublicKey);
                        toast('SSH Public key copied to clipboard!');
                      }}
                      className="text-teal-400 hover:text-teal-300 flex items-center space-x-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Public Key</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={sshPublicKey}
                    rows={3}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-300 font-mono select-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* UI & THEME TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Theme</label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="dark-kraken">GitKraken Dark Slate (Default)</option>
                    <option value="midnight-navy">Midnight Navy</option>
                    <option value="amoled-black">AMOLED Pitch Black</option>
                    <option value="light-clean">Clean Light</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Graph Lane Density</label>
                  <select
                    value={graphDensity}
                    onChange={(e) => setGraphDensity(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="comfortable">Comfortable (32px row height)</option>
                    <option value="compact">Compact (24px row height)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Commit Date Display</label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="relative">Relative (e.g. 2 hours ago)</option>
                    <option value="absolute">Absolute (YYYY-MM-DD HH:mm)</option>
                  </select>
                </div>
              </div>
            )}

            {/* DIFF & EDITOR TAB */}
            {activeTab === 'diff' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Default Diff View Mode</label>
                  <select
                    value={defaultDiffView}
                    onChange={(e) => setDefaultDiffView(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="unified">Unified (Inline)</option>
                    <option value="split">Split (Side-by-side)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tab Size</label>
                  <select
                    value={tabSize}
                    onChange={(e) => setTabSize(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="2">2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="8">8 spaces</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Diff Font Size (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="20"
                    value={diffFontSize}
                    onChange={(e) => setDiffFontSize(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div className="pt-2 border-t border-[#2a3447]">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaultIgnoreWs}
                      onChange={(e) => setDefaultIgnoreWs(e.target.checked)}
                      className="rounded bg-[#14181f] border-[#2a3447] text-teal-500"
                    />
                    <span>Ignore whitespace changes by default (-w)</span>
                  </label>
                </div>
              </div>
            )}

            {/* AI & MODELS TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">AI Provider</label>
                  <select
                    value={provider}
                    onChange={(e: any) => {
                      const p = e.target.value;
                      setProvider(p);
                      if (p === 'anthropic') setModel('claude-3-7-sonnet-20250219');
                      else if (p === 'gemini') setModel('gemini-2.5-pro');
                      else if (p === 'openai') setModel('o3-mini');
                      else if (p === 'deepseek') {
                        setModel('deepseek-chat');
                        setBaseUrl('https://api.deepseek.com/v1');
                      } else if (p === 'custom') {
                        setModel('custom-model');
                        setBaseUrl('https://api.openai.com/v1');
                      } else if (p === 'ollama') {
                        setModel('llama3.2');
                        setBaseUrl('http://localhost:11434/v1');
                      }
                    }}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="builtin">Built-in Offline Engine (No API key needed)</option>
                    <option value="anthropic">Anthropic Claude (Claude 3.7 Sonnet, 3.5 Sonnet v2, 3.5 Haiku)</option>
                    <option value="gemini">Google Gemini (Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash)</option>
                    <option value="openai">OpenAI (o3-mini, o1, GPT-4.5, GPT-4o, GPT-4o-mini)</option>
                    <option value="deepseek">DeepSeek (DeepSeek-V3, DeepSeek-R1 Reasoner)</option>
                    <option value="custom">Custom OpenAI-Compatible API (OpenRouter, Groq, Together, vLLM)</option>
                    <option value="ollama">Ollama Local AI (http://localhost:11434)</option>
                  </select>
                </div>

                {provider !== 'builtin' && (
                  <>
                    {(provider === 'custom' || provider === 'ollama' || provider === 'deepseek') && (
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">
                          API Base URL (OpenAI-compatible)
                        </label>
                        <input
                          type="text"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder={
                            provider === 'deepseek'
                              ? 'https://api.deepseek.com/v1'
                              : provider === 'ollama'
                              ? 'http://localhost:11434/v1'
                              : 'https://openrouter.ai/api/v1'
                          }
                          className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">
                        API Key {provider === 'ollama' && '(Optional for local)'}
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={`Enter your ${provider} API Key`}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-400 font-semibold">Model Name (or type any custom model)</label>
                        <span className="text-[10px] text-teal-400 font-mono">Custom input supported</span>
                      </div>
                      <input
                        type="text"
                        list="model-presets"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. claude-3-7-sonnet-20250219 or deepseek-reasoner"
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                      />
                      <datalist id="model-presets">
                        {/* Anthropic Presets */}
                        <option value="claude-3-7-sonnet-20250219">Claude 3.7 Sonnet (Latest Flagship with Reasoning)</option>
                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet v2</option>
                        <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                        <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                        {/* Gemini Presets */}
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Latest 2025 Flagship)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        <option value="gemini-2.0-flash-thinking-exp">Gemini 2.0 Flash Thinking</option>
                        <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                        <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
                        {/* OpenAI Presets */}
                        <option value="o3-mini">OpenAI o3-mini (Latest Reasoning)</option>
                        <option value="o1">OpenAI o1</option>
                        <option value="gpt-4.5-preview">OpenAI GPT-4.5 Preview</option>
                        <option value="gpt-4o">OpenAI GPT-4o</option>
                        <option value="gpt-4o-mini">OpenAI GPT-4o-mini</option>
                        {/* DeepSeek Presets */}
                        <option value="deepseek-chat">DeepSeek-V3 Chat</option>
                        <option value="deepseek-reasoner">DeepSeek-R1 Reasoner</option>
                        {/* Ollama Presets */}
                        <option value="llama3.2">Ollama Llama 3.2</option>
                        <option value="qwen2.5-coder">Ollama Qwen 2.5 Coder</option>
                        <option value="mistral">Ollama Mistral</option>
                      </datalist>
                    </div>

                    {provider === 'ollama' && (
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Ollama Base URL</label>
                        <input
                          type="text"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder="http://localhost:11434"
                          className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* INTEGRATIONS TAB */}
            {activeTab === 'integrations' && (
              <div className="space-y-4 max-w-xl">
                <div className="p-3 bg-[#14181f] border border-[#2a3447] rounded-lg">
                  <div className="flex items-center space-x-2 text-teal-400 font-bold mb-1">
                    <Globe className="w-4 h-4" />
                    <span>GitHub Integration</span>
                  </div>
                  <p className="text-slate-400 text-xs mb-2">{ghStatus}</p>
                  <div className="text-[11px] text-slate-500">
                    Pull request reviews, creations, and branch checkouts are automatically powered by your local GitHub CLI credentials.
                  </div>
                </div>
              </div>
            )}

            {/* KEYBOARD SHORTCUTS TAB */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-2 max-w-2xl">
                <div className="border border-[#2a3447] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#14181f] text-slate-400 border-b border-[#2a3447]">
                      <tr>
                        <th className="py-2 px-3">Shortcut</th>
                        <th className="py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222a3a]">
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + P / Cmd + P</td>
                        <td className="py-2 px-3">Quick Launch / Command Palette</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Shift + P</td>
                        <td className="py-2 px-3">Quick Launch All Commands</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + T</td>
                        <td className="py-2 px-3">Open Repository in New Tab / Launchpad</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + W</td>
                        <td className="py-2 px-3">Close Current Repository Tab</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Tab</td>
                        <td className="py-2 px-3">Cycle Open Repository Tabs</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Enter</td>
                        <td className="py-2 px-3">Commit Staged Changes</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Z</td>
                        <td className="py-2 px-3">1-Click Undo Last Git Action (Reflog roll)</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + B</td>
                        <td className="py-2 px-3">Toggle Left Sidebar (Navigator)</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + J</td>
                        <td className="py-2 px-3">Toggle Staging & Diff Panel</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Shift + A</td>
                        <td className="py-2 px-3">Toggle AI Assistant Dock</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Double Click (Branch)</td>
                        <td className="py-2 px-3">Checkout Branch</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Double Click (File)</td>
                        <td className="py-2 px-3">Stage / Unstage File</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer Save / Cancel Button Bar */}
          <div className="h-14 border-t border-[#2a3447] bg-[#14181f] flex items-center justify-end px-6 space-x-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveAll()}
              disabled={loading}
              className="px-5 py-1.5 rounded text-xs font-semibold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-lg shadow-teal-500/20 flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
