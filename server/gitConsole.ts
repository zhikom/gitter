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

function blockedFlag(subcommand: string, arg: string): boolean {
  return (
    /^--(force|force-with-lease|force-if-includes|mirror|exec|extcmd|tool|output|upload-pack|receive-pack|exec-path|config-env)(=|$)/.test(arg) ||
    (['push', 'rebase', 'checkout', 'switch'].includes(subcommand) && /^-[a-zA-Z]*[fx][a-zA-Z]*$/.test(arg)) ||
    (subcommand === 'push' && arg.startsWith('+')) ||
    (subcommand === 'branch' && /^-[a-zA-Z]*D/.test(arg)) ||
    arg === '-c' ||
    arg.startsWith('-c=')
  );
}

/** Splits a command line into arguments, honouring single and double quotes. */
export function tokenize(input: string): string[] {
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
