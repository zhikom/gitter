// Session discovery reads local metadata only. It does not send prompts, start
// agents, or infer that a session is running from the time it was last edited.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { WorkSession, WorkSessions } from '../shared/types/workOverview';
import { inRepo, UserError } from './http';
import { resolveReviewCli } from './reviewAgent';
import { worktrees } from './worktrees';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function sessionId(id: unknown): string {
  if (typeof id !== 'string' || !UUID.test(id)) throw new UserError('Enter a valid session UUID.');
  return id.toLowerCase();
}

function samePath(a: string, b: string): boolean {
  const first = path.resolve(a),
    second = path.resolve(b);
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}
function contained(cwd: string, roots: string[]): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, cwd);
    return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
}

/** A short-lived, bounded JSON-RPC connection to the installed Codex CLI. */
export function codexRequest(method: string, params: object, cwd: string): Promise<any> {
  const cli = resolveReviewCli('codex');
  return new Promise((resolve, reject) => {
    const child = spawn(cli.command, [...cli.prefix, 'app-server', '--listen', 'stdio://'], { cwd, windowsHide: true });
    let buffer = '',
      finished = false;
    const complete = (error?: Error, value?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => complete(new UserError('Codex session discovery timed out.')), 15_000);
    child.on('error', (error) => complete(new UserError(`Could not start Codex: ${error.message}`)));
    child.on('close', () => complete(new UserError('Codex app-server closed before responding.')));
    child.stdin.on('error', () => undefined);
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 8_000_000) return complete(new UserError('Codex returned too much session data.'));
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1 && message.error)
          return complete(new UserError(`Codex initialization failed: ${message.error.message || 'unknown error'}`));
        if (message.id === 1 && message.result) {
          child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
          child.stdin.write(JSON.stringify({ id: 2, method, params }) + '\n');
        }
        if (message.id === 2) {
          if (message.error) complete(new UserError(`Codex could not read the session: ${message.error.message || 'unknown error'}`));
          else complete(undefined, message.result);
        }
      }
    });
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'gitter', version: '1.0.0' } } }) + '\n');
  });
}

export async function listCodexSessions(roots: string[], request = codexRequest): Promise<{ sessions: WorkSession[]; truncated: boolean }> {
  const result = await request(
    'thread/list',
    {
      cwd: roots,
      limit: 200,
      sortKey: 'updated_at',
      modelProviders: [],
      sourceKinds: ['cli', 'vscode', 'appServer'],
      useStateDbOnly: true,
    },
    roots[0],
  );
  if (!Array.isArray(result?.data)) throw new UserError('The installed Codex did not return a session list.');
  const sessions: WorkSession[] = result.data
    .filter(
      (item: any) =>
        typeof item?.id === 'string' &&
        UUID.test(item.id) &&
        typeof item.cwd === 'string' &&
        roots.some((root) => samePath(root, item.cwd)) &&
        !item.ephemeral,
    )
    .map((item: any) => ({
      id: item.id.toLowerCase(),
      provider: 'codex' as const,
      title: String(item.name || item.preview || 'Codex session')
        .replace(/\s+/g, ' ')
        .slice(0, 160),
      cwd: item.cwd,
      branch: typeof item.gitInfo?.branch === 'string' ? item.gitInfo.branch : undefined,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt * 1000 : 0,
      source: String(item.source || 'Codex'),
    }));
  return { sessions, truncated: Boolean(result.nextCursor) };
}

function claudeProjectsRoot(): string {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'projects');
}
function projectKey(dir: string): string {
  return path.resolve(dir).replace(/[^a-zA-Z0-9]/g, '-');
}
async function projectDirs(roots: string[], projects = claudeProjectsRoot()): Promise<string[]> {
  const entries = await fs.promises.readdir(projects, { withFileTypes: true }).catch(() => []);
  const keys = roots.map(projectKey);
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        keys.some(
          (key) => entry.name === key || entry.name.startsWith(`${key}-`) || (key.length > 200 && entry.name.startsWith(key.slice(0, 200))),
        ),
    )
    .slice(0, 200)
    .map((entry) => path.join(projects, entry.name));
}
async function readPart(file: string, fromEnd: boolean, max = 128_000): Promise<string> {
  const handle = await fs.promises.open(file, 'r');
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, max);
    const buffer = Buffer.alloc(size);
    const start = fromEnd ? Math.max(0, stat.size - size) : 0;
    const result = await handle.read(buffer, 0, size, start);
    const text = buffer.subarray(0, result.bytesRead).toString('utf8');
    return start ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
}
function jsonLines(text: string): any[] {
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}
function messageText(value: any): string {
  if (typeof value === 'string') return value;
  return Array.isArray(value)
    ? value
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
    : '';
}

/** Claude Code local JSONL is best-effort metadata; cloud/desktop-only chats may not be present. */
export async function listClaudeSessions(
  roots: string[],
  projects = claudeProjectsRoot(),
): Promise<{ sessions: WorkSession[]; truncated: boolean }> {
  const dirs = await projectDirs(roots, projects);
  const files: string[] = [];
  for (const dir of dirs) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    files.push(
      ...entries
        .filter((entry) => entry.isFile() && UUID.test(entry.name.replace(/\.jsonl$/, '')) && entry.name.endsWith('.jsonl'))
        .map((entry) => path.join(dir, entry.name)),
    );
  }
  const truncated = files.length > 500;
  const sessions: WorkSession[] = [];
  for (const file of files.slice(0, 500)) {
    try {
      const [head, tail, stat] = await Promise.all([readPart(file, false), readPart(file, true), fs.promises.stat(file)]);
      const rows = [...jsonLines(head), ...jsonLines(tail)];
      const matching = rows.find((row) => typeof row.cwd === 'string' && contained(row.cwd, roots));
      if (!matching) continue;
      const firstUser = rows.find((row) => row.type === 'user' && messageText(row.message?.content).trim());
      const title = messageText(firstUser?.message?.content).replace(/\s+/g, ' ').trim().slice(0, 160) || 'Claude Code session';
      const branch = [...rows].reverse().find((row) => typeof row.gitBranch === 'string')?.gitBranch;
      sessions.push({
        id: path.basename(file, '.jsonl').toLowerCase(),
        provider: 'claude',
        title,
        cwd: matching.cwd,
        branch,
        updatedAt: stat.mtimeMs,
        source: 'Claude Code local history',
      });
    } catch {
      /* History may be removed while scanning. */
    }
  }
  return { sessions, truncated };
}

