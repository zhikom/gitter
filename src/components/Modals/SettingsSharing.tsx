import React, { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { SETTINGS, type SettingSection } from '../../settingsCatalog';
import { applySettingsBackup, exportSettings, parseSettingsBackup, SHARED_SECTIONS, type SettingsBackup } from '../../settingsTransfer';
import { toast } from '../../utils/toast';
import { Button, inputClass } from '../ui/Modal';

function SectionPicker({ available, selected, onChange }: { available: readonly SettingSection[]; selected: readonly SettingSection[]; onChange: (sections: SettingSection[]) => void }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-2">{available.map((section) => <label key={section} className="flex gap-1.5 items-center text-xs text-slate-300"><input type="checkbox" checked={selected.includes(section)} onChange={(event) => onChange(event.target.checked ? [...selected, section] : selected.filter((item) => item !== section))} />{section}</label>)}</div>;
}

export const SettingsSharing: React.FC = () => {
  const [exportSections, setExportSections] = useState<SettingSection[]>(SHARED_SECTIONS);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<SettingsBackup | null>(null);
  const [importSections, setImportSections] = useState<SettingSection[]>([]);
  const [error, setError] = useState('');
  const previewItems = preview ? SETTINGS.filter((item) => item.shareable && Object.hasOwn(preview.settings, item.key)) : [];
  const previewSections = [...new Set(previewItems.map((item) => item.section))];
  const prepare = () => {
    try {
      const parsed = parseSettingsBackup(text);
      setPreview(parsed);
      setImportSections([...new Set(SETTINGS.filter((item) => item.shareable && Object.hasOwn(parsed.settings, item.key)).map((item) => item.section))]);
      setError('');
    } catch (e) { setPreview(null); setError((e as Error).message); }
  };
  const makeDownload = async () => {
    try {
      const content = exportSettings(exportSections);
      if (isTauri()) {
        if (await invoke<boolean>('export_settings_backup', { content })) toast.success('Settings backup saved.');
        return;
      }
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'gitter-settings.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast.error((e as Error).message); }
  };
  const copyExport = async () => {
    try { await navigator.clipboard.writeText(exportSettings(exportSections)); toast.success('Settings JSON copied.'); }
    catch (e) { toast.error(`Could not copy settings: ${(e as Error).message}`); }
  };
  return <div className="space-y-6 text-xs text-slate-300">
    <div><h3 className="text-sm font-semibold text-slate-100">Settings backup</h3><p className="mt-2 text-slate-400">Choose what to share between Gitter installations. Repository paths, recent repositories, accounts, tokens, and Open in commands are excluded.</p></div>
    <section className="space-y-3"><h4 className="font-semibold text-slate-200">Export</h4><SectionPicker available={SHARED_SECTIONS} selected={exportSections} onChange={setExportSections} /><div className="flex flex-wrap gap-2"><Button type="button" disabled={!exportSections.length} onClick={() => void makeDownload()}>Save JSON</Button><Button type="button" disabled={!exportSections.length} onClick={() => void copyExport()}>Copy JSON</Button></div></section>
    <section className="space-y-3"><h4 className="font-semibold text-slate-200">Import</h4><p className="text-slate-400">Choose a JSON backup or paste its contents, then preview it before applying.</p>
      <input aria-label="Choose a settings backup" type="file" accept=".json,application/json" className="block text-xs text-slate-400 max-w-full" onChange={(event) => { const file = event.target.files?.[0]; setPreview(null); setError(''); if (!file) return; if (file.size > 32_768) { setError('The settings file is too large.'); return; } void file.text().then(setText).catch(() => setError('Could not read the settings file.')); }} />
      <textarea aria-label="Settings JSON" value={text} onChange={(event) => { setText(event.target.value); setPreview(null); setError(''); }} rows={5} placeholder="Paste settings JSON here" className={`${inputClass} font-mono`} />
      <Button type="button" disabled={!text.trim()} onClick={prepare}>Preview import</Button>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {preview && <div className="space-y-3 rounded border border-[#2a3447] p-3"><p className="font-semibold text-slate-200">Select sections to apply</p><SectionPicker available={previewSections} selected={importSections} onChange={setImportSections} /><ul className="space-y-1 text-slate-400">{previewItems.filter((item) => importSections.includes(item.section)).map((item) => <li key={item.key}>{item.label}: <span className="text-slate-200 break-all">{JSON.stringify(preview.settings[item.key])}</span></li>)}</ul><Button type="button" tone="primary" disabled={!importSections.length} onClick={() => { try { const count = applySettingsBackup(preview, importSections); setPreview(null); toast.success(`Applied ${count} settings.`); } catch (e) { setError((e as Error).message); } }}>Apply selected settings</Button></div>}
    </section>
  </div>;
};
