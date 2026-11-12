import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Layers } from 'lucide-react';
import type { ChangedFile, Commit, FileDiff } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { ChangedFileList } from '../Diff/ChangedFileList';
import { DiffView } from '../Diff/DiffView';
import { Modal } from '../ui/Modal';

interface CommitComparisonModalProps {
  base: Commit;
  target: Commit;
  repo: string;
  onClose: () => void;
}

const CommitChip: React.FC<{ commit: Commit; tone: string }> = ({ commit, tone }) => (
  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1f2636] border border-[#2b364c] min-w-0">
    <span className={`font-mono text-xs font-semibold ${tone}`}>{commit.shortHash}</span>
    <span className="text-xs text-slate-300 max-w-[180px] truncate">{commit.summary}</span>
  </span>
);

/** What changed from one commit to another. */
export const CommitComparisonModal: React.FC<CommitComparisonModalProps> = ({ base: initialBase, target: initialTarget, repo, onClose }) => {
  const [[base, target], setPair] = useState([initialBase, initialTarget]);
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | undefined>();

  useEffect(() => {
    let current = true;
    setFiles(null);
    api
      .compareCommits({ repo, base: base.hash, target: target.hash })
      .then((changed) => {
        if (!current) return;
        setFiles(changed);
        setSelected((previous) => (changed.some((f) => f.path === previous) ? previous : changed[0]?.path ?? null));
      })
      .catch((e) => {
        if (current) setFiles([]);
        toast.error(`Could not compare the commits: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo, base.hash, target.hash]);

  useEffect(() => {
    let current = true;
    setDiff(undefined);
    if (selected) {
      api
        .compareFileDiff({ repo, base: base.hash, target: target.hash, file: selected })
        .then((diffs) => current && setDiff(diffs[0]))
        .catch((e) => toast.error(`Could not load the diff: ${e.message}`));
    }
    return () => {
      current = false;
    };
  }, [repo, base.hash, target.hash, selected]);

  const totals = (files ?? []).reduce((t, f) => ({ additions: t.additions + f.additions, deletions: t.deletions + f.deletions }), { additions: 0, deletions: 0 });

  return (
    <Modal
      width="full"
      tall
      icon={<Layers className="w-4 h-4" />}
      title={
        <span className="flex items-center gap-2">
          <CommitChip commit={base} tone="text-amber-300" />
          <button onClick={() => setPair([target, base])} title="Swap the two commits" className="p-1 rounded text-slate-400 hover:text-teal-300 hover:bg-teal-500/15">
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <CommitChip commit={target} tone="text-teal-300" />
        </span>
      }
      subtitle={files && `${files.length} files changed · +${totals.additions} −${totals.deletions}`}
      onClose={onClose}
    >
      <div className="flex-1 min-h-0 flex">
        <div className="w-80 flex-shrink-0 border-r border-[#2a3447]">
          <ChangedFileList files={files ?? []} selected={selected} onSelect={setSelected} emptyLabel={files ? 'The commits have the same content.' : 'Comparing…'} />
        </div>
        <DiffView diff={diff} title={<span className="text-xs font-mono text-slate-300 truncate">{selected}</span>} />
      </div>
    </Modal>
  );
};
