import React from 'react';
import { defaultPreference, resetPreference, usePreference, type Preferences } from '../../preferences';

export function PreferenceReset<K extends keyof Preferences>({ name, label }: { name: K; label: string }) {
  const [value] = usePreference(name);
  const unchanged = JSON.stringify(value) === JSON.stringify(defaultPreference(name));
  return <button type="button" onClick={() => resetPreference(name)} disabled={unchanged} aria-label={`Reset ${label}`} className="shrink-0 text-[10px] text-slate-400 hover:text-teal-300 disabled:opacity-30 disabled:cursor-default">Reset</button>;
}

export const SettingAnchor: React.FC<{ name: keyof Preferences; children: React.ReactNode }> = ({ name, children }) => (
  <div id={`setting-${name}`} tabIndex={-1} className="scroll-mt-4 outline-none">{children}</div>
);
