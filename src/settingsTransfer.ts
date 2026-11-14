import { getPreference, setPreferencesBatch, type Preferences } from './preferences';
import { SETTINGS, type SettingSection } from './settingsCatalog';

export const SHARED_SECTIONS = [...new Set(SETTINGS.filter((item) => item.shareable).map((item) => item.section))];
export type SettingsBackup = { format: 'gitter-settings'; version: 1; settings: Partial<Preferences> };

/** A versioned allowlist; machine paths, credentials, commands, and session state have no entries here. */
export function exportSettings(sections: readonly SettingSection[]): string {
  const settings: Record<string, unknown> = Object.create(null);
  for (const item of SETTINGS) {
    if (!item.shareable || !sections.includes(item.section)) continue;
    const value = getPreference(item.key);
    if (!item.valid(value)) throw new Error(`The current value of ${item.label} cannot be shared.`);
    settings[item.key] = value;
  }
  if (!Object.keys(settings).length) throw new Error('Choose at least one section to export.');
  return JSON.stringify({ format: 'gitter-settings', version: 1, settings }, null, 2);
}

/** Validate the entire document before allowing any settings to be applied. */
export function parseSettingsBackup(text: string): SettingsBackup {
  if (text.length > 32_768) throw new Error('The settings file is too large.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('The settings JSON is invalid.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This is not a Gitter settings backup.');
  const data = raw as Record<string, unknown>;
  if (data.format !== 'gitter-settings' || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
    throw new Error('This settings backup has an unsupported format or version.');
  }
  const entries = Object.entries(data.settings);
  if (!entries.length) throw new Error('This settings backup has no settings.');
  const settings: Record<string, unknown> = Object.create(null);
  for (const [key, value] of entries) {
    const item = SETTINGS.find((setting) => setting.key === key && setting.shareable);
    if (!item || !item.valid(value)) throw new Error(`The setting “${key}” is not supported or has an invalid value.`);
    settings[key] = value;
  }
  return { format: 'gitter-settings', version: 1, settings: settings as Partial<Preferences> };
}

export function applySettingsBackup(backup: SettingsBackup, sections: readonly SettingSection[]): number {
  const entries: Array<[keyof Preferences, Preferences[keyof Preferences]]> = [];
  for (const item of SETTINGS) {
    if (!item.shareable || !sections.includes(item.section) || !Object.hasOwn(backup.settings, item.key)) continue;
    const value = backup.settings[item.key];
    // Do not rely on the caller retaining the originally validated object.
    if (!item.valid(value)) throw new Error(`The setting “${item.key}” has an invalid value.`);
    entries.push([item.key, value as Preferences[keyof Preferences]]);
  }
  if (entries.some(([key]) => key === 'theme')) entries.push(['themePack', '']);
  if (entries.length) setPreferencesBatch(entries);
  return entries.filter(([key]) => key !== 'themePack').length;
}
