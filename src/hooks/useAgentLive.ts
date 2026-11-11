import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../api/client';
import { AgentFleetState } from '../types/agentFleet';
import { AgentReviewState } from '../types/agentReview';
import { toast } from '../utils/toast';

export interface AgentLiveState {
  fleet: AgentFleetState | null;
  review: AgentReviewState | null;
  connected: boolean;
  lastUpdated: number;
  refresh: () => Promise<void>;
  applyFleet: Dispatch<SetStateAction<AgentFleetState | null>>;
  applyReview: Dispatch<SetStateAction<AgentReviewState | null>>;
}

/**
 * Live fleet + review state over SSE, with polling fallback and attention routing.
 * Routine agent progress never interrupts; only review decisions and errors do.
 */
export function useAgentLive(repoPath: string): AgentLiveState {
  const [fleet, setFleet] = useState<AgentFleetState | null>(null);
  const [review, setReview] = useState<AgentReviewState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const seenAttention = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const connectedRef = useRef(false);

  const applySnapshot = useCallback((nextFleet: AgentFleetState, nextReview: AgentReviewState) => {
    setFleet(nextFleet);
    setReview(nextReview);
    setLastUpdated(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    try {
      const [nextFleet, nextReview] = await Promise.all([
        api.getAgentFleet(repoPath),
        api.getAgentReview(repoPath),
      ]);
      applySnapshot(nextFleet, nextReview);
    } catch {
      // The server may still be starting; the stream or next poll will recover.
    }
  }, [repoPath, applySnapshot]);

  useEffect(() => {
    if (!repoPath) {
      setFleet(null);
      setReview(null);
      setConnected(false);
      return;
    }

    seenAttention.current = new Set();
    connectedRef.current = false;
    initialized.current = false;
    let cancelled = false;

    const unsubscribe = api.subscribeAgentEvents(
      repoPath,
      (snapshot) => {
        if (!cancelled) applySnapshot(snapshot.fleet, snapshot.review);
      },
      (isConnected) => {
        connectedRef.current = isConnected;
        if (!cancelled) setConnected(isConnected);
      }
    );

    // Poll only as a fallback while the event stream is down.
    const poll = setInterval(() => {
      if (!cancelled && !connectedRef.current) refresh();
    }, 10_000);

    refresh();

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(poll);
    };
  }, [repoPath, applySnapshot, refresh]);

  // Attention routing: decisions and errors interrupt; everything else stays ambient.
  useEffect(() => {
    if (!review) return;
    const interruptive = review.attention.filter(
      (item) =>
        item.kind === 'review' ||
        item.kind === 'collision' ||
        item.kind === 'index-lock' ||
        item.kind === 'error'
    );

    if (!initialized.current) {
      interruptive.forEach((item) => seenAttention.current.add(item.id));
      initialized.current = true;
      return;
    }

    for (const item of interruptive) {
      if (seenAttention.current.has(item.id)) continue;
      seenAttention.current.add(item.id);
      if (item.kind === 'review') {
        toast.info(item.title);
      } else if (item.kind === 'index-lock' || item.kind === 'error' || item.severity === 'high') {
        toast.error(`${item.title}\n${item.detail}`);
      } else {
        toast.info(`${item.title}\n${item.detail}`);
      }
    }
  }, [review]);

  return {
    fleet,
    review,
    connected,
    lastUpdated,
    refresh,
    applyFleet: setFleet,
    applyReview: setReview,
  };
}