async function rootsFor(repo: string): Promise<string[]> {
  const trees = await worktrees(repo);
  return trees.filter((tree) => !tree.isBare && !tree.prunable && fs.existsSync(tree.path)).map((tree) => path.resolve(tree.path));
}
export async function sessionRoots(repo: string, directory: string): Promise<string[]> {
  const roots = await rootsFor(repo);
  if (typeof directory !== 'string' || !fs.existsSync(directory))
    throw new UserError('Choose an existing folder in a worktree of this repository.');
  const canonical = fs.realpathSync(directory);
  if (!roots.some((root) => contained(canonical, [fs.realpathSync(root)])))
    throw new UserError('Choose an existing folder in a worktree of this repository.');
  return roots;
}

export async function discoverSessions(repo: string): Promise<WorkSessions> {
  const roots = await rootsFor(repo);
  if (!roots.length) return { sessions: [], warnings: ['No accessible worktrees to search for sessions.'] };
  const results = await Promise.allSettled([listCodexSessions(roots), listClaudeSessions(roots)]);
  const warnings: string[] = [];
  const sessions = results
    .flatMap((result, index) => {
      const label = index === 0 ? 'Codex' : 'Claude Code';
      if (result.status === 'rejected') {
        warnings.push(`${label}: ${String(result.reason?.message || result.reason)}`);
        return [];
      }
      if (result.value.truncated) warnings.push(`${label}: only the first sessions were loaded.`);
      return result.value.sessions;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { sessions, warnings };
}

export async function sessionConversation(provider: 'codex' | 'claude', id: string, directory: string): Promise<string> {
  id = sessionId(id);
  if (provider === 'codex') {
    const result = await codexRequest(
      'thread/turns/list',
      { threadId: id, itemsView: 'summary', limit: 12, sortDirection: 'desc' },
      directory,
    );
    const turns = Array.isArray(result?.data) ? result.data : [];
    return turns
      .reverse()
      .flatMap((turn: any) => (Array.isArray(turn.items) ? turn.items : []))
      .flatMap((item: any) => {
        if (item.type === 'agentMessage' && typeof item.text === 'string') return [`Assistant: ${item.text}`];
        if (item.type === 'userMessage') {
          const text = messageText(item.content);
          return text ? [`User: ${text}`] : [];
        }
        return [];
      })
      .join('\n\n')
      .slice(-25_000);
  }
  if (provider !== 'claude') throw new UserError('Choose Codex or Claude Code.');
  for (const dir of await projectDirs([directory])) {
    const file = path.join(dir, `${id}.jsonl`);
    try {
      const rows = jsonLines(await readPart(file, true, 1_000_000));
      if (!rows.some((row) => typeof row.cwd === 'string' && contained(row.cwd, [directory]))) continue;
      return rows
        .filter((row) => row.type === 'user' || row.type === 'assistant')
        .slice(-30)
        .map((row) => `${row.type === 'user' ? 'User' : 'Assistant'}: ${messageText(row.message?.content)}`)
        .filter((line) => !line.endsWith(': '))
        .join('\n\n')
        .slice(-25_000);
    } catch {
      /* Try the next matching project folder. */
    }
  }
  throw new UserError('Claude Code conversation was not found in this worktree’s local history.');
}

async function runDesktop(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let output = '',
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new UserError('The desktop app did not respond. Use the terminal resume command instead.'));
    }, 25_000);
    child.on('error', (error) => finish(new UserError(`Could not open the desktop app: ${error.message}`)));
    child.stdout.on('data', (chunk) => {
      if (output.length < 4000) output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      if (output.length < 4000) output += chunk.toString();
    });
    child.on('close', (code) =>
      finish(code === 0 ? undefined : new UserError(output.trim().slice(-1000) || 'Could not continue this session in the desktop app.')),
    );
    child.stdin.end();
  });
}

export const workSessionHandlers = {
  workSessions: inRepo((repo) => discoverSessions(repo)),
  resumeWorkSession: inRepo(async (repo, { provider, id, directory }: { provider: 'codex' | 'claude'; id: string; directory: string }) => {
    await sessionRoots(repo, directory);
    id = sessionId(id);
    if (provider === 'codex') {
      const url = `codex://threads/${id}`;
      if (process.platform === 'darwin') await runDesktop('open', [url], directory);
      else if (process.platform === 'win32') await runDesktop('rundll32.exe', ['url.dll,FileProtocolHandler', url], directory);
      else throw new UserError('Desktop continuation is supported on macOS and Windows.');
    } else if (provider === 'claude') {
      const cli = resolveReviewCli('claude');
      await runDesktop(cli.command, [...cli.prefix, '--desktop', '--resume', id], directory);
    } else throw new UserError('Choose Codex or Claude Code.');
  }),
};
