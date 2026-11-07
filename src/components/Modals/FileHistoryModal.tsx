import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  GitCommit,
  Clock,
  User,
  FileCode,
  Search,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { FileCommitHistory, FileDiff } from '../../types/git';
import { api } from '../../api/client';
import { DiffViewer } from '../Staging/DiffViewer';

interface FileHistoryModalProps {
  filePath: string;
  repoPath: string;
  onClose: () => void;
  onSelectCommit?: (hash: string) => void;
}

export const FileHistoryModal: React.FC<FileHistoryModalProps> = ({
  filePath,
  repoPath,
  onClose,
  onSelectCommit,
}) => {
  const [history, setHistory] = useState<FileCommitHistory[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<FileCommitHistory | null>(null);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch file commit history
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getFileHistory(repoPath, filePath)
      .then((data) => {
        if (!isMounted) return;
        setHistory(data || []);
        if (data && data.length > 0) {
          setSelectedCommit(data[0]);
        }
      })
      .catch((err) => {
        console.error('File history error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, filePath]);

  // Fetch diff for selected commit
  useEffect(() => {
    if (!selectedCommit) {
      setFileDiffs([]);
      return;
    }

    let isMounted = true;
    setDiffLoading(true);

    api.getFileCommitDiff(repoPath, selectedCommit.hash, filePath)
      .then((diffs) => {
        if (!isMounted) return;
        setFileDiffs(diffs);
      })
      .catch(() => {
        if (isMounted) setFileDiffs([]);
      })
      .finally(() => {
        if (isMounted) setDiffLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repoPath, filePath, selectedCommit]);

  const filteredHistory = history.filter(
    (h) =>
      h.summary.toLowerCase().includes(search.toLowerCase()) ||
      h.author.toLowerCase().includes(search.toLowerCase()) ||
      h.shortHash.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-6xl h-[88vh] bg-[#141820] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] px-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100">File History Timeline</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#202736] text-teal-300 border border-[#2e394e]">
                  {filePath}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Chronological timeline of all revisions touching this file
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Commit Revisions List */}
          <div className="w-80 bg-[#12161f] border-r border-[#232c3d] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#232c3d]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter revisions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#181d26] border border-[#2b364c] rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#1a202c]">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading revisions...</div>
              ) : filteredHistory.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No revisions found</div>
              ) : (
                filteredHistory.map((item) => {
                  const isSelected = selectedCommit?.hash === item.hash;

                  return (
                    <div
                      key={item.hash}
                      onClick={() => setSelectedCommit(item)}
                      className={`p-3 cursor-pointer text-xs transition ${
                        isSelected ? 'bg-teal-500/20 text-teal-200' : 'hover:bg-[#181e2b] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[11px] font-semibold text-amber-300">
                          {item.shortHash}
                        </span>
                        <span className="text-[10px] text-slate-500">{item.date}</span>
                      </div>

                      <div className="font-medium text-slate-200 truncate mb-1" title={item.summary}>
                        {item.summary}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate max-w-[160px]">{item.author}</span>
                        {onSelectCommit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              onSelectCommit(item.hash);
                            }}
                            className="hover:text-teal-400 p-0.5"
                            title="Inspect in main Commit Graph"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Diff Viewer for Revision */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#14181f]">
            {selectedCommit ? (
              <DiffViewer
                diffs={fileDiffs}
                filePath={filePath}
                isStaged={false}
                onToggleStage={() => {}}
                onExplainFile={() => {}}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <FileCode className="w-12 h-12 mb-3 opacity-25 text-teal-400" />
                <span className="text-sm font-medium text-slate-400">Select a revision to inspect diff</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
