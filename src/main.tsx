import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { getPreference, usePreference } from './preferences';
import { applyFontPreferences } from './fontAppearance';
import './index.css';

document.documentElement.dataset.theme = getPreference('theme');
applyFontPreferences(getPreference('interfaceFont'), getPreference('codeFont'));

const ThemedApp: React.FC = () => {
  const [theme] = usePreference('theme');
  const [interfaceFont] = usePreference('interfaceFont');
  const [codeFont] = usePreference('codeFont');
  React.useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
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
