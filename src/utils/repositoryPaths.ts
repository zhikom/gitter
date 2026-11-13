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
