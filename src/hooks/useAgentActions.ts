import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { AgentHarness } from '../../shared/types/agentFleet';
import type { AgentDiff, AgentReviewSnapshot } from '../../shared/types/agentReview';
import { toast } from '../utils/toast';

/** What the user can do with agents; each action shows its result and the new snapshot. */
export interface AgentActions {
  spawn(harness: AgentHarness, task: string, baseRef?: string): Promise<void>;
  claim(agentId: string, files: string[]): Promise<void>;
  release(agentId: string, removeWorktree: boolean): Promise<void>;
  clearStaleLock(): Promise<void>;
  approve(agentId: string, merge: boolean): Promise<void>;
  requestChanges(agentId: string, feedback: string): Promise<void>;
  discard(agentId: string): Promise<void>;
  checkpoint(agentId: string): Promise<void>;
  rollback(agentId: string): Promise<void>;
  /** Resolves to the agent's diff after the hunk is gone. */
  rejectHunk(agentId: string, patch: string): Promise<AgentDiff | null>;
}

/**
 * @param apply shows a snapshot an action returned
 * @param onRepositoryChanged runs after actions that change the open repository (merging, spawning)
 */
export function useAgentActions(
  repo: string,
  apply: (snapshot: AgentReviewSnapshot) => void,
  refresh: () => Promise<void>,
  onRepositoryChanged: () => void
): AgentActions {
  return useMemo(() => {
    // Runs one action: applies its snapshot, reports success or failure, and rethrows
    // so callers can keep their own state (a form, a busy flag) consistent.
    async function act<T>(run: () => Promise<T>, success: string, failure: string, changesRepository = false): Promise<T> {
      try {
        const result = await run();
        if (result && typeof result === 'object' && 'fleet' in result) apply(result as unknown as AgentReviewSnapshot);
        toast.success(success);
        if (changesRepository) onRepositoryChanged();
        return result;
      } catch (e: any) {
        toast.error(`${failure}: ${e.message}`);
        void refresh();
        throw e;
      }
    }

    return {
      spawn: async (harness, task, baseRef) => {
        const { worktreePath } = await act(() => api.spawnAgent({ repo, harness, task, baseRef }), 'Agent worktree created.', 'Could not create the agent', true);
        await refresh();
        toast.info(`Point your agent at ${worktreePath}`);
      },
      claim: (agentId, files) => act(() => api.claimFiles({ repo, agentId, files }), 'Claimed files updated.', 'Could not claim the files').then(() => undefined),
      release: (agentId, removeWorktree) =>
        act(() => api.releaseAgent({ repo, agentId, removeWorktree }), removeWorktree ? 'Agent released and its worktree removed.' : 'Agent released. Its branch is kept.', 'Could not release the agent', removeWorktree).then(
          () => undefined
        ),
      clearStaleLock: () => act(() => api.clearStaleIndexLock({ repo }), 'Removed the stale index lock.', 'Could not remove the lock').then(() => refresh()),
      approve: (agentId, merge) =>
        act(() => api.approveAgent({ repo, agentId, merge }), merge ? 'Agent branch merged.' : 'Agent changes approved and committed on its branch.', 'Approve failed', merge).then(() => undefined),
      requestChanges: (agentId, feedback) =>
        act(() => api.requestAgentChanges({ repo, agentId, feedback }), 'Feedback saved for the agent.', 'Could not save the feedback').then(() => undefined),
      discard: (agentId) => act(() => api.discardAgentChanges({ repo, agentId }), "Agent's changes discarded.", 'Discard failed').then(() => undefined),
      checkpoint: (agentId) => act(() => api.checkpointAgent({ repo, agentId }), 'Checkpoint saved.', 'Checkpoint failed').then(() => undefined),
      rollback: (agentId) => act(() => api.rollbackAgent({ repo, agentId }), 'Rolled back to the checkpoint.', 'Rollback failed').then(() => undefined),
      rejectHunk: async (agentId, patch) => {
        const diff = await act(() => api.rejectAgentHunk({ repo, agentId, patch }), 'Hunk removed from the agent worktree.', 'Could not reject the hunk');
        void refresh();
        return diff;
      },
    };
  }, [repo, apply, refresh, onRepositoryChanged]);
}

/** An agent's diff against its base, reloaded whenever `version` changes. */
export function useAgentDiff(repo: string, agentId: string | null, version: unknown) {
  const [diff, setDiff] = useState<AgentDiff | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      setDiff(await api.agentDiff({ repo, agentId }));
    } catch (e: any) {
      toast.error(`Could not load the agent's changes: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [repo, agentId]);

  useEffect(() => {
    setDiff(null);
  }, [agentId]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  return { diff, setDiff, loading, reload };
}
