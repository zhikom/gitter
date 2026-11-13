/** Suggest a directory name for HTTPS, SSH and scp-style Git remotes. */
export function repositoryNameFromUrl(remote: string): string {
  const trimmed = remote.trim().split(/[?#]/, 1)[0].replace(/[\\/]+$/, '');
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'), trimmed.lastIndexOf(':'));
  let name = trimmed.slice(separator + 1).replace(/\.git$/i, '');
  try { name = decodeURIComponent(name); } catch { /* Preserve a malformed literal URL. */ }
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) return '';
  return name;
}

export function joinRepoFolder(folder: string, name: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${name}`;
}

/** Parent directory of a recently opened repository, on either desktop OS. */
export function repositoryParent(folder: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '');
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (separator < 0) return '';
  if (separator === 0) return trimmed[0];
  if (separator === 2 && /^[A-Za-z]:/.test(trimmed)) return trimmed.slice(0, 3);
  return trimmed.slice(0, separator);
}
