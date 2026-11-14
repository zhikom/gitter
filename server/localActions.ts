import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expandLocalActionText, normalizeLocalActions, type LocalAction } from '../shared/types/localAction';
import { inRepo, UserError } from './http';

type Result = { id: string; state: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'; exitCode: number | null; stdout: string; stderr: string; truncated: boolean };
type Job = { result: Result; child: ChildProcess; started: number; cancel: boolean; timedOut: boolean; timeout?: NodeJS.Timeout; force?: NodeJS.Timeout };
const jobs = new Map<string, Job>();
const OUTPUT_LIMIT = 128_000;

function stop(job: Job) {
  job.child.kill('SIGTERM');
  job.force = setTimeout(() => { if (job.result.state === 'running') job.child.kill('SIGKILL'); }, 3000);
  job.force.unref();
}

function addOutput(job: Job, field: 'stdout' | 'stderr', data: Buffer) {
  const current = job.result[field];
  const remaining = OUTPUT_LIMIT - current.length;
  if (remaining <= 0) { job.result.truncated = true; return; }
  const text = data.toString('utf8');
  job.result[field] = current + text.slice(0, remaining);
  if (text.length > remaining) job.result.truncated = true;
}

function cleanJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.result.state !== 'running' && now - job.started > 10 * 60_000) jobs.delete(id);
}

interface ActionInput { action: LocalAction; branch: string; file?: string }

async function prepare(repo: string, input: ActionInput) {
  const action = normalizeLocalActions([input.action])?.[0];
  if (!action || !action.enabled || !action.name.trim() || !action.executable.trim()) throw new UserError('Configure an enabled action with a name and executable first.');
  if (typeof input.branch !== 'string' || input.branch.length > 1024 || /[\x00-\x1f\x7f]/.test(input.branch) || (input.file !== undefined && (typeof input.file !== 'string' || input.file.includes('\0')))) throw new UserError('Invalid action context.');
  const file = input.file ? path.resolve(repo, input.file) : '';
  const relativeFile = file ? path.relative(repo, file) : '';
  if (file && (relativeFile === '..' || relativeFile.startsWith('..' + path.sep) || path.isAbsolute(relativeFile))) throw new UserError('The selected file must be inside the repository.');
  const variables = { path: repo, branch: input.branch, file };
  let executable: string, args: string[], cwd: string;
  try {
    executable = expandLocalActionText(action.executable, variables);
    args = action.args.map((arg) => expandLocalActionText(arg, variables));
    cwd = action.workingDirectory ? expandLocalActionText(action.workingDirectory, variables) : repo;
  } catch (error) { throw new UserError((error as Error).message); }
  if (!path.isAbsolute(cwd) || !(await fs.stat(cwd).catch(() => null))?.isDirectory()) throw new UserError('The action working directory must be an existing absolute folder.');
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) throw new UserError('Windows batch files are not supported. Choose an executable directly.');
  return { action, executable, args, cwd };
}

export const localActionHandlers = {
  previewLocalAction: inRepo(async (repo, input: ActionInput) => {
    const { executable, args, cwd } = await prepare(repo, input);
    return { executable, args, cwd };
  }),
  startLocalAction: inRepo(async (repo, input: ActionInput) => {
    const { action, executable, args, cwd } = await prepare(repo, input);
    cleanJobs();
    if ([...jobs.values()].filter((job) => job.result.state === 'running').length >= 8) throw new UserError('Too many local actions are running.');
    // Inherited tokens and credential-related environment variables are not passed on.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|GH_|GITHUB_|GITTER_|SSH_)/i.test(key) && !/TOKEN|PASS|SECRET|KEY|AUTH|CREDENTIAL|COOKIE/i.test(key)));
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const id = randomUUID();
    const job: Job = { result: { id, state: 'running', exitCode: null, stdout: '', stderr: '', truncated: false }, child, started: Date.now(), cancel: false, timedOut: false };
    jobs.set(id, job);
    child.stdout?.on('data', (data: Buffer) => addOutput(job, 'stdout', data));
    child.stderr?.on('data', (data: Buffer) => addOutput(job, 'stderr', data));
    child.on('error', (error) => { addOutput(job, 'stderr', Buffer.from(error.message)); });
    child.on('close', (code) => {
      if (job.timeout) clearTimeout(job.timeout);
      if (job.force) clearTimeout(job.force);
      job.result.exitCode = code;
      job.result.state = job.timedOut ? 'timed_out' : job.cancel ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
    });
    job.timeout = setTimeout(() => { if (job.result.state === 'running' && !job.cancel) { job.timedOut = true; stop(job); } }, action.timeoutSeconds * 1000);
    job.timeout.unref();
    return { id };
  }),
  localActionStatus: async ({ id }: { id: string }): Promise<Result> => {
    cleanJobs();
    const job = jobs.get(id);
    if (!job) throw new UserError('That local action is no longer available.');
    return { ...job.result };
  },
  cancelLocalAction: async ({ id }: { id: string }) => {
    const job = jobs.get(id);
    if (!job) throw new UserError('That local action is no longer available.');
    if (job.result.state === 'running' && !job.cancel) { job.cancel = true; stop(job); }
  },
};
