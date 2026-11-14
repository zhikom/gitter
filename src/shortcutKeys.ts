export type ShortcutOverrides = Record<string, string | null>;

const modifiers = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;
const specialKeys = new Set(['Tab', 'Enter', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** A deliberately small, portable shortcut syntax; arbitrary strings are rejected. */
export function normalizeShortcut(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 60) return undefined;
  const parts = value.split('+');
  const key = parts.pop();
  if (!key || parts.some((part) => !modifiers.includes(part as typeof modifiers[number])) || new Set(parts).size !== parts.length) return undefined;
  const normalizedKey = /^[a-z0-9]$/i.test(key) ? key.toUpperCase() : /^f(?:[1-9]|1[0-2])$/i.test(key) ? key.toUpperCase() : key;
  if (!/^[A-Z0-9]$/.test(normalizedKey) && !/^F(?:[1-9]|1[0-2])$/.test(normalizedKey) && !specialKeys.has(normalizedKey) && !/^[,.;/\[\]\\`'-]$/.test(normalizedKey)) return undefined;
  if (!parts.some((part) => ['Mod', 'Ctrl', 'Alt'].includes(part)) && !/^F(?:[1-9]|1[0-2])$/.test(normalizedKey)) return undefined;
  return [...modifiers.filter((part) => parts.includes(part)), normalizedKey].join('+');
}

/** Compare the physical keys, including Ctrl and Mod being the same on Windows. */
export function shortcutIdentity(shortcut: string, mac: boolean): string {
  const parts = shortcut.split('+');
  const key = parts.pop()!.toLowerCase();
  const physical = new Set(parts.map((part) => part === 'Mod' ? (mac ? 'Meta' : 'Ctrl') : part));
  return [...physical].sort().join('+') + '+' + key;
}

export function reservedShortcut(shortcut: string, mac: boolean): boolean {
  const reserved = mac
    ? ['Mod+Q', 'Mod+H', 'Mod+M', 'Mod+Tab', 'Mod+Space', 'Mod+Alt+Escape', 'Mod+Enter', 'Ctrl+Enter']
    : ['Alt+F4', 'Mod+Enter', 'Ctrl+Enter'];
  return ['F1', 'F11', 'F12'].includes(shortcut) || reserved.some((value) => shortcutIdentity(value, mac) === shortcutIdentity(shortcut, mac));
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac: boolean): string | undefined {
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'Dead'].includes(event.key) || (!mac && event.metaKey)) return undefined;
  const key = event.key === ' ' ? 'Space' : event.key;
  const parts = [
    ...(mac ? event.metaKey ? ['Mod'] : [] : event.ctrlKey ? ['Mod'] : []),
    ...(mac && event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    key,
  ];
  return normalizeShortcut(parts.join('+'));
}

export function shortcutMatches(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string, mac: boolean): boolean {
  const input = shortcutFromEvent(event, mac);
  return Boolean(input && shortcutIdentity(input, mac) === shortcutIdentity(shortcut, mac));
}
