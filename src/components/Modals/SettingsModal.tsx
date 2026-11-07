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
} from 'lucide-react';
import { api } from '../../api/client';

interface SettingsModalProps {
  repoPath?: string;
  onClose: () => void;
}

type TabType =
  | 'general'
  | 'git'
  | 'signing'
  | 'ssh'
  | 'appearance'
  | 'diff'
  | 'ai'
  | 'integrations'
  | 'shortcuts';

export const SettingsModal: React.FC<SettingsModalProps> = ({ repoPath = '', onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');

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
  const [provider, setProvider] = useState<'builtin' | 'anthropic' | 'gemini' | 'openai' | 'ollama'>('builtin');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-1.5-flash');
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

    // Load Git config if repoPath present
    if (repoPath) {
      api.getGitConfig(repoPath).then((cfg) => {
        if (cfg.userName) setUserName(cfg.userName);
        if (cfg.userEmail) setUserEmail(cfg.userEmail);
        if (cfg.gpgSign) setGpgSign(cfg.gpgSign);
        if (cfg.signingKey) setSigningKey(cfg.signingKey);
        if (cfg.gpgFormat) setGpgFormat(cfg.gpgFormat);
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

      // Save Git Config if repo present
      if (repoPath) {
        if (userName) await api.setGitConfig(repoPath, 'user.name', userName.trim());
        if (userEmail) await api.setGitConfig(repoPath, 'user.email', userEmail.trim());
        await api.setGitConfig(repoPath, 'commit.gpgsign', gpgSign ? 'true' : 'false');
        if (signingKey) await api.setGitConfig(repoPath, 'user.signingkey', signingKey.trim());
        if (gpgFormat) await api.setGitConfig(repoPath, 'gpg.format', gpgFormat);
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 700);
    } catch (e: any) {
      alert(`Save error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
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
                        alert('SSH Public key copied to clipboard!');
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
                      else if (p === 'gemini') setModel('gemini-1.5-flash');
                      else if (p === 'openai') setModel('gpt-4o');
                      else if (p === 'ollama') setModel('llama3.2');
                    }}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="builtin">Built-in Offline Engine (No API key needed)</option>
                    <option value="anthropic">Anthropic Claude (Claude 3.7 / 3.5 Sonnet)</option>
                    <option value="gemini">Google Gemini (Gemini 1.5 Flash / Pro)</option>
                    <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                    <option value="ollama">Ollama Local AI (http://localhost:11434)</option>
                  </select>
                </div>

                {provider !== 'builtin' && (
                  <>
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
                      <label className="block text-slate-400 font-semibold mb-1">Model Name</label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                      />
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
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + Enter</td>
                        <td className="py-2 px-3">Commit Staged Changes</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono text-teal-400">Ctrl + B</td>
                        <td className="py-2 px-3">Toggle Left Sidebar</td>
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
