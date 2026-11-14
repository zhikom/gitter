import React, { useEffect, useState } from 'react';
import { ANTHROPIC_SANS, hasAnthropicSystemFont, normalizeFontName } from '../../../shared/fonts';
import { api } from '../../api/client';
import { ensureClaudeSans } from '../../fontAppearance';
import { usePreference } from '../../preferences';
import { useCodeTypography } from '../../useCodeTypography';
import { Button, inputClass } from '../ui/Modal';
import { PreferenceReset, SettingAnchor } from './PreferenceReset';

type Catalog = Awaited<ReturnType<typeof api.fontCatalog>>;

type FontChoiceProps = { label: string; value: string; onChange: (value: string) => void; catalog: Catalog | null; loading: boolean; hint?: string; reset: React.ReactNode };

const FontChoice: React.FC<FontChoiceProps> = ({ label, value, onChange, catalog, loading, hint, reset }) => {
  const [custom, setCustom] = useState(value === ANTHROPIC_SANS ? '' : value);
  useEffect(() => { setCustom(value === ANTHROPIC_SANS ? '' : value); }, [value]);
  const families = catalog?.families ?? [];
  const missingSelection = Boolean(value && value !== ANTHROPIC_SANS && !families.includes(value));
  const customName = normalizeFontName(custom);
  const anthropicInstalled = catalog?.claudeDesktopFont || hasAnthropicSystemFont(families);
  return <div>
    <div className="flex justify-between items-center mb-1"><span className="text-[11px] font-semibold text-slate-400">{label}</span>{reset}</div>
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      <option value="">Theme default</option>
      <option value={ANTHROPIC_SANS}>Anthropic Sans{catalog ? anthropicInstalled ? catalog.claudeDesktopFont ? ' (Claude Desktop)' : ' (installed)' : ' (not found)' : ''}</option>
      {missingSelection && <option value={value}>{value}</option>}
      {families.filter((name) => name !== ANTHROPIC_SANS).map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
    {loading && <span className="block text-[10px] text-slate-500 mt-1">Finding installed fonts…</span>}
    {!loading && catalog && !catalog.listingFailed && missingSelection && <span className="block text-[10px] text-amber-300 mt-1">This family was not found in the installed-font list; rendering may fall back.</span>}
    {hint && <span className="block text-[10px] text-slate-500 mt-1">{hint}</span>}
    <details className="mt-2 text-[10px] text-slate-500">
      <summary className="cursor-pointer">Use another installed font by name</summary>
      <div className="flex gap-2 mt-2">
        <input aria-label={`${label} custom family`} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Font family name" className={inputClass} />
        <Button type="button" disabled={!customName} onClick={() => customName && onChange(customName)}>Apply</Button>
      </div>
    </details>
  </div>;
};

export const FontSettings: React.FC = () => {
  const typography = useCodeTypography();
  const [interfaceFont, setInterfaceFont] = usePreference('interfaceFont');
  const [codeFont, setCodeFont] = usePreference('codeFont');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const usingAnthropic = interfaceFont === ANTHROPIC_SANS || codeFont === ANTHROPIC_SANS;
  useEffect(() => {
    let active = true;
    api.fontCatalog().then((result) => { if (active) setCatalog(result); }).catch(() => { if (active) setUnavailable(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    if (!usingAnthropic || !catalog?.claudeDesktopFont) { setClaudeStatus('idle'); return () => { active = false; }; }
    setClaudeStatus('loading');
    ensureClaudeSans().then(() => { if (active) setClaudeStatus('ready'); }).catch(() => { if (active) setClaudeStatus('failed'); });
    return () => { active = false; };
  }, [usingAnthropic, catalog?.claudeDesktopFont]);
  const systemAnthropic = hasAnthropicSystemFont(catalog?.families ?? []);
  return <div className="space-y-3">
    <SettingAnchor name="interfaceFont"><FontChoice label="Interface font" value={interfaceFont} onChange={setInterfaceFont} catalog={catalog} loading={loading} reset={<PreferenceReset name="interfaceFont" label="interface font" />} /></SettingAnchor>
    <SettingAnchor name="codeFont"><FontChoice label="Code and diff font" value={codeFont} onChange={setCodeFont} catalog={catalog} loading={loading} hint="Choose a monospaced font to keep diff columns aligned. Code size is set under Diffs." reset={<PreferenceReset name="codeFont" label="code and diff font" />} /></SettingAnchor>
    {(unavailable || catalog?.listingFailed) && <p className="text-[10px] text-amber-300">Installed fonts could not be listed. You can still enter a family name above.</p>}
    {usingAnthropic && catalog && <p className="text-[10px] text-slate-500">
      {catalog.claudeDesktopFont ? claudeStatus === 'failed' ? 'Could not load the font from Claude Desktop; a system fallback is shown.' : claudeStatus === 'ready' ? 'Using Anthropic Sans from your local Claude Desktop installation.' : 'Loading Anthropic Sans from Claude Desktop…' : systemAnthropic ? 'Using the installed Anthropic Sans family.' : 'Anthropic Sans was not found. Install it separately or choose another font; a system fallback is shown.'}
    </p>}
    <div className="rounded border border-[#2a3447] bg-[#14181f] px-3 py-2 text-xs text-slate-200">
      <div>The quick brown fox · Aa Bb 0123</div>
      <div style={typography} className="font-mono mt-1 text-slate-400">const branch = 'main'; {'//'} 0123</div>
    </div>
  </div>;
};
