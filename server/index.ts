// Gitter's backend process. Two hosts start it:
// - the desktop app, with --desktop: a free loopback port and a fresh token,
//   reported on stdout, and an exit when the app exits;
// - `npm start` in development, on port 3001 with the token in GITTER_TOKEN,
//   which Vite's proxy adds to every request.
import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import { AddressInfo } from 'net';
import { DESKTOP_FLAG, DEV_BACKEND_PORT, PARENT_PID_FLAG, READY_PREFIX, TOKEN_HEADER } from '../shared/host';
import { agentSnapshot } from './agents';
import { createHandlers } from './handlers';
import { repoPath, serveApi } from './http';

const desktop = process.argv.includes(DESKTOP_FLAG);
const parentPid = Number(process.argv.find((a) => a.startsWith(PARENT_PID_FLAG))?.slice(PARENT_PID_FLAG.length)) || 0;
const token = (!desktop && process.env.GITTER_TOKEN) || crypto.randomBytes(24).toString('hex');

const app = express();

// Chromium-based webviews (WebView2, Edge) ask before a page reaches a loopback
// address (Private Network Access); this header answers yes on the preflight.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors({ origin: true, allowedHeaders: ['Content-Type', TOKEN_HEADER] }));

// Every request needs the token, so no other web page can drive git through this backend.
app.use('/api', (req, res, next) => {
  if (req.get(TOKEN_HEADER) === token || req.query.token === token) return next();
  res.status(401).json({ error: 'Missing or invalid Gitter token.' });
});

app.use(express.json({ limit: '50mb' }));

/** Pushes the repository's agent snapshot whenever it changes. */
app.get('/api/events', async (req, res) => {
  let repo: string;
  try {
    repo = repoPath(req.query.repo);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  let open = true;
  req.on('close', () => (open = false));
  let last = '';
  while (open) {
    try {
      const payload = JSON.stringify(await agentSnapshot(repo));
      // An unchanged snapshot still gets a comment line, which keeps proxies from closing the stream.
      res.write(payload === last ? ': unchanged\n\n' : `data: ${payload}\n\n`);
      last = payload;
    } catch (e: any) {
      // A named event; EventSource reserves "error" for its own connection failures.
      res.write(`event: problem\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
});

serveApi(
  app,
  createHandlers({
    onUpdateInstalling: () => {
      // The installer replaces this executable; exit so the file is not in use.
      if (desktop) setTimeout(() => process.exit(0), 500);
    },
  })
);

const server = app.listen(desktop ? 0 : Number(process.env.PORT) || DEV_BACKEND_PORT, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  if (desktop) console.log(`${READY_PREFIX}${JSON.stringify({ port, token })}`);
  else if (process.env.GITTER_TOKEN) console.log(`Gitter backend listening on http://127.0.0.1:${port}`);
  else console.log(`Gitter backend listening on http://127.0.0.1:${port} (token ${token})`);
});

if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 2000);
}
