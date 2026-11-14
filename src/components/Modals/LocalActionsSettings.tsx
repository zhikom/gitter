import React, { useState } from 'react';
import type { LocalAction } from '../../../shared/types/localAction';
import { usePreference } from '../../preferences';
import { pickApplication } from '../../api/client';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass } from '../ui/Modal';

export const LocalActionsSettings: React.FC<{ repo: string; onRun: (action: LocalAction) => void }> = ({ repo, onRun }) => {
  const [actions, setActions] = usePreference('localActions');
  const [editing, setEditing] = useState<string | null>(null);
  const update = (id: string, change: Partial<LocalAction>) => setActions((items) => items.map((item) => item.id === id ? { ...item, ...change } : item));
  const add = () => {
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActions((items) => [...items, { id, name: 'New action', executable: '', args: [], workingDirectory: '', timeoutSeconds: 60, enabled: true }]);
    setEditing(id);
  };
  return <div className="space-y-3 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Local actions</h3><p className="mt-2 text-slate-400">Actions run only when you launch them. They use your account’s operating-system permissions and can access files and the network. Gitter does not pass inherited credential-related environment variables.</p></div>
    <p className="text-slate-500">Use {'{path}'}, {'{branch}'}, or {'{file}'} in an executable, argument, or working directory. Each argument is passed separately; no shell is used. An empty working directory uses the repository root.</p>
    {actions.map((action) => <div key={action.id} className="space-y-2 rounded border border-[#2a3447] p-3">
      <div className="flex flex-wrap items-center gap-2"><label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={action.enabled} onChange={(event) => update(action.id, { enabled: event.target.checked })} />{action.name || 'Unnamed action'}</label><Button type="button" disabled={!repo || !action.enabled || !action.name.trim() || !action.executable.trim()} onClick={() => onRun(action)}>Run…</Button><Button type="button" onClick={() => setEditing(editing === action.id ? null : action.id)}>{editing === action.id ? 'Done' : 'Configure'}</Button><Button type="button" onClick={() => setActions((items) => items.filter((item) => item.id !== action.id))}>Remove</Button></div>
      {editing === action.id && <div className="space-y-2">
        <Field label="Name"><input aria-label="Local action name" maxLength={80} className={inputClass} value={action.name} onChange={(event) => update(action.id, { name: event.target.value })} /></Field>
        <Field label="Executable"><div className="flex gap-2"><input aria-label="Local action executable" maxLength={1024} className={inputClass} value={action.executable} onChange={(event) => update(action.id, { executable: event.target.value })} /><Button type="button" onClick={async () => { try { const selected = await pickApplication(); if (selected) update(action.id, { executable: selected }); } catch (error) { toast.error((error as Error).message); } }}>Browse…</Button></div></Field>
        <Field label="Arguments (one per line)"><textarea aria-label="Local action arguments" className={inputClass} rows={3} value={action.args.join('\n')} onChange={(event) => update(action.id, { args: event.target.value ? event.target.value.split('\n').slice(0, 32).map((arg) => arg.slice(0, 4096)) : [] })} /></Field>
        <Field label="Working directory (optional)"><input aria-label="Local action working directory" maxLength={1024} className={inputClass} value={action.workingDirectory} onChange={(event) => update(action.id, { workingDirectory: event.target.value })} placeholder="Repository root" /></Field>
        <Field label="Timeout in seconds"><input aria-label="Local action timeout" type="number" min={1} max={300} className={inputClass} value={action.timeoutSeconds} onChange={(event) => update(action.id, { timeoutSeconds: Math.max(1, Math.min(300, Math.floor(Number(event.target.value) || 1))) })} /></Field>
      </div>}
    </div>)}
    <Button type="button" disabled={actions.length >= 30} onClick={add}>Add local action…</Button>
  </div>;
};
