import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Lock, ShieldAlert, X } from 'lucide-react';
import { AgentAttentionItem } from '../../types/agentReview';
import { timeAgo } from './agentUi';

interface AttentionBellProps {
  attention: AgentAttentionItem[];
  acknowledged: Set<string>;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onSelect: (item: AgentAttentionItem) => void;
}

const iconFor = (kind: AgentAttentionItem['kind']) => {
  if (kind === 'collision') return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
  if (kind === 'index-lock') return <Lock className="w-3.5 h-3.5 text-rose-400" />;
  if (kind === 'error') return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
  return <Bell className="w-3.5 h-3.5 text-sky-400" />;
};

export const AttentionBell: React.FC<AttentionBellProps> = ({
  attention,
  acknowledged,
  onAcknowledge,
  onAcknowledgeAll,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const pending = attention.filter((item) => !acknowledged.has(item.id));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title={`Attention${pending.length > 0 ? ` · ${pending.length} item${pending.length === 1 ? '' : 's'} need you` : ''}`}
        aria-label="Attention center"
        className={`relative p-1.5 rounded transition ${
          pending.length > 0
            ? 'text-amber-300 bg-amber-500/15 ring-1 ring-inset ring-amber-400/40 hover:bg-amber-500/25'
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#202735]'
        }`}
      >
        <Bell className="w-4 h-4" />
        {pending.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">
            {pending.length > 9 ? '9+' : pending.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 z-50 bg-[#131821] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[11px] font-semibold text-slate-200">Attention</span>
                <span className="text-[10px] text-slate-500">{pending.length} pending</span>
              </div>
              <div className="flex items-center gap-1">
                {pending.length > 0 && (
                  <button
                    onClick={() => {
                      onAcknowledgeAll();
                      setOpen(false);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-emerald-300 hover:bg-white/[0.05] transition-colors"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close attention center"
                  className="p-0.5 rounded text-slate-500 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {pending.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  Nothing needs you right now. Routine agent progress stays quiet.
                </div>
              ) : (
                pending.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onAcknowledge(item.id);
                      onSelect(item);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors flex items-start gap-2.5"
                  >
                    <span className="mt-0.5 flex-shrink-0">{iconFor(item.kind)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-200 truncate">{item.title}</span>
                        <span className="text-[9px] text-slate-600 flex-shrink-0">{timeAgo(item.createdAt)}</span>
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 line-clamp-2">{item.detail}</span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="px-3 py-2 bg-white/[0.02] border-t border-white/[0.06] text-[10px] text-slate-600">
              Only review decisions, collisions, and errors interrupt. Everything else is ambient.
            </div>
          </div>
        </>
      )}
    </div>
  );
};
