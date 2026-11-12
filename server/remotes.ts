import type { PullRequest, Remote } from '../shared/types/git';
import { git, run } from './git';
import { inRepo, UserError } from './http';

const PR_FIELDS = 'number,title,author,headRefName,baseRefName,state,url,createdAt,updatedAt,isDraft';

function gh(repo: string, args: string[]): Promise<string> {
  return run('gh', repo, args, { env: { GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } });
}

function checkPr(number: number): string {
  if (!Number.isInteger(number) || number <= 0) throw new UserError(`No pull request #${number}.`);
  return String(number);
}

function toPullRequest(item: any): PullRequest {
  return { ...item, author: { login: item.author?.login ?? 'ghost' } };
}

async function remotes(repo: string): Promise<Remote[]> {
  const byName = new Map<string, Remote>();
  // Lines read "<name>\t<url> (fetch)"; the URL itself may contain spaces.
  for (const line of (await git(repo, ['remote', '-v'])).split('\n')) {
    const match = line.match(/^(\S+)\t(.*) \((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, kind] = match;
    const remote = byName.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (kind === 'fetch') remote.fetchUrl = url;
    else remote.pushUrl = url;
    byName.set(name, remote);
  }
  return [...byName.values()];
}

export const remoteHandlers = {
  remotes: inRepo((repo) => remotes(repo)),

  /** Fetches one remote, or every remote when none is named. */
  fetch: inRepo((repo, { remote }: { remote?: string }) =>
    git(repo, remote ? ['fetch', '--prune', '--end-of-options', remote] : ['fetch', '--all', '--prune'])
  ),

  /**
   * Pulls the current branch's upstream, or `branch` from `remote` when given.
   * Without `rebase`, the repository's pull.rebase setting decides.
   */
  pull: inRepo((repo, { remote, branch, rebase }: { remote?: string; branch?: string; rebase?: boolean }) =>
    git(repo, [
      'pull',
      ...(rebase === undefined ? [] : [rebase ? '--rebase' : '--no-rebase']),
      ...(remote ? ['--end-of-options', remote, ...(branch ? [branch] : [])] : []),
    ])
  ),

  /**
   * Pushes a branch (the checked-out one by default) to the branch it tracks. A
   * branch that tracks nothing yet goes to origin under its own name and starts
   * tracking it.
   */
  push: inRepo(async (repo, { branch, forceWithLease = false }: { branch?: string; forceWithLease?: boolean }) => {
    const target = branch || (await git(repo, ['branch', '--show-current'])).trim();
    if (!target) throw new UserError('Check out a branch to push.');
    const config = (key: string) => git(repo, ['config', '--get', `branch.${target}.${key}`]).then((v) => v.trim(), () => '');
    const [trackedRemote, trackedRef] = await Promise.all([config('remote'), config('merge')]);
    const force = forceWithLease ? ['--force-with-lease'] : [];
    if (trackedRemote && trackedRef) {
      return git(repo, ['push', ...force, '--end-of-options', trackedRemote, `refs/heads/${target}:${trackedRef}`]);
    }
    return git(repo, ['push', '-u', ...force, '--end-of-options', 'origin', target]);
  }),

  pullRequests: inRepo(async (repo, { state = 'open' }: { state?: 'open' | 'closed' | 'all' }) =>
    (JSON.parse(await gh(repo, ['pr', 'list', `--state=${state}`, `--json=${PR_FIELDS}`])) as any[]).map(toPullRequest)
  ),

  pullRequest: inRepo(async (repo, { number }: { number: number }) =>
    toPullRequest(
      // checkPr throws for anything but a pull request number.
      JSON.parse(
        await gh(repo, ['pr', 'view', checkPr(number), `--json=${PR_FIELDS},body,mergeable,additions,deletions,changedFiles`])
      )
    )
  ),

  createPullRequest: inRepo(
    async (repo, { title, body, head, base, draft = false }: { title: string; body: string; head: string; base: string; draft?: boolean }) => {
      const out = await gh(repo, ['pr', 'create', '--title', title, '--body', body, '--head', head, '--base', base, ...(draft ? ['--draft'] : [])]);
      const url = out.match(/https:\/\/\S+\/pull\/(\d+)/);
      return { url: url?.[0] ?? out.trim(), number: url ? Number(url[1]) : 0 };
    }
  ),

  checkoutPullRequest: inRepo((repo, { number }: { number: number }) => gh(repo, ['pr', 'checkout', checkPr(number)])),
};
