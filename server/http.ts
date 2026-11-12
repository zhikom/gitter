// The backend API is a map of named operations. Each one is reached as
// `POST /api/<name>` with its input as the JSON body and its result as the JSON
// response, and its TypeScript signature is the contract: the UI's client is
// typed from the same handler map (see server/handlers.ts).
import path from 'path';
import type { Express } from 'express';
import { CommandError } from './git';

/** A request refused as given. Its message is shown to the user. */
export class UserError extends Error {}

type Handler = (input: any) => unknown;

/** The repository a request acts on; every repository operation takes one. */
export interface RepoInput {
  repo: string;
}

export function repoPath(repo: unknown): string {
  if (typeof repo !== 'string' || !repo.trim()) throw new UserError('No repository was given.');
  return path.resolve(repo);
}

/** Wraps a handler that acts on a repository: it gets the resolved path first. */
export function inRepo<In extends object, Out>(handler: (repo: string, input: In) => Out) {
  // Async, so a missing repository rejects like any other failure instead of throwing.
  return async (input: In & RepoInput): Promise<Awaited<Out>> => await handler(repoPath(input.repo), input);
}

/** Merges domain handler maps; two domains defining one name is a startup error. */
export function combine<Maps extends Record<string, Handler>[]>(...maps: Maps): UnionToIntersection<Maps[number]> {
  const merged: Record<string, Handler> = {};
  for (const map of maps) {
    for (const [name, handler] of Object.entries(map)) {
      if (name in merged) throw new Error(`Two handlers are named "${name}".`);
      merged[name] = handler;
    }
  }
  return merged as UnionToIntersection<Maps[number]>;
}

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never;

export function serveApi(app: Express, handlers: Record<string, Handler>): void {
  app.post('/api/:operation', async (req, res) => {
    const { operation } = req.params;
    const handler = Object.hasOwn(handlers, operation) ? handlers[operation] : undefined;
    if (!handler) {
      res.status(404).json({ error: `Unknown operation "${operation}".` });
      return;
    }
    try {
      res.json((await handler(req.body ?? {})) ?? null);
    } catch (e: any) {
      // A failed git or gh command is an expected outcome (conflicts, rejected
      // pushes); anything else is a bug in Gitter.
      const status = e instanceof UserError ? 400 : e instanceof CommandError ? 422 : 500;
      if (status === 500) console.error(`${operation} failed:`, e);
      res.status(status).json({ error: e?.message ?? String(e) });
    }
  });
}
