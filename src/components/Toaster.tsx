import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { ToastItem, ToastTone, dismissToast, subscribeToasts } from '../utils/toast';

const STYLES: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-emerald-950/90 text-emerald-100 ring-emerald-400/30',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
  },
  error: {
    box: 'bg-rose-950/90 text-rose-100 ring-rose-400/30',
    icon: <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
  },
  info: {
    box: 'bg-slate-900/90 text-slate-100 ring-white/15',
    icon: <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />,
  },
};

export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2.5 max-w-sm px-3.5 py-2.5 rounded-xl text-xs shadow-2xl shadow-black/50 backdrop-blur-md ring-1 ring-inset animate-[gk-toast-in_220ms_cubic-bezier(0.16,1,0.3,1)] ${STYLES[t.tone].box}`}
        >
          {STYLES[t.tone].icon}
          <span className="leading-snug whitespace-pre-line flex-1 select-text">{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="p-0.5 -mr-1 rounded text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
