import type { PullRequest, Remote } from '../../shared/types/git';
import type { BitbucketPage, BitbucketPullRequest, Integration } from '../types/integration';

export interface BitbucketTarget {
  connection: Integration;
  projectKey: string;
  slug: string;
  remoteName: string;
}

/** Match only the configured Bitbucket host, never send its token to a Git remote. */
export function matchBitbucketRemote(remote: Remote, connections: Integration[]): BitbucketTarget | null {
  const raw = remote.fetchUrl.trim();
  let host = '', pathname = '', protocol = '', port = '';
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:', 'ssh:'].includes(parsed.protocol)) return null;
    host = parsed.hostname.toLowerCase(); pathname = parsed.pathname; protocol = parsed.protocol; port = parsed.port;
  } catch {
    const scp = raw.match(/^(?:[^@/:\s]+@)?([^/:\s]+):(.+)$/);
    if (!scp) return null;
    host = scp[1].toLowerCase(); pathname = `/${scp[2]}`; protocol = 'ssh:';
  }
  for (const connection of connections) {
    if (connection.kind !== 'bitbucket_dc') continue;
    let base: URL;
    try { base = new URL(connection.baseUrl); } catch { continue; }
    if (base.hostname.toLowerCase() !== host) continue;
    if (protocol !== 'ssh:' && (base.protocol !== protocol || base.port !== port)) continue;
    let rest = pathname.replace(/^\/+|\/+$/g, '');
    if (protocol !== 'ssh:') {
      const prefix = base.pathname.replace(/^\/+|\/+$/g, '');
      if (prefix) {
        if (!rest.startsWith(`${prefix}/`)) continue;
        rest = rest.slice(prefix.length + 1);
      }
      if (!rest.startsWith('scm/')) continue;
      rest = rest.slice(4);
    }
    const parts = rest.split('/');
    if (parts.length !== 2) continue;
    try {
      const projectKey = decodeURIComponent(parts[0]);
      const slug = decodeURIComponent(parts[1]).replace(/\.git$/i, '');
      if (!projectKey || !slug || /[\/\\\0]/.test(projectKey + slug)) continue;
      return { connection, projectKey, slug, remoteName: remote.name };
    } catch { continue; }
  }
  return null;
}

export function bitbucketPrToPullRequest(pr: BitbucketPullRequest, target: BitbucketTarget): PullRequest {
  const date = (timestamp?: number) => typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  const base = target.connection.baseUrl.replace(/\/+$/, '');
  return {
    number: pr.id, title: pr.title, body: pr.description || '', author: { login: pr.author || 'unknown' },
    headRefName: pr.source, baseRefName: pr.target, state: pr.state === 'MERGED' ? 'MERGED' : pr.state === 'OPEN' ? 'OPEN' : 'CLOSED',
    url: pr.url || `${base}/projects/${encodeURIComponent(target.projectKey)}/repos/${encodeURIComponent(target.slug)}/pull-requests/${pr.id}`,
    createdAt: date(pr.createdAt), updatedAt: date(pr.updatedAt), isDraft: Boolean(pr.draft),
    provider: { kind: 'bitbucket_dc', connectionId: target.connection.id, projectKey: target.projectKey, slug: target.slug, remoteName: target.remoteName,
      sourceProjectKey: pr.sourceProjectKey || undefined, sourceRepositorySlug: pr.sourceRepositorySlug || undefined },
  };
}

export async function loadBitbucketPullRequests(target: BitbucketTarget, loadPage: (start: number) => Promise<BitbucketPage<BitbucketPullRequest>>): Promise<PullRequest[]> {
  const pulls: PullRequest[] = [];
  let start = 0;
  for (;;) {
    const page = await loadPage(start);
    pulls.push(...page.values.map((pr) => bitbucketPrToPullRequest(pr, target)));
    if (page.isLastPage) return pulls;
    if (page.nextPageStart == null || page.nextPageStart <= start) throw new Error('Bitbucket returned an invalid next page for pull requests.');
    start = page.nextPageStart;
  }
}
