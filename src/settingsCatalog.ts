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
  { key: 'interfaceScale', label: 'Interface scale', section: 'Appearance', keywords: 'zoom size accessibility icons panels window', shareable: true, valid: choice(85, 100, 115, 125) },
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

export interface SettingsSearchResult { id: string; label: string; detail: string; tab: SettingsTab; keywords: string; target?: string }

/** Individual settings outside General, with stable navigation targets. */
const fields: SettingsSearchResult[] = [
  { id: 'repo-name', target: 'repo-name', label: 'Git user name', detail: 'Repository · Identity', tab: 'repository', keywords: 'author commit name identity' },
  { id: 'repo-email', target: 'repo-email', label: 'Git email', detail: 'Repository · Identity', tab: 'repository', keywords: 'author commit identity email' },
  { id: 'repo-pull', target: 'repo-pull', label: 'Pull behavior', detail: 'Repository · Behavior', tab: 'repository', keywords: 'merge rebase default' },
  { id: 'repo-line-endings', target: 'repo-line-endings', label: 'Line endings', detail: 'Repository · Behavior', tab: 'repository', keywords: 'core autocrlf crlf lf' },
  { id: 'repo-diff-tool', target: 'repo-diff-tool', label: 'External diff tool', detail: 'Repository · Behavior', tab: 'repository', keywords: 'compare command editor' },
  { id: 'repo-sign', target: 'repo-sign', label: 'Sign commits', detail: 'Repository · Signing', tab: 'repository', keywords: 'gpg ssh x509 enable' },
  { id: 'repo-sign-format', target: 'repo-sign-format', label: 'Signing format', detail: 'Repository · Signing', tab: 'repository', keywords: 'gpg ssh x509 openpgp' },
  { id: 'repo-sign-key', target: 'repo-sign-key', label: 'Signing key', detail: 'Repository · Signing', tab: 'repository', keywords: 'gpg ssh x509 key id' },
  { id: 'ssh-generate', target: 'ssh-generate', label: 'Generate SSH key', detail: 'SSH keys', tab: 'ssh', keywords: 'ed25519 create public private passphrase' },
  { id: 'ssh-test', target: 'ssh-test', label: 'Test SSH connection', detail: 'SSH keys', tab: 'ssh', keywords: 'repository remote host authentication' },
  { id: 'bitbucket-connect', target: 'bitbucket-connect', label: 'Connect Bitbucket server', detail: 'Integrations', tab: 'integrations', keywords: 'personal access token account host' },
  { id: 'ai-provider', target: 'ai-provider', label: 'AI provider', detail: 'AI', tab: 'ai', keywords: 'openai anthropic model' },
  { id: 'ai-model', target: 'ai-model', label: 'AI model', detail: 'AI', tab: 'ai', keywords: 'provider model' },
  { id: 'ai-address', target: 'ai-address', label: 'AI API address', detail: 'AI', tab: 'ai', keywords: 'endpoint base url provider' },
  { id: 'ai-key', target: 'ai-key', label: 'AI API key', detail: 'AI', tab: 'ai', keywords: 'provider token credential secret' },
  { id: 'keymap-filter', target: 'keymap-filter', label: 'Find an action shortcut', detail: 'Keyboard shortcuts', tab: 'keymap', keywords: 'keyboard keys search remap' },
  { id: 'layout-name', target: 'layout-name', label: 'Save a panel layout', detail: 'Panel layouts', tab: 'layouts', keywords: 'workspace name restore' },
  { id: 'template-personal-commit', target: 'template-personal-commit', label: 'Personal commit template', detail: 'Templates · This installation', tab: 'templates', keywords: 'message git draft' },
  { id: 'template-personal-branch', target: 'template-personal-branch', label: 'Personal branch template', detail: 'Templates · This installation', tab: 'templates', keywords: 'name git draft' },
  { id: 'template-personal-pullRequest', target: 'template-personal-pullRequest', label: 'Personal pull request template', detail: 'Templates · This installation', tab: 'templates', keywords: 'description pr draft' },
  { id: 'template-repo-commit', target: 'template-repo-commit', label: 'Repository commit template', detail: 'Templates · This repository', tab: 'templates', keywords: 'message git draft' },
  { id: 'template-repo-branch', target: 'template-repo-branch', label: 'Repository branch template', detail: 'Templates · This repository', tab: 'templates', keywords: 'name git draft' },
  { id: 'template-repo-pullRequest', target: 'template-repo-pullRequest', label: 'Repository pull request template', detail: 'Templates · This repository', tab: 'templates', keywords: 'description pr draft' },
  { id: 'pack-import', target: 'pack-import', label: 'Import extension pack', detail: 'Extension packs', tab: 'packs', keywords: 'theme shortcuts templates json' },
  { id: 'backup-import', target: 'backup-import', label: 'Import settings backup', detail: 'Settings backup', tab: 'sharing', keywords: 'restore json transfer' },
];

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
  const items: SettingsSearchResult[] = SETTINGS.map((s) => ({ id: s.key, target: s.key, label: s.label, detail: `General · ${s.section}`, tab: 'general', keywords: s.keywords }));
  return [...items, ...fields, ...pages].filter((item) => (hasRepository || (item.tab !== 'repository' && !item.id.startsWith('template-repo-'))) &&
    words.every((word) => `${item.label} ${item.detail} ${item.keywords}`.toLocaleLowerCase().includes(word)));
}
