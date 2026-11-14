import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, ChevronDown, Archive, MessageSquare, ArrowUp, RefreshCw, Bot } from 'lucide-react';
import type { Commit } from '../../../shared/types/git';
import type { AgentHarness } from '../../../shared/types/agentFleet';
import { HARNESSES, HARNESS_TRAILER } from '../../../shared/agents';
import { toast } from '../../utils/toast';
import { HARNESS_META } from '../Agent/agentUi';
import { templateDraft } from '../../templateDraft';
import { isMac } from '../../commands';
import { usePreference } from '../../preferences';
import { matchesCommitShortcut } from '../../shortcutKeys';
export interface CommitDraft { summary: string; description: string; amend: boolean; previousDraft: { summary: string; description: string } }
interface CommitBoxProps {
  repo: string;
  initialDraft?: CommitDraft;
  onDraftChange?: (draft: CommitDraft) => void;
  stagedCount: number;
  currentBranch?: string;
  lastCommit?: Commit | null;
  onCommit: (summary: string, description: string, amend: boolean, postAction?: 'push' | 'sync') => Promise<void>;
  onStash?: () => void;
  onGenerateAiMessage: () => Promise<{ summary: string; description: string }>;
}

const CONVENTIONAL_TAGS = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf', 'test'];

export const CommitBox: React.FC<CommitBoxProps> = ({
  repo,
  initialDraft,
  onDraftChange,
  stagedCount,
  currentBranch = 'main',
  lastCommit,
  onCommit,
  onStash,
  onGenerateAiMessage,
}) => {
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState(initialDraft?.summary ?? '');
  const [description, setDescription] = useState(initialDraft?.description ?? '');
  const [amend, setAmend] = useState(initialDraft?.amend ?? false);
  const [previousDraft, setPreviousDraft] = useState(initialDraft?.previousDraft ?? { summary: '', description: '' });
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [showDesc, setShowDesc] = useState(Boolean(initialDraft?.description));
  const [showOptions, setShowOptions] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [commitMode, setCommitMode] = useState<'commit' | 'push' | 'sync'>('commit');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [shortcutOverrides] = usePreference('shortcutOverrides');
  const latest = useRef({ summary, description, amend, repo, currentBranch });
  latest.current = { summary, description, amend, repo, currentBranch };
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onDraftChange?.({ summary, description, amend, previousDraft }); }, [summary, description, amend, previousDraft, onDraftChange]);

  const useTemplate = async () => {
    setTemplateBusy(true);
    try {
      const draft = await templateDraft(repo, 'commit', currentBranch);
      const now = latest.current;
      if (!active.current || now.repo !== repo || now.currentBranch !== currentBranch || now.summary.trim() || now.description.trim() || now.amend) return;
      const lines = draft.text.replace(/\r\n/g, '\n').replace(/^(?:[ \t]*\n)+/, '').split('\n');
      setSummary(lines.shift() ?? '');
      const body = lines.join('\n').replace(/^\n+/, '');
      setDescription(body); setShowDesc(Boolean(body));
      toast.success(`Inserted template from ${draft.source}.`);
    } catch (error) { if (active.current) toast.error((error as Error).message); }
    finally { if (active.current) setTemplateBusy(false); }
  };

  // Records in the commit which agent wrote it, as Gitter's own agent commits do.
  const handleTagAgent = (harness: AgentHarness) => {
    const trailer = `${HARNESS_TRAILER}: ${harness}`;
    setShowDesc(true);
    setDescription((prev) => {
      if (prev.includes(trailer)) return prev;
      return prev ? `${prev.trim()}\n\n${trailer}` : trailer;
    });
    setShowAgentMenu(false);
  };

  // When amend is toggled ON, prefill with last commit message
  const handleToggleAmend = (checked: boolean) => {
    setAmend(checked);
    if (checked) {
      setPreviousDraft({ summary, description });
      if (lastCommit) {
        setSummary(lastCommit.summary);
        if (lastCommit.body) {
          setDescription(lastCommit.body);
          setShowDesc(true);
        }
      }
    } else {
      // Restore previous draft
      setSummary(previousDraft.summary);
      setDescription(previousDraft.description);
    }
  };

  const handleAiGenerate = async () => {
    const requested = { ...latest.current };
    setIsAiGenerating(true);
    try {
      const generated = await onGenerateAiMessage();
      const now = latest.current;
      if (!active.current) return;
      if (now.summary !== requested.summary || now.description !== requested.description || now.amend !== requested.amend || now.repo !== requested.repo || now.currentBranch !== requested.currentBranch) {
        toast.info('The draft changed while AI was working, so its result was not applied.');
        return;
      }
      if (generated) {
        setSummary(generated.summary);
        if (generated.description) {
          setDescription(generated.description);
          setShowDesc(true);
        }
      }
    } catch (e: any) {
      toast.error(`Could not write a message: ${e.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleApplyTag = (tag: string) => {
    const prefix = `${tag}: `;
    if (!summary.startsWith(prefix)) {
      // Remove any existing prefix if present
      const cleaned = summary.replace(/^[a-z]+(\([a-z0-9_-]+\))?:\s*/i, '');
      setSummary(prefix + cleaned);
    }
  };

  // This contextual shortcut is active only in the two commit fields.
  const commitOnShortcut = (e: React.KeyboardEvent) => {
    if (!e.repeat && matchesCommitShortcut(e, shortcutOverrides, isMac)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideMode?: 'commit' | 'push' | 'sync') => {
    if (e) e.preventDefault();
    if (!canCommit) return; // also stops a second Ctrl+Enter while the first commit runs

    const action = overrideMode || commitMode;
    const postAction = action === 'push' ? 'push' : action === 'sync' ? 'sync' : undefined;

    setCommitting(true);
    try {
      // Resolves once the commit exists; a push or pull afterwards reports its own failure.
      await onCommit(summary.trim(), description.trim(), amend, postAction);
    } catch {
      return; // the message stays for another try; the failure was reported
    } finally {
      setCommitting(false);
    }
    setSummary('');
    setDescription('');
    setAmend(false);
    setShowDesc(false);
    setShowOptions(false);
  };

  const canCommit = summary.trim().length > 0 && (stagedCount > 0 || amend) && !committing;

  const getCommitButtonLabel = () => {
    if (amend) {
      if (commitMode === 'push') return 'Amend & Push';
      if (commitMode === 'sync') return 'Amend & Sync';
      return 'Amend Commit';
    }
    const countStr = stagedCount > 0 ? `(${stagedCount} files)` : '';
    if (commitMode === 'push') return `Commit & Push ${countStr}`;
    if (commitMode === 'sync') return `Commit & Sync ${countStr}`;
    return `Commit to ${currentBranch} ${countStr}`.trim();
  };

  return (
    <div className="bg-[#1b212c] border-t border-[#2a3447] p-3 select-none flex-shrink-0">
      <form onSubmit={(e) => handleSubmit(e)} className="space-y-2">
        {/* Header with AI Generate and Stash buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {amend ? 'Amend Previous Commit' : 'Commit Changes'}
            </span>
            <span className="text-[10px] text-teal-400 font-mono">({currentBranch})</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button type="button" onClick={() => void useTemplate()} disabled={templateBusy || amend || Boolean(summary.trim() || description.trim())} title="Insert a template into an empty commit draft" className="px-2 py-0.5 rounded border border-[#2a3447] text-slate-300 text-xs disabled:opacity-40">Template</button>
            {onStash && (
              <button
                type="button"
                onClick={onStash}
                title="Stash uncommitted changes"
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#202735] hover:bg-[#283244] border border-[#2a3447] text-amber-300 text-xs font-medium transition"
              >
                <Archive className="w-3 h-3 text-amber-400" />
                <span>Stash</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={stagedCount === 0 || isAiGenerating}
              title={stagedCount === 0 ? 'Stage files first to generate AI message' : 'Generate conventional commit message using AI'}
              className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className={`w-3 h-3 ${isAiGenerating ? 'animate-spin' : ''}`} />
              <span>{isAiGenerating ? 'Drafting...' : 'AI Generate'}</span>
            </button>
          </div>
        </div>

        {/* Conventional Commit Tag Chips */}
        <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
          {CONVENTIONAL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleApplyTag(tag)}
              className="px-1.5 py-0.5 rounded bg-[#14181f] hover:bg-[#252f40] border border-[#2a3447] text-[10px] text-slate-400 hover:text-teal-300 font-mono transition"
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Commit Summary Input with Char Counter */}
        <div className="relative">
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={commitOnShortcut}
            aria-label="Commit summary"
            placeholder="Commit summary (e.g. feat: add configurable side panels)"
            className="w-full bg-[#14181f] border border-[#2a3447] rounded pl-3 pr-14 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
          />
          <div
            className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono pointer-events-none ${
              summary.length > 72
                ? 'text-red-400 font-bold'
                : summary.length > 50
                ? 'text-amber-400'
                : 'text-slate-500'
            }`}
          >
            {summary.length}/72
          </div>
        </div>

        {/* Description Toggle & Textarea */}
        <div>
          {!showDesc ? (
            <button
              type="button"
              onClick={() => setShowDesc(true)}
              className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center space-x-1"
            >
              <MessageSquare className="w-3 h-3" />
              <span>+ Add description</span>
            </button>
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={commitOnShortcut}
              aria-label="Commit description"
              placeholder="Commit description (optional details or reasoning)..."
              rows={3}
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none font-mono"
            />
          )}
        </div>

        {/* Amend checkbox & Commit button with dropdown options */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 pt-1 relative">
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={amend}
                onChange={(e) => handleToggleAmend(e.target.checked)}
                className="rounded bg-[#14181f] border-[#2a3447] text-teal-500 focus:ring-0"
              />
              <span>Amend</span>
            </label>

            {/* Tag Agent Attribution Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAgentMenu(!showAgentMenu)}
                title="Mark this commit as an AI agent's work"
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#14181f] hover:bg-[#202737] border border-[#2a3447] text-[10px] text-teal-300 font-medium transition"
              >
                <Bot className="w-2.5 h-2.5 text-teal-400" />
                <span>Tag Agent</span>
                <ChevronDown className="w-2 h-2 text-slate-400" />
              </button>

              {showAgentMenu && (
                <div
                  className="absolute bottom-full left-0 mb-1 w-44 bg-[#1b212c] border border-[#2a3447] rounded shadow-xl py-1 z-50 text-xs"
                  onClick={() => setShowAgentMenu(false)}
                >
                  <div className="px-2.5 py-1 text-[9px] uppercase font-bold text-slate-500">Written by</div>
                  {HARNESSES.map((harness) => (
                    <button
                      key={harness}
                      type="button"
                      onClick={() => handleTagAgent(harness)}
                      className="w-full text-left px-2.5 py-1 hover:bg-[#262f3f] text-slate-200 flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: HARNESS_META[harness].color }} />
                      {HARNESS_META[harness].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Split button with primary action and options dropdown */}
          <div className="relative inline-flex min-w-0 max-w-full rounded shadow-sm">
            <button
              type="submit"
              disabled={!canCommit}
              className={`min-w-0 max-w-full px-3 py-1.5 rounded-l text-xs font-semibold flex items-center space-x-1.5 transition ${
                canCommit
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-lg shadow-teal-500/20 cursor-pointer'
                  : 'bg-[#202735] text-slate-500 border border-[#2a3447] cursor-not-allowed'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span className="truncate">{getCommitButtonLabel()}</span>
            </button>

            <button
              type="button"
              disabled={!canCommit}
              onClick={() => setShowOptions(!showOptions)}
              className={`px-1.5 py-1.5 rounded-r border-l border-white/20 text-xs font-semibold flex items-center justify-center transition ${
                canCommit
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                  : 'bg-[#202735] text-slate-500 border border-[#2a3447] cursor-not-allowed'
              }`}
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* Commit Options Dropdown */}
            {showOptions && (
              <div
                className="absolute right-0 bottom-full mb-1 bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[220px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2a3447]">
                  Commit Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCommitMode('commit');
                    handleSubmit(undefined, 'commit');
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center justify-between ${
                    commitMode === 'commit' ? 'text-teal-300 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                    <span>Commit changes</span>
                  </div>
                  {commitMode === 'commit' && <Check className="w-3 h-3 text-teal-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCommitMode('push');
                    handleSubmit(undefined, 'push');
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center justify-between ${
                    commitMode === 'push' ? 'text-blue-300 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                    <span>Commit and push</span>
                  </div>
                  {commitMode === 'push' && <Check className="w-3 h-3 text-teal-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCommitMode('sync');
                    handleSubmit(undefined, 'sync');
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center justify-between ${
                    commitMode === 'sync' ? 'text-emerald-300 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Commit and sync (Pull & Push)</span>
                  </div>
                  {commitMode === 'sync' && <Check className="w-3 h-3 text-teal-400" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
