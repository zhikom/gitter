import { MAX_TEMPLATE_LENGTH, type TemplateKind } from '../shared/templates';
import { normalizeShortcut, reservedShortcut, shortcutIdentity } from './shortcutKeys';
import type { Command } from './commands';

const safeActions = ['repositories', 'new-tab', 'close-tab', 'next-tab', 'previous-tab', 'refresh', 'reflog', 'history-search', 'branch-timeline', 'worktrees', 'gitflow', 'new-branch', 'open-in', 'toggle-sidebar', 'toggle-staging', 'lanes', 'toggle-assistant', 'agent-rail', 'review-inbox', 'fleet', 'next-review', 'palette', 'settings', 'check-updates'] as const;
export const PACK_COLOR_KEYS = ['theme-deep', 'theme-base', 'theme-surface', 'theme-raised', 'theme-border', 'theme-overlay', 'graph-bg', 'graph-accent', ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].flatMap((n) => [`slate-${n}`, `teal-${n}`])] as const;

export interface DataPack {
  format: 'gitter-pack'; schemaVersion: 1; id: string; name: string; version: string; author: string; minGitterVersion: string;
  contributions: {
    theme?: { base: 'classic' | 'codex' | 'claude'; colors: Record<string, string> };
    keymap?: Record<string, string | null>;
    templates?: Partial<Record<TemplateKind, string>>;
  };
}
export interface InstalledPack { manifest: DataPack; enabled: boolean }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const version = (value: unknown) => typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value);

