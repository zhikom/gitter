import React, { useState, useEffect } from 'react';
import { X, Archive, Check, Trash2, RotateCcw, FileCode, Copy, ExternalLink, Layers, Search } from 'lucide-react';
import { FileDiff } from '../../types/git';
import { api } from '../../api/client';
import { DiffViewer } from '../Staging/DiffViewer';

import { toast } from '../../utils/toast';
interface StashFileItem {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface StashInspectorModalProps {
  repoPath: string;
  target: { type: 'stash'; index: number; name: string };
  onClose: () => void;
  onRefresh: () => void;
}

export const StashInspectorModal: React.FC<StashInspectorModalProps> = ({ repoPath, target, onClose, onRefresh }) => {
  const [files, setFiles] = useState<StashFileItem[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');

  const title = `Stash: ${target.name}`;

  // Fetch files in the stash
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api
      .getStashFiles(repoPath, target.index)
      .then((res) => {
        if (!isMounted) return;
        setFiles(res.files || []);
        setSummary(res.summary || '');
        if (res.files && res.files.length > 0) {
          setSelectedFile(res.files[0].path);
        }
      })
      .catch((e) => {
        console.error('Fetch stash files error:', e);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, target]);

  // Fetch diff for selected file
  useEffect(() => {
    if (!selectedFile) {
      setFileDiffs([]);
      return;
    }

    let isMounted = true;

    api
      .getStashFileDiff(repoPath, target.index, selectedFile)
      .then((diffs) => {
        if (isMounted) setFileDiffs(diffs);
      })
      .catch(() => {
        if (isMounted) setFileDiffs([]);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, target, selectedFile]);

  // Actions
  const handleApplyStash = async () => {
    setActionLoading(true);
    try {
      await api.applyStash(repoPath, target.index);
      toast(`Applied stash@{${target.index}}!`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Apply stash failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePopStash = async () => {
    setActionLoading(true);
    try {
      await api.popStash(repoPath, target.index);
      toast(`Popped stash@{${target.index}}!`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Pop stash failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDropStash = async () => {
    if (!confirm(`Are you sure you want to drop stash@{${target.index}}?`)) return;
    setActionLoading(true);
    try {
      await api.dropStash(repoPath, target.index);
      toast(`Dropped stash@{${target.index}}!`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Drop stash failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredFiles = files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-6xl h-[88vh] bg-[#141820] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100">{title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e2636] text-slate-400 font-mono">{summary}</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Inspect changes and file diffs before applying or discarding
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleApplyStash}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition"
              title="Apply changes to working tree while keeping stash in list"
            >
              Apply Stash
            </button>
            <button
              onClick={handlePopStash}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow"
              title="Apply changes and remove stash from list"
            >
              Pop Stash
            </button>
            <button
              onClick={handleDropStash}
              disabled={actionLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#202736] transition"
              title="Drop Stash"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded-md transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File List Sidebar */}
          <div className="w-72 bg-[#12161f] border-r border-[#232c3d] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#232c3d]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#181d26] border border-[#2b364c] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#1a202c]">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading stash files...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No files found</div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected = selectedFile === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`px-3 py-2 cursor-pointer flex items-center justify-between text-xs transition ${
                        isSelected ? 'bg-teal-500/20 text-teal-200 font-medium' : 'hover:bg-[#181e2b] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#1e2636] text-amber-400">
                          {file.status}
                        </span>
                        <span className="truncate font-mono text-[11px]">{file.path}</span>
                      </div>

                      {(file.additions > 0 || file.deletions > 0) && (
                        <div className="flex items-center space-x-1 font-mono text-[10px] ml-2 flex-shrink-0">
                          {file.additions > 0 && <span className="text-emerald-400">+{file.additions}</span>}
                          {file.deletions > 0 && <span className="text-rose-400">-{file.deletions}</span>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Diff Viewer for Selected File */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#14181f]">
            {selectedFile ? (
              <DiffViewer
                diffs={fileDiffs}
                filePath={selectedFile}
                isStaged={false}
                onToggleStage={() => {}}
                onExplainFile={() => {}}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <FileCode className="w-12 h-12 mb-3 opacity-25 text-teal-400" />
                <span className="text-sm font-medium text-slate-400">Select a file from stash to view diff</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
