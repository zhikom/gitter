import { DiffHunk, DiffLine } from '../types/git';

/**
 * Generates a unified diff patch string for a single full hunk.
 */
export function generateHunkPatch(
  filePath: string,
  hunk: DiffHunk,
  reverse: boolean = false
): string {
  const normPath = filePath.replace(/\\/g, '/');
  let oldPath = `a/${normPath}`;
  let newPath = `b/${normPath}`;

  let oldStart = hunk.oldStart;
  let oldLines = hunk.oldLines;
  let newStart = hunk.newStart;
  let newLines = hunk.newLines;

  let body = '';
  for (const line of hunk.lines) {
    if (line.type === 'context') {
      body += ` ${line.text}\n`;
    } else if (line.type === 'add') {
      body += `+${line.text}\n`;
    } else if (line.type === 'delete') {
      body += `-${line.text}\n`;
    }
  }

  const patchHeader = [
    `diff --git ${oldPath} ${newPath}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
  ].join('\n');

  // Prefer the raw hunk text: it preserves "\ No newline at end of file"
  // markers and function context that a reconstructed body would lose.
  const rawHunk = (hunk.rawHunk || '').trimEnd();
  if (rawHunk.startsWith('@@')) {
    return `${patchHeader}\n${rawHunk}\n`;
  }

  return `${patchHeader}\n@@ -${oldStart},${oldLines} +${newStart},${newLines} @@\n${body}`;
}

/**
 * Generates a unified diff patch for selectively staging or discarding specific lines.
 * 
 * @param filePath - relative path of file
 * @param hunk - the DiffHunk containing the lines
 * @param selectedLineIndices - set of indices (into hunk.lines) that are selected
 * @param mode - 'stage' (staging changes to index) or 'discard' (reverting changes in working copy)
 */
export function generateLineSelectionPatch(
  filePath: string,
  hunk: DiffHunk,
  selectedLineIndices: Set<number>,
  mode: 'stage' | 'discard' | 'unstage' = 'stage'
): string {
  const normPath = filePath.replace(/\\/g, '/');
  const oldPath = `a/${normPath}`;
  const newPath = `b/${normPath}`;

  const patchLines: string[] = [];
  let oldLinesCount = 0;
  let newLinesCount = 0;

  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i];
    const isSelected = selectedLineIndices.has(i);

    if (line.type === 'context') {
      patchLines.push(` ${line.text}`);
      oldLinesCount++;
      newLinesCount++;
    } else if (line.type === 'add') {
      if (isSelected) {
        patchLines.push(`+${line.text}`);
        newLinesCount++;
      }
      // If add is NOT selected, we omit it from this patch
    } else if (line.type === 'delete') {
      if (isSelected) {
        patchLines.push(`-${line.text}`);
        oldLinesCount++;
      } else {
        // If delete is NOT selected, in the patch it remains unchanged context
        patchLines.push(` ${line.text}`);
        oldLinesCount++;
        newLinesCount++;
      }
    }
  }

  if (patchLines.length === 0) return '';

  const header = `@@ -${hunk.oldStart},${oldLinesCount} +${hunk.newStart},${newLinesCount} @@`;
  const diffHeader = [
    `diff --git ${oldPath} ${newPath}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    header,
  ].join('\n');

  return `${diffHeader}\n${patchLines.join('\n')}\n`;
}
