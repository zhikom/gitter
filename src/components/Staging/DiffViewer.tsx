import React, { useState } from 'react';
import { FileDiff, DiffHunk } from '../../types/git';
import {
  Columns,
  AlignLeft,
  Sparkles,
  Check,
  Plus,
  Minus,
  FileCode,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface DiffViewerProps {
  diffs: FileDiff[];
  filePath: string;
  isStaged: boolean;
  onToggleStage: () => void;
  onExplainFile: (rawDiff: string, filename: string) => void;
  onResolveConflict?: (rawDiff: string, filename: string) => void;
  onOpenBlame?: (filePath: string) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffs,
  filePath,
  isStaged,
  onToggleStage,
  onExplainFile,
  onResolveConflict,
  onOpenBlame,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  if (!filePath || diffs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#14181f] text-slate-500 select-none">
        <FileCode className="w-10 h-10 mb-2 opacity-30" />
        <span className="text-sm">Select a file from Working Tree or a Commit to view diff</span>
      </div>
    );
  }

  const fileDiff = diffs[0];
  const hasConflicts = fileDiff.rawDiff.includes('<<<<<<<');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#14181f] overflow-hidden select-text font-mono">
      {/* File Header Bar */}
      <div className="h-10 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3 select-none flex-shrink-0">
        <div className="flex items-center space-x-2 truncate">
          <FileCode className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate">{filePath}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
              isStaged
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isStaged ? 'Staged' : 'Unstaged'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Conflict Resolution Button */}
          {hasConflicts && onResolveConflict && (
            <button
              onClick={() => onResolveConflict(fileDiff.rawDiff, filePath)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium transition"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>AI Resolve Conflict</span>
            </button>
          )}

          {/* Blame & History button */}
          {onOpenBlame && (
            <button
              onClick={() => onOpenBlame(filePath)}
              title="View Visual Blame and File History"
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300 text-xs font-medium transition"
            >
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Blame</span>
            </button>
          )}

          {/* Explain File with AI */}
          <button
            onClick={() => onExplainFile(fileDiff.rawDiff, filePath)}
            title="Explain this file changes with AI"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explain with AI</span>
          </button>

          {/* Stage / Unstage Button */}
          <button
            onClick={onToggleStage}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition ${
              isStaged
                ? 'bg-[#202735] hover:bg-[#2d384c] text-amber-300 border border-[#2a3447]'
                : 'bg-teal-500 hover:bg-teal-400 text-white shadow-sm'
            }`}
          >
            {isStaged ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isStaged ? 'Unstage File' : 'Stage File'}</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#14181f] border border-[#2a3447] rounded p-0.5">
            <button
              onClick={() => setViewMode('unified')}
              title="Unified diff view"
              className={`p-1 rounded ${
                viewMode === 'unified' ? 'bg-[#2d384c] text-teal-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              title="Side-by-side split view"
              className={`p-1 rounded ${
                viewMode === 'split' ? 'bg-[#2d384c] text-teal-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto p-2 text-xs leading-5">
        {fileDiff.isBinary ? (
          <div className="p-8 text-center text-slate-500 italic">Binary file not shown</div>
        ) : fileDiff.hunks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic">No visible line differences</div>
        ) : (
          fileDiff.hunks.map((hunk, hIdx) => (
            <div key={hIdx} className="mb-4 border border-[#222a38] rounded overflow-hidden">
              {/* Hunk Header */}
              <div className="bg-[#181e29] text-teal-400/80 px-3 py-1 text-[11px] font-semibold border-b border-[#222a38] select-none flex items-center justify-between">
                <span>{hunk.header}</span>
              </div>

              {/* Hunk Lines */}
              {viewMode === 'unified' ? (
                <div className="bg-[#12161d]">
                  {hunk.lines.map((line, lIdx) => {
                    const isAdd = line.type === 'add';
                    const isDel = line.type === 'delete';

                    return (
                      <div
                        key={lIdx}
                        className={`flex items-start hover:bg-[#1f2838]/40 transition ${
                          isAdd
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : isDel
                            ? 'bg-rose-500/10 text-rose-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {/* Old Line Number */}
                        <div className="w-12 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38]">
                          {line.oldLineNumber || ''}
                        </div>
                        {/* New Line Number */}
                        <div className="w-12 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38]">
                          {line.newLineNumber || ''}
                        </div>
                        {/* Sign */}
                        <div className="w-6 text-center select-none font-bold">
                          {isAdd ? '+' : isDel ? '-' : ' '}
                        </div>
                        {/* Text */}
                        <div className="flex-1 pl-1 whitespace-pre-wrap break-all">
                          {line.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Split side-by-side mode */
                <div className="bg-[#12161d] divide-y divide-[#1b2230]">
                  {hunk.lines.map((line, lIdx) => {
                    const isAdd = line.type === 'add';
                    const isDel = line.type === 'delete';

                    return (
                      <div key={lIdx} className="grid grid-cols-2 divide-x divide-[#222a38]">
                        {/* Left: Deletions or Context */}
                        <div
                          className={`flex items-start ${
                            isDel ? 'bg-rose-500/10 text-rose-300' : isAdd ? 'opacity-30' : 'text-slate-300'
                          }`}
                        >
                          <div className="w-10 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38]">
                            {line.oldLineNumber || ''}
                          </div>
                          <div className="flex-1 pl-2 whitespace-pre-wrap break-all">
                            {!isAdd && line.text}
                          </div>
                        </div>

                        {/* Right: Additions or Context */}
                        <div
                          className={`flex items-start ${
                            isAdd ? 'bg-emerald-500/10 text-emerald-300' : isDel ? 'opacity-30' : 'text-slate-300'
                          }`}
                        >
                          <div className="w-10 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38]">
                            {line.newLineNumber || ''}
                          </div>
                          <div className="flex-1 pl-2 whitespace-pre-wrap break-all">
                            {!isDel && line.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
