import React, { useEffect, useState } from 'react';
import { GitBranch, History, RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { Modal } from '../ui/Modal';

type ReflogEntry = Awaited<ReturnType<typeof api.reflog>>[number];

interface ReflogModalProps {
  repo: string;
  onClose: () => void;
  /** Each resolves when done; the dialog then closes. */
  onCheckout: (hash: string) => Promise<void>;
  onReset: (hash: string, mode: 'soft' | 'hard') => Promise<void>;
  onCreateBranchAt: (hash: string) => void;
}

/** Where HEAD has been, newest first: the way back to work a reset or rebase left behind. */
export const ReflogModal: React.FC<ReflogModalProps> = ({ repo, onClose, onCheckout, onReset, onCreateBranchAt }) => {
  const [entries, setEntries] = useState<ReflogEntry[] | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .reflog({ repo, limit: 200 })
      .then((loaded) => current && setEntries(loaded))
      .catch((e) => {
        if (current) setEntries([]);
        toast.error(`Could not read the reflog: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      // Reported by the action.
    } finally {
      setBusy(false);
    }
  };

  const needle = filter.toLowerCase();
  const shown = (entries ?? []).filter((e) => !needle || `${e.message} ${e.selector} ${e.hash}`.toLowerCase().includes(needle));
  const button = 'px-2 py-0.5 rounded border border-[#2a3447] bg-[#202735] hover:bg-[#2a3447] text-[10px] font-semibold text-slate-300 disabled:opacity-40';

  return (
    <Modal width="lg" tall icon={<History className="w-4 h-4" />} title="Reflog" subtitle="Every position HEAD has had, newest first" onClose={onClose}>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by message, selector or hash…"
        aria-label="Filter reflog"
        className="m-3 bg-[#14181f] border border-[#2a3447] rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
      />
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {!entries && <div className="p-6 text-center text-xs text-slate-500">Loading…</div>}
        {entries && shown.length === 0 && <div className="p-6 text-center text-xs text-slate-500">No entries.</div>}
        {shown.map((entry) => (
          <div key={entry.selector} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[#181d26] border border-[#222a38] hover:border-[#2e3a4e]">
            <span className="font-mono text-[11px] text-teal-400 w-16 flex-shrink-0">{entry.hash.slice(0, 7)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-200 truncate" title={entry.message}>
                {entry.message}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {entry.selector} · {entry.date}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              <button disabled={busy} onClick={() => act(() => onCheckout(entry.hash))} className={button} title="Check out this commit (detached HEAD)">
                Check out
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  onCreateBranchAt(entry.hash);
                  onClose();
                }}
                className={button}
              >
                <GitBranch className="w-3 h-3 inline" /> Branch
              </button>
              <button disabled={busy} onClick={() => act(() => onReset(entry.hash, 'soft'))} className={button} title="Move the current branch here and keep the changes staged">
                <RotateCcw className="w-3 h-3 inline" /> Reset
              </button>
              <button disabled={busy} onClick={() => act(() => onReset(entry.hash, 'hard'))} className={`${button} text-rose-300`} title="Move the current branch here and discard all changes">
                Hard reset
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
