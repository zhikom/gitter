import type { Branch, RebaseCommitItem, Tag } from '../shared/types/git';
import { git } from './git';
import { format, records, refFormat, STATUS_ARGS } from './gitParse';
import { inRepo, UserError } from './http';

async function branches(repo: string): Promise<Branch[]> {
  const out = await git(repo, [
    'for-each-ref', 'refs/heads', 'refs/remotes',
    refFormat('%(refname)', '%(HEAD)', '%(upstream:short)', '%(upstream:track)', '%(objectname:short)', '%(symref)'),
  ]);
  return records(out)
    .filter(([, , , , , symref]) => !symref) // refs/remotes/<remote>/HEAD only points at another branch
    .map(([ref, head, upstream, track, targetHash]) => {
      const remote = ref.match(/^refs\/remotes\/([^/]+)\/(.+)$/);
      return {
        name: remote ? `${remote[1]}/${remote[2]}` : ref.replace(/^refs\/heads\//, ''),
        current: head === '*',
        isRemote: Boolean(remote),
        remoteName: remote?.[1],
        upstream: upstream || undefined,
        ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
        behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
        targetHash,
      };
    });
}

async function tags(repo: string): Promise<Tag[]> {
  // Annotated tags point at a tag object; %(*objectname) is the commit behind it.
  const out = await git(repo, [
    'for-each-ref', 'refs/tags',
    refFormat('%(refname:short)', '%(if)%(*objectname)%(then)%(*objectname:short)%(else)%(objectname:short)%(end)', '%(contents:subject)'),
  ]);
  return records(out).map(([name, targetHash, message]) => ({ name, targetHash, message: message || undefined }));
}

async function requireCleanTree(repo: string, action: string): Promise<void> {
  if ((await git(repo, STATUS_ARGS)).length > 0) {
    throw new UserError(`Commit or stash your changes before ${action}.`);
  }
}

// What undoing the latest reflog entry means depends on what that entry did.
async function undo(repo: string): Promise<string> {
  const [latest] = records(await git(repo, ['reflog', '-n1', format('%gs')]));
  if (!latest) throw new UserError('Nothing to undo.');
  const [action] = latest;
  const checkout = action.match(/^checkout: moving from (.+) to .+$/);
  if (checkout) {
    await git(repo, ['checkout', '--end-of-options', checkout[1]]);
    return `Switched back to ${checkout[1]}.`;
  }
  // Commits, merges, resets: move HEAD back and keep the changes staged.
  await git(repo, ['reset', '--soft', 'HEAD@{1}']);
  const commit = action.match(/^commit(?: \([^)]*\))?: (.*)$/);
  return commit ? `Undid the commit "${commit[1]}". Its changes are staged.` : `Undid "${action}".`;
}

async function runRebasePlan(repo: string, base: string, plan: RebaseCommitItem[]): Promise<string> {
  await requireCleanTree(repo, 'an interactive rebase');
  const branch = (await git(repo, ['branch', '--show-current'])).trim();
  const start = (await git(repo, ['rev-parse', 'HEAD'])).trim();
  try {
    await git(repo, ['reset', '--hard', '--end-of-options', base]);
    for (const item of plan) {
      const summary = item.newSummary || item.summary;
      if (item.action === 'drop') continue;
      if (item.action === 'pick') {
        await git(repo, ['cherry-pick', '--end-of-options', item.hash]);
      } else if (item.action === 'reword') {
        await git(repo, ['cherry-pick', '--end-of-options', item.hash]);
        await git(repo, ['commit', '--amend', '-F', '-'], { input: summary });
      } else if (item.action === 'squash') {
        await git(repo, ['cherry-pick', '-n', '--end-of-options', item.hash]);
        const previous = (await git(repo, ['log', '-1', '--format=%B'])).trim();
        await git(repo, ['commit', '--amend', '-F', '-'], { input: `${previous}\n\n* ${summary}` });
      } else if (item.action === 'fixup') {
        await git(repo, ['cherry-pick', '-n', '--end-of-options', item.hash]);
        await git(repo, ['commit', '--amend', '--no-edit']);
      }
    }
    return `Rewrote ${branch || 'HEAD'} onto ${base.slice(0, 7)}.`;
  } catch (e: any) {
    await git(repo, ['cherry-pick', '--abort']).catch(() => undefined); // only meaningful mid-conflict
    await git(repo, ['reset', '--hard', start]);
    throw new UserError(`Interactive rebase stopped and was undone: ${e.message}`);
  }
}

export const branchHandlers = {
  branches: inRepo((repo) => branches(repo)),

  createBranch: inRepo(async (repo, { name, startPoint = 'HEAD' }: { name: string; startPoint?: string }) => {
    await git(repo, ['branch', '--end-of-options', name, startPoint]);
  }),

  /** Checks out a branch, tag or commit. */
  checkout: inRepo(async (repo, { target }: { target: string }) => {
    await git(repo, ['checkout', '--end-of-options', target]);
  }),

  deleteBranch: inRepo(async (repo, { name, force = false }: { name: string; force?: boolean }) => {
    await git(repo, ['branch', force ? '-D' : '-d', '--end-of-options', name]);
  }),

  renameBranch: inRepo(async (repo, { from, to }: { from: string; to: string }) => {
    await git(repo, ['branch', '-m', '--end-of-options', from, to]);
  }),

  tags: inRepo((repo) => tags(repo)),

  createTag: inRepo(async (repo, { name, target = 'HEAD', message }: { name: string; target?: string; message?: string }) => {
    if (message) await git(repo, ['tag', '-a', '-F', '-', '--end-of-options', name, target], { input: message });
    else await git(repo, ['tag', '--end-of-options', name, target]);
  }),

  deleteTag: inRepo(async (repo, { name }: { name: string }) => {
    await git(repo, ['tag', '-d', '--end-of-options', name]);
  }),

  pushTag: inRepo((repo, { name, remote = 'origin' }: { name: string; remote?: string }) =>
    git(repo, ['push', '--end-of-options', remote, `refs/tags/${name}`])
  ),

  merge: inRepo((repo, { branch }: { branch: string }) => git(repo, ['merge', '--end-of-options', branch])),
  rebase: inRepo((repo, { onto }: { onto: string }) => git(repo, ['rebase', '--end-of-options', onto])),
  cherryPick: inRepo((repo, { hash }: { hash: string }) => git(repo, ['cherry-pick', '--end-of-options', hash])),
  revert: inRepo((repo, { hash }: { hash: string }) => git(repo, ['revert', '--no-edit', '--end-of-options', hash])),

  reset: inRepo(async (repo, { hash, mode }: { hash: string; mode: 'soft' | 'mixed' | 'hard' }) => {
    if (!['soft', 'mixed', 'hard'].includes(mode)) throw new UserError(`Unknown reset mode "${mode}".`);
    await git(repo, ['reset', `--${mode}`, '--end-of-options', hash]);
  }),

  undo: inRepo((repo) => undo(repo)),

  /** Commits after `base` on the current branch, oldest first, for the interactive rebase editor. */
  rebaseCommits: inRepo(async (repo, { base }: { base: string }): Promise<RebaseCommitItem[]> => {
    const out = await git(repo, ['log', '--reverse', format('%H', '%h', '%an', '%s'), `${base}..HEAD`]);
    return records(out).map(([hash, shortHash, author, summary]) => ({ hash, shortHash, author, summary, action: 'pick' }));
  }),

  runRebasePlan: inRepo((repo, { base, plan }: { base: string; plan: RebaseCommitItem[] }) => runRebasePlan(repo, base, plan)),
};
