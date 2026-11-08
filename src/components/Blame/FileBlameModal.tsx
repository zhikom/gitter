import React, { useState, useEffect } from 'react';
import { BlameLine, FileCommitHistory } from '../../types/git';
import { api } from '../../api/client';
import {
  X,
  FileCode,
  Clock,
  Sparkles,
  GitCommit,
  User,
  Calendar,
  Layers,
} from 'lucide-react';

import { toast } from '../../utils/toast';
interface FileBlameModalProps {
  filePath: string;
  repoPath: string;
  onClose: () => void;
  onSelectCommit: (hash: string) => void;
}

export const FileBlameModal: React.FC<FileBlameModalProps> = ({
  filePath,
  repoPath,
  onClose,
  onSelectCommit,
}) => {
  const [tab, setTab] = useState<'blame' | 'history'>('blame');
  const [blameLines, setBlameLines] = useState<BlameLine[]>([]);
  const [history, setHistory] = useState<FileCommitHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isAiSummarizing, setIsAiSummarizing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getBlame(repoPath, filePath),
      api.getFileHistory(repoPath, filePath),
    ])
      .then(([blameData, historyData]) => {
        if (!isMounted) return;
        setBlameLines(blameData);
        setHistory(historyData);
      })
      .catch((e) => {
        console.error('Blame load error:', e);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [filePath, repoPath]);

  const handleAiSummarize = async () => {
    setIsAiSummarizing(true);
    try {
      const prompt = `Explain the purpose and evolution of this file: ${filePath}. Recent commits: ${history.slice(0, 5).map(h => h.summary).join('; ')}`;
      const res = await api.chatWithAgent(prompt, { branch: 'main' });
      setAiSummary(res.reply);
    } catch (e: any) {
      toast(`AI Summary error: ${e.message}`);
    } finally {
      setIsAiSummarizing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-5xl h-[85vh] bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100 font-mono">
                {filePath}
              </span>
              <span className="block text-xs text-slate-400">
                {blameLines.length} lines • {history.length} commits in history
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Tab switch */}
            <div className="flex bg-[#14181f] border border-[#2a3447] rounded p-0.5 text-xs">
              <button
                onClick={() => setTab('blame')}
                className={`px-3 py-1 rounded transition ${
                  tab === 'blame'
                    ? 'bg-[#2d384c] text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Visual Blame
              </button>
              <button
                onClick={() => setTab('history')}
                className={`px-3 py-1 rounded transition ${
                  tab === 'history'
                    ? 'bg-[#2d384c] text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Commit History
              </button>
            </div>

            <button
              onClick={handleAiSummarize}
              disabled={isAiSummarizing || loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI File Summary</span>
            </button>

            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Summary Banner if generated */}
        {aiSummary && (
          <div className="bg-[#15232d] border-b border-teal-500/30 p-3 text-xs leading-relaxed text-slate-300">
            <div className="font-semibold text-teal-300 flex items-center space-x-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Evolution & Architectural Summary</span>
            </div>
            <p>{aiSummary}</p>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-[#14181f] font-mono text-xs select-text">
          {loading ? (
            <div className="text-center py-16 text-slate-500 text-xs">Loading blame data...</div>
          ) : tab === 'blame' ? (
            <div className="divide-y divide-[#1b2230]">
              {blameLines.map((line) => {
                // Color intensity from agePercent
                const heatOpacity = Math.max(0.2, line.agePercent);

                return (
                  <div
                    key={line.lineNumber}
                    className="flex items-start hover:bg-[#1a2333]/40 group transition"
                  >
                    {/* Heatmap Bar */}
                    <div
                      style={{ opacity: heatOpacity }}
                      className="w-1.5 self-stretch bg-teal-400 flex-shrink-0"
                    />

                    {/* Commit Info Column */}
                    <div className="w-48 px-2 py-0.5 flex-shrink-0 select-none border-r border-[#222a38] text-[11px] text-slate-500 flex items-center justify-between">
                      <button
                        onClick={() => onSelectCommit(line.commitHash)}
                        title={line.summary}
                        className="text-teal-400/80 hover:text-teal-300 font-semibold"
                      >
                        {line.shortHash}
                      </button>
                      <span className="truncate max-w-[70px] text-slate-400" title={line.author}>
                        {line.author}
                      </span>
                      <span className="text-[10px] text-slate-600">{line.date}</span>
                    </div>

                    {/* Line Number */}
                    <div className="w-12 text-right pr-2 py-0.5 text-slate-600 select-none border-r border-[#222a38] flex-shrink-0">
                      {line.lineNumber}
                    </div>

                    {/* Code */}
                    <div className="flex-1 pl-2 py-0.5 text-slate-200 whitespace-pre overflow-x-auto">
                      {line.code}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* File History Tab */
            <div className="p-4 space-y-2">
              {history.map((h) => (
                <div
                  key={h.hash}
                  onClick={() => onSelectCommit(h.hash)}
                  className="flex items-center justify-between p-3 rounded bg-[#181d26] hover:bg-[#202735] border border-[#2a3447] cursor-pointer transition"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <GitCommit className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block truncate">
                        {h.summary}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <User className="w-3 h-3" />
                        <span>{h.author}</span>
                        <span>•</span>
                        <Calendar className="w-3 h-3" />
                        <span>{h.date}</span>
                      </span>
                    </div>
                  </div>

                  <span className="font-mono text-xs text-teal-400 px-2 py-1 bg-[#14181f] border border-[#2a3447] rounded">
                    {h.shortHash}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
