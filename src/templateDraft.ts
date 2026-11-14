import { expandTemplate, type TemplateKind } from '../shared/templates';
import { api } from './api/client';
import { getPreference } from './preferences';
import { packTemplate } from './dataPacks';
import { CURRENT_VERSION } from './services/updateService';

export async function templateDraft(repo: string, kind: TemplateKind, branch: string, base = ''): Promise<{ text: string; source: string }> {
  const current = await api.templates({ repo });
  const local = current.repository[kind];
  const personal = getPreference('personalTemplates')[kind];
  const pack = packTemplate(getPreference('dataPacks'), kind, CURRENT_VERSION);
  const git = kind === 'commit' ? current.gitCommit.text : '';
  if (!local && !personal && !pack && !git) {
    if (kind === 'commit' && current.gitCommit.error) throw new Error(current.gitCommit.error);
    throw new Error('No template is configured. Add one in Settings → Templates.');
  }
  const date = new Date();
  const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return { text: expandTemplate(local || personal || pack?.text || git, { branch, base, repository: repo.split(/[\\/]/).filter(Boolean).pop() ?? '', date: today }), source: local ? 'this repository' : personal ? 'personal settings' : pack ? `pack ${pack.source}` : 'Git commit.template' };
}
