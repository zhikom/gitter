import React, { useState } from 'react';
import { compatiblePack, packContrastProblems, parseDataPack, type DataPack } from '../../dataPacks';
import { resetPreference, usePreference } from '../../preferences';
import { CURRENT_VERSION } from '../../services/updateService';
import { toast } from '../../utils/toast';
import { Button, inputClass } from '../ui/Modal';

export const PackSettings: React.FC = () => {
  const [packs, setPacks] = usePreference('dataPacks');
  const [themePack, setThemePack] = usePreference('themePack');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<DataPack | null>(null);
  const [error, setError] = useState('');
  const check = () => {
    try {
      const pack = parseDataPack(source);
      if (!compatiblePack(pack, CURRENT_VERSION)) throw new Error(`This pack requires Gitter ${pack.minGitterVersion} or later within the same major version.`);
      if (packs.some((item) => item.manifest.id === pack.id)) throw new Error('A pack with this ID is already installed. Remove it before importing another version.');
      if (packs.length >= 10) throw new Error('Gitter supports up to 10 installed packs.');
      setPreview(pack); setError('');
    } catch (e) { setPreview(null); setError((e as Error).message); }
  };
  const install = () => {
    if (!preview) return;
    try {
      const pack = parseDataPack(source);
      if (!compatiblePack(pack, CURRENT_VERSION) || packs.some((item) => item.manifest.id === pack.id) || packs.length >= 10) throw new Error('The pack can no longer be imported. Preview it again.');
      setPacks((current) => [...current, { manifest: pack, enabled: false }]);
      setPreview(null); setSource(''); toast.success('Pack imported. Enable it when ready.');
    } catch (e) { setError((e as Error).message); }
  };
  return <div className="space-y-4 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Extension packs</h3><p className="mt-2 text-slate-400">Import versioned data-only packs containing theme colors, safe view shortcuts, and literal templates. Packs cannot execute code, inject CSS or HTML, start commands, or access the network.</p><p className="mt-2 text-slate-500">Personal shortcuts and templates take precedence. Conflicting pack shortcuts are skipped. Packs are imported disabled; enabling one never runs a command.</p></div>
    {packs.map(({ manifest, enabled }) => <div key={manifest.id} className="space-y-2 rounded border border-[#2a3447] p-3"><div className="flex flex-wrap items-center gap-2"><div className="flex-1"><span className="block font-semibold text-slate-200">{manifest.name} · {manifest.version}</span><span className="text-slate-500">{manifest.author} · {manifest.id}</span></div><Button type="button" disabled={!enabled && !compatiblePack(manifest, CURRENT_VERSION)} onClick={() => setPacks((items) => items.map((item) => item.manifest.id === manifest.id ? { ...item, enabled: !item.enabled } : item))}>{enabled ? 'Disable' : 'Enable'}</Button>{manifest.contributions.theme && <Button type="button" disabled={!enabled || !compatiblePack(manifest, CURRENT_VERSION)} onClick={() => setThemePack(manifest.id)}>{themePack === manifest.id && enabled ? 'Theme selected' : 'Use theme'}</Button>}<Button type="button" onClick={() => { setPacks((items) => items.filter((item) => item.manifest.id !== manifest.id)); if (themePack === manifest.id) resetPreference('themePack'); }}>Remove</Button></div><p className="text-slate-500">{[manifest.contributions.theme && 'Theme', manifest.contributions.keymap && 'Keymap', manifest.contributions.templates && 'Templates'].filter(Boolean).join(' · ')}{!compatiblePack(manifest, CURRENT_VERSION) ? ` · Requires Gitter ${manifest.minGitterVersion}` : ''}</p></div>)}
    {!packs.length && <p className="text-slate-500">No packs installed.</p>}
    <section id="setting-pack-import" className="space-y-2"><h4 className="font-semibold text-slate-200">Import a pack</h4><input aria-label="Choose a pack file" type="file" accept=".json,application/json" className="block max-w-full text-xs" onChange={(event) => { const file = event.target.files?.[0]; setPreview(null); setError(''); if (!file) return; if (file.size > 48_000) { setError('The pack is too large.'); return; } void file.text().then(setSource).catch(() => setError('Could not read the pack.')); }} /><textarea aria-label="Pack JSON" rows={6} value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); setError(''); }} placeholder="Paste a Gitter pack manifest" className={`${inputClass} font-mono`} /><Button type="button" disabled={!source.trim()} onClick={check}>Preview pack</Button>{error && <p role="alert" className="text-rose-300">{error}</p>}
      {preview && <div className="space-y-2 rounded border border-[#2a3447] p-3"><p className="font-semibold text-slate-200">{preview.name} · {preview.version} · {preview.author}</p><p className="text-slate-500">ID: {preview.id} · Requires Gitter {preview.minGitterVersion} or later in the same major version</p>{preview.contributions.theme && <div><p>Theme based on {preview.contributions.theme.base}:</p><ul>{Object.entries(preview.contributions.theme.colors).map(([key, value]) => <li key={key}><span aria-hidden="true" className="inline-block w-3 h-3 mr-1 border border-slate-500" style={{ backgroundColor: value }} />{key}: {value}</li>)}</ul>{packContrastProblems(preview).length > 0 && <p className="text-amber-300">Some text colors have low contrast: {packContrastProblems(preview).slice(0, 5).join('; ')}{packContrastProblems(preview).length > 5 ? '; …' : ''}. Other color pairs also need review.</p>}</div>}{preview.contributions.keymap && <p>Shortcuts: {Object.entries(preview.contributions.keymap).map(([id, value]) => `${id} → ${value ?? 'unassigned'}`).join('; ')}</p>}{preview.contributions.templates && Object.entries(preview.contributions.templates).map(([kind, value]) => <div key={kind}><span>{kind} template:</span><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words p-2 bg-[#14181f]">{value}</pre></div>)}<Button type="button" tone="primary" onClick={install}>Import disabled</Button></div>}
    </section>
  </div>;
};
