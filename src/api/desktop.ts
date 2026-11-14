import { invoke, isTauri } from '@tauri-apps/api/core';
import type { BitbucketPage, BitbucketPullRequest, BitbucketRepository, Integration, IntegrationKind } from '../types/integration';
import type { ReviewAnchor } from '../../shared/types/review';

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

async function integrationChange<T>(request: Promise<T>): Promise<T> {
  const value = await request;
  window.dispatchEvent(new Event('gitter:integrations-changed'));
  return value;
}

export const desktopApi = {
  listSshKeys: () => desktop<SshPublicKey[]>('list_ssh_keys'),
  copySshPublicKey: (publicKey: string) => desktop<void>('copy_ssh_public_key', { publicKey }),
  generateSshKey: (name: string, comment: string, passphrase: string) => desktop<string>('generate_ssh_key', { name, comment, passphrase }),
  testSshRemote: (remote: string) => desktop<string>('test_ssh_remote', { remote }),
  listIntegrations: () => desktop<Integration[]>('list_integrations'),
  connectIntegration: (kind: IntegrationKind, baseUrl: string, label: string, token: string) =>
    integrationChange(desktop<Integration>('connect_integration', { kind, baseUrl, label, token })),
  reconnectIntegration: (id: string, token: string) => integrationChange(desktop<void>('reconnect_integration', { id, token })),
  disconnectIntegration: (id: string) => integrationChange(desktop<void>('disconnect_integration', { id })),
  getBitbucketRepositories: (id: string, start: number, search = '') =>
    desktop<BitbucketPage<BitbucketRepository>>('bitbucket_repositories', { id, start, search }),
  getBitbucketPullRequests: (id: string, project: string, slug: string, start: number) =>
    desktop<BitbucketPage<BitbucketPullRequest>>('bitbucket_pull_requests', { id, project, slug, start }),
  getBitbucketPullRequestTemplate: (id: string, project: string, slug: string) =>
    desktop<{ text: string; source: string } | null>('bitbucket_pull_request_template', { id, project, slug }),
  getBitbucketPullRequest: (id: string, project: string, slug: string, number: number) =>
    desktop<BitbucketPullRequest>('bitbucket_pull_request', { id, project, slug, number }),
  getBitbucketReview: (id: string, project: string, slug: string, number: number) =>
    desktop<{ pull: any; diff: string; activities: any[]; builds: any[]; warnings: string[] }>('bitbucket_review', { id, project, slug, number }),
  bitbucketReviewAction: (id: string, project: string, slug: string, number: number, head: string, base: string, action: 'approve' | 'comment', body?: string, anchor?: ReviewAnchor) =>
    desktop<void>('bitbucket_review_action', { id, project, slug, number, head, base, action, body, anchor }),
  createBitbucketPullRequest: (id: string, project: string, slug: string, pullRequest: { title: string; description: string; source: string; target: string }) =>
    desktop<BitbucketPullRequest>('create_bitbucket_pull_request', { id, project, slug, pullRequest }),
};
