// The one dialog shell: backdrop, panel, title bar, Escape to close, and focus
// moved into the dialog when it opens and back when it closes.
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useEscape } from './useEscape';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[min(1400px,96vw)]' };

interface ModalProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Shown under the title. */
  subtitle?: React.ReactNode;
  onClose: () => void;
  width?: keyof typeof WIDTHS;
  /** Full height for views with their own scrolling panes (diffs, lists). */
  tall?: boolean;
  /** Right side of the title bar, before the close button. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ title, icon, subtitle, onClose, width = 'md', tall, actions, footer, children }) => {
  const panel = useRef<HTMLDivElement>(null);
  useEscape(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // React has already focused an element marked autoFocus (the confirm button of a
    // confirmation); otherwise the first field gets focus, or the dialog itself.
    if (!panel.current?.contains(document.activeElement)) {
      (panel.current?.querySelector<HTMLElement>('input, textarea, select') ?? panel.current)?.focus();
    }
    return () => previous?.focus?.();
  }, []);

  // Tab stays inside the dialog, so it cannot reach buttons behind the backdrop.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const [first, last] = [focusable[0], focusable[focusable.length - 1]];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[gk-fade-in_120ms_ease-out]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`w-full ${WIDTHS[width]} ${tall ? 'h-[88vh]' : 'max-h-[88vh]'} flex flex-col bg-[#1b212c] border border-[#2a3447] rounded-xl shadow-2xl shadow-black/60 overflow-hidden outline-none animate-[gk-pop-in_160ms_cubic-bezier(0.16,1,0.3,1)]`}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#2a3447] bg-[#171c26] select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="flex-shrink-0 text-teal-400">{icon}</span>}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">{title}</h2>
              {subtitle && <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {actions}
            <button data-close onClick={onClose} aria-label="Close" className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
        <div className={`flex-1 min-h-0 ${tall ? 'flex flex-col' : 'overflow-y-auto'}`}>{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#2a3447] bg-[#171c26]">{footer}</footer>}
      </div>
    </div>
  );
};

const BUTTON_TONES = {
  primary: 'bg-teal-500 hover:bg-teal-400 text-white shadow-sm',
  danger: 'bg-rose-500 hover:bg-rose-400 text-white shadow-sm',
  quiet: 'text-slate-300 hover:text-slate-100 hover:bg-white/[0.06]',
  outline: 'border border-[#2a3447] bg-[#202735] hover:bg-[#2a3447] text-slate-200',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON_TONES; busy?: boolean }> = ({
  tone = 'outline',
  busy,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-40 disabled:pointer-events-none ${BUTTON_TONES[tone]} ${className}`}
  >
    {children}
  </button>
);

export const Field: React.FC<{ label: string; hint?: React.ReactNode; id?: string; children: React.ReactNode }> = ({ label, hint, id, children }) => (
  <label id={id} className="block">
    <span className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-slate-500 mt-1">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full bg-[#14181f] border border-[#2a3447] rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500';
