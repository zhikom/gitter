import React, { useState } from 'react';
import {
  X,
  Bot,
  AlertTriangle,
  FolderGit2,
  ShieldCheck,
  Plus,
  Trash2,
  ExternalLink,
  Code2,
  RefreshCw,
  FolderOpen,
  Lock,
  Unlock,
  Layers,
  Cpu,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  AgentFleetState,
  AgentHarness,
  AgentInstance,
  FileCollision,
} from '../../types/agentFleet';
import { api } from '../../api/client';

interface AgentFleetModalProps {
  repoPath: string;
  fleetState: AgentFleetState;
  onClose: () => void;
  onRefresh: () => void;
  onOpenWorktreeTab?: (worktreePath: string) => void;
}

export const AgentFleetModal: React.FC<AgentFleetModalProps> = ({
  repoPath,
  fleetState,
  onClose,
  onRefresh,
  onOpenWorktreeTab,
}) => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'spawn' | 'matrix'>('fleet');
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Spawn Form state
  const [spawnHarness, setSpawnHarness] = useState<AgentHarness>('claude-code');
  const [spawnTaskName, setSpawnTaskName] = useState('');
  const [spawnBaseBranch, setSpawnBaseBranch] = useState('main');
  const [spawnMode, setSpawnMode] = useState<'worktree' | 'branch'>('worktree');

  // File Claim State
  const [newClaimPath, setNewClaimPath] = useState('');

  const harnessPresets: Array<{
    id: AgentHarness;
    label: string;
    sublabel: string;
    color: string;
    bg: string;
  }> = [
    {
      id: 'claude-code',
      label: 'Claude Code',
      sublabel: 'Anthropic Terminal Agent',
      color: '#c084fc',
      bg: 'rgba(192, 132, 252, 0.1)',
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      sublabel: 'Google DeepMind CLI & IDE',
      color: '#34d399',
      bg: 'rgba(52, 211, 153, 0.1)',
    },
    {
      id: 'codex',
      label: 'Codex / Canvas',
      sublabel: 'OpenAI Autonomous Agent',
      color: '#60a5fa',
      bg: 'rgba(96, 165, 250, 0.1)',
    },
    {
      id: 'grok',
      label: 'Grok Build',
      sublabel: 'xAI Coding Engine',
      color: '#fb923c',
      bg: 'rgba(251, 146, 60, 0.1)',
    },
    {
      id: 'cursor',
      label: 'Cursor Background',
      sublabel: 'Cursor Composer Subagent',
      color: '#22d3ee',
      bg: 'rgba(34, 211, 238, 0.1)',
    },
    {
      id: 'aider',
      label: 'Aider',
      sublabel: 'Git-Paired Terminal AI',
      color: '#f472b6',
      bg: 'rgba(244, 114, 182, 0.1)',
    },
  ];

  const handleSpawn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spawnTaskName.trim()) return;

    setLoading(true);
    try {
      if (spawnMode === 'worktree') {
        const res = await api.spawnAgentWorktree(
          repoPath,
          spawnHarness,
          spawnTaskName.trim(),
          spawnBaseBranch
        );
        alert(`Successfully spawned isolated worktree at:\n${res.worktreePath}\nBranch: ${res.agent.branchName}`);
      } else {
        await api.registerAgent(repoPath, {
          harness: spawnHarness,
          name: `${spawnHarness.toUpperCase()} (${spawnTaskName.trim()})`,
          branchName: `agent/${spawnHarness}-${spawnTaskName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          taskDescription: spawnTaskName.trim(),
          status: 'running',
        });
      }
      setSpawnTaskName('');
      setActiveTab('fleet');
      onRefresh();
    } catch (err: any) {
      alert(`Spawn error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (agentId: string, removeWorktree: boolean) => {
    if (!confirm(`Release agent '${agentId}'? ${removeWorktree ? 'Its worktree directory will be deleted.' : ''}`)) {
      return;
    }
    setLoading(true);
    try {
      await api.releaseAgent(repoPath, agentId, removeWorktree);
      onRefresh();
    } catch (err: any) {
      alert(`Release error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearLock = async () => {
    setLoading(true);
    try {
      const res = await api.clearGitIndexLock(repoPath);
      if (res.cleared) {
        alert('Stale .git/index.lock removed cleanly!');
      } else {
        alert('No index.lock file was found.');
      }
      onRefresh();
    } catch (err: any) {
      alert(`Error clearing lock: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClaim = async (agent: AgentInstance) => {
    if (!newClaimPath.trim()) return;
    setLoading(true);
    try {
      const updatedClaims = Array.from(new Set([...agent.claimedFiles, newClaimPath.trim()]));
      await api.claimAgentFiles(repoPath, agent.id, updatedClaims);
      setNewClaimPath('');
      onRefresh();
    } catch (err: any) {
      alert(`Claim error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveClaim = async (agent: AgentInstance, filePath: string) => {
    setLoading(true);
    try {
      const updatedClaims = agent.claimedFiles.filter((f) => f !== filePath);
      await api.claimAgentFiles(repoPath, agent.id, updatedClaims);
      onRefresh();
    } catch (err: any) {
      alert(`Remove claim error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = fleetState.agents.find((a) => a.id === selectedAgentId) || fleetState.agents[0];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-5xl bg-[#141822] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222a3a] bg-[#171d29]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 via-teal-500/20 to-blue-500/20 border border-teal-500/30 text-teal-400">
              <Bot className="w-5 h-5 text-teal-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">Multi-Agent Fleet Orchestrator</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Collision Radar 2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Coordinate parallel coding agents (Claude Code, Antigravity, Codex, Grok) with zero file collisions
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh Fleet State"
              className="p-2 rounded hover:bg-[#202737] text-slate-400 hover:text-slate-200 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-[#202737] text-slate-400 hover:text-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Collision & Lock Alert Banners */}
        {fleetState.indexLockDetected && (
          <div className="px-6 py-2.5 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-rose-300 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>
                Git Index Lock Contention: <code className="text-rose-200 bg-rose-950/60 px-1 py-0.5 rounded">.git/index.lock</code> is active. Another process or stalled agent is locking Git.
              </span>
            </div>
            <button
              onClick={handleClearLock}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition shadow-sm"
            >
              Break Stale Lock
            </button>
          </div>
        )}

        {fleetState.collisions.length > 0 && (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-amber-300">
                  {fleetState.collisions.length} Real-Time Collision{fleetState.collisions.length > 1 ? 's' : ''} Detected!
                </span>
                <span className="text-[11px] text-amber-400/80">Multiple agents are modifying or claiming the same files concurrently</span>
              </div>
              <div className="mt-2 space-y-1.5 max-h-24 overflow-y-auto pr-2">
                {fleetState.collisions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#10141d] border border-amber-500/20 text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-mono text-slate-200 font-medium truncate">{c.filePath}</span>
                      <span className="text-slate-500">↔</span>
                      <div className="flex items-center space-x-1">
                        {c.contendingAgents.map((a, j) => (
                          <span
                            key={j}
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[11px] text-amber-300/90 italic flex-shrink-0 ml-3">
                      {c.suggestedAction}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-[#222a3a] bg-[#121620] space-x-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'fleet'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Active Agent Fleet ({fleetState.agents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('spawn')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'spawn'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>Spawn Agent Sandbox</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'matrix'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>File Territory & Claim Matrix</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#141822]">
          {/* Tab 1: Active Agent Fleet */}
          {activeTab === 'fleet' && (
            <div>
              {fleetState.agents.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-xl border border-dashed border-[#2a3447] bg-[#161c28]">
                  <Bot className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-300">No Active Agents Registered</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Spawn a sandbox or worktree for Claude Code, Antigravity, Codex, or Grok to enable real-time collision radar and boundary isolation.
                  </p>
                  <button
                    onClick={() => setActiveTab('spawn')}
                    className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-lg shadow-md transition"
                  >
                    Spawn First Agent Sandbox
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fleetState.agents.map((agent) => {
                    const preset = harnessPresets.find((p) => p.id === agent.harness);
                    const hasCollision = fleetState.collisions.some((c) =>
                      c.contendingAgents.includes(agent.name)
                    );

                    return (
                      <div
                        key={agent.id}
                        className={`rounded-xl border p-4 bg-[#181f2c] transition-all flex flex-col justify-between ${
                          hasCollision
                            ? 'border-amber-500/40 shadow-lg shadow-amber-500/5'
                            : 'border-[#263144] hover:border-teal-500/40'
                        }`}
                      >
                        <div>
                          {/* Agent Card Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2.5">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border"
                                style={{
                                  backgroundColor: preset?.bg || 'rgba(168, 85, 247, 0.1)',
                                  borderColor: preset?.color || '#a855f7',
                                  color: preset?.color || '#a855f7',
                                }}
                              >
                                {agent.harness.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-200">{agent.name}</h4>
                                <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                                  <span>{preset?.sublabel || agent.harness}</span>
                                  <span>•</span>
                                  <span className="font-mono text-teal-400">{agent.branchName}</span>
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${
                                agent.status === 'running'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-700/30 text-slate-400 border-slate-600/30'
                              }`}
                            >
                              {agent.status}
                            </span>
                          </div>

                          {/* Task Description */}
                          <div className="mt-3 p-2.5 rounded bg-[#131720] border border-[#222b3b] text-xs text-slate-300">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">Objective</div>
                            <div>{agent.taskDescription}</div>
                          </div>

                          {/* Worktree Sandbox Status */}
                          <div className="mt-2.5 flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
                            <FolderGit2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <span className="truncate" title={agent.worktreePath || 'Shared working directory'}>
                              {agent.worktreePath ? `Worktree: ${agent.worktreePath}` : 'Shared Working Directory'}
                            </span>
                          </div>

                          {/* Files Active / Claimed Badges */}
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>Modified Files ({agent.modifiedFiles.length})</span>
                              <span>Claimed Scope ({agent.claimedFiles.length})</span>
                            </div>

                            <div className="max-h-20 overflow-y-auto pr-1 space-y-1">
                              {agent.modifiedFiles.slice(0, 4).map((f, idx) => (
                                <div
                                  key={idx}
                                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#10141d] text-slate-300 truncate border border-[#1f2736]"
                                >
                                  {f}
                                </div>
                              ))}
                              {agent.modifiedFiles.length > 4 && (
                                <div className="text-[10px] text-slate-500 italic px-2">
                                  +{agent.modifiedFiles.length - 4} more files...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="mt-4 pt-3 border-t border-[#222b3b] flex items-center justify-between">
                          <div className="flex items-center space-x-1">
                            {agent.worktreePath && onOpenWorktreeTab && (
                              <button
                                onClick={() => onOpenWorktreeTab(agent.worktreePath!)}
                                title="Open Worktree as Tab in Gitter"
                                className="px-2.5 py-1 rounded bg-[#202838] hover:bg-[#2b364c] text-teal-300 text-xs font-semibold transition flex items-center space-x-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Open Tab</span>
                              </button>
                            )}
                            {agent.worktreePath && (
                              <button
                                onClick={() => api.revealInExplorer(agent.worktreePath!)}
                                title="Reveal Worktree in OS File Explorer"
                                className="p-1 rounded bg-[#202838] hover:bg-[#2b364c] text-slate-300 hover:text-white transition"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleRelease(agent.id, false)}
                              title="Release agent while keeping worktree files"
                              className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#202838] text-xs transition"
                            >
                              Release
                            </button>
                            {agent.worktreePath && (
                              <button
                                onClick={() => handleRelease(agent.id, true)}
                                title="Delete agent worktree and clean branch"
                                className="p-1 rounded text-rose-400 hover:bg-rose-500/20 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Spawn Agent Sandbox */}
          {activeTab === 'spawn' && (
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSpawn} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">
                    1. Select Agent Harness
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {harnessPresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => setSpawnHarness(preset.id)}
                        className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                          spawnHarness === preset.id
                            ? 'bg-[#1b2332] border-teal-500 shadow-md shadow-teal-500/10'
                            : 'bg-[#151a24] border-[#252f40] hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-200">{preset.label}</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: preset.color }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400">{preset.sublabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">
                    2. Task Objective / Feature Name
                  </label>
                  <input
                    type="text"
                    required
                    value={spawnTaskName}
                    onChange={(e) => setSpawnTaskName(e.target.value)}
                    placeholder="e.g. refactor-auth-service, table-virtualization, fix-login-form"
                    className="w-full bg-[#10141d] border border-[#263144] rounded-lg px-3.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Will automatically spin up branch <code className="text-teal-400">agent/{spawnHarness}-...</code>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wide">
                    3. Isolation Architecture
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      onClick={() => setSpawnMode('worktree')}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        spawnMode === 'worktree'
                          ? 'bg-[#1b2332] border-teal-500 shadow-sm'
                          : 'bg-[#151a24] border-[#252f40]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <FolderGit2 className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-bold text-slate-200">Git Worktree (Recommended)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Isolated directory on disk sharing `.git`. Zero chance of file overwrite or live file-watcher stomping.
                      </p>
                    </label>

                    <label
                      onClick={() => setSpawnMode('branch')}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        spawnMode === 'branch'
                          ? 'bg-[#1b2332] border-teal-500 shadow-sm'
                          : 'bg-[#151a24] border-[#252f40]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-slate-200">Virtual Branch Lane</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Logical partition within the current repository workspace using Gitter virtual branch lanes.
                      </p>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#222b3b] flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('fleet')}
                    className="px-4 py-2 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202737]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !spawnTaskName.trim()}
                    className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{loading ? 'Spawning Sandbox...' : 'Spawn Agent Sandbox'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 3: File Territory & Claim Matrix */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-[#18202d] border border-[#273244] text-xs text-slate-300 flex items-start space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200">Pre-Flight File Claims:</span>{' '}
                  Assign specific modules or directories to agents before they execute. If another agent touches a claimed file, Collision Radar flags a high-priority warning immediately.
                </div>
              </div>

              {fleetState.agents.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">No registered agents available to manage claims.</div>
              ) : (
                <div className="space-y-3">
                  {fleetState.agents.map((agent) => (
                    <div key={agent.id} className="p-4 rounded-xl border border-[#263144] bg-[#161c28]">
                      <div className="flex items-center justify-between pb-2 border-b border-[#222b3b]">
                        <div className="flex items-center space-x-2">
                          <Bot className="w-4 h-4 text-teal-400" />
                          <span className="text-xs font-bold text-slate-200">{agent.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({agent.branchName})</span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {agent.claimedFiles.length} file{agent.claimedFiles.length === 1 ? '' : 's'} claimed
                        </span>
                      </div>

                      {/* Claimed Files List */}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {agent.claimedFiles.length === 0 ? (
                          <span className="text-xs text-slate-500 italic">No files claimed yet.</span>
                        ) : (
                          agent.claimedFiles.map((file, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#10141d] border border-[#222b3b] text-xs font-mono text-slate-300"
                            >
                              <Lock className="w-3 h-3 text-teal-400" />
                              <span>{file}</span>
                              <button
                                onClick={() => handleRemoveClaim(agent, file)}
                                className="text-slate-500 hover:text-rose-400 ml-1"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Add Claim Input */}
                      <div className="mt-3 flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="e.g. src/components/HeaderToolbar.tsx or src/api/"
                          value={selectedAgentId === agent.id ? newClaimPath : ''}
                          onFocus={() => setSelectedAgentId(agent.id)}
                          onChange={(e) => {
                            setSelectedAgentId(agent.id);
                            setNewClaimPath(e.target.value);
                          }}
                          className="flex-1 bg-[#10141d] border border-[#263144] rounded px-3 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddClaim(agent)}
                          disabled={selectedAgentId !== agent.id || !newClaimPath.trim()}
                          className="px-3 py-1 rounded bg-[#202737] hover:bg-[#2c374c] text-teal-300 font-semibold text-xs border border-[#2a3548] transition disabled:opacity-40"
                        >
                          Claim Scope
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
