import { DiffHunk, DiffLine, FileDiff } from '../types/git';

export function parseGitDiff(rawDiff: string): FileDiff[] {
  if (!rawDiff || rawDiff.trim() === '') return [];

  const files: FileDiff[] = [];
  const fileDiffRegex = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  const matches: { index: number; oldPath: string; newPath: string }[] = [];

  let match;
  while ((match = fileDiffRegex.exec(rawDiff)) !== null) {
    matches.push({
      index: match.index,
      oldPath: match[1],
      newPath: match[2],
    });
  }

  if (matches.length === 0) {
    // Single file diff without header
    return [parseSingleFileDiff(rawDiff, 'file', 'file')];
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextIndex = i + 1 < matches.length ? matches[i + 1].index : rawDiff.length;
    const chunk = rawDiff.slice(cur.index, nextIndex);
    files.push(parseSingleFileDiff(chunk, cur.oldPath, cur.newPath));
  }

  return files;
}

function parseSingleFileDiff(text: string, defaultOldPath: string, defaultNewPath: string): FileDiff {
  const isBinary = text.includes('Binary files ') || text.includes('GIT binary patch');
  const hunks: DiffHunk[] = [];

  const lines = text.split('\n');
  let currentHunk: DiffHunk | null = null;
  let rawHunkLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('@@ ')) {
      if (currentHunk) {
        currentHunk.rawHunk = rawHunkLines.join('\n');
        hunks.push(currentHunk);
        rawHunkLines = [];
      }

      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        const oldLines = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newLines = match[4] ? parseInt(match[4], 10) : 1;

        currentHunk = {
          header: line,
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: [],
          rawHunk: '',
        };
        rawHunkLines.push(line);
      }
    } else if (currentHunk) {
      rawHunkLines.push(line);

      let oldLineNum = currentHunk.oldStart;
      let newLineNum = currentHunk.newStart;

      // Calculate line numbers based on previous lines in hunk
      for (const prev of currentHunk.lines) {
        if (prev.type === 'context') {
          oldLineNum++;
          newLineNum++;
        } else if (prev.type === 'delete') {
          oldLineNum++;
        } else if (prev.type === 'add') {
          newLineNum++;
        }
      }

      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'add',
          text: line.slice(1),
          newLineNumber: newLineNum,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'delete',
          text: line.slice(1),
          oldLineNumber: oldLineNum,
        });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          text: line.startsWith(' ') ? line.slice(1) : line,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
        });
      }
    }
  }

  if (currentHunk) {
    currentHunk.rawHunk = rawHunkLines.join('\n');
    hunks.push(currentHunk);
  }

  return {
    path: defaultNewPath,
    oldPath: defaultOldPath !== defaultNewPath ? defaultOldPath : undefined,
    isBinary,
    hunks,
    rawDiff: text,
  };
}
