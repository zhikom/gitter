import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Release, ReleaseAsset } from '../shared/types/update';
import { launchInstaller } from './osIntegration';

const REPO = 'zhikom/gitter';
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

function platformOf(name: string): ReleaseAsset['platform'] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.vsix')) return 'vscode';
  if (lower.endsWith('.exe') || lower.endsWith('.msi')) return 'windows';
  if (lower.endsWith('.dmg') || lower.endsWith('.app.tar.gz')) return 'macos';
  return 'other';
}

/** The release's installer for this machine: the NSIS setup on Windows, the disk image on macOS. */
function installerFor(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  if (process.platform === 'win32') {
    return assets.find((a) => a.name.endsWith('-setup.exe')) ?? assets.find((a) => a.name.endsWith('.msi'));
  }
  if (process.platform === 'darwin') return assets.find((a) => a.name.endsWith('.dmg'));
  return undefined;
}

export async function latestRelease(): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'User-Agent': 'Gitter', Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub releases request failed (${response.status} ${response.statusText})`);
  const release: any = await response.json();
  const assets: ReleaseAsset[] = (release.assets ?? []).map((a: any) => ({
    name: a.name,
    url: a.browser_download_url,
    size: a.size ?? 0,
    platform: platformOf(a.name),
  }));
  return {
    version: String(release.tag_name ?? '').replace(/^v/, ''),
    title: release.name || release.tag_name,
    notes: release.body || '',
    publishedAt: release.published_at,
    pageUrl: release.html_url,
    assets,
    installer: installerFor(assets),
  };
}

/** Downloads a Gitter release installer and starts it. Returns where it was saved. */
export async function downloadAndInstall(downloadUrl: string): Promise<string> {
  // Checked on the parsed URL: a raw prefix check passes "…/download/../../other/repo/…".
  const url = new URL(downloadUrl);
  if (`${url.origin}${url.pathname}`.startsWith(DOWNLOAD_PREFIX) === false || url.search || url.hash) {
    throw new Error(`Updates can only be installed from ${DOWNLOAD_PREFIX}`);
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText})`);
  const installerPath = path.join(os.tmpdir(), path.basename(new URL(downloadUrl).pathname));
  await fs.promises.writeFile(installerPath, Buffer.from(await response.arrayBuffer()));
  await launchInstaller(installerPath);
  return installerPath;
}
