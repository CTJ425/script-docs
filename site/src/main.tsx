import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ColorModeContext, MODE_STORAGE_KEY } from './colorMode';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/doc.css';
import './styles/markdown.css';
import './styles/code.css';

function storedMode(): 'light' | 'dark' | null {
  try {
    const m = localStorage.getItem(MODE_STORAGE_KEY);
    return m === 'light' || m === 'dark' ? m : null;
  } catch {
    return null; // private browsing
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function Root() {
  // An explicit choice wins; otherwise follow the OS, and keep following it.
  const [override, setOverride] = useState<'light' | 'dark' | null>(storedMode);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const mode = override ?? (prefersDark ? 'dark' : 'light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // The stylesheet reads data-theme; the inline script in index.html has
  // already set it for the first paint, and this keeps it true afterwards.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const current = prev ?? (systemPrefersDark() ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const ctx = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ColorModeContext.Provider value={ctx}>
      {/* Hash routing: GitHub Pages serves no SPA rewrite, so deep links
          like /#/k8s-install work without a 404.html fallback. */}
      <HashRouter>
        <App />
      </HashRouter>
    </ColorModeContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
