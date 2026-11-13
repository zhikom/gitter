import { homedir } from 'node:os';
import { run, useGitHubCliForGit } from './git';
import { UserError } from './errors';

type Gh = (args: string[]) => Promise<string>;
const gh: Gh = (args) => run('gh', homedir(), args, {
  env: { GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
});

export interface GitHubRepository {
  fullName: string;
  description: string | null;
  private: boolean;
  httpsUrl: string;
  sshUrl: string;
  webUrl: string;
}

/** Use the user's existing gh authentication without exporting its token to Gitter. */
export function createGitHubHandlers(command: Gh = gh) {
  return {
    githubStatus: async () => {
      try { await command(['--version']); }
      catch (error: any) {
        useGitHubCliForGit(false);
        if (error?.code === 'ENOENT') return { installed: false, authenticated: false, login: '', error: '' };
        return { installed: false, authenticated: false, login: '', error: String(error?.message || error) };
      }
      try {
        const login = (await command(['api', '--hostname', 'github.com', 'user', '--jq', '.login'])).trim();
        if (!login) throw new Error('GitHub did not return an account name.');
        useGitHubCliForGit(true);
        return { installed: true, authenticated: true, login, error: '' };
      } catch (error: any) {
        useGitHubCliForGit(false);
        return { installed: true, authenticated: false, login: '', error: String(error?.message || error) };
      }
    },

    githubRepositories: async ({ page = 1 }: { page?: number }) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new UserError('Invalid GitHub repository page.');
      const endpoint = `/user/repos?per_page=50&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`;
      const data = JSON.parse(await command(['api', '--hostname', 'github.com', endpoint]));
      if (!Array.isArray(data)) throw new UserError('GitHub did not return a repository list.');
      const repositories: GitHubRepository[] = data.map((item) => ({
        fullName: String(item.full_name || ''),
        description: typeof item.description === 'string' ? item.description : null,
        private: Boolean(item.private),
        httpsUrl: String(item.clone_url || ''),
        sshUrl: String(item.ssh_url || ''),
        webUrl: String(item.html_url || ''),
      }));
      return { repositories, nextPage: data.length === 50 ? page + 1 : null };
    },

    githubCreateRepository: async ({ owner, name, description = '', visibility, addReadme = false }: {
      owner: string; name: string; description?: string; visibility: 'private' | 'public'; addReadme?: boolean;
    }) => {
      owner = owner.trim(); name = name.trim(); description = description.trim();
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(owner)) throw new UserError('Enter a valid GitHub owner or organization.');
      if (!/^[a-z\d_.-]{1,100}$/i.test(name) || name === '.' || name === '..' || /\.git$/i.test(name)) throw new UserError('Enter a valid GitHub repository name.');
      if (!['private', 'public'].includes(visibility) || description.length > 350 || /[\r\n\0]/.test(description)) throw new UserError('Check the visibility and description.');
      const fullName = `${owner}/${name}`;
      await command(['repo', 'create', fullName, `--${visibility}`,
        ...(description ? ['--description', description] : []), ...(addReadme ? ['--add-readme'] : [])]);
      return { fullName, webUrl: `https://github.com/${fullName}`, httpsUrl: `https://github.com/${fullName}.git`, sshUrl: `git@github.com:${fullName}.git` };
    },
  };
}

export const githubHandlers = createGitHubHandlers();
