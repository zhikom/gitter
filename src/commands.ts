// Every app-level action, once: the toolbar, the command palette and keyboard
// shortcuts all run the same Command, so a shortcut can never act on stale state
// or drift from what the palette offers.
import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Command {
  id: string;
  title: string;
  category: 'Repository' | 'Changes' | 'Branches' | 'View' | 'Agents' | 'Gitter';
  icon?: LucideIcon;
  /** Like "Mod+Shift+K"; Mod is Ctrl, or Cmd on macOS. */
  shortcut?: string;
  /** Text fields keep their own meaning for the keys (e.g. Mod+Z undoes typing). */
  notInTextFields?: boolean;
  /** Unavailable commands are left out of the palette and their shortcut does nothing. */
  enabled?: boolean;
  run: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export function shortcutLabel(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => (part === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : part === 'Shift' ? (isMac ? '⇧' : 'Shift') : part === 'Alt' ? (isMac ? '⌥' : 'Alt') : part))
    .join(isMac ? '' : '+');
}

// "Ctrl" means the Control key on every platform (Ctrl+Tab); "Mod" is Cmd on macOS.
function matches(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const wantCtrl = parts.includes('Ctrl') || (!isMac && parts.includes('Mod'));
  const wantMeta = isMac && parts.includes('Mod');
  return (
    e.ctrlKey === wantCtrl &&
    e.metaKey === wantMeta &&
    e.shiftKey === parts.includes('Shift') &&
    e.altKey === parts.includes('Alt') &&
    e.key.toLowerCase() === key
  );
}

const inTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Runs a command when its shortcut is pressed. Always sees the latest commands. */
export function useShortcuts(commands: Command[]): void {
  const latest = useRef(commands);
  latest.current = commands;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An open dialog owns the keyboard, except for its own Escape handling.
      if (document.querySelector('[role="dialog"]')) return;
      const command = latest.current.find((c) => c.shortcut && c.enabled !== false && matches(e, c.shortcut));
      if (!command || (command.notInTextFields && inTextField(e.target))) return;
      e.preventDefault();
      command.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
