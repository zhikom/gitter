// Every backend operation, by name. The UI's client is typed from `Handlers`, so
// a handler's parameter and return types are the API contract.
import { agentHandlers } from './agents';
import { aiHandlers } from './ai';
import { downloadAndInstall, latestRelease } from './appUpdate';
import { UserError } from './errors';
import { branchHandlers } from './branches';
import { changeHandlers } from './changes';
import { consoleHandlers } from './gitConsole';
import { historyHandlers } from './history';
import { combine } from './http';
import * as os from './osIntegration';
import { homedir } from 'node:os';
import path from 'node:path';
import { remoteHandlers } from './remotes';
import { githubReviewHandlers } from './pullReview';
import { reviewAgentHandlers } from './reviewAgent';
import { githubHandlers } from './github';
import { repositoryHandlers } from './repository';
import { settingsHandlers } from './settings';
import { stashHandlers } from './stash';
import { virtualBranchHandlers } from './virtualBranches';
import { worktreeHandlers } from './worktrees';

export interface Host {
  /** Runs once an update installer has started; the desktop backend exits so its file can be replaced. */
  onUpdateInstalling(): void;
}

function appHandlers(host: Host) {
  return {
    /** The OS folder picker, for a browser UI that has no dialog of its own. */
    pickFolder: ({ title }: { title?: string }) => os.pickFolder(title),
    openUrl: ({ url }: { url: string }) => os.openUrl(url),
    defaultRepoFolder: () => path.join(homedir(), 'repos').replace(/\\/g, '/'),
    latestRelease: () => latestRelease(),
    installUpdate: async ({ downloadUrl }: { downloadUrl: string }) => {
      // The installer runs with the user's rights: only an asset of the current release qualifies.
      const release = await latestRelease();
      if (!release.assets.some((asset) => asset.url === downloadUrl)) throw new UserError('That file is not part of the latest Gitter release.');
      const installerPath = await downloadAndInstall(downloadUrl);
      host.onUpdateInstalling();
      return installerPath;
    },
  };
}

export function createHandlers(host: Host) {
  return combine(
    repositoryHandlers,
    changeHandlers,
    historyHandlers,
    branchHandlers,
    remoteHandlers,
    githubReviewHandlers,
    reviewAgentHandlers,
    githubHandlers,
    stashHandlers,
    worktreeHandlers,
    settingsHandlers,
    virtualBranchHandlers,
    agentHandlers,
    consoleHandlers,
    aiHandlers,
    appHandlers(host)
  );
}

export type Handlers = ReturnType<typeof createHandlers>;
