import React, { useMemo, useState } from 'react';
import { applyShortcutOverrides, isMac, shortcutLabel, type Command } from '../../commands';
import { usePreference } from '../../preferences';
import { reservedShortcut, shortcutFromEvent, shortcutIdentity } from '../../shortcutKeys';
import { Button, inputClass } from '../ui/Modal';

export const KeymapSettings: React.FC<{ commands: Command[] }> = ({ commands }) => {
  const [overrides, setOverrides] = usePreference('shortcutOverrides');
  const [filter, setFilter] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const current = useMemo(() => applyShortcutOverrides(commands, overrides), [commands, overrides]);
  const conflict = (id: string, shortcut: string | undefined) => shortcut && current.find((item) => item.id !== id && item.shortcut && shortcutIdentity(item.shortcut, isMac) === shortcutIdentity(shortcut, isMac));
  const record = (event: React.KeyboardEvent, command: Command) => {
    if (recording !== command.id) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { setRecording(null); setMessage(''); return; }
    const shortcut = shortcutFromEvent(event.nativeEvent, isMac);
    if (!shortcut) { setMessage('Use a modifier with a key, or a function key.'); return; }
    if (reservedShortcut(shortcut, isMac)) { setMessage(`${shortcutLabel(shortcut)} is reserved by the operating system or another Gitter control.`); return; }
    const other = conflict(command.id, shortcut);
    if (other) { setMessage(`${shortcutLabel(shortcut)} is already assigned to ${other.title}.`); return; }
    setOverrides((previous) => ({ ...previous, [command.id]: shortcut }));
    setRecording(null); setMessage('Shortcut saved.');
  };
  const reset = (command: Command) => {
    const other = conflict(command.id, command.shortcut);
    if (other) { setMessage(`Resetting ${command.title} would conflict with ${other.title}. Change that shortcut first.`); return; }
    setOverrides((previous) => { const next = { ...previous }; delete next[command.id]; return next; });
    setRecording(null); setMessage('Shortcut reset.');
  };
  const visible = commands.filter((command) => `${command.title} ${command.category}`.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className="space-y-3 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Keyboard shortcuts</h3><p className="mt-2 text-slate-400">Choose Record, then press a shortcut. Conflicts and system-reserved keys are rejected. Custom shortcuts do not run while typing or while a dialog is open.</p></div>
    <input aria-label="Filter keyboard shortcuts" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter actions…" className={inputClass} />
    <p aria-live="polite" className="min-h-4 text-amber-300">{message}</p>
    <div className="space-y-1">{visible.map((command) => {
      const assigned = current.find((item) => item.id === command.id)?.shortcut;
      const changed = Object.hasOwn(overrides, command.id);
      return <div key={command.id} className="flex flex-wrap items-center gap-2 rounded border border-[#2a3447] px-2 py-2">
        <div className="flex-1 min-w-36"><span className="block text-slate-200">{command.title}</span><span className="text-[10px] text-slate-500">{command.category}</span></div>
        <span className="min-w-20 text-right font-mono text-slate-300">{assigned ? shortcutLabel(assigned) : 'Unassigned'}</span>
        <Button type="button" aria-label={`Record shortcut for ${command.title}`} onClick={() => { setRecording(command.id); setMessage('Press the new shortcut, or Escape to cancel.'); }} onKeyDown={(event) => record(event, command)}>{recording === command.id ? 'Press keys…' : 'Record'}</Button>
        <Button type="button" aria-label={`Clear shortcut for ${command.title}`} disabled={!assigned} onClick={() => { setOverrides((previous) => ({ ...previous, [command.id]: null })); setRecording(null); setMessage('Shortcut cleared.'); }}>Clear</Button>
        <Button type="button" aria-label={`Reset shortcut for ${command.title}`} disabled={!changed} onClick={() => reset(command)}>Reset</Button>
      </div>;
    })}</div>
    {!visible.length && <p className="text-slate-500">No actions found.</p>}
  </div>;
};
