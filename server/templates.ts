import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { EMPTY_TEMPLATES, MAX_TEMPLATE_LENGTH, normalizeTemplates, type TemplateSet } from '../shared/templates';
import { CommandError, git } from './git';
import { inRepo, UserError } from './http';
import { readDoc, updateDoc } from './repoStore';

async function gitConfig(repo: string, key: string, pathValue = false): Promise<string> {
  try {
    const value = await git(repo, ['config', ...(pathValue ? ['--path'] : []), '--get', key]);
    return pathValue ? value.replace(/\r?\n$/, '') : value.trim();
  }
  catch (error) { if (error instanceof CommandError && error.code === 1) return ''; throw error; }
}

async function configuredCommitTemplate(repo: string): Promise<{ text: string; error?: string }> {
  const filename = await gitConfig(repo, 'commit.template', true);
  if (!filename) return { text: '' };
  const root = (await git(repo, ['rev-parse', '--show-toplevel'])).trim();
  const file = path.isAbsolute(filename) ? filename : path.resolve(root, filename);
  try {
    // A misconfigured FIFO must not block the sidecar while it is opened.
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_TEMPLATE_LENGTH * 4) throw new Error('Template is not a small text file.');
      const buffer = Buffer.alloc(MAX_TEMPLATE_LENGTH * 4 + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_TEMPLATE_LENGTH * 4) throw new Error('Template is too large.');
      bytes = buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.length > MAX_TEMPLATE_LENGTH || text.includes('\0')) throw new Error('Template is too large or contains a null character.');
    const comment = await gitConfig(repo, 'core.commentString').catch(() => '') || await gitConfig(repo, 'core.commentChar').catch(() => '') || '#';
    // Git treats only lines beginning with the configured comment marker as comments.
    return { text: comment === 'auto' ? text : text.split(/\r?\n/).filter((line) => !line.startsWith(comment)).join('\n') };
  } catch (error) { return { text: '', error: `Could not read Git's commit template: ${(error as Error).message}` }; }
}

export const templateHandlers = {
  templates: inRepo(async (repo) => {
    const stored = await readDoc<TemplateSet>(repo, 'templates', EMPTY_TEMPLATES);
    const repository = normalizeTemplates(stored) ?? { ...EMPTY_TEMPLATES };
    return { repository, gitCommit: await configuredCommitTemplate(repo) };
  }),
  saveTemplates: inRepo(async (repo, { templates }: { templates: TemplateSet }) => {
    const validated = normalizeTemplates(templates);
    if (!validated) throw new UserError('Templates must be plain text and at most 16,000 characters each.');
    await updateDoc<TemplateSet>(repo, 'templates', EMPTY_TEMPLATES, () => validated);
  }),
};
