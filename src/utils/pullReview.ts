import { parseDiff } from '../../server/gitParse';
import type { ReviewComment, ReviewSnapshot } from '../../shared/types/review';

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
