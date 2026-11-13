import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, subscribeAgentEvents } from '../api/client';
import type { AgentFleetState } from '../../shared/types/agentFleet';
import type { AgentReviewItem, AgentReviewSnapshot } from '../../shared/types/agentReview';
import { attentionItems, type AttentionItem } from '../components/Agent/agentUi';
import { toast } from '../utils/toast';

export interface AgentLiveState {
  fleet: AgentFleetState | null;
  reviews: AgentReviewItem[];
  attention: AttentionItem[];
  /** Whether the backend's event stream is connected; while it is not, the hook polls. */
  connected: boolean;
  /** Shows a snapshot an agent action in `repo` returned, unless another repository has opened since. */
  apply: (snapshot: AgentReviewSnapshot, repo: string) => void;
  refresh: () => Promise<void>;
}

/**
 * The repository's agents, kept current by the backend's event stream. New
 * attention items raise a toast; ones present when the repository opened do not.
 */
export function useAgentLive(repo: string): AgentLiveState {
  const [snapshot, setSnapshot] = useState<AgentReviewSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  // Answers can arrive after the user switched repositories; only the open one's count.
  const openRepo = useRef(repo);
  openRepo.current = repo;

  const refresh = useCallback(async () => {
    if (!repo) return;
    try {
      const next = await api.agentSnapshot({ repo });
      if (openRepo.current === repo) setSnapshot(next);
    } catch {
      // The backend may still be starting; the stream or the next poll catches up.
    }
  }, [repo]);

  const apply = useCallback((next: AgentReviewSnapshot, from: string) => {
    if (openRepo.current === from) setSnapshot(next);
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setConnected(false);
    if (!repo) return;
    let cancelled = false;
    const unsubscribe = subscribeAgentEvents(
      repo,
      (next) => !cancelled && setSnapshot(next),
      (isConnected) => {
        connectedRef.current = isConnected;
        if (!cancelled) setConnected(isConnected);
      }
    );
    const poll = setInterval(() => !connectedRef.current && refresh(), 10_000);
    refresh();
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(poll);
    };
  }, [repo, refresh]);

  const attention = useMemo(() => (snapshot ? attentionItems(snapshot.fleet, snapshot.reviews) : []), [snapshot]);

  // Items already there when the repository opened are not news.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    seen.current = null;
  }, [repo]);
  useEffect(() => {
    if (!snapshot) return;
    if (!seen.current) {
      seen.current = new Set(attention.map((item) => item.id));
      return;
    }
    for (const item of attention) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      const message = item.kind === 'review' ? item.title : `${item.title}\n${item.detail}`;
      if (item.severity === 'high' && item.kind !== 'review') toast.error(message);
      else toast.info(message);
    }
  }, [snapshot, attention]);

  return {
    fleet: snapshot?.fleet ?? null,
    reviews: snapshot?.reviews ?? [],
    attention,
    connected,
    apply,
    refresh,
  };
}
