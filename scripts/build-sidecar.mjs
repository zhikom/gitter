// Compiles the backend (server/index.ts) into the standalone executable the
// desktop app ships as its `gitter-server` sidecar. Tauri looks for it at
// src-tauri/binaries/gitter-server-<target triple>[.exe].
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src-tauri', 'binaries');

// Tauri sets this for its before-build commands; otherwise build for this machine.
const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  execSync('rustc -vV', { encoding: 'utf8' }).match(/^host: (.+)$/m)[1].trim();

const BUN_TARGETS = {
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
  'aarch64-pc-windows-msvc': 'bun-windows-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'aarch64-apple-darwin': 'bun-darwin-arm64',
};

function run(command, args) {
  // bun is often an npm shim (bun.cmd), which Windows only starts through a shell.
  const commandLine = [command, ...args.map((a) => `"${a}"`)].join(' ');
  const result = spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compile(target, outfile) {
  run('bun', ['build', 'server/index.ts', '--compile', `--target=${target}`, `--outfile=${outfile}`]);
}

mkdirSync(outDir, { recursive: true });
const output = (t) => path.join(outDir, `gitter-server-${t}${t.includes('windows') ? '.exe' : ''}`);

if (triple === 'universal-apple-darwin') {
  const parts = ['x86_64-apple-darwin', 'aarch64-apple-darwin'];
  for (const t of parts) compile(BUN_TARGETS[t], output(t));
  run('lipo', ['-create', '-output', output(triple), ...parts.map(output)]);
  // Tauri compiles each architecture separately before bundling the universal
  // app, so its build script still needs the two thin sidecars at that point.
} else if (BUN_TARGETS[triple]) {
  compile(BUN_TARGETS[triple], output(triple));
} else {
  console.error(`No sidecar build for target ${triple}. Gitter ships for Windows and macOS.`);
  process.exit(1);
}
