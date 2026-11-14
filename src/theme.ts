import type { Preferences } from './preferences';
import { compatiblePack, PACK_COLOR_KEYS, type InstalledPack } from './dataPacks';

export function effectiveTheme(theme: Preferences['theme'], prefersDark: boolean): Exclude<Preferences['theme'], 'system'> {
  return theme === 'system' ? (prefersDark ? 'classic' : 'claude') : theme;
}

export function applyTheme(root: HTMLElement, theme: Preferences['theme'], packId: string, packs: InstalledPack[], prefersDark: boolean, currentVersion: string) {
  const selected = packs.find((pack) => pack.enabled && pack.manifest.id === packId && compatiblePack(pack.manifest, currentVersion) && pack.manifest.contributions.theme);
  const contribution = selected?.manifest.contributions.theme;
  root.dataset.theme = contribution?.base ?? effectiveTheme(theme, prefersDark);
  for (const key of PACK_COLOR_KEYS) root.style.removeProperty(`--${key}`);
  for (const [key, color] of Object.entries(contribution?.colors ?? {})) {
    const value = key.startsWith('graph-') ? color : `${parseInt(color.slice(1, 3), 16)} ${parseInt(color.slice(3, 5), 16)} ${parseInt(color.slice(5, 7), 16)}`;
    root.style.setProperty(`--${key}`, value);
  }
}
