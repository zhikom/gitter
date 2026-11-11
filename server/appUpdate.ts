import fs from 'fs';
import os from 'os';
import path from 'path';
import { launchInstaller } from './osIntegration';

const REPO = 'zhikom/gitter';
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export async function fetchLatestRelease(): Promise<unknown> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'User-Agent': 'Gitter', Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub releases request failed (${response.status} ${response.statusText})`);
  return response.json();
}

/** Downloads a Gitter release installer and starts it. Returns where it was saved. */
export async function downloadAndInstall(downloadUrl: string): Promise<string> {
  // The installer runs with the user's rights, so only Gitter's own release assets qualify.
  if (!downloadUrl.startsWith(DOWNLOAD_PREFIX)) {
    throw new Error(`Updates can only be installed from ${DOWNLOAD_PREFIX}`);
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText})`);
  const installerPath = path.join(os.tmpdir(), path.basename(new URL(downloadUrl).pathname));
  await fs.promises.writeFile(installerPath, Buffer.from(await response.arrayBuffer()));
  await launchInstaller(installerPath);
  return installerPath;
}
