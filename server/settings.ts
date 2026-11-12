// Per-repository settings. Values git itself understands live in the repo's
// local git config, so git and every other tool see them; only settings git has
// no notion of (gitflow branch names, the diff tool) live in Gitter's own store.
import { CommandError, git } from './git';
import { inRepo, UserError } from './http';
import { readDoc, updateDoc } from './repoStore';

export interface GitflowConfig {
  masterBranch: string;
  developBranch: string;
  featurePrefix: string;
  releasePrefix: string;
  hotfixPrefix: string;
}

export interface RepoSettings {
  /** Local overrides; empty means the global value applies. */
  userName: string;
  userEmail: string;
  /** null leaves git's default in place. */
  pullRebase: boolean | null;
  autocrlf: 'true' | 'false' | 'input' | null;
  gpgSign: boolean;
  signingKey: string;
  gpgFormat: string;
  gitflow: GitflowConfig;
  /** A diff tool command line with %1 (old file) and %2 (new file); empty picks one automatically. */
  diffTool: string;
}

interface GitterSettings {
  gitflow: GitflowConfig & { initialized: boolean };
  diffTool: string;
}

const GITTER_DEFAULTS: GitterSettings = {
  gitflow: {
    initialized: false,
    masterBranch: 'main',
    developBranch: 'develop',
    featurePrefix: 'feature/',
    releasePrefix: 'release/',
    hotfixPrefix: 'hotfix/',
  },
  diffTool: '',
};

const GIT_KEYS = {
  userName: 'user.name',
  userEmail: 'user.email',
  pullRebase: 'pull.rebase',
  autocrlf: 'core.autocrlf',
  gpgSign: 'commit.gpgsign',
  signingKey: 'user.signingkey',
  gpgFormat: 'gpg.format',
} as const;

/** A config value, or '' when unset. `git config --get` exits 1 for an unset key. */
async function configValue(repo: string, key: string, scope: string[] = []): Promise<string> {
  return git(repo, ['config', ...scope, '--get', key]).then(
    (v) => v.trim(),
    (e) => {
      if (e instanceof CommandError && e.code === 1) return '';
      throw e;
    }
  );
}

export function gitterSettings(repo: string): Promise<GitterSettings> {
  return readDoc(repo, 'settings', GITTER_DEFAULTS);
}

async function repoSettings(repo: string) {
  const local = (key: string) => configValue(repo, key, ['--local']);
  const [userName, userEmail, pullRebase, autocrlf, gpgSign, signingKey, gpgFormat, globalName, globalEmail, gitter] =
    await Promise.all([
      local(GIT_KEYS.userName),
      local(GIT_KEYS.userEmail),
      configValue(repo, GIT_KEYS.pullRebase),
      configValue(repo, GIT_KEYS.autocrlf),
      configValue(repo, GIT_KEYS.gpgSign),
      configValue(repo, GIT_KEYS.signingKey),
      configValue(repo, GIT_KEYS.gpgFormat),
      configValue(repo, GIT_KEYS.userName, ['--global']),
      configValue(repo, GIT_KEYS.userEmail, ['--global']),
      gitterSettings(repo),
    ]);
  const { initialized: _, ...gitflow } = gitter.gitflow;
  const settings: RepoSettings = {
    userName,
    userEmail,
    pullRebase: pullRebase ? pullRebase === 'true' : null,
    autocrlf: (autocrlf || null) as RepoSettings['autocrlf'],
    gpgSign: gpgSign === 'true',
    signingKey,
    gpgFormat,
    gitflow,
    diffTool: gitter.diffTool,
  };
  return { settings, inherited: { userName: globalName, userEmail: globalEmail } };
}

async function saveRepoSettings(repo: string, changes: Partial<RepoSettings>): Promise<void> {
  for (const [field, key] of Object.entries(GIT_KEYS) as Array<[keyof typeof GIT_KEYS, string]>) {
    if (!(field in changes)) continue;
    const value = changes[field];
    if (value === null || value === '') {
      // Exit code 5: the key was not set, which is what we wanted anyway.
      await git(repo, ['config', '--local', '--unset', key]).catch((e) => {
        if (!(e instanceof CommandError && e.code === 5)) throw e;
      });
    } else {
      await git(repo, ['config', '--local', key, String(value)]);
    }
  }
  if (changes.gitflow || changes.diffTool !== undefined) {
    await updateDoc(repo, 'settings', GITTER_DEFAULTS, (doc) => ({
      ...doc,
      gitflow: { ...doc.gitflow, ...changes.gitflow },
      diffTool: changes.diffTool ?? doc.diffTool,
    }));
  }
}

