// Settings that belong to this installation rather than to a repository, kept
// in localStorage. Each is read where it takes effect, so what Settings shows is
// what the app does. Storage keys are the ones earlier versions used, so
// existing choices carry over.
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_OPEN_IN_APPS, type OpenInApp, type OpenInKind } from '../shared/types/openIn';

export interface RepoTab {
  path: string;
  name: string;
  branch: string;
  isClean: boolean;
}

export interface Preferences {
  theme: 'classic' | 'codex' | 'claude';
  // Diffs
  diffView: 'unified' | 'split';
  diffFontSize: number;
  tabSize: number;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
  // Graph
  graphDensity: 'compact' | 'normal' | 'comfortable';
  // Safety
  confirmDiscard: boolean;
  confirmDeleteBranch: boolean;
  // Background work
  autoFetchMinutes: number;
  checkForUpdates: boolean;
  // Layout
  sidebarOpen: boolean;
  sidebarWidth: number;
  stagingOpen: boolean;
  rightPanelWidth: number;
  stagingListWidth: number;
  laneMode: boolean;
  agentRailOpen: boolean;
  assistantOpen: boolean;
  // Repositories
  openTabs: RepoTab[];
  recentRepos: string[];
  scanFolder: string;
  cloneFolder: string;
  recentCloneFolders: string[];
  openInApps: OpenInApp[];
}

const DEFAULTS: Preferences = {
  theme: 'classic',
  diffView: 'unified',
  diffFontSize: 12,
  tabSize: 4,
  wordWrap: true,
  ignoreWhitespace: false,
  graphDensity: 'normal',
  confirmDiscard: true,
  confirmDeleteBranch: true,
  autoFetchMinutes: 0,
  checkForUpdates: true,
  sidebarOpen: true,
  sidebarWidth: 256,
  stagingOpen: true,
  rightPanelWidth: 560,
  stagingListWidth: 280,
  laneMode: false,
  agentRailOpen: true,
  assistantOpen: false,
  openTabs: [],
  recentRepos: [],
  scanFolder: '',
  cloneFolder: '',
  recentCloneFolders: [],
  openInApps: DEFAULT_OPEN_IN_APPS,
};

const STORAGE_KEYS: Record<keyof Preferences, string> = {
  theme: 'gitter_theme',
  diffView: 'gitter_diff_view',
  diffFontSize: 'gitter_diff_font_size',
  tabSize: 'gitter_tab_size',
  wordWrap: 'gitter_diff_wrap',
  ignoreWhitespace: 'gitter_diff_ws',
  graphDensity: 'gitter_graph_density',
  confirmDiscard: 'gitter_confirm_discard',
  confirmDeleteBranch: 'gitter_confirm_delete_branch',
  // A new key: earlier versions stored a value here that never took effect.
  autoFetchMinutes: 'gitter_auto_fetch_minutes',
  checkForUpdates: 'gitter_auto_check_updates',
  sidebarOpen: 'gitter_sidebar_open',
  sidebarWidth: 'gitter_sidebar_width',
  stagingOpen: 'gitter_staging_open',
  rightPanelWidth: 'gitter_right_panel_width',
  stagingListWidth: 'gitter_staging_list_width',
  laneMode: 'gitter_vb_mode',
  agentRailOpen: 'gitter_agent_rail_open',
  assistantOpen: 'gitter_agent_open',
  openTabs: 'gitter_open_repo_tabs',
  recentRepos: 'gitter_recent_repos',
  scanFolder: 'gitter_scan_parent_folder',
  cloneFolder: 'gitter_default_repo_folder',
  recentCloneFolders: 'gitter_recent_clone_folders',
  openInApps: 'gitter_open_in_apps',
};

const oneOf =
  <T extends string>(...allowed: T[]) =>
  (v: unknown): T | undefined =>
    allowed.includes(v as T) ? (v as T) : undefined;
const strings = (v: unknown) => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? v : undefined);

// Stored values are checked on the way in: a value of the wrong shape, written
// by an earlier version or edited by hand, falls back to the default.
const NORMALIZE: { [K in keyof Preferences]?: (value: unknown) => Preferences[K] | undefined } = {
  theme: oneOf('classic', 'codex', 'claude'),
  openInApps: (value) => {
    if (!Array.isArray(value)) return undefined;
    const kinds: OpenInKind[] = ['vscode', 'rider', 'codex', 'claude', 'terminal', 'application', 'command'];
    return value.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && kinds.includes(item.kind) && typeof item.target === 'string' && Array.isArray(item.args) && item.args.every((arg: unknown) => typeof arg === 'string'))
      .map((item) => ({ id: item.id, name: item.name, kind: item.kind, target: item.target, args: item.args, enabled: item.enabled !== false }));
  },
  diffView: oneOf('unified', 'split'),
  graphDensity: oneOf('compact', 'normal', 'comfortable'),
  // Earlier versions kept objects ({ path, name, … }) per recent repository.
  recentRepos: (v) => (Array.isArray(v) ? v.map((r) => (typeof r === 'string' ? r : r?.path)).filter((p): p is string => typeof p === 'string') : undefined),
  openTabs: (v) =>
    Array.isArray(v)
      ? v
          .filter((t) => typeof t?.path === 'string')
          .map((t) => ({ path: t.path, name: String(t.name ?? t.path), branch: String(t.branch ?? ''), isClean: t.isClean !== false }))
      : undefined,
  sidebarWidth: (v) => (typeof v === 'number' && v >= 120 && v <= 800 ? v : undefined),
  rightPanelWidth: (v) => (typeof v === 'number' && v >= 240 && v <= 2000 ? v : undefined),
  stagingListWidth: (v) => (typeof v === 'number' && v >= 120 && v <= 1200 ? v : undefined),
};

function accept<K extends keyof Preferences>(key: K, value: unknown): Preferences[K] {
  const normalize = NORMALIZE[key];
  if (normalize) return normalize(value) ?? DEFAULTS[key];
  if (Array.isArray(DEFAULTS[key])) return (strings(value) as Preferences[K]) ?? DEFAULTS[key];
  return typeof value === typeof DEFAULTS[key] ? (value as Preferences[K]) : DEFAULTS[key];
}

const cache = new Map<keyof Preferences, unknown>();
const listeners = new Set<() => void>();

// Earlier versions stored bare strings ("true", "12", "unified"); JSON reads the
// first two, and a string that is not JSON is taken as is.
function load<K extends keyof Preferences>(key: K): Preferences[K] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEYS[key]);
  } catch {
    // Storage can be unavailable (private windows); defaults apply.
  }
  if (raw === null) return DEFAULTS[key];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  return accept(key, value);
}

export function getPreference<K extends keyof Preferences>(key: K): Preferences[K] {
  if (!cache.has(key)) cache.set(key, load(key));
  return cache.get(key) as Preferences[K];
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  cache.set(key, value);
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A preference and its setter; every component using it re-renders when it changes. */
export function usePreference<K extends keyof Preferences>(
  key: K
): [Preferences[K], (value: Preferences[K] | ((previous: Preferences[K]) => Preferences[K])) => void] {
  const value = useSyncExternalStore(subscribe, () => getPreference(key));
  const set = useCallback(
    (next: Preferences[K] | ((previous: Preferences[K]) => Preferences[K])) =>
      setPreference(key, typeof next === 'function' ? (next as (p: Preferences[K]) => Preferences[K])(getPreference(key)) : next),
    [key]
  );
  return [value, set];
}
