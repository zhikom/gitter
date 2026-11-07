import React, { useState, useEffect } from 'react';
import { X, Settings, Sparkles, Key, Cpu, Globe, Shield, User, Mail, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { GitConfig } from '../../types/git';

interface SettingsModalProps {
  repoPath?: string;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ repoPath = '', onClose }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'git'>('ai');

  // AI Config
  const [provider, setProvider] = useState<'builtin' | 'gemini' | 'openai' | 'ollama'>('builtin');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [baseUrl, setBaseUrl] = useState('');

  // Git Config
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [gpgSign, setGpgSign] = useState(false);
  const [signingKey, setSigningKey] = useState('');
  const [gpgFormat, setGpgFormat] = useState('openpgp');

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (activeTab === 'ai') {
        await api.saveAiConfig({
          provider,
          apiKey: apiKey.trim(),
          model: model.trim(),
          baseUrl: baseUrl.trim(),
        });
      } else if (repoPath) {
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
      }, 800);
    } catch (e: any) {
      alert(`Save error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-sm text-slate-100">Preferences & Settings</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 my-3 bg-[#14181f] p-0.5 rounded border border-[#2a3447] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-1.5 rounded font-medium flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'ai' ? 'bg-[#263245] text-teal-300 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI & Models</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('git')}
            className={`flex-1 py-1.5 rounded font-medium flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'git' ? 'bg-[#263245] text-teal-300 font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Git Identity & Signing</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {activeTab === 'ai' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span>AI Provider</span>
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setProvider('builtin')}
                    className={`p-2.5 rounded border text-left transition ${
                      provider === 'builtin'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                        : 'border-[#2a3447] bg-[#14181f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">Built-in Engine</div>
                    <div className="text-[10px] text-slate-500 font-normal">Fast, offline, zero API key needed</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider('gemini');
                      setModel('gemini-1.5-flash');
                    }}
                    className={`p-2.5 rounded border text-left transition ${
                      provider === 'gemini'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                        : 'border-[#2a3447] bg-[#14181f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">Google Gemini</div>
                    <div className="text-[10px] text-slate-500 font-normal">Deep reasoning, Flash or Pro</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider('openai');
                      setModel('gpt-4o-mini');
                    }}
                    className={`p-2.5 rounded border text-left transition ${
                      provider === 'openai'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                        : 'border-[#2a3447] bg-[#14181f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">OpenAI / Compatible</div>
                    <div className="text-[10px] text-slate-500 font-normal">OpenAI, Anthropic proxy, Groq</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider('ollama');
                      setModel('llama3.2');
                      setBaseUrl('http://localhost:11434/v1');
                    }}
                    className={`p-2.5 rounded border text-left transition ${
                      provider === 'ollama'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300 font-semibold'
                        : 'border-[#2a3447] bg-[#14181f] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">Local Ollama</div>
                    <div className="text-[10px] text-slate-500 font-normal">Local LLMs (100% private)</div>
                  </button>
                </div>
              </div>

              {provider !== 'builtin' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span>API Key</span>
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={provider === 'ollama' ? 'Optional for Ollama' : 'Enter API Key...'}
                      className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-blue-400" />
                      <span>Model Name</span>
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. gemini-1.5-flash or gpt-4o"
                      className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>

                  {(provider === 'openai' || provider === 'ollama') && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
                        <Globe className="w-3.5 h-3.5 text-purple-400" />
                        <span>Base URL (Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Git Identity & Signing Tab */
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-teal-400" />
                  <span>Author Name (user.name)</span>
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-teal-400" />
                  <span>Author Email (user.email)</span>
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="pt-2 border-t border-[#2a3447]">
                <label className="flex items-center space-x-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={gpgSign}
                    onChange={(e) => setGpgSign(e.target.checked)}
                    className="rounded bg-[#14181f] border-[#2a3447] text-teal-500 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-200">Sign all commits automatically (commit.gpgsign)</span>
                </label>

                {gpgSign && (
                  <div className="space-y-2 pl-5 pt-1">
                    <div>
                      <label className="block text-slate-400 mb-1">Signing Format (gpg.format)</label>
                      <select
                        value={gpgFormat}
                        onChange={(e) => setGpgFormat(e.target.value)}
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-2.5 py-1 text-slate-200 focus:outline-none"
                      >
                        <option value="openpgp">OpenPGP (GPG)</option>
                        <option value="ssh">SSH Key</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Signing Key ID or SSH Key (user.signingkey)
                      </label>
                      <input
                        type="text"
                        value={signingKey}
                        onChange={(e) => setSigningKey(e.target.value)}
                        placeholder="e.g. 3AA5C34371567BD2 or ~/.ssh/id_ed25519.pub"
                        className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#2a3447]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white font-semibold text-xs shadow-md transition"
            >
              {saved ? 'Saved!' : loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
