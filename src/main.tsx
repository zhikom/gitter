import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { getPreference, usePreference } from './preferences';
import { applyFontPreferences } from './fontAppearance';
import { applyTheme } from './theme';
import { CURRENT_VERSION } from './services/updateService';
import { invoke, isTauri } from '@tauri-apps/api/core';
import './index.css';

applyTheme(document.documentElement, getPreference('theme'), getPreference('themePack'), getPreference('dataPacks'), window.matchMedia('(prefers-color-scheme: dark)').matches, CURRENT_VERSION);
document.documentElement.style.setProperty('--ui-text-scale', String(getPreference('interfaceTextScale') / 100));
document.documentElement.dataset.uiTextScale = String(getPreference('interfaceTextScale'));
applyFontPreferences(getPreference('interfaceFont'), getPreference('codeFont'));
let scaleQueue: Promise<unknown> = Promise.resolve();

const ThemedApp: React.FC = () => {
  const [theme] = usePreference('theme');
  const [interfaceFont] = usePreference('interfaceFont');
  const [interfaceScale] = usePreference('interfaceScale');
  const [interfaceTextScale] = usePreference('interfaceTextScale');
  const [dataPacks] = usePreference('dataPacks');
  const [themePack] = usePreference('themePack');
  const [codeFont] = usePreference('codeFont');
  React.useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(document.documentElement, theme, themePack, dataPacks, media.matches, CURRENT_VERSION);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, themePack, dataPacks]);
  React.useLayoutEffect(() => { document.documentElement.style.setProperty('--ui-text-scale', String(interfaceTextScale / 100)); document.documentElement.dataset.uiTextScale = String(interfaceTextScale); }, [interfaceTextScale]);
  React.useLayoutEffect(() => {
    if (isTauri()) {
      scaleQueue = scaleQueue.catch(() => undefined).then(() => invoke('set_window_scale', { percent: interfaceScale }));
      void scaleQueue.catch(() => undefined);
    } else {
      document.documentElement.style.zoom = String(interfaceScale / 100);
    }
  }, [interfaceScale]);
  React.useLayoutEffect(() => { applyFontPreferences(interfaceFont, codeFont); }, [interfaceFont, codeFont]);
  return <><App /><Toaster /></>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemedApp />
    </ErrorBoundary>
  </React.StrictMode>
);
