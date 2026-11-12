import { spawn } from 'child_process';

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly args: string[],
    readonly code: number,
    readonly stderr: string,
    readonly stdout: string
  ) {
    super(stderr.trim() || stdout.trim() || `${command} ${args[0] ?? ''} exited with code ${code}`);
  }
}

interface RunOptions {
  /** Written to the process's stdin (patches, commit messages). */
  input?: string;
  env?: NodeJS.ProcessEnv;
  /** Exit codes besides 0 that mean success, like 1 ("files differ") for `diff --no-index`. */
  successCodes?: number[];
}

const GIT_ENV = {
  // The UI polls status and diffs every few seconds. Without this, each read
  // briefly takes .git/index.lock and a concurrent commit or stash fails with
  // "index.lock: File exists". Writes still take the lock.
  GIT_OPTIONAL_LOCKS: '0',
  // There is no terminal to answer a credential prompt; fail instead of hanging.
  // Credential helpers (Git Credential Manager, the macOS keychain) still work.
  GIT_TERMINAL_PROMPT: '0',
  // Print non-ASCII paths as-is instead of as octal escapes in diffs and logs.
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.quotePath',
  GIT_CONFIG_VALUE_0: 'false',
};

/** Runs a program without a shell, so arguments reach it exactly as given. */
export function run(command: string, cwd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...options.env } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0 || (code !== null && options.successCodes?.includes(code))) resolve(stdout);
      else reject(new CommandError(command, args, code ?? -1, stderr, stdout));
    });
    child.stdin.end(options.input ?? '');
  });
}

export function git(cwd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return run('git', cwd, args, { ...options, env: { ...GIT_ENV, ...options.env } });
}

/** For commands whose failure means "no": `rev-parse --verify`, `merge-base --is-ancestor`. */
export function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  return git(cwd, args).then(
    () => true,
    (e) => {
      if (e instanceof CommandError) return false;
      throw e;
    }
  );
}
