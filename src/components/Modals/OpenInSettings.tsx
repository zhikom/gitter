import React, { useState } from 'react';
import { usePreference } from '../../preferences';
import type { OpenInApp } from '../../../shared/types/openIn';
import { Button, Field, inputClass } from '../ui/Modal';
import { pickApplication } from '../../api/client';
import { toast } from '../../utils/toast';

export const OpenInSettings: React.FC = () => {
  const [apps, setApps] = usePreference('openInApps');
  const [editing, setEditing] = useState<string | null>(null);
  const update = (id: string, change: Partial<OpenInApp>) => setApps((current) => current.map((app) => app.id === id ? { ...app, ...change } : app));
  const move = (index: number, direction: -1 | 1) => setApps((current) => {
    const next = [...current]; const target = index + direction;
    if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const add = () => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setApps((current) => [...current, { id, name: 'Custom app', kind: 'application', target: '', args: [], enabled: true }]);
    setEditing(id);
  };
  return <div className="max-w-2xl space-y-3 text-xs text-slate-300">
    <p>Choose and arrange the apps shown in the repository’s Open in menu.</p>
    {apps.map((app, index) => <div key={app.id} className="rounded border border-[#2a3447] bg-[#14181f] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 min-w-32"><input type="checkbox" checked={app.enabled} onChange={(event) => update(app.id, { enabled: event.target.checked })} /><span>{app.name || 'Unnamed app'}</span></label>
        <Button type="button" aria-label={`Move ${app.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
        <Button type="button" aria-label={`Move ${app.name} down`} disabled={index === apps.length - 1} onClick={() => move(index, 1)}>↓</Button>
        <Button type="button" onClick={() => setEditing(editing === app.id ? null : app.id)}>{editing === app.id ? 'Done' : 'Configure'}</Button>
        {['application', 'command'].includes(app.kind) && <Button type="button" onClick={() => { setApps((current) => current.filter((item) => item.id !== app.id)); if (editing === app.id) setEditing(null); }}>Remove</Button>}
      </div>
      {editing === app.id && <div className="space-y-2">
        <Field label="Name"><input aria-label="Application name" className={inputClass} value={app.name} onChange={(event) => update(app.id, { name: event.target.value })} /></Field>
        {['application', 'command'].includes(app.kind) && <Field label="Launch as"><select className={inputClass} value={app.kind} onChange={(event) => update(app.id, { kind: event.target.value as 'application' | 'command' })}><option value="application">Application</option><option value="command">Command or executable</option></select></Field>}
        {['vscode', 'rider', 'application', 'command'].includes(app.kind) && <><Field label={['vscode', 'rider'].includes(app.kind) ? 'Application name or path (optional)' : 'Application name or executable path'}><div className="flex gap-2"><input aria-label="Application path" className={inputClass} value={app.target} onChange={(event) => update(app.id, { target: event.target.value })} placeholder={app.kind === 'command' ? '/path/to/executable' : '/Applications/Example.app'} /><Button type="button" onClick={async () => { try { const target = await pickApplication(); if (target) update(app.id, { target }); } catch (error: any) { toast.error(error.message); } }}>Browse…</Button></div></Field>
          <Field label="Arguments (one per line)" hint="Use {path} to place the repository folder; otherwise it is added at the end."><textarea aria-label="Application arguments" className={inputClass} rows={2} value={app.args.join('\n')} onChange={(event) => update(app.id, { args: event.target.value ? event.target.value.split('\n') : [] })} /></Field></>}
        {['codex', 'claude'].includes(app.kind) && <p className="text-slate-500">Opens a new desktop coding session in the repository folder.</p>}
        {app.kind === 'terminal' && <p className="text-slate-500">Opens the system terminal in the repository folder.</p>}
      </div>}
    </div>)}
    <Button type="button" onClick={add}>Add application…</Button>
  </div>;
};
