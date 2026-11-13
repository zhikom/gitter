import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { UserError } from './errors';

const exec = promisify(execFile);
const MAX_FONT_BYTES = 8_000_000;

/** Return only usable family names; the profiler includes disabled duplicates and faces. */
export function macFontFamilies(output: string): string[] {
  const data = JSON.parse(output);
  const files = Array.isArray(data.SPFontsDataType) ? data.SPFontsDataType : [];
  return uniqueFamilies(files.flatMap((file: any) => file?.enabled === 'no' || !Array.isArray(file?.typefaces) ? [] : file.typefaces.filter((face: any) => face?.enabled !== 'no').map((face: any) => face?.family)));
}

export function uniqueFamilies(items: unknown[]): string[] {
  return [...new Set(items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !item.trim().startsWith('.') && item.length <= 160 && !/[\x00-\x1f\x7f]/.test(item)).map((item) => item.trim()))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

const claudeFontDirs = () => platform() === 'darwin' ? [
  '/Applications/Claude.app/Contents/Resources/fonts',
  path.join(homedir(), 'Applications/Claude.app/Contents/Resources/fonts'),
] : [];

/** Look only in the user's installed Claude Desktop bundle; never package the fonts. */
export async function findClaudeSans(dirs: string[] = claudeFontDirs()): Promise<{ roman: string; italic?: string } | null> {
  for (const dir of dirs) {
    try {
      const names = (await fs.readdir(dir)).sort();
      const roman = names.find((name) => /^AnthropicSans-Romans-Variable-[\w.-]+\.ttf$/i.test(name))
        ?? names.find((name) => /^AnthropicSans-Text-Regular-Static\.otf$/i.test(name));
      const italic = names.find((name) => /^AnthropicSans-Italics-Variable-[\w.-]+\.ttf$/i.test(name));
      if (roman) return { roman: path.join(dir, roman), ...(italic ? { italic: path.join(dir, italic) } : {}) };
    } catch { /* Claude Desktop is not installed in this location. */ }
  }
  return null;
}

async function readFont(file: string): Promise<string> {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size < 12 || stat.size > MAX_FONT_BYTES) throw new UserError('Claude Desktop contains an invalid or oversized font file.');
  const data = await fs.readFile(file);
  const signature = data.subarray(0, 4).toString('hex');
  if (!['00010000', '4f54544f', '74746366', '774f4646', '774f4632'].includes(signature)) throw new UserError('Claude Desktop contains an unsupported font file.');
  return data.toString('base64');
}

async function systemFamilies(): Promise<string[]> {
  const options = { timeout: 30_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true };
  if (platform() === 'darwin') return macFontFamilies((await exec('/usr/sbin/system_profiler', ['SPFontsDataType', '-json'], options)).stdout);
  if (platform() === 'win32') {
    const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Drawing; $f = New-Object System.Drawing.Text.InstalledFontCollection; ConvertTo-Json -Compress -InputObject @($f.Families | ForEach-Object { $_.Name })";
    const result = JSON.parse((await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], options)).stdout);
    return uniqueFamilies(Array.isArray(result) ? result : [result]);
  }
  const output = (await exec('fc-list', [':', 'family'], options)).stdout;
  return uniqueFamilies(output.split('\n').flatMap((line) => line.split(',')));
}

export function createFontHandlers(dirs: string[] = claudeFontDirs()) {
  return {
  fontCatalog: async () => {
    const [available, families] = await Promise.all([findClaudeSans(dirs), systemFamilies().catch(() => null)]);
    return { families: families ?? [], listingFailed: families === null, claudeDesktopFont: Boolean(available) };
  },
  claudeSansFont: async () => {
    const files = await findClaudeSans(dirs);
    if (!files) throw new UserError('Install Claude Desktop or choose an installed Anthropic Sans font.');
    return { roman: await readFont(files.roman), italic: files.italic ? await readFont(files.italic) : null };
  },
  };
}

export const fontHandlers = createFontHandlers();