export function validateDataPack(value: unknown): DataPack {
  if (!record(value) || !only(value, ['format', 'schemaVersion', 'id', 'name', 'version', 'author', 'minGitterVersion', 'contributions']) || value.format !== 'gitter-pack' || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(value.id) || !text(value.name, 80) || !text(value.author, 80) || !version(value.version) || !version(value.minGitterVersion) || !record(value.contributions) || !only(value.contributions, ['theme', 'keymap', 'templates'])) throw new Error('Invalid or unsupported pack manifest.');
  const source = value.contributions;
  const contributions: DataPack['contributions'] = {};
  if (source.theme !== undefined) {
    if (!record(source.theme) || !only(source.theme, ['base', 'colors']) || !['classic', 'codex', 'claude'].includes(String(source.theme.base)) || !record(source.theme.colors) || !Object.keys(source.theme.colors).length || Object.entries(source.theme.colors).some(([key, color]) => !PACK_COLOR_KEYS.includes(key) || typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('The pack theme has unsupported colors or values.');
    contributions.theme = { base: source.theme.base as 'classic' | 'codex' | 'claude', colors: { ...source.theme.colors } as Record<string, string> };
  }
  if (source.keymap !== undefined) {
    if (!record(source.keymap) || Object.entries(source.keymap).some(([id, shortcut]) => !safeActions.includes(id as typeof safeActions[number]) || (shortcut !== null && (typeof shortcut !== 'string' || normalizeShortcut(shortcut) !== shortcut || reservedShortcut(shortcut, true) || reservedShortcut(shortcut, false))))) throw new Error('The pack keymap has an unsupported action or shortcut.');
    contributions.keymap = { ...source.keymap } as Record<string, string | null>;
  }
  if (source.templates !== undefined) {
    if (!record(source.templates) || !only(source.templates, ['commit', 'branch', 'pullRequest']) || Object.values(source.templates).some((template) => typeof template !== 'string' || template.length > MAX_TEMPLATE_LENGTH || template.includes('\0'))) throw new Error('The pack templates must be bounded plain text.');
    contributions.templates = { ...source.templates } as Partial<Record<TemplateKind, string>>;
  }
  if (!contributions.theme && !Object.keys(contributions.keymap ?? {}).length && !Object.keys(contributions.templates ?? {}).length) throw new Error('The pack has no contributions.');
  return { format: 'gitter-pack', schemaVersion: 1, id: value.id, name: value.name as string, version: value.version as string, author: value.author as string, minGitterVersion: value.minGitterVersion as string, contributions };
}

export function parseDataPack(input: string): DataPack {
  if (input.length > 48_000) throw new Error('The pack is too large.');
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('The pack JSON is invalid.'); }
  return validateDataPack(value);
}

export function compatiblePack(pack: DataPack, current: string): boolean {
  if (!version(current)) return false;
  const a = current.split('.').map(Number), b = pack.minGitterVersion.split('.').map(Number);
  if (a[0] !== b[0]) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

/** Common opaque text/surface pairs. Alpha overlays and custom content still need visual review. */
export const CONTRAST_BASE_COLORS = {
  classic: { 'theme-base': '#14181f', 'theme-surface': '#202735', 'theme-raised': '#2d384c', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1', 'slate-400': '#b2bfd0', 'slate-500': '#a2b0c3', 'slate-600': '#94a3b8', 'teal-300': '#5eead4', 'teal-400': '#2dd4bf' },
  codex: { 'theme-base': '#1c1c1c', 'theme-surface': '#242424', 'theme-raised': '#2e2e2e', 'slate-200': '#e0e0dd', 'slate-300': '#c4c4c0', 'slate-400': '#b5b5b0', 'slate-500': '#a4a4a0', 'slate-600': '#999994', 'teal-300': '#abcaf7', 'teal-400': '#8baee8' },
  claude: { 'theme-base': '#faf9f5', 'theme-surface': '#f4f2eb', 'theme-raised': '#e8e4da', 'slate-200': '#3a342e', 'slate-300': '#4b433b', 'slate-400': '#60564c', 'slate-500': '#6d6155', 'slate-600': '#6f6357', 'teal-300': '#863b24', 'teal-400': '#99432a' },
} as const;

export function themeContrastProblems(base: keyof typeof CONTRAST_BASE_COLORS, overrides: Record<string, string> = {}): string[] {
  const colors: Record<string, string> = { ...CONTRAST_BASE_COLORS[base], ...overrides };
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  return (['theme-base', 'theme-surface', 'theme-raised'] as const).flatMap((background) => (['slate-200', 'slate-300', 'slate-400', 'slate-500', 'slate-600', 'teal-300', 'teal-400'] as const).flatMap((foreground) => {
    const a = luminance(colors[background]), b = luminance(colors[foreground]);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio < 4.5 ? [`${foreground} on ${background} (${ratio.toFixed(1)}:1)`] : [];
  }));
}

export function packContrastProblems(pack: DataPack): string[] {
  const theme = pack.contributions.theme;
  return theme ? themeContrastProblems(theme.base, theme.colors) : [];
}

export function normalizeInstalledPacks(value: unknown): InstalledPack[] | undefined {
  if (!Array.isArray(value) || value.length > 10) return undefined;
  const result: InstalledPack[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    try {
      if (!record(item) || !only(item, ['manifest', 'enabled']) || typeof item.enabled !== 'boolean') continue;
      const manifest = validateDataPack(item.manifest);
      if (!ids.has(manifest.id)) { ids.add(manifest.id); result.push({ manifest, enabled: item.enabled }); }
    } catch { /* An invalid pack never prevents the other packs from loading. */ }
  }
  return result;
}

/** The first enabled pack wins; personal overrides always take precedence. */
export function packCommands(commands: Command[], packs: InstalledPack[], personal: Record<string, string | null>, mac: boolean, currentVersion: string): Command[] {
  const output = commands.map((command) => ({ ...command }));
  const used = new Set<string>();
  for (const { manifest, enabled } of packs) {
    if (!enabled || !compatiblePack(manifest, currentVersion)) continue;
    for (const [id, shortcut] of Object.entries(manifest.contributions.keymap ?? {})) {
      if (Object.hasOwn(personal, id) || used.has(id)) continue;
      const command = output.find((item) => item.id === id);
      if (!command) continue;
      const conflict = shortcut && output.some((other) => {
        if (other.id === id) return false;
        const actual = Object.hasOwn(personal, other.id) ? personal[other.id] : other.shortcut;
        return actual && shortcutIdentity(actual, mac) === shortcutIdentity(shortcut, mac);
      });
      if (conflict) continue;
      command.shortcut = shortcut ?? undefined;
      command.notInTextFields = true;
      used.add(id);
    }
  }
  return output;
}

export function packTemplate(packs: InstalledPack[], kind: TemplateKind, currentVersion: string): { text: string; source: string } | undefined {
  for (const { manifest, enabled } of packs) {
    const template = manifest.contributions.templates?.[kind];
    if (enabled && compatiblePack(manifest, currentVersion) && template) return { text: template, source: manifest.name };
  }
}
