import React, { useState, useEffect } from 'react';
import { X, Settings, Sparkles, Key, Cpu, Globe } from 'lucide-react';
import { api } from '../../api/client';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [provider, setProvider] = useState<'builtin' | 'gemini' | 'openai' | 'ollama'>('builtin');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getAiConfig().then((cfg) => {
      if (cfg) {
        setProvider(cfg.provider || 'builtin');
        setApiKey(cfg.apiKey || '');
        setModel(cfg.model || 'gemini-1.5-flash');
        setBaseUrl(cfg.baseUrl || '');
      }
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.saveAiConfig({
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      });
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
            <span className="font-bold text-sm text-slate-100">AI & Provider Settings</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
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
