import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { getPreference, usePreference } from './preferences';
import './index.css';

document.documentElement.dataset.theme = getPreference('theme');

const ThemedApp: React.FC = () => {
  const [theme] = usePreference('theme');
  React.useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <><App /><Toaster /></>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemedApp />
    </ErrorBoundary>
  </React.StrictMode>
);
