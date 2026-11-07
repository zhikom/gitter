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
  WrapText,
  Type,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface DiffViewerProps {
  diffs: FileDiff[];
  filePath: string;
  isStaged: boolean;
  ignoreWhitespace?: boolean;
  onToggleIgnoreWhitespace?: () => void;
  onToggleStage: () => void;
  onExplainFile: (rawDiff: string, filename: string) => void;
  onResolveConflict?: (rawDiff: string, filename: string) => void;
  onOpenBlame?: (filePath: string) => void;
  onOpenExternalDiff?: (filePath: string, isStaged: boolean) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffs,
  filePath,
  isStaged,
  ignoreWhitespace = false,
  onToggleIgnoreWhitespace,
  onToggleStage,
  onExplainFile,
  onResolveConflict,
  onOpenBlame,
  onOpenExternalDiff,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [tabSize, setTabSize] = useState<number>(2);
  const [fontSize, setFontSize] = useState<number>(12);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  if (!filePath || diffs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#14181f] text-slate-500 select-none p-6 text-center">
        <FileCode className="w-12 h-12 mb-3 opacity-25 text-teal-400" />
        <span className="text-sm font-medium text-slate-400">Select a file from the list to inspect diff</span>
        <span className="text-xs text-slate-600 mt-1">Supports Unified & Split view, whitespace ignore, hunk actions, and AI analysis</span>
      </div>
    );
  }

  const fileDiff = diffs[0];
  const hasConflicts = fileDiff.rawDiff.includes('<<<<<<<');

  // Compute total additions and deletions
  let totalAdditions = 0;
  let totalDeletions = 0;
  fileDiff.hunks.forEach((h) => {
    h.lines.forEach((l) => {
      if (l.type === 'add') totalAdditions++;
      if (l.type === 'delete') totalDeletions++;
    });
  });

  return (
    <div
      className={`flex-1 flex flex-col h-full bg-[#14181f] overflow-hidden select-text font-mono ${
        isFullScreen ? 'fixed inset-0 z-50 p-4 bg-[#14181f]/95 backdrop-blur' : ''
      }`}
    >
      {/* File Header Bar */}
      <div className="h-10 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3 select-none flex-shrink-0">
        <div className="flex items-center space-x-2 truncate">
          <FileCode className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate" title={filePath}>
            {filePath}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
              isStaged
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isStaged ? 'Staged' : 'Unstaged'}
          </span>

          {/* Added & Deleted line pill */}
          <div className="flex items-center space-x-1 text-[11px] font-mono">
            <span className="text-emerald-400">+{totalAdditions}</span>
            <span className="text-rose-400">-{totalDeletions}</span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Ignore Whitespace Toggle */}
          {onToggleIgnoreWhitespace && (
            <button
              onClick={onToggleIgnoreWhitespace}
              title={`Ignore whitespace changes (currently ${ignoreWhitespace ? 'ON' : 'OFF'})`}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
                ignoreWhitespace
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                  : 'bg-[#202735] text-slate-400 border-[#2a3447] hover:text-slate-200'
              }`}
            >
              Whitespace
            </button>
          )}

          {/* Word Wrap Toggle */}
          <button
            onClick={() => setWordWrap(!wordWrap)}
            title={`Toggle word wrap (currently ${wordWrap ? 'ON' : 'OFF'})`}
            className={`p-1 rounded border transition ${
              wordWrap
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                : 'bg-[#202735] text-slate-400 border-[#2a3447] hover:text-slate-200'
            }`}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Font Size Selector */}
          <div className="flex items-center bg-[#14181f] border border-[#2a3447] rounded text-[10px] text-slate-400">
            <button
              onClick={() => setFontSize(Math.max(10, fontSize - 1))}
              title="Decrease font size"
              className="px-1.5 py-0.5 hover:text-slate-200"
            >
              A-
            </button>
            <span className="px-1 font-mono">{fontSize}px</span>
            <button
              onClick={() => setFontSize(Math.min(18, fontSize + 1))}
              title="Increase font size"
              className="px-1.5 py-0.5 hover:text-slate-200"
            >
              A+
            </button>
          </div>

          {/* Conflict Resolution Button */}
          {hasConflicts && onResolveConflict && (
            <button
              onClick={() => onResolveConflict(fileDiff.rawDiff, filePath)}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium transition"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>AI Resolve</span>
            </button>
          )}

          {/* Blame Button */}
          {onOpenBlame && (
            <button
              onClick={() => onOpenBlame(filePath)}
              title="View Blame and file history heatmap"
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300 text-xs font-medium transition"
            >
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Blame</span>
            </button>
          )}

          {/* External Diff Button */}
          {onOpenExternalDiff && (
            <button
              onClick={() => onOpenExternalDiff(filePath, isStaged)}
              title="Open in External Diff Tool (code --diff)"
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300 text-xs font-medium transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              <span>External Diff</span>
            </button>
          )}

          {/* Explain File with AI */}
          <button
            onClick={() => onExplainFile(fileDiff.rawDiff, filePath)}
            title="Explain changes with AI"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Review</span>
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
            <span>{isStaged ? 'Unstage' : 'Stage'}</span>
          </button>

          {/* View Mode Toggle (Unified vs Split) */}
          <div className="flex items-center bg-[#14181f] border border-[#2a3447] rounded p-0.5">
            <button
              onClick={() => setViewMode('unified')}
              title="Unified diff view (inline)"
              className={`p-1 rounded ${
                viewMode === 'unified' ? 'bg-[#2d384c] text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              title="Side-by-side split diff view"
              className={`p-1 rounded ${
                viewMode === 'split' ? 'bg-[#2d384c] text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Full Screen Toggle */}
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit full screen' : 'Expand diff full screen'}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Diff Content Area */}
      <div
        style={{ fontSize: `${fontSize}px`, tabSize }}
        className="flex-1 overflow-auto p-2 leading-relaxed"
      >
        {fileDiff.isBinary ? (
          <div className="p-8 text-center text-slate-500 italic">Binary file not shown</div>
        ) : fileDiff.hunks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic">
            {ignoreWhitespace ? 'No differences found (ignoring whitespace)' : 'No visible line differences'}
          </div>
        ) : (
          fileDiff.hunks.map((hunk, hIdx) => (
            <div key={hIdx} className="mb-4 border border-[#222a38] rounded overflow-hidden">
              {/* Hunk Header */}
              <div className="bg-[#181e29] text-teal-400/90 px-3 py-1 text-[11px] font-semibold border-b border-[#222a38] select-none flex items-center justify-between">
                <span>{hunk.header}</span>
                <span className="text-[10px] text-slate-500 font-normal">Hunk {hIdx + 1} of {fileDiff.hunks.length}</span>
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
                        <div className="w-12 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38] flex-shrink-0">
                          {line.oldLineNumber || ''}
                        </div>
                        {/* New Line Number */}
                        <div className="w-12 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38] flex-shrink-0">
                          {line.newLineNumber || ''}
                        </div>
                        {/* Sign */}
                        <div className="w-6 text-center select-none font-bold flex-shrink-0">
                          {isAdd ? '+' : isDel ? '-' : ' '}
                        </div>
                        {/* Text */}
                        <div className={`flex-1 pl-1 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
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
                            isDel ? 'bg-rose-500/10 text-rose-300' : isAdd ? 'opacity-25' : 'text-slate-300'
                          }`}
                        >
                          <div className="w-10 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38] flex-shrink-0">
                            {line.oldLineNumber || ''}
                          </div>
                          <div className={`flex-1 pl-2 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                            {!isAdd && line.text}
                          </div>
                        </div>

                        {/* Right: Additions or Context */}
                        <div
                          className={`flex items-start ${
                            isAdd ? 'bg-emerald-500/10 text-emerald-300' : isDel ? 'opacity-25' : 'text-slate-300'
                          }`}
                        >
                          <div className="w-10 text-right pr-2 select-none text-[11px] text-slate-600 border-r border-[#222a38] flex-shrink-0">
                            {line.newLineNumber || ''}
                          </div>
                          <div className={`flex-1 pl-2 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
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
