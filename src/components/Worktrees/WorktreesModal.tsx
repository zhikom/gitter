import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, FolderOpen, GitBranch, Layers, Plus, Trash2 } from 'lucide-react';
import type { Worktree } from '../../../shared/types/git';
import { api, pickFolder } from '../../api/client';
import { toast } from '../../utils/toast';
import { ask } from '../ui/ask';
import { Button, Field, inputClass, Modal } from '../ui/Modal';

interface WorktreesModalProps {
  repo: string;
  onClose: () => void;
  /** Opens a worktree in its own tab. */
  onOpen: (path: string) => void;
  /** The list of worktrees changed (the sidebar shows them too). */
  onChanged: () => void;
}

/** The repository's working folders: each checks out its own branch from one shared history. */
export const WorktreesModal: React.FC<WorktreesModalProps> = ({ repo, onClose, onOpen, onChanged }) => {
  const [worktrees, setWorktrees] = useState<Worktree[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [folder, setFolder] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .worktrees({ repo })
      .then(setWorktrees)
      .catch((e) => toast.error(`Could not list worktrees: ${e.message}`));
  }, [repo]);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addWorktree({ repo, folder: folder.trim(), branch: branch.trim() });
      toast.success(`Checked out ${branch.trim()} in ${folder.trim()}.`);
      setFolder('');
      setBranch('');
      setAdding(false);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(`Could not add the worktree: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (worktree: Worktree) => {
    const confirmed = await ask.confirm({
      title: 'Remove this worktree?',
      message: `${worktree.path} is deleted. Its branch ${worktree.branch ?? ''} is kept. Git refuses if the folder has uncommitted changes.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.removeWorktree({ repo, folder: worktree.path });
      load();
      onChanged();
    } catch (err: any) {
      toast.error(`Could not remove the worktree: ${err.message}`);
    }
  };

  const browse = async () => {
    const picked = await pickFolder('Folder for the new worktree').catch((err) => {
      toast.error(`Could not open the folder picker: ${err.message}`);
      return null;
    });
    if (picked) setFolder(picked);
  };

  return (
    <Modal
      width="lg"
      icon={<Layers className="w-4 h-4" />}
      title="Worktrees"
      subtitle="Work on several branches at once, each in its own folder"
      onClose={onClose}
      actions={
        !adding && (
          <Button tone="primary" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" />
            New worktree
          </Button>
        )
      }
    >
      {adding && (
        <form onSubmit={add} className="p-4 border-b border-[#2a3447] bg-[#15232d] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch" hint="An existing branch, or a new name to create it from HEAD">
              <input autoFocus value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="feature/search" className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Folder" hint="Must not exist yet, or be empty">
              <div className="flex gap-1.5">
                <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Path for the new folder" className={`${inputClass} font-mono`} />
                <Button type="button" onClick={browse}>
                  Browse…
                </Button>
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" tone="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" busy={busy} disabled={!folder.trim() || !branch.trim()}>
              Create worktree
            </Button>
          </div>
        </form>
      )}
      <div className="p-4 space-y-2">
        {!worktrees && <div className="text-center py-8 text-slate-500 text-xs">Loading…</div>}
        {worktrees?.map((wt) => (
          <div
            key={wt.path}
            className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${wt.isCurrent ? 'bg-teal-500/10 border-teal-500/40' : 'bg-[#181d26] border-[#2a3447]'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <FolderOpen className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-200 truncate">{wt.path}</span>
                  {wt.isCurrent && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300">
                      <CheckCircle className="w-2.5 h-2.5" />
                      open
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <GitBranch className="w-3 h-3 text-emerald-400" />
                  {wt.branch || 'detached HEAD'}
                  <span className="font-mono text-slate-500">{wt.head.slice(0, 7)}</span>
                </div>
              </div>
            </div>
            {!wt.isCurrent && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  onClick={() => {
                    onOpen(wt.path);
                    onClose();
                  }}
                >
                  Open in tab
                </Button>
                {!wt.isBare && (
                  <button onClick={() => remove(wt)} title="Remove worktree" aria-label={`Remove ${wt.path}`} className="p-1.5 rounded text-slate-500 hover:text-rose-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
};
