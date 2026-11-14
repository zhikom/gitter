export const TOOLBAR_ACTIONS = ['pull', 'push', 'new-branch', 'stash', 'pop-stash', 'undo', 'fetch', 'reflog', 'worktrees', 'gitflow', 'pull-request', 'lanes', 'reveal', 'open-in', 'history-search', 'stage-all'] as const;
export type ToolbarAction = typeof TOOLBAR_ACTIONS[number];
export const MAX_TOOLBAR_ACTIONS = 6;
export const DEFAULT_TOOLBAR_ACTIONS: ToolbarAction[] = ['pull', 'push', 'new-branch', 'stash', 'pop-stash', 'undo'];

export function normalizeToolbarActions(value: unknown): ToolbarAction[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_TOOLBAR_ACTIONS || value.some((id) => typeof id !== 'string' || !TOOLBAR_ACTIONS.includes(id as ToolbarAction)) || new Set(value).size !== value.length) return undefined;
  return value as ToolbarAction[];
}
