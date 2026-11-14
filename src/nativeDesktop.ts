import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import type { FileStatus, RepositoryState } from '../shared/types/git';
import { isMac, type Command } from './commands';

/** Keep private paths out of window titles, which the OS may show elsewhere. */
export function repositoryWindowTitle(repo: string, state: RepositoryState | null, statuses: FileStatus[]): string {
  if (!repo) return 'Gitter';
  const clean = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
  const name = clean(repo.split(/[\\/]/).filter(Boolean).pop() || 'Repository');
  const sameRepo = state && state.path.replace(/\\/g, '/').toLowerCase() === repo.replace(/\\/g, '/').toLowerCase();
  if (!sameRepo) return name;
  const branch = clean(state.currentBranch || '');
  const changed = new Set(statuses.map((status) => status.path)).size;
  return [name, branch && `${state.isDetached ? 'detached ' : ''}${branch}`, !state.isClean && (changed ? `${changed} changed` : 'changes')].filter(Boolean).join(' — ');
}

const nativeLabels: Record<string, string> = {
  settings: 'Settings…', 'check-updates': 'Check for Updates…', repositories: 'Open Repository…',
  'new-tab': 'Open Repository in New Tab…', 'close-tab': 'Close Tab', reveal: 'Show in Finder', 'open-in': 'Open In…',
  fetch: 'Fetch All Remotes', pull: 'Pull', 'pull-rebase': 'Pull with Rebase', push: 'Push', 'push-force': 'Push with Force-with-Lease',
  'new-branch': 'New Branch…', 'pull-request': 'New Pull Request…', stash: 'Stash Changes…', 'pop-stash': 'Pop Latest Stash',
  'stage-all': 'Stage All Changes', undo: 'Undo Last Git Action', 'history-search': 'Search History…', reflog: 'Reflog…',
  worktrees: 'Worktrees…', 'toggle-sidebar': 'Sidebar', 'toggle-staging': 'Working Tree', 'toggle-assistant': 'Assistant',
  'agent-rail': 'Agent Rail', 'zoom-in': 'Zoom In', 'zoom-out': 'Zoom Out', 'zoom-reset': 'Actual Size', palette: 'Command Palette…', refresh: 'Reload Repository', guide: 'Gitter User Guide',
};

export interface NativeMenuItemState { id: string; title: string; enabled: boolean; accelerator: string | null }

/** Custom shortcuts remain in the webview so they don't steal text-field keys. */
export function nativeMenuItems(commands: Command[], blocked: boolean): NativeMenuItemState[] {
  return Object.entries(nativeLabels).map(([id, label]) => {
    const command = commands.find((item) => item.id === id);
    const toggle = id.startsWith('toggle-') || id === 'agent-rail';
    const title = toggle && command ? `${command.title.toLowerCase().startsWith('hide') ? 'Hide' : 'Show'} ${label}` : label;
    const accelerator = command?.shortcut && !command.notInTextFields
      ? command.shortcut.split('+').map((part) => part === 'Mod' ? 'Cmd' : part).join('+')
      : null;
    return { id, title, enabled: !blocked && !!command && command.enabled !== false, accelerator };
  });
}

let titleQueue: Promise<unknown> = Promise.resolve();
let menuQueue: Promise<unknown> = Promise.resolve();

/** Update the real desktop window as tabs, branches, and working-tree state change. */
export function useRepositoryWindowTitle(repo: string, state: RepositoryState | null, statuses: FileStatus[]): void {
  const title = repositoryWindowTitle(repo, state, statuses);
  useEffect(() => {
    document.title = title;
    if (!isTauri()) return;
    titleQueue = titleQueue.catch(() => undefined).then(() => invoke('set_window_title', { title }));
    void titleQueue.catch(() => undefined);
  }, [title]);
}

/** Native menu actions use the latest app commands, including their enabled state. */
export function useNativeMenu(commands: Command[], blocked: boolean): void {
  const current = useRef({ commands, blocked });
  current.current = { commands, blocked };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isTauri() || !isMac) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    listen<string>('gitter:menu-action', ({ payload }) => {
      const { commands: latest, blocked: modalOpen } = current.current;
      if (modalOpen || document.querySelector('[role="dialog"]')) return;
      const command = latest.find((item) => item.id === payload);
      if (command && command.enabled !== false) command.run();
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else { stop = unlisten; setReady(true); }
    }).catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }, []);
  const serialized = JSON.stringify(nativeMenuItems(commands, blocked));
  useEffect(() => {
    if (!ready) return;
    const items: NativeMenuItemState[] = JSON.parse(serialized);
    menuQueue = menuQueue.catch(() => undefined).then(() => invoke('sync_native_menu', { items }));
    void menuQueue.catch(() => undefined);
  }, [ready, serialized]);
}
