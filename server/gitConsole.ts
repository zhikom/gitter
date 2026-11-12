// The git console: one-line git commands typed in the AI sidebar or suggested
// by the assistant, run in the open repository.
import { git } from './git';
import { inRepo, UserError } from './http';

// Git subcommands the console may run. Anything that rewrites history or
// hands git an external program to run is left to the dedicated UI actions.
export const CONSOLE_SUBCOMMANDS = [
  'status', 'log', 'diff', 'show', 'branch', 'fetch', 'pull', 'push', 'add', 'commit', 'checkout', 'switch',
  'restore', 'stash', 'merge', 'rebase', 'cherry-pick', 'revert', 'tag', 'remote', 'worktree', 'blame',
  'shortlog', 'describe', 'rev-parse', 'ls-files',
];

// Long options that run another program, write files, or overwrite history elsewhere.
const BLOCKED_OPTIONS = [
  'force', 'force-with-lease', 'force-if-includes', 'mirror', 'exec', 'extcmd', 'tool', 'output',
  'upload-pack', 'receive-pack', 'exec-path', 'config-env', 'strategy',
];

// Short options with the same effect, per subcommand: -x runs a command, -s names a
// merge strategy program, -f and -D force. They count anywhere in a cluster (-fu)
// and with an attached value (-xcmd).
const BLOCKED_SHORT: Record<string, string> = {
  push: 'f',
  rebase: 'xs',
  merge: 's',
  pull: 's',
  checkout: 'f',
  switch: 'f',
  branch: 'Df',
};

function blockedFlag(subcommand: string, arg: string): boolean {
  if (arg.startsWith('--')) {
    // git accepts any unambiguous prefix of a long option (--upload-pac), so prefixes are blocked too.
    const name = arg.slice(2).split('=')[0];
    return name.length > 0 && BLOCKED_OPTIONS.some((option) => option.startsWith(name));
  }
  if (arg.startsWith('-') && arg.length > 1) {
    if (arg.startsWith('-c')) return true; // -c sets configuration, which can name programs
    const letters = BLOCKED_SHORT[subcommand] ?? '';
    return [...arg.slice(1)].some((ch) => letters.includes(ch));
  }
  return subcommand === 'push' && arg.startsWith('+'); // +refspec forces the update
}

/** Splits a command line into arguments, honouring single and double quotes. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let inToken = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (quote) throw new UserError('Unterminated quote in command.');
  if (inToken) tokens.push(current);
  return tokens;
}

export function consoleArgs(command: string): string[] {
  if ([...command].some((ch) => ch.charCodeAt(0) < 0x20)) throw new UserError('Commands must be a single line.');
  const [program, subcommand, ...rest] = tokenize(command.trim());
  if (program !== 'git' || !subcommand) throw new UserError('Only git commands can run here.');
  // Global options before the subcommand (-c, -C, --exec-path) can make git run
  // other programs, so the subcommand has to come first.
  if (!CONSOLE_SUBCOMMANDS.includes(subcommand)) throw new UserError(`"git ${subcommand}" can't run here. Use Gitter's own action for it.`);
  if (rest.some((arg) => blockedFlag(subcommand, arg))) throw new UserError('That option is blocked here. Use Gitter\'s own action for it.');
  if (subcommand === 'worktree' && rest[0] && rest[0] !== 'list') throw new UserError('Only "git worktree list" can run here.');
  return [subcommand, ...rest];
}

export const consoleHandlers = {
  runConsoleCommand: inRepo(async (repo, { command }: { command: string }) => {
    const output = await git(repo, consoleArgs(command));
    return output.trim() || 'Done.';
  }),
};
