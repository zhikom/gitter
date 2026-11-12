export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  platform: 'windows' | 'macos' | 'vscode' | 'other';
}

/** Gitter's latest published release, as the backend reads it from GitHub. */
export interface Release {
  version: string;
  title: string;
  notes: string;
  publishedAt: string;
  pageUrl: string;
  assets: ReleaseAsset[];
  /** The installer for the platform the backend runs on, if the release has one. */
  installer?: ReleaseAsset;
}

export interface UpdateInfo extends Release {
  currentVersion: string;
  hasUpdate: boolean;
}
