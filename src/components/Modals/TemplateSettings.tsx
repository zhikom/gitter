import React, { useEffect, useState } from 'react';
import { EMPTY_TEMPLATES, MAX_TEMPLATE_LENGTH, type TemplateKind, type TemplateSet } from '../../../shared/templates';
import { api } from '../../api/client';
import { usePreference } from '../../preferences';
import { toast } from '../../utils/toast';
import { Button, inputClass } from '../ui/Modal';

const kinds: Array<[TemplateKind, string]> = [['commit', 'Commit message'], ['branch', 'Branch name'], ['pullRequest', 'Pull request description']];

export const TemplateSettings: React.FC<{ repo: string }> = ({ repo }) => {
  const [personal, setPersonal] = usePreference('personalTemplates');
  const [local, setLocal] = useState<TemplateSet>({ ...EMPTY_TEMPLATES });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gitStatus, setGitStatus] = useState('');
  useEffect(() => {
    let active = true;
    if (!repo) { setLoaded(false); return; }
    setLoaded(false);
    api.templates({ repo }).then((data) => {
      if (!active) return;
      setLocal(data.repository); setGitStatus(data.gitCommit.error || (data.gitCommit.text ? 'Git commit.template is available as a fallback.' : 'No Git commit.template is configured.')); setLoaded(true);
    }).catch((error) => { if (active) toast.error(`Could not load repository templates: ${error.message}`); });
    return () => { active = false; };
  }, [repo]);
  const save = async () => {
    setSaving(true);
    try { await api.saveTemplates({ repo, templates: local }); toast.success('Repository templates saved.'); }
    catch (error) { toast.error(`Could not save templates: ${(error as Error).message}`); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Templates</h3><p className="mt-2 text-slate-400">Insert templates into an empty draft when you choose. Repository templates take precedence over personal templates, then enabled packs; Git’s commit.template is the final fallback for commit messages.</p><p className="mt-2 text-slate-500">Available literal placeholders: {'{branch}'}, {'{base}'}, {'{repository}'}, {'{date}'}. Unknown placeholders remain visible.</p></div>
    <section className="space-y-3"><h4 className="font-semibold text-slate-200">Personal · this installation</h4>{kinds.map(([kind, label]) => <label id={`setting-template-personal-${kind}`} key={kind} className="block"><span className="block mb-1 text-slate-400">{label}</span><textarea aria-label={`Personal ${label} template`} maxLength={MAX_TEMPLATE_LENGTH} rows={kind === 'branch' ? 1 : 3} value={personal[kind]} onChange={(event) => setPersonal((current) => ({ ...current, [kind]: event.target.value }))} className={`${inputClass} font-mono`} /></label>)}</section>
    <section className="space-y-3"><h4 className="font-semibold text-slate-200">This repository</h4>{!repo ? <p className="text-slate-500">Open a repository to configure its templates.</p> : <>
      <p className="text-slate-500">Stored locally in Gitter’s repository data; shared linked worktrees use the same templates. {gitStatus}</p>
      {kinds.map(([kind, label]) => <label id={`setting-template-repo-${kind}`} key={kind} className="block"><span className="block mb-1 text-slate-400">{label}</span><textarea aria-label={`Repository ${label} template`} disabled={!loaded} maxLength={MAX_TEMPLATE_LENGTH} rows={kind === 'branch' ? 1 : 3} value={local[kind]} onChange={(event) => setLocal((current) => ({ ...current, [kind]: event.target.value }))} className={`${inputClass} font-mono`} /></label>)}
      <Button type="button" disabled={!loaded} busy={saving} onClick={() => void save()}>Save repository templates</Button>
    </>}</section>
    <p className="text-slate-500">Bitbucket Data Center can also have a server-side pull request template. Gitter does not fetch that server setting.</p>
  </div>;
};
