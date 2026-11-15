import fs from 'node:fs';
import path from 'node:path';

/** Normalize case and separators only; do not infer 8.3 aliases from their spelling. */
export function samePath(a: string, b: string, windows = process.platform === 'win32'): boolean {
  if (windows) return path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();
  return path.normalize(a) === path.normalize(b);
}

/** Ask the operating system to resolve junctions, symlinks and Windows short names. */
function realPath(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return fs.realpathSync(value);
  }
}

/** Compare existing directories by their resolved path or filesystem identity. */
export function sameDirectory(a: string, b: string): boolean {
  try {
    const first = fs.statSync(a, { bigint: true });
    const second = fs.statSync(b, { bigint: true });
    if (!first.isDirectory() || !second.isDirectory()) return false;
    if (samePath(realPath(a), realPath(b))) return true;
    return first.ino !== 0n && second.ino !== 0n && first.dev === second.dev && first.ino === second.ino;
  } catch {
    return false;
  }
}

/** A resolved directory belongs to a worktree only if an ancestor is that worktree. */
export function directoryWithin(directory: string, root: string): boolean {
  try {
    let current = realPath(directory);
    for (let depth = 0; depth < 128; depth++) {
      if (sameDirectory(current, root)) return true;
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  } catch {
    /* A deleted or inaccessible directory cannot be safely matched. */
  }
  return false;
}
