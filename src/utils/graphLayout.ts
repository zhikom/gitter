import { Commit, GraphNode, GraphRoute } from '../../shared/types/git';

export const LANE_COLORS = [
  '#18b487', // Teal
  '#3b82f6', // Vivid Blue
  '#a855f7', // Purple
  '#f97316', // Orange
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#eab308', // Amber/Yellow
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#ef4444', // Red
];

export function getLaneColor(lane: number): string {
  return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length];
}

/**
 * Assigns each commit (newest first) a lane, and records the lines from it to
 * its parents and the lanes passing by. With `wipParent` (the checked-out
 * commit), a row for uncommitted changes goes on top, attached to it.
 */
export function layoutCommitGraph(commits: Commit[], wipParent?: string): GraphNode[] {
  if (commits.length === 0) return [];

  const nodes: GraphNode[] = [];
  // Active branches tracking: map from commit hash to assigned lane
  const activeLanes: (string | null)[] = [];
  const hashToNode = new Map<string, GraphNode>();

  // If there are uncommitted changes, add a WIP pseudo-commit
  const commitList = [...commits];
  if (wipParent !== undefined) {
    const wipCommit: Commit = {
      hash: 'wip',
      shortHash: 'WIP',
      parents: wipParent ? [wipParent] : [],
      author: { name: 'You (Uncommitted Changes)', email: '' },
      date: 'Just now',
      timestamp: Date.now(),
      message: 'Uncommitted Working Tree Changes',
      summary: 'Uncommitted Working Tree Changes',
      body: 'Working tree changes not yet committed',
      refs: ['* WIP *'],
      isWip: true,
    };
    commitList.unshift(wipCommit);
  }

  // First pass: assign lanes and calculate routes
  for (let rowIndex = 0; rowIndex < commitList.length; rowIndex++) {
    const commit = commitList[rowIndex];
    
    // Find if this commit is already expected in an active lane
    let lane = activeLanes.indexOf(commit.hash);
    const incoming = lane !== -1;
    if (lane === -1) {
      // Find the first empty lane or add a new lane
      lane = activeLanes.indexOf(null);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(commit.hash);
      } else {
        activeLanes[lane] = commit.hash;
      }
    }

    const color = getLaneColor(lane);
    const routes: GraphRoute[] = [];
    const passingLanes: number[] = [];

    // Active lanes that pass through this row without being this commit
    for (let l = 0; l < activeLanes.length; l++) {
      if (l !== lane && activeLanes[l] !== null) {
        passingLanes.push(l);
      }
    }

    // Now determine child -> parent connections for this commit
    const parents = commit.parents;

    if (parents.length === 0) {
      // Root commit - frees this lane
      activeLanes[lane] = null;
    } else {
      // Primary parent continues this lane if possible
      const primaryParent = parents[0];
      const existingParentLane = activeLanes.indexOf(primaryParent);

      if (existingParentLane === -1) {
        // Parent takes this current lane
        activeLanes[lane] = primaryParent;
        routes.push({
          fromLane: lane,
          toLane: lane,
          type: 'direct',
          color: color,
        });
      } else {
        // Parent is already active in another lane -> this is a merge or convergence
        activeLanes[lane] = null;
        routes.push({
          fromLane: lane,
          toLane: existingParentLane,
          type: 'merge',
          color: color,
        });
      }

      // Secondary parents (merge commits)
      for (let pIdx = 1; pIdx < parents.length; pIdx++) {
        const mergeParent = parents[pIdx];
        let mergeLane = activeLanes.indexOf(mergeParent);
        if (mergeLane === -1) {
          // Parent needs a new lane
          mergeLane = activeLanes.indexOf(null);
          if (mergeLane === -1) {
            mergeLane = activeLanes.length;
            activeLanes.push(mergeParent);
          } else {
            activeLanes[mergeLane] = mergeParent;
          }
        }

        routes.push({
          fromLane: lane,
          toLane: mergeLane,
          type: 'branch',
          color: getLaneColor(mergeLane),
        });
      }
    }

    // Trim trailing empty lanes
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    const node: GraphNode = {
      commit,
      lane,
      incoming,
      color,
      routes,
      passingLanes,
    };

    nodes.push(node);
    hashToNode.set(commit.hash, node);
  }

  return nodes;
}
