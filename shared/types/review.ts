import type { FileDiff } from './git';

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  outdated?: boolean;
  url?: string;
}

export interface ReviewCheck {
  name: string;
  state: string;
  url?: string;
}

export interface ReviewApproval {
  author: string;
  state: string;
}

export interface ReviewSnapshot {
  headHash: string;
  baseHash: string;
  files: FileDiff[];
  comments: ReviewComment[];
  approvals: ReviewApproval[];
  checks: ReviewCheck[];
  warnings: string[];
}

export interface ReviewAnchor {
  path: string;
  oldPath?: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  lineType: 'add' | 'delete' | 'context';
}

export interface ReviewSuggestion extends ReviewAnchor {
  body: string;
}
