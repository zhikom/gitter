import fs from 'fs';
import os from 'os';
import path from 'path';
import { git, gitSucceeds } from './git';
import { parseDiff, parseStatus, STATUS_ARGS, toFileStatuses } from './gitParse';
import { inRepo, UserError } from './http';
import { openDiffTool } from './osIntegration';
import { gitterSettings } from './settings';

const NULL_DEVICE = '/dev/null';

const hasCommits = (repo: string) => gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', 'HEAD']);

async function isTracked(repo: string, file: string): Promise<boolean> {
  return gitSucceeds(repo, ['ls-files', '--error-unmatch', '--', file]);
}

/** Resolves a path inside the repository, refusing anything that escapes it. */
function insideRepo(repo: string, file: string): string {
  const full = path.resolve(repo, file);
  const relative = path.relative(repo, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new UserError(`${file} is outside the repository.`);
  return full;
}

async function workingDiff(repo: string, file: string, staged: boolean, ignoreWhitespace: boolean) {
  const whitespace = ignoreWhitespace ? ['-w'] : [];
  if (staged) return parseDiff(await git(repo, ['diff', '--cached', ...whitespace, '--', file]));
  if (!(await isTracked(repo, file))) {
    // An untracked file diffs against nothing; --no-index exits 1 when files differ.
    return parseDiff(
      await git(repo, ['diff', '--no-index', ...whitespace, '--', NULL_DEVICE, file], { successCodes: [1] })
    );
  }
  return parseDiff(await git(repo, ['diff', ...whitespace, '--', file]));
}

// Patches come from the diff view's hunk and line selections. --unidiff-zero
// accepts hunks without surrounding context lines.
async function applyPatch(repo: string, patch: string, flags: string[]): Promise<void> {
  await git(repo, ['apply', ...flags, '--unidiff-zero', '--whitespace=nowarn', '-'], { input: patch });
}

export const changeHandlers = {
  fileStatuses: inRepo(async (repo) => toFileStatuses(parseStatus(await git(repo, STATUS_ARGS)))),

  workingDiff: inRepo((repo, { file, staged = false, ignoreWhitespace = false }: { file: string; staged?: boolean; ignoreWhitespace?: boolean }) =>
    workingDiff(repo, file, staged, ignoreWhitespace)
  ),

  stageFile: inRepo((repo, { file }: { file: string }) => git(repo, ['add', '--', file]).then(() => undefined)),
  // Before the first commit there is no HEAD to restore the index from, so the files are just untracked again.
  unstageFile: inRepo(async (repo, { file }: { file: string }) => {
    if (await hasCommits(repo)) await git(repo, ['restore', '--staged', '--', file]);
    else await git(repo, ['rm', '--cached', '-q', '-r', '--', file]);
  }),
  stageAll: inRepo((repo) => git(repo, ['add', '-A']).then(() => undefined)),
  unstageAll: inRepo(async (repo) => {
    if (await hasCommits(repo)) await git(repo, ['reset', '-q']);
    else if ((await git(repo, ['ls-files'])).trim()) await git(repo, ['rm', '--cached', '-q', '-r', '--', '.']);
  }),

  discardFile: inRepo(async (repo, { file }: { file: string }) => {
    if (await isTracked(repo, file)) await git(repo, ['restore', '--', file]);
    else await git(repo, ['clean', '-fd', '--', file]);
  }),

  discardAll: inRepo(async (repo) => {
    // `restore .` fails when nothing is tracked yet, as in a new repository.
    if ((await git(repo, ['ls-files'])).trim()) await git(repo, ['restore', '--', '.']);
    await git(repo, ['clean', '-fd']);
  }),

  stagePatch: inRepo((repo, { patch }: { patch: string }) => applyPatch(repo, patch, ['--cached'])),
  unstagePatch: inRepo((repo, { patch }: { patch: string }) => applyPatch(repo, patch, ['--cached', '--reverse'])),
  discardPatch: inRepo((repo, { patch }: { patch: string }) => applyPatch(repo, patch, ['--reverse'])),

  commit: inRepo((repo, { summary, description = '', amend = false }: { summary: string; description?: string; amend?: boolean }) => {
    if (!summary.trim()) throw new UserError('A commit needs a summary.');
    const message = description.trim() ? `${summary}\n\n${description}` : summary;
    return git(repo, ['commit', '-F', '-', ...(amend ? ['--amend'] : [])], { input: message });
  }),

  /** The file as it is on disk, e.g. with conflict markers in it. */
  workingFile: inRepo((repo, { file }: { file: string }) => fs.promises.readFile(insideRepo(repo, file), 'utf8')),

  /** Writes a resolved conflict to disk and, unless told otherwise, marks it resolved. */
  saveConflictResolution: inRepo(async (repo, { file, content, stage = true }: { file: string; content: string; stage?: boolean }) => {
    await fs.promises.writeFile(insideRepo(repo, file), content, 'utf8');
    if (stage) await git(repo, ['add', '--', file]);
  }),

  /** Opens the file in the configured diff tool against HEAD (if staged) or the index. */
  openExternalDiff: inRepo(async (repo, { file, staged = false }: { file: string; staged?: boolean }) => {
    // A version git stores, written to a temp file; a version that does not exist (a new file) is empty.
    const snapshot = async (label: string, spec: string) => {
      const target = path.join(os.tmpdir(), `gitter-${label}-${Date.now()}-${path.basename(file)}`);
      await fs.promises.writeFile(target, await git(repo, ['show', spec]).catch(() => ''), 'utf8');
      return target;
    };
    const tool = (await gitterSettings(repo)).diffTool;
    // Staged changes are HEAD against the index; unstaged ones the index against the file on disk.
    if (staged) await openDiffTool(await snapshot('HEAD', `HEAD:${file}`), await snapshot('staged', `:${file}`), tool);
    else await openDiffTool(await snapshot('index', `:${file}`), insideRepo(repo, file), tool);
  }),
};
