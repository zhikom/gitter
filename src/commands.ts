// Every app-level action, once: the toolbar, the command palette and keyboard
// shortcuts all run the same Command, so a shortcut can never act on stale state
// or drift from what the palette offers.
import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { shortcutMatches, type ShortcutOverrides } from './shortcutKeys';

export interface Command {
  id: string;
  title: string;
  category: 'Repository' | 'Changes' | 'Branches' | 'View' | 'Agents' | 'Gitter' | 'Tools';
  icon?: LucideIcon;
  /** Like "Mod+Shift+K"; Mod is Ctrl, or Cmd on macOS. */
  shortcut?: string;
  /** Text fields keep their own meaning for the keys (e.g. Mod+Z undoes typing). */
  notInTextFields?: boolean;
  /** Unavailable commands are left out of the palette and their shortcut does nothing. */
  enabled?: boolean;
  run: () => void;
}

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export function shortcutLabel(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => (part === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : part === 'Shift' ? (isMac ? '⇧' : 'Shift') : part === 'Alt' ? (isMac ? '⌥' : 'Alt') : part))
    .join(isMac ? '' : '+');
}

export function applyShortcutOverrides(commands: Command[], overrides: ShortcutOverrides): Command[] {
  return commands.map((command) => Object.hasOwn(overrides, command.id)
    ? { ...command, shortcut: overrides[command.id] ?? undefined, notInTextFields: true }
    : command);
}

const inTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Runs a command when its shortcut is pressed. Always sees the latest commands. */
export function useShortcuts(commands: Command[]): void {
  const latest = useRef(commands);
  latest.current = commands;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A held key repeats; Mod+Z held down must not undo several times.
      if (e.repeat) return;
      // An open dialog owns the keyboard, except for its own Escape handling.
      if (document.querySelector('[role="dialog"]')) return;
      const command = latest.current.find((c) => c.shortcut && c.enabled !== false && shortcutMatches(e, c.shortcut, isMac));
      if (!command || (command.notInTextFields && inTextField(e.target))) return;
      e.preventDefault();
      command.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
