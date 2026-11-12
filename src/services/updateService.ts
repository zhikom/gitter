import { api } from '../api/client';
import type { UpdateInfo } from '../../shared/types/update';
import packageJson from '../../package.json';

export const CURRENT_VERSION = packageJson.version;

/** Compares dotted version numbers, ignoring a leading "v" and any pre-release suffix. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((p) => parseInt(p, 10) || 0);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export async function checkForAppUpdate(): Promise<UpdateInfo> {
  const release = await api.latestRelease();
  return {
    ...release,
    currentVersion: CURRENT_VERSION,
    hasUpdate: compareVersions(release.version, CURRENT_VERSION) > 0,
  };
}
