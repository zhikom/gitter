import React, { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button, Field, inputClass, Modal } from '../ui/Modal';

interface CreateBranchModalProps {
  startPoint: string;
  onClose: () => void;
  /** Resolves once the branch exists; a failure leaves the dialog open. */
  onCreate: (name: string, startPoint: string, checkout: boolean) => Promise<void>;
}

/** The common mistakes git would reject, explained before the round trip. */
export function branchNameProblem(name: string): string | null {
  if (/\s/.test(name)) return 'Branch names cannot contain spaces.';
  if (name.startsWith('-')) return 'Branch names cannot start with "-".';
  if (name.includes('..') || /[~^:?*[\\]/.test(name) || name.endsWith('.lock') || name.endsWith('/') || name.endsWith('.')) {
    return 'Git does not allow this name.';
  }
  return null;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({ startPoint, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [busy, setBusy] = useState(false);
  const problem = name.trim() ? branchNameProblem(name.trim()) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreate(name.trim(), startPoint, checkout);
      onClose();
    } catch {
      // Reported by the action; the dialog stays open to fix the name.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal width="sm" icon={<GitBranch className="w-4 h-4 text-emerald-400" />} title="New branch" subtitle={`From ${startPoint.length === 40 ? startPoint.slice(0, 7) : startPoint}`} onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <Field label="Name" hint={problem && <span className="text-rose-300">{problem}</span>}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/my-change" className={`${inputClass} font-mono`} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
          Check it out
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" tone="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" busy={busy} disabled={!name.trim() || Boolean(problem)}>
            Create branch
          </Button>
        </div>
      </form>
    </Modal>
  );
};
