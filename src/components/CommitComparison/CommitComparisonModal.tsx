import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowLeftRight,
  GitCommit,
  FileCode,
  Sparkles,
  Search,
  Plus,
  Minus,
  Check,
  Copy,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Commit, FileDiff } from '../../types/git';
import { api } from '../../api/client';
import { DiffViewer } from '../Staging/DiffViewer';

import { toast } from '../../utils/toast';
interface ChangedFileItem {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface CommitComparisonModalProps {
  baseCommit: Commit;
  targetCommit: Commit;
  repoPath: string;
  onClose: () => void;
}

export const CommitComparisonModal: React.FC<CommitComparisonModalProps> = ({
  baseCommit: initialBase,
  targetCommit: initialTarget,
  repoPath,
  onClose,
}) => {
  const [base, setBase] = useState<Commit>(initialBase);
  const [target, setTarget] = useState<Commit>(initialTarget);
  const [files, setFiles] = useState<ChangedFileItem[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [aiNotes, setAiNotes] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch changed files between base and target
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.compareCommits(repoPath, base.hash, target.hash)
      .then((res) => {
        if (!isMounted) return;
        setFiles(res.files || []);
        setSummary(res.summary || '');
        if (res.files && res.files.length > 0) {
          setSelectedFile(res.files[0].path);
        } else {
          setSelectedFile(null);
        }
      })
      .catch((err) => {
        console.error('Compare commits error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, base.hash, target.hash]);

  // Fetch diff for selected file
  useEffect(() => {
    if (!selectedFile) {
      setFileDiffs([]);
      return;
    }

    let isMounted = true;
    setDiffLoading(true);

    api.getComparisonFileDiff(repoPath, base.hash, target.hash, selectedFile)
      .then((diffs) => {
        if (!isMounted) return;
        setFileDiffs(diffs);
      })
      .catch((err) => {
        console.error('File diff error:', err);
        if (isMounted) setFileDiffs([]);
      })
      .finally(() => {
        if (isMounted) setDiffLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, base.hash, target.hash, selectedFile]);

  const handleSwap = () => {
    const temp = base;
    setBase(target);
    setTarget(temp);
  };

  const handleGenerateReleaseNotes = async () => {
    setAiLoading(true);
    try {
      const commitMessages = [
        `Base (${base.shortHash}): ${base.summary}`,
        `Target (${target.shortHash}): ${target.summary}`,
      ];
      const res = await api.generatePrDescription(commitMessages, summary);
      setAiNotes(`### ${res.title}\n\n${res.body}`);
    } catch (e: any) {
      toast(`AI Release notes error: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-7xl h-[92vh] bg-[#141820] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-16 bg-[#181d26] border-b border-[#2a3447] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>

            <div className="flex items-center space-x-2">
              {/* Base Commit */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#1f2636] border border-[#2b364c]">
                <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-xs text-amber-300 font-semibold">{base.shortHash}</span>
                <span className="text-xs text-slate-300 max-w-[140px] truncate">{base.summary}</span>
              </div>

              {/* Swap Button */}
              <button
                onClick={handleSwap}
                className="p-1.5 rounded-lg bg-[#222a3a] hover:bg-teal-500/20 hover:text-teal-300 text-slate-400 transition-colors"
                title="Swap Base and Target Commits"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              {/* Target Commit */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#1f2636] border border-[#2b364c]">
                <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-xs text-teal-300 font-semibold">{target.shortHash}</span>
                <span className="text-xs text-slate-300 max-w-[140px] truncate">{target.summary}</span>
              </div>

              {summary && (
                <span className="text-xs text-slate-400 px-2 py-0.5 rounded bg-[#1c2230] border border-[#2b364c]">
                  {summary}
                </span>
              )}
            </div>
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleGenerateReleaseNotes}
              disabled={aiLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{aiLoading ? 'Generating...' : 'AI Release Summary'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Notes Drawer if generated */}
        {aiNotes && (
          <div className="bg-[#102327] border-b border-teal-500/30 px-5 py-3 flex items-start justify-between text-xs text-teal-100">
            <div className="space-y-1">
              <span className="font-semibold text-teal-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>AI Release Notes & Change Analysis</span>
              </span>
              <p className="whitespace-pre-wrap text-slate-300 leading-relaxed max-h-32 overflow-y-auto font-sans">
                {aiNotes}
              </p>
            </div>
            <button
              onClick={() => setAiNotes('')}
              className="text-teal-400/60 hover:text-teal-300 text-xs ml-4"
            >
              Close
            </button>
          </div>
        )}

        {/* Comparison Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Changed Files Sidebar */}
          <div className="w-80 bg-[#12161f] border-r border-[#232c3d] flex flex-col overflow-hidden">
            {/* Search filter */}
            <div className="p-3 border-b border-[#232c3d]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter changed files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#181d26] border border-[#2b364c] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1a202c]">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-500">Comparing commits...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No changed files found</div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected = selectedFile === file.path;
                  const isAdded = file.status === 'A';
                  const isDeleted = file.status === 'D';
                  return (
                    <div
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`px-3 py-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                        isSelected ? 'bg-teal-500/20 text-teal-200 font-medium' : 'hover:bg-[#181e2b] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isAdded
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isDeleted
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {file.status}
                        </span>
                        <span className="truncate font-mono text-[11px]">{file.path}</span>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0 font-mono text-[10px] ml-2">
                        {file.additions > 0 && (
                          <span className="text-emerald-400">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-rose-400">-{file.deletions}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Diff View for Selected File */}
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
                <span className="text-sm font-medium text-slate-400">Select a file to inspect diff</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
