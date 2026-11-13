export type OpenInKind = 'vscode' | 'rider' | 'codex' | 'claude' | 'terminal' | 'application' | 'command';

export interface OpenInApp {
  id: string;
  name: string;
  kind: OpenInKind;
  enabled: boolean;
  /** Application name/path or executable for custom entries. */
  target: string;
  /** Each entry is a separate argument; {path} is replaced with the repository. */
  args: string[];
}

export const DEFAULT_OPEN_IN_APPS: OpenInApp[] = [
  { id: 'vscode', name: 'Visual Studio Code', kind: 'vscode', enabled: true, target: '', args: [] },
  { id: 'rider', name: 'Rider', kind: 'rider', enabled: true, target: '', args: [] },
  { id: 'codex', name: 'Codex', kind: 'codex', enabled: true, target: '', args: [] },
  { id: 'claude', name: 'Claude Code', kind: 'claude', enabled: true, target: '', args: [] },
  { id: 'terminal', name: 'Terminal', kind: 'terminal', enabled: true, target: '', args: [] },
];
