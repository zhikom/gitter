import React from 'react';
import { MAX_TOOLBAR_ACTIONS, TOOLBAR_ACTIONS, type ToolbarAction } from '../../../shared/types/toolbar';
import type { Command } from '../../commands';
import { resetPreference, usePreference } from '../../preferences';
import { Button } from '../ui/Modal';

export const ToolbarSettings: React.FC<{ commands: Command[] }> = ({ commands }) => {
  const [selected, setSelected] = usePreference('toolbarActions');
  const ordered = [...selected, ...TOOLBAR_ACTIONS.filter((id) => !selected.includes(id))];
  const move = (id: ToolbarAction, direction: -1 | 1) => setSelected((current) => {
    const index = current.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  return <div className="space-y-3 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Toolbar actions</h3><p className="mt-2 text-slate-400">Choose and reorder up to {MAX_TOOLBAR_ACTIONS} repository actions. All actions remain available in the command palette.</p></div>
    <div className="space-y-1">{ordered.map((id) => {
      const command = commands.find((item) => item.id === id);
      if (!command) return null;
      const index = selected.indexOf(id);
      return <div key={id} className="flex items-center gap-2 rounded border border-[#2a3447] px-2 py-1.5"><label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={index >= 0} disabled={index < 0 && selected.length >= MAX_TOOLBAR_ACTIONS} onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} />{command.title}</label><Button type="button" aria-label={`Move ${command.title} up`} disabled={index <= 0} onClick={() => move(id, -1)}>↑</Button><Button type="button" aria-label={`Move ${command.title} down`} disabled={index < 0 || index === selected.length - 1} onClick={() => move(id, 1)}>↓</Button></div>;
    })}</div>
    <Button type="button" onClick={() => resetPreference('toolbarActions')}>Reset toolbar</Button>
  </div>;
};
