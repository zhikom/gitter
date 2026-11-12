// A file with git conflict markers, split into the text both sides agree on and
// the conflicts, and put back together once each conflict has a resolution.

export type Resolution = 'unresolved' | 'ours' | 'theirs' | 'ours-then-theirs' | 'theirs-then-ours';

export interface Conflict {
  kind: 'conflict';
  ours: string[];
  theirs: string[];
  /** The common ancestor's lines, present when git wrote diff3-style markers. */
  base?: string[];
  oursLabel: string;
  theirsLabel: string;
  resolution: Resolution;
}

export type Section = { kind: 'common'; lines: string[] } | Conflict;

export interface ConflictedFile {
  sections: Section[];
  /** The file's line ending, kept when the result is written back. */
  eol: '\n' | '\r\n';
}

export function parseConflicts(content: string): ConflictedFile {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const sections: Section[] = [];
  let common: string[] = [];
  let conflict: Conflict | null = null;
  let part: 'ours' | 'base' | 'theirs' = 'ours';

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('<<<<<<<')) {
      if (common.length) sections.push({ kind: 'common', lines: common });
      common = [];
      conflict = { kind: 'conflict', ours: [], theirs: [], oursLabel: line.slice(7).trim() || 'ours', theirsLabel: 'theirs', resolution: 'unresolved' };
      part = 'ours';
    } else if (conflict && line.startsWith('|||||||')) {
      conflict.base = [];
      part = 'base';
    } else if (conflict && line.startsWith('=======')) {
      part = 'theirs';
    } else if (conflict && line.startsWith('>>>>>>>')) {
      conflict.theirsLabel = line.slice(7).trim() || 'theirs';
      sections.push(conflict);
      conflict = null;
    } else if (conflict) {
      (part === 'base' ? conflict.base! : conflict[part]).push(line);
    } else {
      common.push(line);
    }
  }
  if (conflict) {
    // An unterminated conflict is kept as plain text rather than lost.
    common.push(`<<<<<<< ${conflict.oursLabel}`, ...conflict.ours, '=======', ...conflict.theirs);
  }
  if (common.length) sections.push({ kind: 'common', lines: common });
  return { sections, eol };
}

function resolvedLines(c: Conflict): string[] {
  switch (c.resolution) {
    case 'ours':
      return c.ours;
    case 'theirs':
      return c.theirs;
    case 'ours-then-theirs':
      return [...c.ours, ...c.theirs];
    case 'theirs-then-ours':
      return [...c.theirs, ...c.ours];
    default:
      return [`<<<<<<< ${c.oursLabel}`, ...c.ours, ...(c.base ? ['|||||||', ...c.base] : []), '=======', ...c.theirs, `>>>>>>> ${c.theirsLabel}`];
  }
}

/** The file text with each resolved conflict replaced and unresolved ones kept as markers. */
export function mergeConflicts(file: ConflictedFile): string {
  return file.sections.flatMap((s) => (s.kind === 'common' ? s.lines : resolvedLines(s))).join(file.eol);
}

export const hasMarkers = (text: string) => /^(<{7}|>{7})( |$)/m.test(text);
