// The UI's view of the backend. Every operation is `POST <backend>/<name>` with
// one JSON object in and one JSON value out, and its types come straight from
// the server's handler map, so a changed handler is a type error here.
import { isTauri } from '@tauri-apps/api/core';
import type { Handlers } from '../../server/handlers';
import { TOKEN_HEADER } from '../../shared/host';
import type { AgentReviewSnapshot } from '../../shared/types/agentReview';

interface BackendLocation {
  baseUrl: string;
  token?: string;
}

declare global {
  interface Window {
    /** Set by the desktop app before the page loads: where its bundled backend listens. */
    __GITTER_BACKEND__?: BackendLocation;
  }
}

// In a browser the backend is reached through Vite's /api proxy, which adds the token.
const backend: BackendLocation = window.__GITTER_BACKEND__ ?? { baseUrl: '/api' };

type Api = {
  [Name in keyof Handlers]: Handlers[Name] extends (input: infer In) => infer Out
    ? {} extends In
      ? (input?: In) => Promise<Awaited<Out>>
      : (input: In) => Promise<Awaited<Out>>
    : never;
};

async function call(operation: string, input: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${backend.baseUrl}/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(backend.token ? { [TOKEN_HEADER]: backend.token } : {}) },
      body: JSON.stringify(input ?? {}),
    });
  } catch {
    throw new Error(`Cannot reach the Gitter backend at ${backend.baseUrl}. Is it running?`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Backend error ${res.status} ${res.statusText}`);
  return body;
}

export const api = new Proxy({} as Api, {
  // "then" is not an operation: without this, `await api` would POST /then.
  get: (_, operation) => (typeof operation === 'string' && operation !== 'then' ? (input: unknown) => call(operation, input) : undefined),
});

/** Shows the OS folder picker. Resolves to the chosen folder, or null if cancelled. */
export async function pickFolder(title = 'Select folder'): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === 'string' ? picked.replace(/\\/g, '/') : null;
  }
  // A plain browser has no folder dialog that reveals paths, so the backend shows one.
  return api.pickFolder({ title });
}

/**
 * Follows the repository's agent snapshot as the backend pushes it, reconnecting
 * after a dropped connection. Returns the function that stops following.
 */
export function subscribeAgentEvents(
  repo: string,
  onSnapshot: (snapshot: AgentReviewSnapshot) => void,
  onConnectionChange: (connected: boolean) => void
): () => void {
  // EventSource cannot send headers, so the token travels in the query string.
  const query = new URLSearchParams({ repo, ...(backend.token ? { token: backend.token } : {}) });
  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const connect = () => {
    source = new EventSource(`${backend.baseUrl}/events?${query}`);
    source.onopen = () => onConnectionChange(true);
    source.onmessage = (event) => onSnapshot(JSON.parse(event.data));
    // The backend could not read the repository this time; the stream stays open.
    source.addEventListener('problem', () => onConnectionChange(false));
    source.onerror = () => {
      onConnectionChange(false);
      source?.close();
      if (!stopped) retry = setTimeout(connect, 1500);
    };
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
  };
}
