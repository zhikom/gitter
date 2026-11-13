export type IntegrationKind = 'bitbucket_dc';

export interface Integration {
  id: string;
  kind: IntegrationKind;
  baseUrl: string;
  label: string;
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
}

export interface BitbucketPage<T> {
  values: T[];
  isLastPage: boolean;
  nextPageStart?: number | null;
}
