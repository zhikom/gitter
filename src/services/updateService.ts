import { ReleaseAsset, UpdateInfo } from '../types/update';
import packageJson from '../../package.json';

export const CURRENT_VERSION = packageJson.version;

/**
 * Compare two semver strings (e.g. "1.0.1" and "1.0.0").
 * Returns > 0 if v1 > v2, < 0 if v1 < v2, and 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const cleanV1 = v1.replace(/^v/, '').trim();
  const cleanV2 = v2.replace(/^v/, '').trim();

  const parts1 = cleanV1.split('-')[0].split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = cleanV2.split('-')[0].split('.').map((p) => parseInt(p, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

export function detectUserPlatform(): 'windows' | 'macos' | 'linux' {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('linux')) return 'linux';
  }
  return 'windows';
}

function categorizeAsset(name: string): 'windows' | 'macos' | 'linux' | 'vscode' | 'other' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.vsix')) return 'vscode';
  if (lower.endsWith('.exe') || lower.endsWith('.msi')) return 'windows';
  if (lower.endsWith('.dmg') || lower.includes('macos') || lower.includes('universal.app')) return 'macos';
  if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm')) return 'linux';
  return 'other';
}

export async function checkForAppUpdate(): Promise<UpdateInfo> {
  const platform = detectUserPlatform();
  let releaseData: any = null;

  try {
    // 1. Try fetching directly from GitHub Releases API
    const res = await fetch('https://api.github.com/repos/zhikom/gitter/releases/latest', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.ok) {
      releaseData = await res.json();
    }
  } catch (err) {
    console.warn('Direct GitHub releases check failed, trying backend fallback...', err);
  }

  // 2. Fallback to local server proxy if direct request was blocked
  if (!releaseData) {
    try {
      const res = await fetch('http://localhost:3001/api/app/check-update');
      if (res.ok) {
        releaseData = await res.json();
      }
    } catch (e) {
      console.warn('Backend proxy update check failed:', e);
    }
  }

  if (!releaseData || !releaseData.tag_name) {
    throw new Error('Unable to check for updates. Please check your internet connection or try again later.');
  }

  const latestTag = releaseData.tag_name;
  const latestVersion = latestTag.replace(/^v/, '');
  const hasUpdate = compareSemver(latestVersion, CURRENT_VERSION) > 0;

  const rawAssets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
  const assets: ReleaseAsset[] = rawAssets.map((a: any) => ({
    name: a.name,
    browser_download_url: a.browser_download_url,
    size: a.size || 0,
    content_type: a.content_type || 'application/octet-stream',
    platform: categorizeAsset(a.name),
  }));

  // Find the recommended asset for the user's platform
  let recommendedAsset: ReleaseAsset | undefined = undefined;
  if (platform === 'windows') {
    recommendedAsset =
      assets.find((a) => a.name.endsWith('-setup.exe') || a.name.endsWith('.exe')) ||
      assets.find((a) => a.name.endsWith('.msi'));
  } else if (platform === 'macos') {
    recommendedAsset = assets.find((a) => a.name.endsWith('.dmg'));
  } else if (platform === 'linux') {
    recommendedAsset =
      assets.find((a) => a.name.endsWith('.AppImage')) ||
      assets.find((a) => a.name.endsWith('.deb'));
  }

  return {
    hasUpdate,
    currentVersion: CURRENT_VERSION,
    latestVersion,
    releaseTitle: releaseData.name || latestTag,
    changelog: releaseData.body || 'No release notes provided.',
    publishedAt: releaseData.published_at || new Date().toISOString(),
    htmlUrl: releaseData.html_url || `https://github.com/zhikom/gitter/releases/tag/${latestTag}`,
    assets,
    recommendedAsset,
  };
}
