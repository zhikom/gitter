export interface VirtualBranch {
  id: string;
  name: string;
  color: string;
  targetBranch: string; // e.g. 'main' or 'origin/main'
  description?: string;
  filePaths: string[]; // files allocated to this virtual branch
  /** The lane's changes are put away under refs/gitter/lanes/<id> instead of in the working tree. */
  isStashed?: boolean;
  createdAt: number;
}
