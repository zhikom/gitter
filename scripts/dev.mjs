// `npm start`: the backend and Vite's dev server, sharing one access token.
// The browser never sees the token; Vite's proxy adds it to every /api request.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const env = { ...process.env, GITTER_TOKEN: crypto.randomBytes(24).toString('hex') };
// npx is a .cmd shim on Windows, which only starts through a shell; the commands are fixed strings.
const children = [
  spawn('npx tsx server/index.ts', { stdio: 'inherit', env, shell: true }),
  spawn('npx vite', { stdio: 'inherit', env, shell: true }),
];

const stop = (code) => {
  for (const child of children) child.kill();
  process.exit(code ?? 0);
};
for (const child of children) child.on('exit', (code) => stop(code));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
