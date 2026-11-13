export type IntegrationKind = 'bitbucket_dc';

export interface Integration {
  id: string;
  kind: IntegrationKind;
  baseUrl: string;
  label: string;
  authenticated: boolean;
}

export interface BitbucketRepository {
  name: string;
  slug: string;
  projectKey: string;
  httpsUrl?: string | null;
  sshUrl?: string | null;
  webUrl?: string | null;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  state: string;
  author: string;
  source: string;
  target: string;
  url?: string | null;
  description?: string;
  draft?: boolean;
  createdAt?: number;
  updatedAt?: number;
  sourceProjectKey?: string;
  sourceRepositorySlug?: string;
}

export interface BitbucketPage<T> {
  values: T[];
  isLastPage: boolean;
  nextPageStart?: number | null;
}
