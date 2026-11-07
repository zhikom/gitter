export interface VirtualBranch {
  id: string;
  name: string;
  color: string;
  targetBranch: string; // e.g. 'main' or 'origin/main'
  description?: string;
  filePaths: string[]; // files allocated to this virtual branch
  isStashed?: boolean;
  stashPatch?: string;
  createdAt: number;
}

export interface VirtualBranchCommitPayload {
  path: string;
  branchName: string;
  files: string[];
  summary: string;
  description?: string;
  targetBranch?: string;
  pushUpstream?: boolean;
}
