import React, { useState, useEffect } from 'react';
import { PullRequest } from '../../types/git';
import { api } from '../../api/client';
import {
  X,
  GitPullRequest,
  ExternalLink,
  Sparkles,
  Check,
  User,
  Calendar,
  Layers,
  ArrowRight,
  GitBranch,
} from 'lucide-react';

import { toast } from '../../utils/toast';
interface PullRequestModalProps {
  repoPath: string;
  currentBranch: string;
  selectedPr: PullRequest | null;
  mode: 'view' | 'create';
  onClose: () => void;
  onRefresh: () => void;
}

export const PullRequestModal: React.FC<PullRequestModalProps> = ({
  repoPath,
  currentBranch,
  selectedPr,
  mode,
  onClose,
  onRefresh,
}) => {
  const [prDetails, setPrDetails] = useState<PullRequest | null>(selectedPr);
  const [loading, setLoading] = useState(mode === 'view');

  // Create PR form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [headBranch, setHeadBranch] = useState(currentBranch);
  const [isDraft, setIsDraft] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === 'view' && selectedPr) {
      setLoading(true);
      api.getPullRequestDetails(repoPath, selectedPr.number)
        .then((details) => {
          if (details) setPrDetails(details);
        })
        .finally(() => setLoading(false));
    }
  }, [mode, selectedPr, repoPath]);

  const handleCheckout = async (number: number) => {
    try {
      await api.checkoutPullRequest(repoPath, number);
      toast(`Checked out Pull Request #${number}`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Checkout error: ${e.message}`);
    }
  };

  const handleAiGenerate = async () => {
    setIsAiGenerating(true);
    try {
      const commits = await api.getCommits(repoPath, 15);
      const commitSummaries = commits.map((c) => c.summary);
      const res = await api.generatePrDescription(commitSummaries, 'Feature changes on branch ' + headBranch);
      setTitle(res.title);
      setBody(res.body);
    } catch (e: any) {
      toast(`AI PR generation error: ${e.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await api.createPullRequest(repoPath, title.trim(), body.trim(), headBranch, baseBranch, isDraft);
      toast(`Pull Request created! ${res.url}`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast(`Create PR error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-3xl bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100">
                {mode === 'create' ? 'Create GitHub Pull Request' : `Pull Request #${prDetails?.number}`}
              </span>
              <span className="block text-xs text-slate-400">
                {mode === 'create' ? `Branch: ${headBranch}` : prDetails?.title}
              </span>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {mode === 'create' ? (
          <form onSubmit={handleCreatePr} className="p-4 space-y-3 flex-1 overflow-y-auto">
            {/* Branch Direction */}
            <div className="flex items-center space-x-3 p-3 bg-[#14181f] border border-[#2a3447] rounded text-xs font-mono">
              <div className="flex items-center space-x-1.5 text-teal-300">
                <GitBranch className="w-3.5 h-3.5" />
                <span>{headBranch}</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex items-center space-x-1.5 text-slate-300">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder="base branch (main)"
                  className="bg-transparent border-b border-[#2a3447] focus:outline-none w-24 text-slate-200"
                />
              </div>

              <div className="flex-1 text-right">
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={isAiGenerating}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 text-xs font-medium transition"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                  <span>{isAiGenerating ? 'Generating...' : 'AI Generate Title & Body'}</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Title</label>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pull Request title..."
                className="w-full bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Description Body */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Markdown)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Describe your changes..."
                className="w-full bg-[#14181f] border border-[#2a3447] rounded p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
              />
            </div>

            {/* Draft toggle */}
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="rounded bg-[#14181f] border-[#2a3447] text-teal-500 focus:ring-0"
              />
              <span>Create as Draft Pull Request</span>
            </label>

            {/* Submit */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-[#2a3447]">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="px-4 py-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white font-semibold text-xs transition disabled:opacity-40"
              >
                {submitting ? 'Creating PR...' : 'Create Pull Request'}
              </button>
            </div>
          </form>
        ) : (
          /* View PR Details */
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-12 text-slate-500 text-xs">Loading PR details...</div>
            ) : prDetails ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-[#2a3447]">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">{prDetails.title}</h2>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1 font-mono">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {prDetails.state}
                      </span>
                      <span>#{prDetails.number}</span>
                      <span>•</span>
                      <span>{prDetails.author.login}</span>
                      <span>•</span>
                      <span>
                        {prDetails.headRefName} ➔ {prDetails.baseRefName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCheckout(prDetails.number)}
                      className="px-3 py-1.5 rounded bg-[#202735] hover:bg-[#283244] border border-[#2a3447] text-xs font-semibold text-teal-300 transition"
                    >
                      Checkout Branch
                    </button>
                    <a
                      href={prDetails.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold transition"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* PR Description Body */}
                <div className="bg-[#14181f] p-4 rounded border border-[#2a3447] text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
                  {prDetails.body || 'No description provided.'}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">Pull Request not found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
