import React, { useState, useEffect } from 'react';
import { Commit, AIExplanation, FileDiff } from '../../types/git';
import { api } from '../../api/client';
import { parseGitDiff } from '../../utils/diffParser';
import {
  X,
  GitCommit,
  GitBranch,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Shield,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { DiffViewer } from '../Staging/DiffViewer';

import { toast } from '../../utils/toast';
interface CommitDetailModalProps {
  commit: Commit;
  repoPath: string;
  onClose: () => void;
  onCheckout: (hash: string) => void;
  onCreateBranchAt: (hash: string) => void;
  onRevertCommit: (hash: string) => void;
}

export const CommitDetailModal: React.FC<CommitDetailModalProps> = ({
  commit,
  repoPath,
  onClose,
  onCheckout,
  onCreateBranchAt,
  onRevertCommit,
}) => {
  const [files, setFiles] = useState<string[]>([]);
  const [rawDiff, setRawDiff] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [parsedDiffs, setParsedDiffs] = useState<FileDiff[]>([]);
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [copiedSha, setCopiedSha] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoadingDiff(true);
    setExplanation(null);

    api.getCommitDiff(repoPath, commit.hash)
      .then((data) => {
        if (!isMounted) return;
        setFiles(data.files);
        setRawDiff(data.rawDiff);
        const parsed = parseGitDiff(data.rawDiff);
        setParsedDiffs(parsed);
        if (data.files.length > 0) {
          setSelectedFile(data.files[0]);
        }
      })
      .catch((e) => console.error('Failed to load commit diff:', e))
      .finally(() => {
        if (isMounted) setLoadingDiff(false);
      });

    return () => {
      isMounted = false;
    };
  }, [commit.hash, repoPath]);

  const handleExplainCommit = async () => {
    setIsExplaining(true);
    try {
      const res = await api.explainChanges(rawDiff, `Commit ${commit.shortHash}: ${commit.summary}`);
      setExplanation(res);
    } catch (e: any) {
      toast(`AI Explain error: ${e.message}`);
    } finally {
      setIsExplaining(false);
    }
  };

  const currentFileDiff = parsedDiffs.filter((d) => d.path === selectedFile);

  const copySha = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-5xl h-[85vh] bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <GitCommit className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100 truncate max-w-xl">
                  {commit.summary}
                </span>
                <button
                  onClick={copySha}
                  title="Copy SHA"
                  className="font-mono text-xs px-2 py-0.5 rounded bg-[#202735] hover:bg-[#283244] text-teal-400 border border-[#2a3447] flex items-center space-x-1"
                >
                  <span>{commit.shortHash}</span>
                  {copiedSha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                </button>
              </div>
              <div className="text-xs text-slate-400 flex items-center space-x-2">
                <span>{commit.author.name}</span>
                <span>•</span>
                <span>{commit.date}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExplainCommit}
              disabled={isExplaining || loadingDiff}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isExplaining ? 'animate-spin' : ''}`} />
              <span>{isExplaining ? 'Analyzing...' : 'Explain with AI'}</span>
            </button>

            <button
              onClick={() => onCheckout(commit.hash)}
              className="px-2.5 py-1.5 rounded bg-[#202735] hover:bg-[#283244] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
            >
              Checkout
            </button>

            <button
              onClick={() => onCreateBranchAt(commit.hash)}
              className="px-2.5 py-1.5 rounded bg-[#202735] hover:bg-[#283244] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
            >
              Branch
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202735] rounded transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Explanation Banner (if generated) */}
        {explanation && (
          <div className="bg-[#15232d] border-b border-teal-500/30 p-3 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center space-x-2 text-teal-300 font-bold">
                <Sparkles className="w-4 h-4" />
                <span>AI Commit Analysis</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-slate-400">Risk Assessment:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    explanation.riskAssessment === 'low'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : explanation.riskAssessment === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {explanation.riskAssessment}
                </span>
              </div>
            </div>
            <p className="text-slate-300 mb-2 leading-relaxed">{explanation.summary}</p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                <span className="font-semibold text-slate-300">Key Highlights:</span>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                  {explanation.keyChanges.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
              {explanation.suggestedAction && (
                <div>
                  <span className="font-semibold text-slate-300">Recommended Verification:</span>
                  <p className="mt-0.5 text-slate-400">{explanation.suggestedAction}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Body: File list on left, Diff viewer on right */}
        <div className="flex-1 flex overflow-hidden">
          {/* File list */}
          <div className="w-72 bg-[#181d26] border-r border-[#2a3447] flex flex-col overflow-y-auto">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#222a3a]">
              Changed Files ({files.length})
            </div>
            <div className="p-1 space-y-0.5">
              {files.map((f) => (
                <div
                  key={f}
                  onClick={() => setSelectedFile(f)}
                  className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition truncate ${
                    selectedFile === f ? 'bg-[#263245] text-teal-300 font-semibold' : 'hover:bg-[#202735] text-slate-300'
                  }`}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Diff viewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#14181f]">
            {selectedFile ? (
              <DiffViewer
                diffs={currentFileDiff}
                filePath={selectedFile}
                isStaged={false}
                onToggleStage={() => {}}
                onExplainFile={() => {}}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Select a file to inspect diff
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
