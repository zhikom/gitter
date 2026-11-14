import { homedir } from 'node:os';
import { CommandError, run, useGitHubCliForGit } from './git';
import { UserError } from './errors';
import { inRepo } from './http';
import { MAX_TEMPLATE_LENGTH } from '../shared/templates';

type Gh = (args: string[], cwd?: string) => Promise<string>;
const gh: Gh = (args, cwd) => run('gh', cwd || homedir(), args, {
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

    /** Read the default-branch PR template without modifying the checkout. */
    githubPullRequestTemplate: inRepo(async (repo) => {
      const info = JSON.parse(await command(['repo', 'view', '--json', 'nameWithOwner'], repo));
      const fullName = String(info.nameWithOwner || '');
      if (!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(fullName)) throw new UserError('GitHub did not return a valid repository name.');
      const owner = fullName.split('/')[0];
      const locations = ['.github/PULL_REQUEST_TEMPLATE.md', '.github/pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md', 'docs/PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md'];
      // GitHub uses a public owner/.github repository for default community files.
      for (const source of [...new Set([fullName, `${owner}/.github`])]) {
        for (const file of locations) {
          const endpoint = `/repos/${source.split('/').map(encodeURIComponent).join('/')}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
          let value: any;
          try { value = JSON.parse(await command(['api', '--hostname', 'github.com', endpoint], repo)); }
          catch (error) {
            if (error instanceof CommandError && /\bHTTP 404\b/.test(error.stderr)) continue;
            throw error;
          }
          if (value?.type !== 'file' || value.encoding !== 'base64' || typeof value.content !== 'string' || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX_TEMPLATE_LENGTH * 4 || value.content.length > MAX_TEMPLATE_LENGTH * 6) {
            throw new UserError('The GitHub template is not a small text file.');
          }
          let text: string;
          try {
            if (!/^[a-z\d+/=\r\n]*$/i.test(value.content)) throw new Error('Invalid encoding');
            const bytes = Buffer.from(value.content, 'base64');
            if (bytes.length !== value.size) throw new Error('Invalid size');
            text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          }
          catch { throw new UserError('The GitHub template is not valid UTF-8.'); }
          if (text.length > MAX_TEMPLATE_LENGTH || text.includes('\0')) throw new UserError('The GitHub template is too large or contains a null character.');
          return { text, source: `${source}/${file}` };
        }
      }
      return null;
    }),

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