type FlowType = 'feature' | 'release' | 'hotfix';

// Where each kind of gitflow branch starts and where finishing it merges.
function flow(config: GitflowConfig, type: FlowType) {
  switch (type) {
    case 'feature':
      return { prefix: config.featurePrefix, base: config.developBranch, mergeInto: [config.developBranch], tag: false };
    case 'release':
      return { prefix: config.releasePrefix, base: config.developBranch, mergeInto: [config.masterBranch, config.developBranch], tag: true };
    case 'hotfix':
      return { prefix: config.hotfixPrefix, base: config.masterBranch, mergeInto: [config.masterBranch, config.developBranch], tag: true };
    default:
      throw new UserError(`Unknown gitflow branch type "${type}".`);
  }
}

async function localBranches(repo: string): Promise<string[]> {
  return (await git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).split('\n').filter(Boolean);
}

export const settingsHandlers = {
  repoSettings: inRepo((repo) => repoSettings(repo)),

  saveRepoSettings: inRepo((repo, { settings }: { settings: Partial<RepoSettings> }) => saveRepoSettings(repo, settings)),

  gitflowStatus: inRepo(async (repo) => {
    const { gitflow } = await gitterSettings(repo);
    const branches = await localBranches(repo);
    const named = (prefix: string) => branches.filter((b) => b.startsWith(prefix)).map((b) => b.slice(prefix.length));
    return {
      initialized: gitflow.initialized || (branches.includes(gitflow.masterBranch) && branches.includes(gitflow.developBranch)),
      config: gitflow,
      currentBranch: (await git(repo, ['branch', '--show-current'])).trim(),
      features: named(gitflow.featurePrefix),
      releases: named(gitflow.releasePrefix),
      hotfixes: named(gitflow.hotfixPrefix),
    };
  }),

  gitflowInit: inRepo(async (repo, { config }: { config: Partial<GitflowConfig> }) => {
    const saved = await updateDoc(repo, 'settings', GITTER_DEFAULTS, (doc) => ({
      ...doc,
      gitflow: { ...doc.gitflow, ...config, initialized: true },
    }));
    const { masterBranch, developBranch } = saved.gitflow;
    const branches = await localBranches(repo);
    if (!branches.includes(developBranch)) {
      await git(repo, ['branch', '--end-of-options', developBranch, branches.includes(masterBranch) ? masterBranch : 'HEAD']);
    }
  }),

  gitflowStart: inRepo(async (repo, { type, name }: { type: FlowType; name: string }) => {
    const { prefix, base } = flow((await gitterSettings(repo)).gitflow, type);
    const branch = `${prefix}${name.trim().replace(/\s+/g, '-')}`;
    await git(repo, ['checkout', '-b', branch, '--end-of-options', base]);
    return branch;
  }),

  /** Merges the branch into its targets, tags releases and hotfixes, then deletes it. */
  gitflowFinish: inRepo(async (repo, { type, name }: { type: FlowType; name: string }) => {
    const { prefix, mergeInto, tag } = flow((await gitterSettings(repo)).gitflow, type);
    const branch = `${prefix}${name.trim()}`;
    for (const target of mergeInto) {
      await git(repo, ['checkout', '--end-of-options', target]);
      await git(repo, ['merge', '--no-ff', '-m', `Merge ${type} '${name}' into ${target}`, '--end-of-options', branch]);
      if (tag && target === mergeInto[0]) {
        const version = `v${name.trim().replace(/^v/, '')}`;
        await git(repo, ['tag', '-a', '-m', `${type === 'release' ? 'Release' : 'Hotfix'} ${name}`, '--end-of-options', version]);
      }
    }
    await git(repo, ['branch', '-d', '--end-of-options', branch]);
    return `Merged ${branch} into ${mergeInto.join(' and ')}${tag ? ', tagged it' : ''} and deleted the branch.`;
  }),
};
