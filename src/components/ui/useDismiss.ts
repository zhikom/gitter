import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

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

/** Focus a context menu and support the same keys for mouse and keyboard users. */
export function useMenuKeyboard(open: boolean, menuRef: RefObject<HTMLElement>, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"]), [role="menuitem"]:not(:disabled):not([aria-disabled="true"])')];
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); latest.current(); previous?.focus(); return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const choices = items();
      if (!choices.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : event.key === 'ArrowDown' ? (index + 1) % choices.length : index < 0 ? choices.length - 1 : (index - 1 + choices.length) % choices.length;
      choices[next]?.focus();
    };
    menu.addEventListener('keydown', onKey);
    return () => menu.removeEventListener('keydown', onKey);
  }, [open, menuRef]);
}

/** Reposition using the rendered menu size, including at large interface scales. */
export function useMenuPlacement(position: { x: number; y: number } | null, menuRef: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!position || !menu) return;
    menu.style.maxHeight = `calc(100vh - 8px)`;
    menu.style.overflowY = 'auto';
    const rect = menu.getBoundingClientRect();
    const placed = menuPosition(position.x, position.y, rect.width, rect.height);
    menu.style.left = `${placed.left}px`;
    menu.style.top = `${placed.top}px`;
  }, [position?.x, position?.y, menuRef]);
}

/** Keeps a menu opened at the pointer inside the window. */
export function menuPosition(x: number, y: number, width = 240, height = 360): { left: number; top: number } {
  return { left: Math.max(4, Math.min(x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - height - 4)) };
}
