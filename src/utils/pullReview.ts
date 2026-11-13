import { parseDiff } from '../../server/gitParse';
import type { ReviewComment, ReviewSnapshot } from '../../shared/types/review';
import type { FileDiff } from '../../shared/types/git';
import type { ReviewAnchor } from '../../shared/types/review';

export const REVIEW_PAGE_ROWS = 250;

/** Build a valid mini-diff for the visible rows, keeping their original line numbers. */
export function reviewPageDiff(file: FileDiff, page: number): string {
  const headerEnd = file.rawDiff.search(/^@@ /m);
  if (headerEnd < 0) return '';
  const start = page * REVIEW_PAGE_ROWS;
  const end = start + REVIEW_PAGE_ROWS;
  let offset = 0;
  let patch = file.rawDiff.slice(0, headerEnd);
  let included = false;
  for (const hunk of file.hunks) {
    offset++; // The hunk header occupies one displayed row.
    const first = Math.max(0, start - offset);
    const last = Math.min(hunk.lines.length, end - offset);
    if (first < last) {
      const before = hunk.lines.slice(0, first);
      const lines = hunk.lines.slice(first, last);
      const oldStart = hunk.oldStart + before.filter((line) => line.type !== 'add').length;
      const newStart = hunk.newStart + before.filter((line) => line.type !== 'delete').length;
      const oldCount = lines.filter((line) => line.type !== 'add').length;
      const newCount = lines.filter((line) => line.type !== 'delete').length;
      patch += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;
      for (const line of lines) patch += `${line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}${line.text}\n${line.noNewline ? '\\ No newline at end of file\n' : ''}`;
      included = true;
    }
    offset += hunk.lines.length;
  }
  return included ? patch : '';
}

/** Find the page containing a suggestion before opening its composer. */
export function reviewAnchorPage(file: FileDiff, anchor: ReviewAnchor): number {
  let offset = 0;
  for (const hunk of file.hunks) {
    offset++;
    const index = hunk.lines.findIndex((line) => anchor.side === 'LEFT' ? line.oldLineNumber === anchor.line && line.type !== 'add' : line.newLineNumber === anchor.line && line.type !== 'delete');
    if (index >= 0) return Math.floor((offset + index) / REVIEW_PAGE_ROWS);
    offset += hunk.lines.length;
  }
  return 0;
}

/** Bitbucket's activity feed includes comments, replies, reviewer events and approvals. */
export function bitbucketReviewSnapshot(data: { pull: any; diff: string; activities: any[]; builds: any[]; warnings: string[] }): ReviewSnapshot {
  const comments: ReviewComment[] = [];
  const seen = new Set<string>();
  const append = (comment: any, inheritedAnchor?: any) => {
    if (!comment || typeof comment !== 'object') return;
    const id = String(comment.id ?? '');
    const anchor = comment.anchor || inheritedAnchor;
    if (id && !seen.has(id)) {
      seen.add(id);
      const path = typeof anchor?.path === 'string' ? anchor.path : anchor?.path?.components?.join('/');
      comments.push({ id, author: comment.author?.displayName || comment.author?.name || 'unknown', body: comment.text || '', createdAt: comment.createdDate ? new Date(comment.createdDate).toISOString() : '', path, line: anchor?.line, side: anchor?.fileType === 'FROM' ? 'LEFT' : anchor?.fileType === 'TO' ? 'RIGHT' : undefined });
    }
    for (const child of comment.comments || []) append(child, anchor);
  };
  for (const activity of data.activities) append(activity.comment, activity.commentAnchor);
  const participants = [...(data.pull.reviewers || []), ...(data.pull.participants || [])];
  const unique = new Map<string, { author: string; state: string }>();
  for (const item of participants) {
    const author = item.user?.displayName || item.user?.name;
    if (author) unique.set(item.user?.name || author, { author, state: item.approved ? 'APPROVED' : item.status || 'UNAPPROVED' });
  }
  return {
    headHash: data.pull.fromRef?.latestCommit || '',
    baseHash: data.pull.toRef?.latestCommit || '',
    files: parseDiff(data.diff), comments,
    approvals: [...unique.values()],
    checks: data.builds.map((build) => ({ name: build.name || build.key || 'Build', state: build.state || 'UNKNOWN', url: build.url })),
    warnings: data.warnings,
  };
}
