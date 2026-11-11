export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
  platform?: 'windows' | 'macos' | 'vscode' | 'other';
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTitle: string;
  changelog: string;
  publishedAt: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
  recommendedAsset?: ReleaseAsset;
}
