import { invoke, isTauri } from '@tauri-apps/api/core';
import type { BitbucketPage, BitbucketPullRequest, BitbucketRepository, Integration, IntegrationKind } from '../types/integration';

export interface SshPublicKey {
  path: string;
  publicKey: string;
  fingerprint: string;
  privateKeyExists: boolean;
  loadedInAgent: boolean;
}

function desktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error('This feature is available in the desktop app.'));
  return invoke<T>(command, args);
}

export const desktopApi = {
  listSshKeys: () => desktop<SshPublicKey[]>('list_ssh_keys'),
  copySshPublicKey: (publicKey: string) => desktop<void>('copy_ssh_public_key', { publicKey }),
  generateSshKey: (name: string, comment: string, passphrase: string) => desktop<string>('generate_ssh_key', { name, comment, passphrase }),
  testSshRemote: (remote: string) => desktop<string>('test_ssh_remote', { remote }),
  listIntegrations: () => desktop<Integration[]>('list_integrations'),
  connectIntegration: (kind: IntegrationKind, baseUrl: string, label: string, token: string) =>
    desktop<Integration>('connect_integration', { kind, baseUrl, label, token }),
  disconnectIntegration: (id: string) => desktop<void>('disconnect_integration', { id }),
  saveGitHttpsCredential: (id: string, username: string) => desktop<void>('save_git_https_credential', { id, username }),
  getBitbucketRepositories: (id: string, start: number, search = '') =>
    desktop<BitbucketPage<BitbucketRepository>>('bitbucket_repositories', { id, start, search }),
  getBitbucketPullRequests: (id: string, project: string, slug: string, start: number) =>
    desktop<BitbucketPage<BitbucketPullRequest>>('bitbucket_pull_requests', { id, project, slug, start }),
  createBitbucketPullRequest: (id: string, project: string, slug: string, pullRequest: { title: string; description: string; source: string; target: string }) =>
    desktop<BitbucketPullRequest>('create_bitbucket_pull_request', { id, project, slug, pullRequest }),
};
