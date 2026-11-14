import React, { useState } from 'react';
import { applyPanelLayout, capturePanelLayout, defaultPanelLayout } from '../../layoutPreferences';
import { usePreference } from '../../preferences';
import { toast } from '../../utils/toast';
import { Button, inputClass } from '../ui/Modal';

export const LayoutSettings: React.FC = () => {
  const [layouts, setLayouts] = usePreference('panelLayouts');
  const [name, setName] = useState('');
  const apply = (values: ReturnType<typeof capturePanelLayout>, label: string) => {
    try { applyPanelLayout(values); toast.success(`${label} applied.`); }
    catch (error) { toast.error((error as Error).message); }
  };
  const save = () => {
    const cleaned = name.trim();
    if (!cleaned || cleaned.length > 60 || /[\x00-\x1f\x7f]/.test(cleaned) || layouts.length >= 30) return;
    const id = `layout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setLayouts((previous) => [...previous, { id, name: cleaned, values: capturePanelLayout() }]);
    setName(''); toast.success('Panel layout saved.');
  };
  return <div className="space-y-4 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Panel layouts</h3><p className="mt-2 text-slate-400">Save panel visibility, widths, and lane mode for this installation. Repository tabs and commit drafts are not part of a layout.</p></div>
    <div className="flex gap-2"><input aria-label="New layout name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Layout name" className={inputClass} /><Button type="button" disabled={!name.trim() || layouts.length >= 30} onClick={save}>Save current</Button></div>
    {!layouts.length && <p className="text-slate-500">No saved layouts yet.</p>}
    <div className="space-y-2">{layouts.map((layout) => <div key={layout.id} className="flex items-center gap-2 rounded border border-[#2a3447] px-3 py-2"><span className="flex-1 break-words">{layout.name}</span><Button type="button" aria-label={`Apply ${layout.name} layout`} onClick={() => apply(layout.values, layout.name)}>Apply</Button><Button type="button" aria-label={`Update ${layout.name} layout`} onClick={() => { setLayouts((previous) => previous.map((item) => item.id === layout.id ? { ...item, values: capturePanelLayout() } : item)); toast.success(`${layout.name} updated.`); }}>Update</Button><Button type="button" aria-label={`Delete ${layout.name} layout`} onClick={() => setLayouts((previous) => previous.filter((item) => item.id !== layout.id))}>Delete</Button></div>)}</div>
    <Button type="button" onClick={() => apply(defaultPanelLayout(), 'Default layout')}>Reset current layout</Button>
  </div>;
};
