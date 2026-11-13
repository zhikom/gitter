// Patches for `git apply`, cut from a diff the user is looking at: whole hunks,
// or single lines of them. The UI sends them to stagePatch, unstagePatch,
// discardPatch and rejectAgentHunk.
import type { DiffHunk, DiffLine, FileDiff } from './types/git';

/**
 * How the patch is applied. `forward` (staging) puts the diff's changes onto its
 * old side; `reverse` (unstaging, discarding, rejecting) takes them back out of
 * its new side. An unchosen line has to look like what that side already holds.
 */
export type PatchDirection = 'forward' | 'reverse';

/** Chosen line indexes per hunk index. `'all'` takes the whole hunk; an absent hunk is left out. */
export type LineSelection = ReadonlyMap<number, ReadonlySet<number> | 'all'>;

export const wholeHunk = (index: number): LineSelection => new Map([[index, 'all']]);

const NO_NEWLINE = '\\ No newline at end of file';

function patchLine(line: DiffLine, chosen: boolean, direction: PatchDirection): string | null {
  if (line.type === 'context') return ` ${line.text}`;
  if (chosen) return `${line.type === 'add' ? '+' : '-'}${line.text}`;
  // An unchosen added line exists only on the new side, a deleted one only on the old side.
  const onTargetSide = line.type === 'add' ? direction === 'reverse' : direction === 'forward';
  return onTargetSide ? ` ${line.text}` : null;
}

function hunkPatch(hunk: DiffHunk, chosen: ReadonlySet<number> | 'all', direction: PatchDirection): string | null {
  const body: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let changes = 0;
  hunk.lines.forEach((line, i) => {
    const isChosen = chosen === 'all' || chosen.has(i);
    const text = patchLine(line, isChosen, direction);
    if (text === null) return;
    if (text[0] !== ' ') changes++;
    if (text[0] !== '+') oldCount++;
    if (text[0] !== '-') newCount++;
    body.push(text);
    if (line.noNewline) body.push(NO_NEWLINE);
  });
  if (changes === 0) return null;
  // A side that gained lines cannot start at line 0, which means "before the first line".
  const oldStart = oldCount > 0 ? Math.max(1, hunk.oldStart) : hunk.oldStart;
  const newStart = newCount > 0 ? Math.max(1, hunk.newStart) : hunk.newStart;
  return [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body].join('\n');
}

function choosesEverything(file: FileDiff, selection: LineSelection): boolean {
  return file.hunks.every((hunk, i) => {
    const chosen = selection.get(i);
    if (chosen === 'all') return true;
    return hunk.lines.every((line, j) => line.type === 'context' || Boolean(chosen?.has(j)));
  });
}

/** The patch for the chosen lines of one file, or null when no changed line is chosen. */
export function buildPatch(file: FileDiff, selection: LineSelection, direction: PatchDirection): string | null {
  const hunks = file.hunks
    .map((hunk, i) => (selection.has(i) ? hunkPatch(hunk, selection.get(i)!, direction) : null))
    .filter((h): h is string => h !== null);
  if (hunks.length === 0) return null;

  // Creating or deleting the file only holds when every line goes with it;
  // otherwise the patch edits a file that exists on both sides.
  const everything = choosesEverything(file, selection);
  const oldPath = file.oldPath ?? file.path;
  const creates = file.isNew && (direction === 'forward' || everything);
  const deletes = file.isDeleted && (direction === 'reverse' || everything);
  const mode = file.mode ?? '100644';
  return [
    `diff --git a/${oldPath} b/${file.path}`,
    ...(creates ? [`new file mode ${mode}`] : deletes ? [`deleted file mode ${mode}`] : []),
    `--- ${creates ? '/dev/null' : `a/${oldPath}`}`,
    `+++ ${deletes ? '/dev/null' : `b/${file.path}`}`,
    ...hunks,
    '',
  ].join('\n');
}
