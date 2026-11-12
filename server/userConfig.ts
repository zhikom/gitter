// Settings that belong to the user rather than a repository, kept in the OS's
// per-user application data folder so the desktop app and a dev server share them.
import fs from 'fs';
import os from 'os';
import path from 'path';

function configDir(): string {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Gitter');
  return path.join(os.homedir(), 'Library', 'Application Support', 'Gitter');
}

export async function readUserConfig<T extends object>(name: string, defaults: T): Promise<T> {
  try {
    return { ...defaults, ...JSON.parse(await fs.promises.readFile(path.join(configDir(), `${name}.json`), 'utf8')) };
  } catch (e: any) {
    if (e?.code === 'ENOENT') return defaults;
    throw e;
  }
}

/** Writes the file readable by the user only: it can hold API keys. */
export async function writeUserConfig(name: string, value: object): Promise<void> {
  await fs.promises.mkdir(configDir(), { recursive: true });
  await fs.promises.writeFile(path.join(configDir(), `${name}.json`), JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
}
