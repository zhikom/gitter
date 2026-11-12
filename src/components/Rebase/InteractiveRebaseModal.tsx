import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, GitMerge, Info, Wand2 } from 'lucide-react';
import type { RebaseActionType, RebaseCommitItem } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { Button, Modal } from '../ui/Modal';

interface InteractiveRebaseModalProps {
  base: string;
  repo: string;
  onClose: () => void;
  onComplete: () => void;
}

const ACTION_STYLE: Record<RebaseActionType, string> = {
  pick: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  reword: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  squash: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  fixup: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  drop: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
};

/**
 * git's autosquash: a commit titled "fixup! X" or "squash! X" moves right after
 * the commit titled X and folds into it.
 */
export function autosquash(plan: RebaseCommitItem[]): RebaseCommitItem[] {
  const result: RebaseCommitItem[] = [];
  const pending = [...plan];
  while (pending.length) {
    // A fixup whose target came earlier was already taken out of `pending`; one
    // still here has no target in the plan and stays where it is.
    const item = pending.shift()!;
    result.push(item);
    const followers = pending.filter((c) => c.summary === `fixup! ${item.summary}` || c.summary === `squash! ${item.summary}`);
    for (const follower of followers) {
      pending.splice(pending.indexOf(follower), 1);
      result.push({ ...follower, action: follower.summary.startsWith('fixup!') ? 'fixup' : 'squash' });
    }
  }
  return result;
}

/** Rewrites the commits after `base`: reorder, reword, squash, fix up or drop them. */
export const InteractiveRebaseModal: React.FC<InteractiveRebaseModalProps> = ({ base, repo, onClose, onComplete }) => {
  const [plan, setPlan] = useState<RebaseCommitItem[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .rebaseCommits({ repo, base })
      .then(setPlan)
      .catch((e) => {
        toast.error(`Could not list the commits: ${e.message}`);
        onClose();
      });
  }, [repo, base, onClose]);

  const update = (index: number, change: Partial<RebaseCommitItem>) => setPlan((prev) => prev && prev.map((c, i) => (i === index ? { ...c, ...change } : c)));
  const move = (index: number, by: -1 | 1) =>
    setPlan((prev) => {
      if (!prev || index + by < 0 || index + by >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  const kept = plan?.filter((c) => c.action !== 'drop') ?? [];
  const problem = !plan?.length
    ? 'There are no commits to rewrite.'
    : kept.length === 0
      ? 'At least one commit has to stay.'
      : kept[0].action === 'squash' || kept[0].action === 'fixup'
        ? 'The first kept commit has nothing to fold into.'
        : null;

  const run = async () => {
    if (!plan || problem) return;
    setRunning(true);
    try {
      toast.success(await api.runRebasePlan({ repo, base, plan }));
      onComplete();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      width="lg"
      tall
      icon={<GitMerge className="w-4 h-4" />}
      title="Interactive rebase"
      subtitle={`${plan?.length ?? 0} commits after ${base.slice(0, 7)}`}
      onClose={onClose}
      actions={
        <Button onClick={() => plan && setPlan(autosquash(plan))} disabled={!plan} title='Fold "fixup! …" and "squash! …" commits into the commits they name'>
          <Wand2 className="w-3.5 h-3.5 text-teal-300" />
          Autosquash
        </Button>
      }
      footer={
        <>
          <span className={`mr-auto text-xs ${problem ? 'text-amber-300' : 'text-slate-400'}`}>{problem ?? `${kept.length} commits will remain`}</span>
          <Button tone="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button tone="primary" onClick={run} busy={running} disabled={Boolean(problem)}>
            <Check className="w-3.5 h-3.5" />
            {running ? 'Rewriting…' : 'Rewrite history'}
          </Button>
        </>
      }
    >
      <div className="px-4 py-2 border-b border-[#2a3447] flex items-center gap-2 text-xs text-slate-400">
        <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
        Needs a clean working tree. If a step fails, the branch goes back to where it was; afterwards the reflog still has the old commits.
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {!plan && <div className="text-center py-12 text-slate-500 text-xs">Loading…</div>}
        {plan?.map((c, i) => (
          <div key={c.hash} className={`flex items-center gap-3 p-2 rounded border ${c.action === 'drop' ? 'bg-[#14181f]/40 border-rose-950 opacity-60' : 'bg-[#14181f] border-[#2a3447]'}`}>
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-0.5 rounded hover:bg-[#202735] text-slate-400 disabled:opacity-20">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === plan.length - 1} aria-label="Move down" className="p-0.5 rounded hover:bg-[#202735] text-slate-400 disabled:opacity-20">
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
            <select
              value={c.action}
              onChange={(e) => update(i, { action: e.target.value as RebaseActionType })}
              aria-label={`Action for ${c.shortHash}`}
              className={`text-xs font-semibold px-2 py-1 rounded border uppercase bg-[#1b212c] focus:outline-none ${ACTION_STYLE[c.action]}`}
            >
              {(['pick', 'reword', 'squash', 'fixup', 'drop'] as const).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span className="font-mono text-xs text-teal-400 w-16 flex-shrink-0">{c.shortHash}</span>
            <div className="flex-1 min-w-0">
              {c.action === 'reword' || c.action === 'squash' ? (
                <input
                  value={c.newSummary ?? c.summary}
                  onChange={(e) => update(i, { newSummary: e.target.value })}
                  aria-label="New message"
                  className="w-full bg-[#1b212c] border border-teal-500/50 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none"
                />
              ) : (
                <span className={`block truncate text-xs ${c.action === 'drop' ? 'line-through text-slate-500' : 'text-slate-200'}`}>{c.summary}</span>
              )}
            </div>
            <span className="text-xs text-slate-500 w-28 truncate text-right">{c.author}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
};
