import { normalizeFontName } from '../shared/fonts';
import type { Preferences } from './preferences';

export type SettingsTab = 'general' | 'repository' | 'ssh' | 'integrations' | 'open-in' | 'ai' | 'about' | 'sharing' | 'keymap' | 'layouts' | 'toolbar' | 'templates' | 'local-actions' | 'packs';
export type SettingSection = 'Appearance' | 'Repositories' | 'Diffs' | 'Commit graph' | 'Safety' | 'Background';

export interface SettingDefinition {
  key: keyof Preferences;
  label: string;
  section: SettingSection;
  keywords: string;
  /** Only explicitly allowlisted, non-machine-specific values can be shared. */
  shareable: boolean;
  valid: (value: unknown) => boolean;
}

const choice = (...values: unknown[]) => (value: unknown) => values.includes(value);
const bool = (value: unknown) => typeof value === 'boolean';
const font = (value: unknown) => typeof value === 'string' && normalizeFontName(value) === value && !/^(?:[A-Za-z]:[\\/]|[\\/]|~[\\/])/.test(value);

/** Settings visible on General. Keys also identify their existing storage entries. */
export const SETTINGS: readonly SettingDefinition[] = [
  { key: 'theme', label: 'Theme', section: 'Appearance', keywords: 'color dark light system codex claude', shareable: true, valid: choice('classic', 'codex', 'claude', 'system') },
  { key: 'interfaceFont', label: 'Interface font', section: 'Appearance', keywords: 'typography anthropic sans family ui', shareable: true, valid: font },
  { key: 'interfaceTextScale', label: 'Interface text size', section: 'Appearance', keywords: 'typography font scale accessibility ui', shareable: true, valid: choice(85, 100, 115, 125) },
  { key: 'codeFont', label: 'Code and diff font', section: 'Appearance', keywords: 'typography anthropic sans family monospace', shareable: true, valid: font },
  { key: 'cloneFolder', label: 'Default clone folder', section: 'Repositories', keywords: 'repository path destination directory', shareable: false, valid: (v) => typeof v === 'string' },
  { key: 'diffView', label: 'Diff layout', section: 'Diffs', keywords: 'unified split side by side', shareable: true, valid: choice('unified', 'split') },
  { key: 'diffFontSize', label: 'Code and diff size', section: 'Diffs', keywords: 'font text code typography blame conflict review', shareable: true, valid: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 10 && v <= 24 },
  { key: 'codeLineHeight', label: 'Code line height', section: 'Diffs', keywords: 'font typography spacing blame conflict review', shareable: true, valid: choice(1.2, 1.4, 1.625, 1.8) },
  { key: 'tabSize', label: 'Tab width', section: 'Diffs', keywords: 'indentation spaces code', shareable: true, valid: choice(2, 4, 8) },
  { key: 'wordWrap', label: 'Wrap long lines', section: 'Diffs', keywords: 'word wrap', shareable: true, valid: bool },
  { key: 'ignoreWhitespace', label: 'Hide whitespace-only changes', section: 'Diffs', keywords: 'ignore spaces whitespace', shareable: true, valid: bool },
  { key: 'graphDensity', label: 'Graph row height', section: 'Commit graph', keywords: 'density compact comfortable', shareable: true, valid: choice('compact', 'normal', 'comfortable') },
  { key: 'confirmDiscard', label: 'Ask before discarding changes', section: 'Safety', keywords: 'confirm delete revert', shareable: true, valid: bool },
  { key: 'confirmDeleteBranch', label: 'Ask before deleting a branch', section: 'Safety', keywords: 'confirm branch delete', shareable: true, valid: bool },
  { key: 'autoFetchMinutes', label: 'Fetch from remotes', section: 'Background', keywords: 'automatic sync polling', shareable: true, valid: choice(0, 5, 15, 60) },
  { key: 'checkForUpdates', label: 'Check for Gitter updates at startup', section: 'Background', keywords: 'automatic update version', shareable: true, valid: bool },
];

export interface SettingsSearchResult { id: string; label: string; detail: string; tab: SettingsTab; keywords: string }

const pages: SettingsSearchResult[] = [
  { id: 'repository', label: 'This repository', detail: 'Repository settings', tab: 'repository', keywords: 'git identity user name email pull rebase push commits sign signing gpg x509 ssh autocrlf line endings diff tool' },
  { id: 'ssh', label: 'SSH keys', detail: 'SSH keys', tab: 'ssh', keywords: 'generate copy test public private key bitbucket github agent connection passphrase' },
  { id: 'integrations', label: 'Integrations', detail: 'Integrations', tab: 'integrations', keywords: 'bitbucket github authentication account token pull request repositories clone' },
  { id: 'open-in', label: 'Open in applications', detail: 'Open in', tab: 'open-in', keywords: 'editor terminal codex claude rider vscode external command' },
  { id: 'ai', label: 'AI provider', detail: 'AI', tab: 'ai', keywords: 'model api key endpoint base url anthropic openai connection test' },
  { id: 'about', label: 'About and user guide', detail: 'About', tab: 'about', keywords: 'version update help documentation' },
  { id: 'sharing', label: 'Share settings', detail: 'Settings backup', tab: 'sharing', keywords: 'export import backup restore transfer' },
  { id: 'keymap', label: 'Keyboard shortcuts', detail: 'Keymap', tab: 'keymap', keywords: 'keyboard keys hotkeys remap action commands' },
  { id: 'layouts', label: 'Panel layouts', detail: 'Layouts', tab: 'layouts', keywords: 'window workspace panels sidebar save restore' },
  { id: 'toolbar', label: 'Toolbar actions', detail: 'Toolbar', tab: 'toolbar', keywords: 'configure buttons actions order show hide' },
  { id: 'templates', label: 'Commit, branch and pull request templates', detail: 'Templates', tab: 'templates', keywords: 'message git draft variables project personal' },
  { id: 'local-actions', label: 'Local actions', detail: 'Local actions', tab: 'local-actions', keywords: 'external tool executable command run output' },
  { id: 'packs', label: 'Extension packs', detail: 'Extension packs', tab: 'packs', keywords: 'theme keymap templates import install enable disable' },
];

export function searchSettings(query: string, hasRepository: boolean): SettingsSearchResult[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const items: SettingsSearchResult[] = SETTINGS.map((s) => ({ id: s.key, label: s.label, detail: `General · ${s.section}`, tab: 'general', keywords: s.keywords }));
  return [...items, ...pages].filter((item) => (hasRepository || item.tab !== 'repository') &&
    words.every((word) => `${item.label} ${item.detail} ${item.keywords}`.toLocaleLowerCase().includes(word)));
}
