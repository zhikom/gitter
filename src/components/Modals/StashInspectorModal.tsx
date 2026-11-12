import React, { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import type { ChangedFile, FileDiff, Stash } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { ChangedFileList } from '../Diff/ChangedFileList';
import { DiffView } from '../Diff/DiffView';
import { Button, Modal } from '../ui/Modal';

interface StashInspectorModalProps {
  repo: string;
  stash: Stash;
  onClose: () => void;
  /** Each resolves once the action is done; the inspector then closes. */
  onApply: (index: number) => Promise<void>;
  onPop: (index: number) => Promise<void>;
  onDrop: (index: number) => Promise<void>;
}

/** The files a stash holds, untracked ones included, before applying it. */
export const StashInspectorModal: React.FC<StashInspectorModalProps> = ({ repo, stash, onClose, onApply, onPop, onDrop }) => {
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .stashFiles({ repo, index: stash.index })
      .then((loaded) => {
        if (!current) return;
        setFiles(loaded);
        setSelected(loaded[0]?.path ?? null);
      })
      .catch((e) => {
        if (current) setFiles([]);
        toast.error(`Could not read the stash: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo, stash.index]);

  useEffect(() => {
    let current = true;
    setDiff(undefined);
    if (selected) {
      api
        .stashFileDiff({ repo, index: stash.index, file: selected })
        .then((diffs) => current && setDiff(diffs[0]))
        .catch((e) => toast.error(`Could not load the diff: ${e.message}`));
    }
    return () => {
      current = false;
    };
  }, [repo, stash.index, selected]);

  const act = (action: (index: number) => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action(stash.index);
      onClose();
    } catch {
      // The action reported its own failure.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      width="xl"
      tall
      icon={<Archive className="w-4 h-4 text-amber-400" />}
      title={stash.message || stash.name}
      subtitle={`${stash.name} · ${stash.date}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={act(onApply)} busy={busy} title="Apply the stash and keep it">
            Apply
          </Button>
          <Button tone="primary" onClick={act(onPop)} busy={busy} title="Apply the stash and remove it">
            Pop
          </Button>
          <Button tone="quiet" onClick={act(onDrop)} busy={busy} className="text-rose-300" title="Delete the stash">
            Drop
          </Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 flex">
        <div className="w-80 flex-shrink-0 border-r border-[#2a3447]">
          <ChangedFileList files={files ?? []} selected={selected} onSelect={setSelected} emptyLabel={files ? 'The stash is empty.' : 'Loading…'} />
        </div>
        <DiffView diff={diff} title={<span className="text-xs font-mono text-slate-300 truncate">{selected}</span>} />
      </div>
    </Modal>
  );
};
