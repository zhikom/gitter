// Print the changelog section for a release tag, after checking its version.
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const tag = process.argv[2] ?? '';
const version = JSON.parse(read('package.json')).version;
const lock = JSON.parse(read('package-lock.json'));
const tauriVersion = JSON.parse(read('src-tauri/tauri.conf.json')).version;
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = read('src-tauri/Cargo.lock').match(/\[\[package\]\]\s*\nname = "gitter"\s*\nversion = "([^"]+)"/)?.[1];

if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}` ||
    [lock.version, lock.packages?.['']?.version, tauriVersion, cargoVersion, cargoLockVersion].some((value) => value !== version)) {
  console.error(`Release tag and app versions must all match ${version}; check package files, Tauri, Cargo, and their lockfiles.`);
  process.exit(1);
}

const lines = read('CHANGELOG.md').split(/\r?\n/);
const start = lines.findIndex((line) => line === `## [${version}]` || line.startsWith(`## [${version}] - `));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
let end = start + 1;
while (end < lines.length && !lines[end].startsWith('## ')) end++;
const notes = lines.slice(start + 1, end).join('\n').trim();
if (!notes) {
  console.error(`CHANGELOG.md has no release notes for ${version}.`);
  process.exit(1);
}
process.stdout.write(`${notes}\n`);
