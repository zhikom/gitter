import { useEffect, useRef } from 'react';

// Open dialogs, oldest first. Escape closes only the newest, so a confirmation
// shown over a dialog does not take the dialog down with it.
const stack: symbol[] = [];

/** Calls `onEscape` when Escape is pressed and this is the topmost open dialog. */
export function useEscape(onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    const id = Symbol('dialog');
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return;
      e.stopPropagation();
      handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, []);
}
