import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Bot,
  AlertTriangle,
  FolderGit2,
  ShieldCheck,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  Lock,
  Layers,
  Sparkles,
  Activity,
  GitCommit,
  FileDiff,
} from 'lucide-react';
import {
  AgentActivityEvent,
  AgentActivityState,
  AgentFleetState,
  AgentHarness,
  AgentInstance,
} from '../../types/agentFleet';
import { api } from '../../api/client';
import { HARNESS_REGISTRY, harnessColor } from '../../utils/agentFleet';
import { toast } from '../../utils/toast';

interface AgentFleetModalProps {
  repoPath: string;
  fleetState: AgentFleetState;
  onClose: () => void;
  onRefresh: () => void;
  onOpenWorktreeTab?: (worktreePath: string) => void;
}

type FleetTab = 'fleet' | 'activity' | 'spawn' | 'matrix';

const SPAWNABLE_HARNESSES = Object.values(HARNESS_REGISTRY).filter((h) => h.id !== 'custom');

const timeAgo = (ts: number, now: number): string => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const tabClass = (active: boolean) =>
  `relative py-3 flex items-center gap-2 transition-colors duration-200 outline-none focus-visible:text-teal-200 ${
    active ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
  }`;

const Stat: React.FC<{ label: string; value: number | string; tone?: 'default' | 'warn' | 'ok' }> = ({
  label,
  value,
  tone = 'default',
}) => {
  const valueClass = tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-slate-100';
  return (
    <div className="flex-1 min-w-[120px] px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
};

export const AgentFleetModal: React.FC<AgentFleetModalProps> = ({
  repoPath,
  fleetState,
  onClose,
  onRefresh,
  onOpenWorktreeTab,
}) => {
  const [activeTab, setActiveTab] = useState<FleetTab>('fleet');
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [armedRelease, setArmedRelease] = useState<string | null>(null);
  const [activity, setActivity] = useState<AgentActivityState | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [spawnHarness, setSpawnHarness] = useState<AgentHarness>('claude-code');
  const [spawnTaskName, setSpawnTaskName] = useState('');
  const [spawnBaseBranch, setSpawnBaseBranch] = useState('main');
  const [spawnMode, setSpawnMode] = useState<'worktree' | 'branch'>('worktree');
  const [newClaimPath, setNewClaimPath] = useState('');


  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      setActivity(await api.getAgentActivity(repoPath));
    } catch (err: any) {
      toast.error(`Could not load activity: ${err.message}`);
    } finally {
      setActivityLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (activeTab === 'activity') loadActivity();
  }, [activeTab, loadActivity, fleetState]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string | null, errorPrefix: string) => {
    setLoading(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      onRefresh();
      return true;
    } catch (err: any) {
      toast.error(`${errorPrefix}: ${err.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSpawn = async (e: React.FormEvent) => {
    e.preventDefault();
    const task = spawnTaskName.trim();
    if (!task) return;

    const ok = await runAction(
      async () => {
        if (spawnMode === 'worktree') {
          const res = await api.spawnAgentWorktree(repoPath, spawnHarness, task, spawnBaseBranch);
          toast.success(`Spawned worktree ${res.agent.branchName}`);
        } else {
          await api.registerAgent(repoPath, {
            harness: spawnHarness,
            name: `${HARNESS_REGISTRY[spawnHarness].label} (${task})`,
            branchName: `agent/${spawnHarness}-${task.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            taskDescription: task,
            status: 'running',
          });
        }
      },
      null,
      'Spawn error'
    );
    if (ok) {
      setSpawnTaskName('');
      setActiveTab('fleet');
    }
  };

  const handleReleaseClick = async (agentId: string, removeWorktree: boolean) => {
    const armKey = `${agentId}:${removeWorktree}`;
    if (armedRelease !== armKey) {
      setArmedRelease(armKey);
      setTimeout(() => setArmedRelease((cur) => (cur === armKey ? null : cur)), 3000);
      return;
    }
    setArmedRelease(null);
    await runAction(() => api.releaseAgent(repoPath, agentId, removeWorktree), 'Agent released', 'Release error');
  };

  const handleClearLock = async () => {
    await runAction(
      async () => {
        const res = await api.clearGitIndexLock(repoPath);
        (res.cleared ? toast.success : toast.error)(res.cleared ? 'Stale .git/index.lock removed' : 'No index.lock file was found');
      },
      null,
      'Error clearing lock'
    );
  };

  const handleClaim = async (agent: AgentInstance, nextFiles: string[], successMessage: string | null) => {
    await runAction(() => api.claimAgentFiles(repoPath, agent.id, nextFiles), successMessage, 'Claim error');
  };

  const handleAddClaim = async (agent: AgentInstance) => {
    const path = newClaimPath.trim();
    if (!path) return;
    setNewClaimPath('');
    await handleClaim(agent, Array.from(new Set([...agent.claimedFiles, path])), null);
  };

  const handleRemoveClaim = (agent: AgentInstance, filePath: string) =>
    handleClaim(agent, agent.claimedFiles.filter((f) => f !== filePath), null);

  const selectedAgent = fleetState.agents.find((a) => a.id === selectedAgentId) || fleetState.agents[0];
  const runningCount = fleetState.agents.filter((a) => a.status === 'running').length;
  const touchedFiles = useMemo(
    () => new Set(fleetState.agents.flatMap((a) => a.modifiedFiles)).size,
    [fleetState.agents]
  );
  const collidingAgentNames = useMemo(
    () => new Set(fleetState.collisions.flatMap((c) => c.contendingAgents)),
    [fleetState.collisions]
  );

  const tabs: Array<{ id: FleetTab; label: string; icon: React.ReactNode }> = [
    { id: 'fleet', label: `Fleet (${fleetState.agents.length})`, icon: <Bot className="w-4 h-4" /> },
    {
      id: 'activity',
      label: `Activity${activity ? ` (${activity.events.length})` : ''}`,
      icon: <Activity className="w-4 h-4 text-sky-400" />,
    },
    { id: 'spawn', label: 'Spawn Sandbox', icon: <Plus className="w-4 h-4 text-teal-400" /> },
    { id: 'matrix', label: 'Claim Matrix', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" /> },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-[gk-fade-in_180ms_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Multi-agent fleet orchestrator"
        className="relative w-full max-w-5xl bg-[#131821] border border-white/[0.08] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] flex flex-col max-h-[90vh] overflow-hidden animate-[gk-pop-in_220ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center gap-3.5">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-violet-500/25 via-teal-500/20 to-sky-500/25 ring-1 ring-inset ring-teal-400/30">
              <Bot className="w-5 h-5 text-teal-200" />
              {runningCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-semibold tracking-tight text-slate-50">Agent Fleet</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-teal-400/10 text-teal-300 ring-1 ring-inset ring-teal-400/25">
                  {runningCount} running
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Every agent branch, worktree and live edit in this repository, in one place.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh fleet state"
              aria-label="Refresh fleet state"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-teal-400/60 outline-none"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-teal-400/60 outline-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-2.5 px-6 py-3.5 border-b border-white/[0.06]">
          <Stat label="Agents" value={fleetState.agents.length} />
          <Stat label="Running" value={runningCount} tone={runningCount > 0 ? 'ok' : 'default'} />
          <Stat label="Files in flight" value={touchedFiles} />
          <Stat
            label="Collisions"
            value={fleetState.collisions.length}
            tone={fleetState.collisions.length > 0 ? 'warn' : 'default'}
          />
        </div>

        {/* Global banners */}
        {fleetState.indexLockDetected && (
          <div className="px-6 py-2.5 bg-rose-500/10 border-b border-rose-500/25 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-rose-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>
                <span className="font-semibold">Index lock contention:</span>{' '}
                <code className="text-rose-100 bg-rose-950/60 px-1 py-0.5 rounded">.git/index.lock</code> is held by another process or a stalled agent.
              </span>
            </div>
            <button
              onClick={handleClearLock}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-semibold transition-colors"
            >
              Break stale lock
            </button>
          </div>
        )}

        {fleetState.collisions.length > 0 && (
          <div className="px-6 py-3 bg-amber-500/[0.07] border-b border-amber-500/20">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="font-semibold text-amber-200">
                {fleetState.collisions.length} collision{fleetState.collisions.length > 1 ? 's' : ''} detected
              </span>
              <span className="text-amber-300/70">Multiple agents are changing or claiming the same files</span>
            </div>
            <ul className="mt-2 space-y-1.5 max-h-24 overflow-y-auto pr-1">
              {fleetState.collisions.map((c) => (
                <li
                  key={`${c.collisionType}:${c.filePath}`}
                  className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-black/25 ring-1 ring-inset ring-amber-500/15 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-200 truncate">{c.filePath}</span>
                    <span className="text-slate-600">↔</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {c.contendingAgents.map((a) => (
                        <span key={a} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/25">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] text-amber-200/80 italic truncate">{c.suggestedAction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" className="flex items-center gap-6 px-6 border-b border-white/[0.06] text-xs font-semibold">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={tabClass(activeTab === t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
              <span
                aria-hidden
                className={`absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-teal-400 transition-transform duration-300 origin-left ${
                  activeTab === t.id ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#10141c]" role="tabpanel">
          {activeTab === 'fleet' && (
            <div>
              {fleetState.agents.length === 0 ? (
                <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                  <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-teal-400/10 ring-1 ring-inset ring-teal-400/25 flex items-center justify-center">
                    <Bot className="w-7 h-7 text-teal-300" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">No agents yet</h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                    Spawn a worktree for Claude Code, Antigravity, Codex or another harness. Each agent gets its own branch and directory, and its edits show up here live.
                  </p>
                  <button
                    onClick={() => setActiveTab('spawn')}
                    className="mt-5 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs rounded-lg shadow-lg shadow-teal-500/20 transition-colors"
                  >
                    Spawn first agent
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fleetState.agents.map((agent) => {
                    const meta = HARNESS_REGISTRY[agent.harness] ?? HARNESS_REGISTRY.custom;
                    const color = harnessColor(agent.harness);
                    const hasCollision = collidingAgentNames.has(agent.name);
                    const isRunning = agent.status === 'running';

                    return (
                      <article
                        key={agent.id}
                        className={`group relative rounded-2xl p-4 bg-[#161c27] ring-1 ring-inset transition-all duration-200 hover:-translate-y-px hover:shadow-xl hover:shadow-black/30 flex flex-col justify-between ${
                          hasCollision ? 'ring-amber-500/40' : 'ring-white/[0.06] hover:ring-white/[0.12]'
                        }`}
                      >
                        <div
                          aria-hidden
                          className="absolute inset-y-4 left-0 w-0.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[11px] tracking-wide flex-shrink-0"
                                style={{ backgroundColor: `${color}1f`, color }}
                              >
                                {agent.harness.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold text-slate-100 truncate">{agent.name}</h4>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 min-w-0">
                                  <span className="truncate">{meta.sublabel}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="font-mono text-teal-300/90 truncate">{agent.branchName}</span>
                                </div>
                              </div>
                            </div>

                            <span
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize flex-shrink-0 ring-1 ring-inset ${
                                isRunning
                                  ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25'
                                  : 'bg-white/[0.04] text-slate-400 ring-white/10'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                              {agent.status}
                            </span>
                          </div>

                          <div className="mt-3.5 px-3 py-2.5 rounded-xl bg-black/25 text-xs text-slate-200 leading-relaxed">
                            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500 mb-0.5">Objective</div>
                            {agent.taskDescription}
                          </div>

                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono min-w-0">
                            <FolderGit2 className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                            <span className="truncate" title={agent.worktreePath || 'Shared working directory'}>
                              {agent.worktreePath || 'Shared working directory'}
                            </span>
                          </div>

                          <div className="mt-3.5">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>Modified ({agent.modifiedFiles.length})</span>
                              <span>Claimed ({agent.claimedFiles.length})</span>
                            </div>
                            <ul className="mt-1.5 space-y-1 max-h-20 overflow-y-auto pr-1">
                              {agent.modifiedFiles.slice(0, 4).map((f) => (
                                <li key={f} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/30 text-slate-300 truncate">
                                  {f}
                                </li>
                              ))}
                              {agent.modifiedFiles.length > 4 && (
                                <li className="text-[10px] text-slate-500 px-2">+{agent.modifiedFiles.length - 4} more</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            {agent.worktreePath && onOpenWorktreeTab && (
                              <button
                                onClick={() => onOpenWorktreeTab(agent.worktreePath!)}
                                title="Open worktree as a tab"
                                className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-teal-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open tab
                              </button>
                            )}
                            {agent.worktreePath && (
                              <button
                                onClick={() => api.revealInExplorer(agent.worktreePath!)}
                                title="Reveal worktree in file explorer"
                                aria-label="Reveal worktree in file explorer"
                                className="p-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleReleaseClick(agent.id, false)}
                              title="Release agent, keep worktree files"
                              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                                armedRelease === `${agent.id}:false`
                                  ? 'bg-amber-500/20 text-amber-200'
                                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]'
                              }`}
                            >
                              {armedRelease === `${agent.id}:false` ? 'Confirm release' : 'Release'}
                            </button>
                            {agent.worktreePath && (
                              <button
                                onClick={() => handleReleaseClick(agent.id, true)}
                                title="Delete worktree and release agent"
                                aria-label="Delete worktree and release agent"
                                className={`p-1.5 rounded-md transition-colors ${
                                  armedRelease === `${agent.id}:true`
                                    ? 'bg-rose-500/25 text-rose-100 px-2.5 text-xs font-semibold'
                                    : 'text-rose-400 hover:bg-rose-500/15'
                                }`}
                              >
                                {armedRelease === `${agent.id}:true` ? 'Confirm delete' : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <ActivityLedger
              activity={activity}
              loading={activityLoading}
              now={now}
              onRefresh={loadActivity}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                setActiveTab('matrix');
              }}
              agents={fleetState.agents}
            />
          )}

          {activeTab === 'spawn' && (
            <form onSubmit={handleSpawn} className="max-w-2xl mx-auto space-y-6">
              <fieldset>
                <legend className="block text-[11px] font-semibold text-slate-300 mb-2.5 uppercase tracking-[0.12em]">
                  1 · Harness
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {SPAWNABLE_HARNESSES.map((h) => {
                    const selected = spawnHarness === h.id;
                    return (
                      <button
                        type="button"
                        key={h.id}
                        aria-pressed={selected}
                        onClick={() => setSpawnHarness(h.id)}
                        className={`p-3 rounded-xl text-left transition-all duration-200 ring-1 ring-inset ${
                          selected ? 'bg-white/[0.06] ring-teal-400/60 shadow-lg shadow-teal-500/10' : 'bg-white/[0.02] ring-white/[0.07] hover:ring-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-slate-100">{h.label}</span>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{h.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="spawn-task" className="block text-[11px] font-semibold text-slate-300 mb-2 uppercase tracking-[0.12em]">
                  2 · Task
                </label>
                <input
                  id="spawn-task"
                  type="text"
                  required
                  value={spawnTaskName}
                  onChange={(e) => setSpawnTaskName(e.target.value)}
                  placeholder="refactor-auth-service, table-virtualization, fix-login-form"
                  className="w-full bg-black/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition-shadow"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Creates branch <code className="text-teal-300">agent/{spawnHarness}-…</code>
                </p>
              </div>

              <fieldset>
                <legend className="block text-[11px] font-semibold text-slate-300 mb-2 uppercase tracking-[0.12em]">
                  3 · Isolation
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        mode: 'worktree' as const,
                        icon: <FolderGit2 className="w-4 h-4 text-teal-300" />,
                        title: 'Git worktree',
                        body: 'Separate directory sharing .git. No chance of overwriting another agent’s files.',
                        badge: 'Recommended',
                      },
                      {
                        mode: 'branch' as const,
                        icon: <Layers className="w-4 h-4 text-violet-300" />,
                        title: 'Virtual branch lane',
                        body: 'Logical lane inside this working copy. Lighter, but shares files with your checkout.',
                        badge: null,
                      },
                    ]
                  ).map((opt) => {
                    const selected = spawnMode === opt.mode;
                    return (
                      <button
                        type="button"
                        key={opt.mode}
                        aria-pressed={selected}
                        onClick={() => setSpawnMode(opt.mode)}
                        className={`p-4 rounded-xl text-left transition-all duration-200 ring-1 ring-inset ${
                          selected ? 'bg-white/[0.06] ring-teal-400/60' : 'bg-white/[0.02] ring-white/[0.07] hover:ring-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {opt.icon}
                            <span className="text-xs font-semibold text-slate-100">{opt.title}</span>
                          </div>
                          {opt.badge && (
                            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-teal-400/15 text-teal-300">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{opt.body}</p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('fleet')}
                  className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !spawnTaskName.trim()}
                  className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs shadow-lg shadow-teal-500/20 transition-colors disabled:opacity-40 disabled:shadow-none flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{loading ? 'Spawning…' : 'Spawn agent'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'matrix' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-400/[0.06] ring-1 ring-inset ring-emerald-400/15 text-xs text-slate-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-100">Claim files before agents start.</span>{' '}
                  If another agent changes a claimed file, Collision Radar flags it immediately.
                </div>
              </div>

              {fleetState.agents.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">No agents to assign claims to.</div>
              ) : (
                fleetState.agents.map((agent) => {
                  const color = harnessColor(agent.harness);
                  const isSelected = selectedAgentId === agent.id || (!selectedAgentId && agent.id === selectedAgent?.id);
                  return (
                    <section key={agent.id} className="p-4 rounded-2xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06]">
                      <header className="flex items-center justify-between pb-2.5 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs font-semibold text-slate-100 truncate">{agent.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono truncate">{agent.branchName}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums flex-shrink-0">
                          {agent.claimedFiles.length} claimed
                        </span>
                      </header>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {agent.claimedFiles.length === 0 ? (
                          <span className="text-xs text-slate-500 italic">No files claimed yet.</span>
                        ) : (
                          agent.claimedFiles.map((file) => (
                            <span
                              key={file}
                              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-black/30 ring-1 ring-inset ring-white/[0.06] text-xs font-mono text-slate-300"
                            >
                              <Lock className="w-3 h-3 text-teal-400" />
                              <span>{file}</span>
                              <button
                                onClick={() => handleRemoveClaim(agent, file)}
                                aria-label={`Remove claim on ${file}`}
                                className="px-1 text-slate-500 hover:text-rose-300 transition-colors"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Add claim for ${agent.name}`}
                          placeholder="src/components/HeaderToolbar.tsx or src/api/"
                          value={isSelected ? newClaimPath : ''}
                          onFocus={() => setSelectedAgentId(agent.id)}
                          onChange={(e) => {
                            setSelectedAgentId(agent.id);
                            setNewClaimPath(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddClaim(agent);
                          }}
                          className="flex-1 bg-black/30 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddClaim(agent)}
                          disabled={!isSelected || !newClaimPath.trim()}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-teal-300 font-semibold text-xs transition-colors disabled:opacity-40"
                        >
                          Claim scope
                        </button>
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

const ActivityLedger: React.FC<{
  activity: AgentActivityState | null;
  loading: boolean;
  now: number;
  agents: AgentInstance[];
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
}> = ({ activity, loading, now, agents, onRefresh, onSelectAgent }) => {
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);

  const events = useMemo(
    () => (activity?.events ?? []).filter((e) => !filterAgentId || e.agentId === filterAgentId),
    [activity, filterAgentId]
  );
  const ownership = activity?.fileOwnership ?? [];
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  if (!activity && loading) {
    return <div className="text-xs text-slate-500 text-center py-16">Reading agent history…</div>;
  }
  if (!activity) {
    return (
      <div className="text-center py-14">
        <button onClick={onRefresh} className="px-4 py-2 rounded-lg bg-white/[0.06] text-xs text-slate-200 hover:bg-white/[0.1]">
          Load activity
        </button>
      </div>
    );
  }
  if (activity.events.length === 0) {
    return (
      <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
        <Activity className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-200 font-semibold">No agent changes yet</p>
        <p className="text-xs text-slate-500 mt-1">Commits on agent branches and live worktree edits will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
      <section aria-label="Change timeline" className="min-w-0">
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterAgentId(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset transition-colors ${
              filterAgentId === null ? 'bg-teal-400/15 text-teal-200 ring-teal-400/40' : 'text-slate-400 ring-white/10 hover:text-slate-200'
            }`}
          >
            All agents
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setFilterAgentId(a.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset transition-colors flex items-center gap-1.5 ${
                filterAgentId === a.id ? 'bg-white/[0.08] text-slate-100 ring-white/30' : 'text-slate-400 ring-white/10 hover:text-slate-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: harnessColor(a.harness) }} />
              {a.name}
            </button>
          ))}
          <button
            onClick={onRefresh}
            disabled={loading}
            aria-label="Reload activity"
            className="ml-auto p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <ol className="relative space-y-2.5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-white/[0.07]">
          {events.map((e: AgentActivityEvent) => {
            const adds = e.files.reduce((n, f) => n + f.additions, 0);
            const dels = e.files.reduce((n, f) => n + f.deletions, 0);
            const agent = agentById.get(e.agentId);
            return (
              <li key={e.id} className="relative pl-9">
                <span
                  className="absolute left-[9px] top-3 w-3.5 h-3.5 rounded-full ring-4 ring-[#10141c] flex items-center justify-center"
                  style={{ backgroundColor: e.color }}
                >
                  {e.kind === 'commit' ? <GitCommit className="w-2 h-2 text-slate-950" /> : <FileDiff className="w-2 h-2 text-slate-950" />}
                </span>
                <div className="p-3 rounded-xl bg-[#161c27] ring-1 ring-inset ring-white/[0.06] hover:ring-white/[0.12] transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">{e.agentName}</span>
                      <span
                        className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          e.kind === 'uncommitted' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-slate-400'
                        }`}
                      >
                        {e.kind === 'uncommitted' ? 'live' : e.hash?.slice(0, 7)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">{timeAgo(e.timestamp, now)}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-slate-300 truncate">{e.subject}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] font-mono tabular-nums">
                    <span className="text-slate-500">{e.files.length} file{e.files.length === 1 ? '' : 's'}</span>
                    <span className="text-emerald-400">+{adds}</span>
                    <span className="text-rose-400">−{dels}</span>
                    {agent && (
                      <button
                        onClick={() => onSelectAgent(agent.id)}
                        className="ml-auto text-[10px] text-slate-500 hover:text-teal-300 transition-colors font-sans"
                      >
                        Manage claims →
                      </button>
                    )}
                  </div>
                  {e.files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.files.slice(0, 6).map((f) => (
                        <span key={f.path} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/30 text-slate-400 truncate max-w-[240px]">
                          {f.path}
                        </span>
                      ))}
                      {e.files.length > 6 && <span className="text-[10px] text-slate-500 px-1">+{e.files.length - 6}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside aria-label="File ownership" className="min-w-0">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-3">File ownership</h3>
        <ul className="space-y-1.5">
          {ownership.slice(0, 60).map((o) => {
            const contested = o.agentIds.length > 1;
            return (
              <li
                key={o.filePath}
                className={`px-2.5 py-2 rounded-lg ring-1 ring-inset ${
                  contested ? 'bg-amber-400/[0.06] ring-amber-400/25' : 'bg-white/[0.02] ring-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-200 truncate">{o.filePath}</span>
                  <span className="text-[10px] font-mono tabular-nums flex-shrink-0">
                    <span className="text-emerald-400">+{o.additions}</span>{' '}
                    <span className="text-rose-400">−{o.deletions}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {o.agentIds.map((id) => {
                    const a = agentById.get(id);
                    if (!a) return null;
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-300 bg-black/30"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: harnessColor(a.harness) }} />
                        {a.name.split(' (')[0]}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        {contestedCount(ownership) > 0 && (
          <p className="mt-3 text-[11px] text-amber-300/80">
            {contestedCount(ownership)} file{contestedCount(ownership) === 1 ? '' : 's'} touched by more than one agent.
          </p>
        )}
      </aside>
    </div>
  );
};

const contestedCount = (ownership: AgentActivityState['fileOwnership']) =>
  ownership.filter((o) => o.agentIds.length > 1).length;
