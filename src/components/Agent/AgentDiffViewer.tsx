import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, FileCode2, ShieldAlert, Sparkles, X } from 'lucide-react';
import { AgentHarness } from '../../types/agentFleet';
import { AgentDiffFile } from '../../types/agentReview';
import { FileDiff } from '../../types/git';
import { parseGitDiff } from '../../utils/diffParser';
import { generateHunkPatch } from '../../utils/patchGenerator';
import { HARNESS_REGISTRY, harnessColor } from '../../utils/agentFleet';

interface AgentDiffViewerProps {
  rawDiff: string;
  files: AgentDiffFile[];
  agentName: string;
  harness: AgentHarness;
  color?: string;
  collisionFiles?: string[];
  onRejectHunk?: (patch: string) => Promise<void> | void;
  onAskWhy?: () => void;
  emptyLabel?: string;
}

export const AgentDiffViewer: React.FC<AgentDiffViewerProps> = ({
  rawDiff,
  files,
  agentName,
  harness,
  color,
  collisionFiles = [],
  onRejectHunk,
  onAskWhy,
  emptyLabel = 'No changes to review yet.',
}) => {
  const parsed = useMemo(() => parseGitDiff(rawDiff), [rawDiff]);
  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.path || parsed[0]?.path || '');
  const [keptHunks, setKeptHunks] = useState<Set<string>>(new Set());
  const [busyHunk, setBusyHunk] = useState<string | null>(null);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile('');
      return;
    }
    if (!files.some((f) => f.path === selectedFile)) {
      setSelectedFile(files[0].path);
    }
  }, [files, selectedFile]);

  const activeDiff: FileDiff | undefined =
    parsed.find((d) => d.path === selectedFile) ||
    parsed.find((d) => d.path.endsWith(selectedFile)) ||
    parsed[0];

  const tint = color || harnessColor(harness);
  const meta = HARNESS_REGISTRY[harness] ?? HARNESS_REGISTRY.custom;
  const hasCollision = collisionFiles.includes(selectedFile);

  const handleReject = async (hunkIndex: number) => {
    if (!activeDiff || !onRejectHunk) return;
    const hunk = activeDiff.hunks[hunkIndex];
    if (!hunk) return;
    const key = `${activeDiff.path}:${hunk.header}`;
    setBusyHunk(key);
    try {
      await onRejectHunk(generateHunkPatch(activeDiff.path, hunk));
    } finally {
      setBusyHunk(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0f131a]">
      {/* Provenance header */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold ring-1 ring-inset ring-white/10 flex-shrink-0"
            style={{ backgroundColor: `${tint}20`, color: tint }}
          >
            {meta.label.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-200 truncate">
              {agentName}
              <span className="text-slate-500 font-normal"> · provenance</span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {files.length} file{files.length === 1 ? '' : 's'} changed by this agent
            </div>
          </div>
        </div>
        {onAskWhy && (
          <button
            onClick={onAskWhy}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[10px] font-semibold text-teal-300 transition-colors flex-shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            Ask why
          </button>
        )}
      </div>

      {hasCollision && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/[0.08] border-b border-amber-500/20 text-[11px] text-amber-200">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Collision radar:</span> another agent is touching this file.
            Reject the overlapping hunks or isolate the work in a worktree before merging.
          </span>
        </div>
      )}

      {files.length === 0 || !activeDiff ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
          <FileCode2 className="w-7 h-7 opacity-40" />
          <span className="text-xs">{emptyLabel}</span>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* File list */}
          <div className="w-52 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-1">
            {files.map((file) => {
              const isActive = file.path === selectedFile;
              const collision = collisionFiles.includes(file.path);
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`w-full text-left px-2.5 py-1.5 text-[11px] transition-colors ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-200 border-l-2 border-teal-400'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {collision && <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    <span className="font-mono truncate">{file.path.split(/[\\/]/).pop()}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono tabular-nums">
                    <span className="text-emerald-400">+{file.additions}</span>
                    <span className="text-rose-400">−{file.deletions}</span>
                    <span className="text-slate-600 truncate">{file.path}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Hunks */}
          <div className="flex-1 min-w-0 overflow-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-1.5 bg-[#14181f] border-b border-white/[0.06]">
              <span className="text-[11px] font-mono text-slate-300 truncate">{activeDiff.path}</span>
              <span className="text-[10px] text-slate-500 flex-shrink-0">
                {activeDiff.hunks.length} hunk{activeDiff.hunks.length === 1 ? '' : 's'}
              </span>
            </div>

            {activeDiff.hunks.map((hunk, hunkIndex) => {
              const key = `${activeDiff.path}:${hunk.header}`;
              const kept = keptHunks.has(key);
              const busy = busyHunk === key;
              return (
                <section key={key} className="border-b border-white/[0.06]">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-sky-500/[0.06] border-b border-sky-500/10">
                    <span className="text-[10px] font-mono text-sky-300/90 truncate">{hunk.header}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setKeptHunks((prev) => new Set(prev).add(key))}
                        disabled={kept}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          kept
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-white/[0.05] text-slate-300 hover:bg-emerald-500/15 hover:text-emerald-300'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        {kept ? 'Marked kept' : 'Mark kept'}
                      </button>
                      {onRejectHunk && (
                        <button
                          onClick={() => handleReject(hunkIndex)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] text-[10px] font-semibold text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 transition-colors disabled:opacity-40"
                        >
                          <X className="w-3 h-3" />
                          {busy ? 'Rejecting…' : 'Reject hunk'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="font-mono text-[11px] leading-[1.55]">
                    {hunk.lines.map((line, lineIndex) => {
                      const tone =
                        line.type === 'add'
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : line.type === 'delete'
                          ? 'bg-rose-500/10 text-rose-200'
                          : 'text-slate-400';
                      return (
                        <div key={lineIndex} className={`flex ${tone}`}>
                          <span className="w-10 flex-shrink-0 text-right pr-2 text-slate-600 select-none">
                            {line.oldLineNumber ?? ''}
                          </span>
                          <span className="w-10 flex-shrink-0 text-right pr-2 text-slate-600 select-none">
                            {line.newLineNumber ?? ''}
                          </span>
                          <span className="w-4 flex-shrink-0 text-center select-none">
                            {line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' '}
                          </span>
                          <span className="whitespace-pre-wrap break-all pr-3">{line.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
