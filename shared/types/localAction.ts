export interface LocalAction {
  id: string;
  name: string;
  executable: string;
  args: string[];
  /** Empty means the current repository root. */
  workingDirectory: string;
  timeoutSeconds: number;
  enabled: boolean;
}

export function expandLocalActionText(text: string, variables: { path: string; branch: string; file: string }): string {
  return text.replace(/\{(path|branch|file)\}/g, (_, key: keyof typeof variables) => {
    if (key === 'file' && !variables.file) throw new Error('Select a file before running an action that uses {file}.');
    return variables[key];
  });
}

export function normalizeLocalActions(value: unknown): LocalAction[] | undefined {
  if (!Array.isArray(value) || value.length > 30) return undefined;
  const ids = new Set<string>();
  const actions: LocalAction[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const { id, name, executable, args, workingDirectory, timeoutSeconds, enabled } = item;
    const validText = (text: unknown, length: number) => typeof text === 'string' && text.length <= length && !/[\x00-\x1f\x7f]/.test(text);
    if (!validText(id, 64) || !/^[a-z0-9-]+$/.test(id) || ids.has(id) || !validText(name, 80) || !validText(executable, 1024) || !validText(workingDirectory, 1024) ||
        !Array.isArray(args) || args.length > 32 || args.some((arg) => typeof arg !== 'string' || arg.length > 4096 || arg.includes('\0')) ||
        !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300 || typeof enabled !== 'boolean') return undefined;
    ids.add(id);
    actions.push({ id, name, executable, args, workingDirectory, timeoutSeconds, enabled });
  }
  return actions;
}
