import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitMerge,
  Sparkles,
  Check,
  AlertCircle,
  Play,
  CheckCircle2,
  Tag,
  Flame,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { ask } from '../ui/ask';

interface GitflowModalProps {
  repo: string;
  onClose: () => void;
  onRefresh: () => void;
}

/** git-flow without the git-flow tool: feature, release and hotfix branches and how they finish. */
export const GitflowModal: React.FC<GitflowModalProps> = ({ repo, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gitflowStatus, setGitflowStatus] = useState<Awaited<ReturnType<typeof api.gitflowStatus>> | null>(null);

  // Init form
  const [masterBranch, setMasterBranch] = useState('main');
  const [developBranch, setDevelopBranch] = useState('develop');
  const [featurePrefix, setFeaturePrefix] = useState('feature/');
  const [releasePrefix, setReleasePrefix] = useState('release/');
  const [hotfixPrefix, setHotfixPrefix] = useState('hotfix/');

  // Start action
  const [actionType, setActionType] = useState<'feature' | 'release' | 'hotfix'>('feature');
  const [actionName, setActionName] = useState('');
  const [selectedToFinish, setSelectedToFinish] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await api.gitflowStatus({ repo });
      setGitflowStatus(status);
      if (status.config) {
        setMasterBranch(status.config.masterBranch || 'main');
        setDevelopBranch(status.config.developBranch || 'develop');
        setFeaturePrefix(status.config.featurePrefix || 'feature/');
        setReleasePrefix(status.config.releasePrefix || 'release/');
        setHotfixPrefix(status.config.hotfixPrefix || 'hotfix/');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load Gitflow status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Reloads only when the repository changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const handleInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await api.gitflowInit({ repo, config: { masterBranch, developBranch, featurePrefix, releasePrefix, hotfixPrefix } });
      await loadStatus();
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'Failed to initialize Gitflow');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionName.trim()) return;

    setActionLoading(true);
    setError(null);
    try {
      const branch = await api.gitflowStart({ repo, type: actionType, name: actionName.trim() });
      setActionName('');
      await loadStatus();
      onRefresh();
      toast.success(`Started ${actionType} on ${branch}.`);
    } catch (e: any) {
      setError(e.message || `Failed to start ${actionType}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinish = async (type: 'feature' | 'release' | 'hotfix', name: string) => {
    const confirmed = await ask.confirm({
      title: `Finish ${type} ${name}?`,
      message: type === 'feature' ? 'It is merged into the develop branch and then deleted.' : 'It is merged into the main and develop branches, tagged, and then deleted.',
      confirmLabel: 'Finish',
    });
    if (!confirmed) return;

    setActionLoading(true);
    setError(null);
    try {
      const message = await api.gitflowFinish({ repo, type, name });
      await loadStatus();
      onRefresh();
      toast.success(message);
    } catch (e: any) {
      setError(e.message || `Failed to finish ${type}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#1b212c] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="h-13 bg-[#151a23] border-b border-[#2a3447] flex items-center justify-between px-5 py-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-100 block">Gitflow Integration</span>
              <span className="text-[11px] text-slate-400">
                GitKraken & Tower style branch workflow model
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#202735] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-300">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-slate-500 italic">Loading Gitflow status...</div>
          ) : !gitflowStatus?.initialized ? (
            /* INITIALIZE GITFLOW FORM */
            <form onSubmit={handleInit} className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2">
                <div className="font-bold text-sm text-purple-300">Initialize Gitflow in this Repository</div>
                <p className="text-slate-300 text-xs">
                  Gitflow is a branching model that standardizes release management with dedicated
                  <code className="text-teal-300 ml-1">main</code> and <code className="text-blue-300">develop</code> branches.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Production Branch (Master)</label>
                  <input
                    type="text"
                    value={masterBranch}
                    onChange={(e) => setMasterBranch(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Development Branch (Develop)</label>
                  <input
                    type="text"
                    value={developBranch}
                    onChange={(e) => setDevelopBranch(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Feature Prefix</label>
                  <input
                    type="text"
                    value={featurePrefix}
                    onChange={(e) => setFeaturePrefix(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Release Prefix</label>
                  <input
                    type="text"
                    value={releasePrefix}
                    onChange={(e) => setReleasePrefix(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Hotfix Prefix</label>
                  <input
                    type="text"
                    value={hotfixPrefix}
                    onChange={(e) => setHotfixPrefix(e.target.value)}
                    className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-md disabled:opacity-50"
                >
                  {actionLoading ? 'Initializing...' : 'Initialize Gitflow'}
                </button>
              </div>
            </form>
          ) : (
            /* ACTIVE GITFLOW WORKFLOW */
            <div className="space-y-5">
              {/* Branch Config Header */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#14181f] border border-[#2a3447] text-xs">
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Production:</span>
                    <span className="font-mono text-teal-300 font-semibold">{gitflowStatus.config.masterBranch}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <div>
                    <span className="text-slate-500 block text-[10px]">Development:</span>
                    <span className="font-mono text-blue-300 font-semibold">{gitflowStatus.config.developBranch}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px]">Current Branch:</span>
                  <span className="font-mono text-slate-200 font-semibold">{gitflowStatus.currentBranch}</span>
                </div>
              </div>

              {/* Start New Item */}
              <form onSubmit={handleStart} className="p-4 rounded-xl bg-[#14181f] border border-[#2a3447] space-y-3">
                <div className="font-semibold text-slate-200 text-xs flex items-center space-x-1.5">
                  <Play className="w-3.5 h-3.5 text-teal-400" />
                  <span>Start New Gitflow Item</span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex rounded bg-[#1b212c] border border-[#2a3447] p-0.5 text-xs">
                    {(['feature', 'release', 'hotfix'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActionType(t)}
                        className={`px-3 py-1 rounded capitalize font-medium transition ${
                          actionType === t
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 flex items-center space-x-1 bg-[#1b212c] border border-[#2a3447] rounded px-3 py-1">
                    <span className="font-mono text-slate-500 text-xs">
                      {actionType === 'feature'
                        ? gitflowStatus.config.featurePrefix
                        : actionType === 'release'
                        ? gitflowStatus.config.releasePrefix
                        : gitflowStatus.config.hotfixPrefix}
                    </span>
                    <input
                      type="text"
                      value={actionName}
                      onChange={(e) => setActionName(e.target.value)}
                      placeholder={actionType === 'release' ? '1.1.0' : 'my-new-task'}
                      className="bg-transparent flex-1 text-slate-200 focus:outline-none font-mono text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading || !actionName.trim()}
                    className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition disabled:opacity-50"
                  >
                    Start {actionType}
                  </button>
                </div>
              </form>

              {/* Active Gitflow Items */}
              <div className="space-y-4">
                {/* Active Features */}
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Active Features ({gitflowStatus.features.length})</span>
                    <span className="text-[10px] text-slate-500 lowercase">branch: {gitflowStatus.config.featurePrefix}*</span>
                  </div>

                  {gitflowStatus.features.length === 0 ? (
                    <div className="p-3 bg-[#14181f] border border-[#2a3447] rounded text-slate-500 italic text-[11px]">
                      No active feature branches. Start one above!
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {gitflowStatus.features.map((f) => (
                        <div
                          key={f}
                          className="flex items-center justify-between p-2.5 bg-[#14181f] border border-[#2a3447] rounded-lg text-xs"
                        >
                          <div className="flex items-center space-x-2 font-mono text-slate-200">
                            <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                            <span>{gitflowStatus.config.featurePrefix}{f}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFinish('feature', f)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[11px] font-medium transition"
                          >
                            Finish Feature
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Releases & Hotfixes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Active Releases ({gitflowStatus.releases.length})
                    </div>
                    {gitflowStatus.releases.length === 0 ? (
                      <div className="p-3 bg-[#14181f] border border-[#2a3447] rounded text-slate-500 italic text-[11px]">
                        No active release branches.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {gitflowStatus.releases.map((r) => (
                          <div
                            key={r}
                            className="flex items-center justify-between p-2 bg-[#14181f] border border-[#2a3447] rounded text-xs"
                          >
                            <span className="font-mono text-slate-200 truncate">{r}</span>
                            <button
                              type="button"
                              onClick={() => handleFinish('release', r)}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]"
                            >
                              Finish
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Active Hotfixes ({gitflowStatus.hotfixes.length})
                    </div>
                    {gitflowStatus.hotfixes.length === 0 ? (
                      <div className="p-3 bg-[#14181f] border border-[#2a3447] rounded text-slate-500 italic text-[11px]">
                        No active hotfixes.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {gitflowStatus.hotfixes.map((h) => (
                          <div
                            key={h}
                            className="flex items-center justify-between p-2 bg-[#14181f] border border-[#2a3447] rounded text-xs"
                          >
                            <span className="font-mono text-slate-200 truncate">{h}</span>
                            <button
                              type="button"
                              onClick={() => handleFinish('hotfix', h)}
                              className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px]"
                            >
                              Finish
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-[#151a23] border-t border-[#2a3447] flex items-center justify-end px-5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#202735] hover:bg-[#2b3548] border border-[#2a3447] text-slate-300 text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
