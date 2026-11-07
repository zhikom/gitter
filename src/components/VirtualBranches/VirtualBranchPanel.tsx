import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Archive,
  ArrowUpRight,
  Sparkles,
  Check,
  ChevronDown,
  Layers,
  FileCode,
  Eye,
  EyeOff,
  MoveRight,
  GripVertical,
  ExternalLink,
} from 'lucide-react';
import { VirtualBranch, VirtualBranchCommitPayload } from '../../types/virtualBranch';
import { FileStatus } from '../../types/git';
import { api } from '../../api/client';

interface VirtualBranchPanelProps {
  repoPath: string;
  currentBranch: string;
  statuses: FileStatus[];
  onSelectFile: (file: string, staged: boolean) => void;
  selectedFile: string | null;
  onRefresh: () => void;
  onSwitchToStandardStaging: () => void;
}

const LANE_COLORS = [
  { name: 'Teal', border: 'border-teal-500/50', bg: 'bg-teal-500/10', text: 'text-teal-400', badge: 'bg-teal-500/20 text-teal-300' },
  { name: 'Purple', border: 'border-purple-500/50', bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  { name: 'Amber', border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' },
  { name: 'Blue', border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  { name: 'Rose', border: 'border-rose-500/50', bg: 'bg-rose-500/10', text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-300' },
];

export const VirtualBranchPanel: React.FC<VirtualBranchPanelProps> = ({
  repoPath,
  currentBranch,
  statuses,
  onSelectFile,
  selectedFile,
  onRefresh,
  onSwitchToStandardStaging,
}) => {
  const [virtualBranches, setVirtualBranches] = useState<VirtualBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [committingLaneId, setCommittingLaneId] = useState<string | null>(null);
  const [commitMessages, setCommitMessages] = useState<Record<string, { summary: string; description: string }>>({});

  // Load virtual branches from server
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getVirtualBranches(repoPath)
      .then((data) => {
        if (!isMounted) return;
        setVirtualBranches(data || []);
      })
      .catch((err) => {
        console.error('Fetch virtual branches error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath]);

  // Persist virtual branches when changed
  const updateBranches = async (updated: VirtualBranch[]) => {
    setVirtualBranches(updated);
    try {
      await api.saveVirtualBranches(repoPath, updated);
    } catch (e: any) {
      console.error('Save virtual branches error:', e);
    }
  };

  // Find all file paths assigned to any virtual branch
  const assignedFilePaths = new Set(
    virtualBranches.flatMap((vb) => vb.filePaths)
  );

  // Unassigned modified files
  const unassignedFiles = statuses.filter((s) => !assignedFilePaths.has(s.path));

  // Create a new Virtual Branch
  const handleCreateVirtualBranch = async () => {
    if (!newBranchName.trim()) return;
    const cleanName = newBranchName.trim().replace(/\s+/g, '-');
    const colorIndex = virtualBranches.length % LANE_COLORS.length;
    const newLane: VirtualBranch = {
      id: `vb-${Date.now()}`,
      name: cleanName,
      color: LANE_COLORS[colorIndex].name.toLowerCase(),
      targetBranch: currentBranch || 'main',
      filePaths: [],
      createdAt: Date.now(),
    };

    const next = [...virtualBranches, newLane];
    await updateBranches(next);
    setNewBranchName('');
    setShowNewModal(false);
  };

  // Assign a file to a virtual branch
  const handleAssignFile = async (filePath: string, targetLaneId: string) => {
    const next = virtualBranches.map((vb) => {
      if (vb.id === targetLaneId) {
        if (!vb.filePaths.includes(filePath)) {
          return { ...vb, filePaths: [...vb.filePaths, filePath] };
        }
      } else {
        return { ...vb, filePaths: vb.filePaths.filter((p) => p !== filePath) };
      }
      return vb;
    });
    await updateBranches(next);
  };

  // Remove a file from a virtual branch back to unassigned
  const handleUnassignFile = async (filePath: string, laneId: string) => {
    const next = virtualBranches.map((vb) => {
      if (vb.id === laneId) {
        return { ...vb, filePaths: vb.filePaths.filter((p) => p !== filePath) };
      }
      return vb;
    });
    await updateBranches(next);
  };

  // Delete an entire virtual branch
  const handleDeleteLane = async (laneId: string) => {
    const confirmDelete = confirm('Remove this virtual branch lane? (Files remain in working directory)');
    if (!confirmDelete) return;
    const next = virtualBranches.filter((vb) => vb.id !== laneId);
    await updateBranches(next);
  };

  // Commit a virtual branch
  const handleCommitLane = async (lane: VirtualBranch, pushUpstream = false) => {
    const msg = commitMessages[lane.id] || { summary: '', description: '' };
    if (!msg.summary.trim()) {
      alert('Please enter a commit message for this virtual branch');
      return;
    }

    setCommittingLaneId(lane.id);
    try {
      const payload: VirtualBranchCommitPayload = {
        path: repoPath,
        branchName: lane.name,
        files: lane.filePaths,
        summary: msg.summary.trim(),
        description: msg.description?.trim(),
        targetBranch: lane.targetBranch,
        pushUpstream,
      };

      const res = await api.commitVirtualBranch(repoPath, payload);
      alert(`Committed ${lane.filePaths.length} files to branch "${res.branchName}" (SHA: ${res.commitHash.slice(0, 7)})!`);

      // Clear assigned files that were committed
      const next = virtualBranches.map((vb) =>
        vb.id === lane.id ? { ...vb, filePaths: [] } : vb
      );
      await updateBranches(next);
      setCommitMessages((prev) => ({ ...prev, [lane.id]: { summary: '', description: '' } }));
      await onRefresh();
    } catch (e: any) {
      alert(`Commit virtual branch failed: ${e.message}`);
    } finally {
      setCommittingLaneId(null);
    }
  };

  // Stash / Hide Lane
  const handleToggleStashLane = async (lane: VirtualBranch) => {
    if (lane.isStashed) {
      // Restore lane patch
      try {
        if (lane.stashPatch) {
          await api.applyVirtualBranch(repoPath, lane.stashPatch);
        }
        const next = virtualBranches.map((vb) =>
          vb.id === lane.id ? { ...vb, isStashed: false, stashPatch: undefined } : vb
        );
        await updateBranches(next);
        await onRefresh();
      } catch (e: any) {
        alert(`Restore lane failed: ${e.message}`);
      }
    } else {
      // Stash lane
      try {
        const res = await api.stashVirtualBranch(repoPath, lane.filePaths);
        const next = virtualBranches.map((vb) =>
          vb.id === lane.id ? { ...vb, isStashed: true, stashPatch: res.patch } : vb
        );
        await updateBranches(next);
        await onRefresh();
      } catch (e: any) {
        alert(`Hide lane failed: ${e.message}`);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#12161f] border-l border-[#222a3a] overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-11 bg-[#171c26] border-b border-[#242d3d] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-xs text-slate-100">Virtual Branches</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
            GitButler Stacking
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Lane</span>
          </button>

          <button
            onClick={onSwitchToStandardStaging}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-[#202736] rounded transition"
            title="Switch back to standard single-branch staging panel"
          >
            Standard Staging
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Unassigned Files Drawer / Top Section */}
        <div className="bg-[#151a24] border-b border-[#242d3d] p-3 flex-shrink-0 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-300">Unassigned Changes</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#202738] text-slate-400 font-mono">
                {unassignedFiles.length} files
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Drag or assign files into virtual branch lanes</span>
          </div>

          {unassignedFiles.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic py-1">All working tree changes are partitioned into lanes.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unassignedFiles.map((file) => (
                <div
                  key={file.path}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', file.path);
                    e.dataTransfer.setData('application/x-gitter-filepath', file.path);
                  }}
                  onClick={() => onSelectFile(file.path, false)}
                  className={`group flex items-center space-x-1.5 px-2 py-1 rounded border text-xs cursor-pointer transition ${
                    selectedFile === file.path
                      ? 'bg-teal-500/20 border-teal-500/60 text-teal-200'
                      : 'bg-[#1b2230] border-[#293549] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <GripVertical className="w-3 h-3 text-slate-500 opacity-60" />
                  <span className="font-mono text-[11px] truncate max-w-[140px]">{file.path}</span>

                  {/* Quick Assign Dropdown */}
                  {virtualBranches.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleAssignFile(file.path, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#202738] text-[10px] text-teal-300 rounded px-1 py-0.5 border border-[#2e3b52] focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>
                        + Assign
                      </option>
                      {virtualBranches.map((vb) => (
                        <option key={vb.id} value={vb.id}>
                          {vb.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Virtual Branch Lanes (Horizontal Scrolling Grid) */}
        <div className="flex-1 overflow-x-auto p-3 flex space-x-3 items-start">
          {virtualBranches.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <Layers className="w-12 h-12 mb-3 opacity-25 text-teal-400" />
              <span className="text-sm font-semibold text-slate-300">No Virtual Branches Yet</span>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
                Work on multiple features simultaneously without stashing or switching branches! Assign changes to independent lanes and commit each directly to its own branch.
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-medium text-xs shadow-md transition"
              >
                + Create First Virtual Branch Lane
              </button>
            </div>
          ) : (
            virtualBranches.map((lane, idx) => {
              const colorTheme = LANE_COLORS[idx % LANE_COLORS.length];
              const msg = commitMessages[lane.id] || { summary: '', description: '' };
              const isCommitting = committingLaneId === lane.id;

              return (
                <div
                  key={lane.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedFile = e.dataTransfer.getData('application/x-gitter-filepath') || e.dataTransfer.getData('text/plain');
                    if (droppedFile) {
                      handleAssignFile(droppedFile, lane.id);
                    }
                  }}
                  className={`w-80 flex-shrink-0 bg-[#161b24] border ${
                    lane.isStashed ? 'border-dashed border-slate-700 opacity-60' : colorTheme.border
                  } rounded-xl shadow-lg flex flex-col overflow-hidden transition-all`}
                >
                  {/* Lane Header */}
                  <div className={`p-3 border-b border-[#242d3d] ${colorTheme.bg} flex items-center justify-between`}>
                    <div className="flex items-center space-x-2 min-w-0">
                      <GitBranch className={`w-4 h-4 ${colorTheme.text} flex-shrink-0`} />
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-100 truncate block">{lane.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">onto {lane.targetBranch}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Stash / Hide Lane */}
                      <button
                        onClick={() => handleToggleStashLane(lane)}
                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#202738] rounded transition"
                        title={lane.isStashed ? 'Restore lane changes to working directory' : 'Hide lane changes temporarily (Stash)'}
                      >
                        {lane.isStashed ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      {/* Delete Lane */}
                      <button
                        onClick={() => handleDeleteLane(lane.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-[#202738] rounded transition"
                        title="Delete virtual branch lane"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Lane Assigned Files List / Dropzone */}
                  <div className="p-3 flex-1 overflow-y-auto space-y-1.5 min-h-[160px] bg-[#12161e]">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Assigned Files ({lane.filePaths.length})</span>
                      <span className="italic text-slate-600">Drop files here</span>
                    </div>

                    {lane.filePaths.length === 0 ? (
                      <div className="h-24 border border-dashed border-[#293549] rounded-lg flex flex-col items-center justify-center text-slate-600 text-xs">
                        <span>Drop changes here</span>
                      </div>
                    ) : (
                      lane.filePaths.map((filePath) => (
                        <div
                          key={filePath}
                          onClick={() => onSelectFile(filePath, false)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded bg-[#181f2b] border border-[#263347] text-xs hover:border-slate-500 cursor-pointer transition ${
                            selectedFile === filePath ? 'border-teal-500/70 text-teal-200' : 'text-slate-300'
                          }`}
                        >
                          <span className="font-mono text-[11px] truncate max-w-[190px]">{filePath}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnassignFile(filePath, lane.id);
                            }}
                            className="p-0.5 text-slate-500 hover:text-slate-200 rounded"
                            title="Unassign file back to working tree pool"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Lane Commit Box */}
                  <div className="p-3 bg-[#171c26] border-t border-[#242d3d] space-y-2">
                    <input
                      type="text"
                      placeholder={`Commit message for ${lane.name}...`}
                      value={msg.summary}
                      onChange={(e) =>
                        setCommitMessages((prev) => ({
                          ...prev,
                          [lane.id]: { ...msg, summary: e.target.value },
                        }))
                      }
                      className="w-full bg-[#11151c] border border-[#283447] rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleCommitLane(lane, false)}
                        disabled={isCommitting || lane.filePaths.length === 0}
                        className="flex-1 py-1.5 rounded bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium text-xs transition shadow-sm"
                      >
                        {isCommitting ? 'Committing...' : `Commit to ${lane.name}`}
                      </button>

                      <button
                        onClick={() => handleCommitLane(lane, true)}
                        disabled={isCommitting || lane.filePaths.length === 0}
                        className="px-2.5 py-1.5 rounded bg-[#222a3a] hover:bg-[#2d384c] text-teal-300 border border-[#2e3a4e] text-xs transition"
                        title="Commit and Push directly to origin"
                      >
                        Commit & Push
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Virtual Branch Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#181d26] border border-[#2a3447] rounded-xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-slate-100 font-bold text-sm">
              <GitBranch className="w-4 h-4 text-teal-400" />
              <span>New Virtual Branch Lane</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Create an independent lane to isolate changes for a specific feature, bugfix, or refactor.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                Virtual Branch Name
              </label>
              <input
                type="text"
                placeholder="e.g. feat/dark-mode, fix/auth-token"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateVirtualBranch();
                  if (e.key === 'Escape') setShowNewModal(false);
                }}
                className="w-full bg-[#11151c] border border-[#283447] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202738] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVirtualBranch}
                disabled={!newBranchName.trim()}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium text-xs shadow-md transition"
              >
                Create Lane
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
