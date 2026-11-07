import React, { useState } from 'react';
import { Sparkles, Check, RefreshCw, MessageSquare } from 'lucide-react';

interface CommitBoxProps {
  stagedCount: number;
  onCommit: (summary: string, description: string, amend: boolean) => Promise<void>;
  onGenerateAiMessage: () => Promise<{ summary: string; description: string }>;
  loading: boolean;
}

export const CommitBox: React.FC<CommitBoxProps> = ({
  stagedCount,
  onCommit,
  onGenerateAiMessage,
  loading,
}) => {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  const handleAiGenerate = async () => {
    setIsAiGenerating(true);
    try {
      const generated = await onGenerateAiMessage();
      if (generated) {
        setSummary(generated.summary);
        if (generated.description) {
          setDescription(generated.description);
          setShowDesc(true);
        }
      }
    } catch (e: any) {
      alert(`AI Generation error: ${e.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || (stagedCount === 0 && !amend)) return;

    await onCommit(summary.trim(), description.trim(), amend);
    setSummary('');
    setDescription('');
    setAmend(false);
    setShowDesc(false);
  };

  const canCommit = summary.trim().length > 0 && (stagedCount > 0 || amend) && !loading;

  return (
    <div className="bg-[#1b212c] border-t border-[#2a3447] p-3 select-none">
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Header with AI Generate button */}
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Commit Changes
          </div>
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={stagedCount === 0 || isAiGenerating}
            title={stagedCount === 0 ? 'Stage files first to generate AI message' : 'Generate conventional commit message using AI'}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
            <span>{isAiGenerating ? 'Drafting...' : 'AI Generate'}</span>
          </button>
        </div>

        {/* Commit Summary Input */}
        <div>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Commit summary (e.g. feat: add visual commit graph)"
            className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
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
              placeholder="Commit description (optional details or reasoning)..."
              rows={3}
              className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none font-mono"
            />
          )}
        </div>

        {/* Amend checkbox & Commit button */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center space-x-1.5 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={amend}
              onChange={(e) => setAmend(e.target.checked)}
              className="rounded bg-[#14181f] border-[#2a3447] text-teal-500 focus:ring-0"
            />
            <span>Amend previous commit</span>
          </label>

          <button
            type="submit"
            disabled={!canCommit}
            className={`px-4 py-1.5 rounded text-xs font-semibold flex items-center space-x-1.5 transition ${
              canCommit
                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-lg shadow-teal-500/20 cursor-pointer'
                : 'bg-[#202735] text-slate-500 border border-[#2a3447] cursor-not-allowed'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Commit {stagedCount > 0 ? `(${stagedCount} files)` : ''}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
