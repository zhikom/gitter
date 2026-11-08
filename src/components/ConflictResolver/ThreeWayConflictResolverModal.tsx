import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Columns,
  Split,
  FileCode,
  Save,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';

import { toast } from '../../utils/toast';
interface ConflictSection {
  id: number;
  type: 'conflict';
  oursHeader: string;
  theirsHeader: string;
  ours: string[];
  theirs: string[];
  base?: string[];
  resolution: 'unresolved' | 'ours' | 'theirs' | 'both-ours-first' | 'both-theirs-first' | 'custom';
  customText?: string;
}

interface CommonSection {
  id: number;
  type: 'common';
  lines: string[];
}

type FileSection = ConflictSection | CommonSection;

interface ThreeWayConflictResolverModalProps {
  filePath: string;
  rawDiff: string;
  repoPath: string;
  onClose: () => void;
  onResolved: () => void;
}

export const ThreeWayConflictResolverModal: React.FC<ThreeWayConflictResolverModalProps> = ({
  filePath,
  rawDiff,
  repoPath,
  onClose,
  onResolved,
}) => {
  const [sections, setSections] = useState<FileSection[]>([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiRationale, setAiRationale] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [manualOutput, setManualOutput] = useState<string>('');

  // Fetch working file content or parse rawDiff
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getFileAtRef(repoPath, 'HEAD', filePath)
      .then(async () => {
        // Fetch raw file from server or parse from rawDiff
        parseConflictContent(rawDiff);
      })
      .catch(() => {
        parseConflictContent(rawDiff);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [filePath, rawDiff, repoPath]);

  // Parse conflict markers from diff or content
  const parseConflictContent = (text: string) => {
    const lines = text.split(/\r?\n/);
    const parsed: FileSection[] = [];
    let currentCommon: string[] = [];
    let sectionId = 0;

    let inConflict = false;
    let inOurs = false;
    let inTheirs = false;
    let inBase = false;

    let oursHeader = 'HEAD (Current)';
    let theirsHeader = 'Incoming';
    let oursLines: string[] = [];
    let theirsLines: string[] = [];
    let baseLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('<<<<<<<')) {
        if (currentCommon.length > 0) {
          parsed.push({ id: sectionId++, type: 'common', lines: currentCommon });
          currentCommon = [];
        }
        inConflict = true;
        inOurs = true;
        inTheirs = false;
        inBase = false;
        oursHeader = line.replace(/^<{7}\s*/, '') || 'HEAD (Current)';
        oursLines = [];
        theirsLines = [];
        baseLines = [];
      } else if (inConflict && line.startsWith('|||||||')) {
        inOurs = false;
        inBase = true;
        inTheirs = false;
      } else if (inConflict && line.startsWith('=======')) {
        inOurs = false;
        inBase = false;
        inTheirs = true;
      } else if (inConflict && line.startsWith('>>>>>>>')) {
        theirsHeader = line.replace(/^>{7}\s*/, '') || 'Incoming';
        parsed.push({
          id: sectionId++,
          type: 'conflict',
          oursHeader,
          theirsHeader,
          ours: oursLines,
          theirs: theirsLines,
          base: baseLines.length > 0 ? baseLines : undefined,
          resolution: 'unresolved',
        });
        inConflict = false;
        inOurs = false;
        inTheirs = false;
        inBase = false;
      } else if (inConflict) {
        if (inOurs) oursLines.push(line);
        else if (inBase) baseLines.push(line);
        else if (inTheirs) theirsLines.push(line);
      } else {
        currentCommon.push(line);
      }
    }

    if (currentCommon.length > 0) {
      parsed.push({ id: sectionId++, type: 'common', lines: currentCommon });
    }

    setSections(parsed);
  };

  const conflicts = useMemo(() => {
    return sections.filter((s): s is ConflictSection => s.type === 'conflict');
  }, [sections]);

  const unresolvedCount = useMemo(() => {
    return conflicts.filter((c) => c.resolution === 'unresolved').length;
  }, [conflicts]);

  // Compute merged result text from current section resolutions
  const computedMergedText = useMemo(() => {
    const result: string[] = [];
    for (const section of sections) {
      if (section.type === 'common') {
        result.push(...section.lines);
      } else {
        if (section.resolution === 'ours') {
          result.push(...section.ours);
        } else if (section.resolution === 'theirs') {
          result.push(...section.theirs);
        } else if (section.resolution === 'both-ours-first') {
          result.push(...section.ours);
          result.push(...section.theirs);
        } else if (section.resolution === 'both-theirs-first') {
          result.push(...section.theirs);
          result.push(...section.ours);
        } else if (section.resolution === 'custom') {
          result.push(section.customText ?? '');
        } else {
          // Unresolved: retain conflict markers
          result.push(`<<<<<<< ${section.oursHeader}`);
          result.push(...section.ours);
          result.push('=======');
          result.push(...section.theirs);
          result.push(`>>>>>>> ${section.theirsHeader}`);
        }
      }
    }
    return result.join('\n');
  }, [sections]);

  // Sync computedMergedText to manualOutput on change if user hasn't overridden
  useEffect(() => {
    setManualOutput(computedMergedText);
  }, [computedMergedText]);

  // Set resolution for a conflict section
  const setConflictResolution = (
    conflictId: number,
    resolution: ConflictSection['resolution']
  ) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === conflictId && s.type === 'conflict') {
          return { ...s, resolution };
        }
        return s;
      })
    );
  };

  // AI-assisted resolution
  const handleAiResolve = async () => {
    setAiLoading(true);
    try {
      const res = await api.resolveConflict(rawDiff, filePath);
      setAiRationale(res.rationale);
      if (res.suggestion) {
        setManualOutput(res.suggestion);
        // Mark all conflicts as resolved with custom/AI
        setSections((prev) =>
          prev.map((s) => (s.type === 'conflict' ? { ...s, resolution: 'custom', customText: res.suggestion } : s))
        );
      }
    } catch (e: any) {
      toast(`AI resolution failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Save resolution & stage file
  const handleSaveAndStage = async () => {
    if (unresolvedCount > 0) {
      const proceed = confirm(
        `There are still ${unresolvedCount} unresolved conflict markers. Are you sure you want to save anyway?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      await api.saveConflictResolution(repoPath, filePath, manualOutput, true);
      toast(`Conflict in ${filePath} resolved and staged successfully!`);
      onResolved();
      onClose();
    } catch (e: any) {
      toast(`Save conflict error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-7xl h-[92vh] bg-[#141820] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-5">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100">3-Way Merge Conflict Resolver</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#202736] text-teal-300 border border-[#2e394e]">
                  {filePath}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                GitKraken-style visual resolver: choose Ours, Theirs, or Both for each conflict block
              </span>
            </div>
          </div>

          {/* Conflict Navigation & Counter */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-[#1c2230] border border-[#2e394e] rounded-lg px-3 py-1 space-x-2">
              <span className="text-xs text-slate-400">Conflicts:</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  unresolvedCount === 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {unresolvedCount === 0 ? 'All Resolved' : `${unresolvedCount} of ${conflicts.length} Remaining`}
              </span>
            </div>

            {/* AI Resolver Button */}
            <button
              onClick={handleAiResolve}
              disabled={aiLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{aiLoading ? 'Resolving...' : 'Auto-Resolve with AI'}</span>
            </button>

            {/* Save & Stage Resolution Button */}
            <button
              onClick={handleSaveAndStage}
              disabled={saving}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Resolution & Stage'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Rationale banner if triggered */}
        {aiRationale && (
          <div className="bg-[#102327] border-b border-teal-500/30 px-5 py-2 flex items-center justify-between text-xs text-teal-200">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
              <span className="font-semibold text-teal-300">AI Strategy:</span>
              <span className="text-slate-300">{aiRationale}</span>
            </div>
            <button
              onClick={() => setAiRationale('')}
              className="text-teal-400/60 hover:text-teal-300 text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 3-Way Panes Grid */}
        <div className="flex-1 grid grid-cols-3 divide-x divide-[#232c3d] overflow-hidden">
          {/* Column 1: Current / HEAD (Ours) */}
          <div className="flex flex-col overflow-hidden bg-[#12161f]">
            <div className="h-9 bg-[#171c26] border-b border-[#232c3d] px-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="text-xs font-semibold text-blue-300">Current Branch (Ours)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">HEAD</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-300 space-y-4">
              {conflicts.map((c, idx) => (
                <div
                  key={c.id}
                  className={`border rounded-lg p-3 transition-colors ${
                    c.resolution === 'ours' || c.resolution === 'both-ours-first'
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-[#263345] bg-[#161d28]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-blue-300">
                      Conflict #{idx + 1}
                    </span>
                    <button
                      onClick={() => setConflictResolution(c.id, 'ours')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        c.resolution === 'ours'
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40'
                      }`}
                    >
                      Take Ours
                    </button>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed text-blue-100 bg-[#0d121a] p-2.5 rounded border border-blue-900/30">
                    {c.ours.length > 0 ? c.ours.join('\n') : <span className="text-slate-500 italic">(Empty)</span>}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Center Merged Output (Interactive & Editable) */}
          <div className="flex flex-col overflow-hidden bg-[#0e1218]">
            <div className="h-9 bg-[#171c26] border-b border-[#232c3d] px-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">Merged Output</span>
                <span className="text-[10px] text-slate-400">(Editable)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Result Preview</span>
            </div>

            <textarea
              value={manualOutput}
              onChange={(e) => setManualOutput(e.target.value)}
              className="flex-1 bg-transparent p-4 font-mono text-xs text-slate-200 resize-none focus:outline-none leading-relaxed selection:bg-teal-500/30"
              spellCheck={false}
            />
          </div>

          {/* Column 3: Incoming (Theirs) */}
          <div className="flex flex-col overflow-hidden bg-[#12161f]">
            <div className="h-9 bg-[#171c26] border-b border-[#232c3d] px-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <span className="text-xs font-semibold text-purple-300">Incoming Branch (Theirs)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Incoming Changes</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-300 space-y-4">
              {conflicts.map((c, idx) => (
                <div
                  key={c.id}
                  className={`border rounded-lg p-3 transition-colors ${
                    c.resolution === 'theirs' || c.resolution === 'both-theirs-first'
                      ? 'border-purple-500/60 bg-purple-500/10'
                      : 'border-[#263345] bg-[#161d28]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-purple-300">
                      Conflict #{idx + 1}
                    </span>
                    <button
                      onClick={() => setConflictResolution(c.id, 'theirs')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        c.resolution === 'theirs'
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40'
                      }`}
                    >
                      Take Theirs
                    </button>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed text-purple-100 bg-[#0d121a] p-2.5 rounded border border-purple-900/30">
                    {c.theirs.length > 0 ? c.theirs.join('\n') : <span className="text-slate-500 italic">(Empty)</span>}
                  </pre>
                  <div className="mt-2 pt-2 border-t border-[#263345] flex items-center justify-end space-x-2">
                    <button
                      onClick={() => setConflictResolution(c.id, 'both-ours-first')}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#1d2636] hover:bg-[#253147] text-slate-300 transition-colors"
                      title="Keep Ours then Theirs"
                    >
                      Both (Ours then Theirs)
                    </button>
                    <button
                      onClick={() => setConflictResolution(c.id, 'both-theirs-first')}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#1d2636] hover:bg-[#253147] text-slate-300 transition-colors"
                      title="Keep Theirs then Ours"
                    >
                      Both (Theirs then Ours)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="h-10 bg-[#161b24] border-t border-[#232c3d] px-5 flex items-center justify-between text-xs text-slate-400">
          <span>Click Take Ours or Take Theirs on each conflict block to automatically build the merged result.</span>
          <span className="font-mono text-[11px] text-teal-400">Total lines: {manualOutput.split('\n').length}</span>
        </div>
      </div>
    </div>
  );
};
