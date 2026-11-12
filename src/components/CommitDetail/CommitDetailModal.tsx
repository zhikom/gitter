import React, { useEffect, useState } from 'react';
import { Check, Copy, GitCommit, Sparkles } from 'lucide-react';
import type { AIExplanation, Commit, FileDiff } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { ChangedFileList, filesOfDiffs } from '../Diff/ChangedFileList';
import { DiffView } from '../Diff/DiffView';
import { Explanation } from '../Diff/Explanation';
import { Button, Modal } from '../ui/Modal';

interface CommitDetailModalProps {
  commit: Commit;
  repo: string;
  onClose: () => void;
  onCheckout: (hash: string) => void;
  onCreateBranchAt: (hash: string) => void;
  onRevert: (hash: string) => void;
}

export const CommitDetailModal: React.FC<CommitDetailModalProps> = ({ commit, repo, onClose, onCheckout, onCreateBranchAt, onRevert }) => {
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    setDiffs(null);
    setExplanation(null);
    api
      .commitDiff({ repo, hash: commit.hash })
      .then((loaded) => {
        if (!current) return;
        setDiffs(loaded);
        setSelected(loaded[0]?.path ?? null);
      })
      .catch((e) => {
        if (current) setDiffs([]);
        toast.error(`Could not load the commit: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo, commit.hash]);

  const explain = async () => {
    if (!diffs) return;
    setExplaining(true);
    try {
      setExplanation(await api.explainChanges({ diff: diffs.map((d) => d.rawDiff).join('\n'), title: `Commit ${commit.shortHash}: ${commit.summary}` }));
    } catch (e: any) {
      toast.error(`AI review failed: ${e.message}`);
    } finally {
      setExplaining(false);
    }
  };

  const copySha = async () => {
    await navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      width="xl"
      tall
      icon={<GitCommit className="w-4 h-4" />}
      title={commit.summary}
      subtitle={`${commit.author.name} · ${commit.date}`}
      onClose={onClose}
      actions={
        <>
          <button
            onClick={copySha}
            title="Copy the full commit hash"
            className="flex items-center gap-1 px-2 py-1 rounded font-mono text-xs bg-[#202735] hover:bg-[#283244] text-teal-300 border border-[#2a3447]"
          >
            {commit.shortHash}
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
          </button>
          <Button onClick={explain} busy={explaining} disabled={!diffs?.length} title="Explain this commit with AI">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            {explaining ? 'Reviewing…' : 'AI review'}
          </Button>
          <Button onClick={() => onCheckout(commit.hash)}>Check out</Button>
          <Button onClick={() => onCreateBranchAt(commit.hash)}>Branch here</Button>
          <Button onClick={() => onRevert(commit.hash)}>Revert</Button>
        </>
      }
    >
      {commit.body && <pre className="px-4 py-2 text-xs text-slate-300 whitespace-pre-wrap border-b border-[#2a3447] max-h-32 overflow-y-auto select-text font-sans">{commit.body}</pre>}
      {explanation && <Explanation explanation={explanation} />}
      <div className="flex-1 min-h-0 flex">
        <div className="w-72 flex-shrink-0 border-r border-[#2a3447]">
          <ChangedFileList files={diffs ? filesOfDiffs(diffs) : []} selected={selected} onSelect={setSelected} emptyLabel={diffs ? 'This commit changes no files.' : 'Loading…'} />
        </div>
        <DiffView diff={diffs?.find((d) => d.path === selected)} title={<span className="text-xs font-mono text-slate-300 truncate">{selected}</span>} />
      </div>
    </Modal>
  );
};
