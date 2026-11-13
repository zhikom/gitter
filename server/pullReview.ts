import type { ReviewAnchor, ReviewCheck, ReviewComment, ReviewSnapshot } from '../shared/types/review';
import { run } from './git';
import { parseDiff } from './gitParse';
import { inRepo, UserError } from './http';

/** Restrict API calls to the actual github.com pull request supplied by the list. */
export function githubPullTarget(url: string, number: number): { owner: string; repo: string; number: number } {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new UserError('Invalid GitHub pull request URL.'); }
  const match = parsed.pathname.match(/^\/([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]+)\/pull\/(\d+)\/?$/i);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || !match || Number(match[3]) !== number || !Number.isSafeInteger(number) || number < 1) {
    throw new UserError('Invalid GitHub pull request URL.');
  }
  return { owner: match[1], repo: match[2], number };
}

type Gh = (repo: string, args: string[], input?: string) => Promise<string>;
const gh: Gh = (repo, args, input) => run('gh', repo, args, { input, env: { GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } });
const list = (raw: string): any[] => {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new UserError('The provider returned an invalid list.');
  return parsed.flatMap((page: any) => Array.isArray(page) ? page : [page]);
};
const endpoint = (url: string, number: number) => {
  const target = githubPullTarget(url, number);
  return `/repos/${target.owner}/${target.repo}`;
};

function validateAnchor(anchor: ReviewAnchor) {
  if (!anchor || typeof anchor.path !== 'string' || !anchor.path || anchor.path.includes('\0') || !Number.isSafeInteger(anchor.line) || anchor.line < 1 || !['LEFT', 'RIGHT'].includes(anchor.side) || !['add', 'delete', 'context'].includes(anchor.lineType)) throw new UserError('Choose a line in the pull request diff.');
}
function validateBody(body: string) {
  if (typeof body !== 'string' || !body.trim() || body.length > 65_000) throw new UserError('Enter a comment up to 65,000 characters.');
}

export function createGitHubReviewHandlers(command: Gh = gh) {
  const get = (repo: string, target: string, options: string[] = []) => command(repo, ['api', '--hostname', 'github.com', ...options, target]);
  return {
    githubReview: inRepo(async (repo, { url, number }: { url: string; number: number }): Promise<ReviewSnapshot> => {
      const root = endpoint(url, number);
      const pr = JSON.parse(await get(repo, `${root}/pulls/${number}`));
      const headHash = String(pr.head?.sha || '');
      const baseHash = String(pr.base?.sha || '');
      if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(headHash) || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(baseHash)) throw new UserError('GitHub did not return the pull request revisions.');
      const jobs = await Promise.allSettled([
        get(repo, `${root}/pulls/${number}`, ['-H', 'Accept: application/vnd.github.v3.diff']),
        get(repo, `${root}/pulls/${number}/comments?per_page=100`, ['--paginate', '--slurp']),
        get(repo, `${root}/issues/${number}/comments?per_page=100`, ['--paginate', '--slurp']),
        get(repo, `${root}/pulls/${number}/reviews?per_page=100`, ['--paginate', '--slurp']),
        get(repo, `${root}/commits/${headHash}/check-runs?per_page=100`, ['--paginate', '--slurp']),
        get(repo, `${root}/commits/${headHash}/status`, []),
      ]);
      if (jobs[0].status === 'rejected') throw new UserError(`Could not load the pull request diff: ${jobs[0].reason?.message || jobs[0].reason}`);
      if (Buffer.byteLength(jobs[0].value, 'utf8') > 20_000_000) throw new UserError('The pull request diff exceeds 20 MB.');
      const warnings: string[] = [];
      const value = (index: number, label: string) => {
        const result = jobs[index];
        if (result.status === 'rejected') { warnings.push(`Could not load ${label}: ${result.reason?.message || result.reason}`); return ''; }
        return result.value;
      };
      const comments: ReviewComment[] = [];
      const inline = value(1, 'inline comments');
      if (inline) for (const item of list(inline)) comments.push({
        id: String(item.id), author: item.user?.login || 'unknown', body: item.body || '', createdAt: item.created_at || '', path: item.path,
        line: item.line ?? item.original_line ?? undefined, side: item.side || undefined, outdated: item.position === null, url: item.html_url,
      });
      const discussion = value(2, 'discussion comments');
      if (discussion) for (const item of list(discussion)) comments.push({ id: `discussion-${item.id}`, author: item.user?.login || 'unknown', body: item.body || '', createdAt: item.created_at || '', url: item.html_url });
      const reviews = value(3, 'reviews');
      const approvals = reviews ? list(reviews).filter((item) => item.state && item.state !== 'PENDING').map((item) => ({ author: item.user?.login || 'unknown', state: item.state })) : [];
      const checks: ReviewCheck[] = [];
      const checkRuns = value(4, 'check runs');
      if (checkRuns) for (const page of list(checkRuns)) for (const check of page.check_runs || []) checks.push({ name: check.name, state: check.conclusion || check.status, url: check.html_url || undefined });
      const statuses = value(5, 'commit statuses');
      if (statuses) for (const status of JSON.parse(statuses).statuses || []) checks.push({ name: status.context, state: status.state, url: status.target_url || undefined });
      const latest = JSON.parse(await get(repo, `${root}/pulls/${number}`));
      if (latest.head?.sha !== headHash || latest.base?.sha !== baseHash) throw new UserError('The pull request changed while loading. Refresh and try again.');
      return { headHash, baseHash, files: parseDiff(jobs[0].value), comments, approvals, checks, warnings };
    }),
    githubReviewComment: inRepo(async (repo, { url, number, headHash, baseHash, anchor, body }: { url: string; number: number; headHash: string; baseHash: string; anchor: ReviewAnchor; body: string }) => {
      const root = endpoint(url, number); validateAnchor(anchor); validateBody(body);
      if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(headHash) || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(baseHash)) throw new UserError('Reload the pull request before commenting.');
      const current = JSON.parse(await get(repo, `${root}/pulls/${number}`));
      if (current.head?.sha !== headHash || current.base?.sha !== baseHash) throw new UserError('The pull request changed. Refresh the review before commenting.');
      await command(repo, ['api', '--hostname', 'github.com', '--method', 'POST', `${root}/pulls/${number}/comments`, '--input', '-'], JSON.stringify({ body: body.trim(), commit_id: headHash, path: anchor.path, line: anchor.line, side: anchor.side }));
    }),
    githubApproveReview: inRepo(async (repo, { url, number, headHash, baseHash }: { url: string; number: number; headHash: string; baseHash: string }) => {
      const root = endpoint(url, number);
      if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(headHash) || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(baseHash)) throw new UserError('Reload the pull request before approving.');
      const current = JSON.parse(await get(repo, `${root}/pulls/${number}`));
      if (current.head?.sha !== headHash || current.base?.sha !== baseHash) throw new UserError('The pull request changed. Refresh the review before approving.');
      await command(repo, ['api', '--hostname', 'github.com', '--method', 'POST', `${root}/pulls/${number}/reviews`, '--input', '-'], JSON.stringify({ event: 'APPROVE', commit_id: headHash }));
    }),
  };
}

export const githubReviewHandlers = createGitHubReviewHandlers();
