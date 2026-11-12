import { spawn } from 'child_process';
import fs from 'fs';
import { UserError } from './errors';

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
  ...configEnv({
    // Print non-ASCII paths as-is instead of as octal escapes in diffs and logs.
    'core.quotePath': 'false',
    // Output is parsed, so user settings that restyle it are turned off.
    'color.ui': 'false',
    'color.diff': 'false',
    'diff.mnemonicPrefix': 'false',
    'diff.noprefix': 'false',
    'diff.srcPrefix': 'a/',
    'diff.dstPrefix': 'b/',
    'log.showSignature': 'false',
  }),
};

function configEnv(settings: Record<string, string>): Record<string, string> {
  const entries = Object.entries(settings);
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(entries.length) };
  entries.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return env;
}

// Diffs are parsed and turned into patches, so an external diff tool or a
// textconv filter (both configurable per user) must not replace git's own output.
function withPlainDiffs(args: string[]): string[] {
  const at = args[0] === 'stash' && args[1] === 'show' ? 2 : ['diff', 'show', 'log'].includes(args[0]) ? 1 : -1;
  return at < 0 ? args : [...args.slice(0, at), '--no-ext-diff', '--no-textconv', ...args.slice(at)];
}

/** Runs a program without a shell, so arguments reach it exactly as given. */
export function run(command: string, cwd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...options.env } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', (e: NodeJS.ErrnoException) => {
      // spawn reports a missing working directory as the program being missing.
      if (e.code === 'ENOENT' && !fs.existsSync(cwd)) reject(new UserError(`${cwd} no longer exists.`));
      else reject(e);
    });
    // git can exit before reading all of a large input (a patch for a folder that
    // is no longer a repository); the exit code reports that, not a crash.
    child.stdin.on('error', () => undefined);
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
  return run('git', cwd, withPlainDiffs(args), { ...options, env: { ...GIT_ENV, ...options.env } });
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
