import { useEffect, useRef } from 'react';

/**
 * Closes a context menu on Escape or on a mouse press outside it. The menu's
 * root element carries `data-context-menu`, so presses on its items still click.
 */
export function useDismiss(open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest?.('[data-context-menu]')) latest.current();
    };
    window.addEventListener('keydown', onEvent);
    window.addEventListener('mousedown', onEvent);
    return () => {
      window.removeEventListener('keydown', onEvent);
      window.removeEventListener('mousedown', onEvent);
    };
  }, [open]);
}

/** Keeps a menu opened at the pointer inside the window. */
export function menuPosition(x: number, y: number, width = 240, height = 360): { left: number; top: number } {
  return { left: Math.max(4, Math.min(x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - height - 4)) };
}
