import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ColorModeContext, MODE_STORAGE_KEY } from './colorMode';
import { buildTheme } from './theme';

function storedMode(): 'light' | 'dark' | null {
  try {
    const m = localStorage.getItem(MODE_STORAGE_KEY);
    return m === 'light' || m === 'dark' ? m : null;
  } catch {
    return null; // private browsing
  }
}

function Root() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  // An explicit choice wins; otherwise follow the OS.
  const [override, setOverride] = useState<'light' | 'dark' | null>(storedMode);
  const mode = override ?? (prefersDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const current = prev ?? (prefersDark ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      document.documentElement.style.colorScheme = next;
      return next;
    });
  }, [prefersDark]);

  const theme = useMemo(() => buildTheme(mode), [mode]);
  const ctx = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ColorModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* Hash routing: GitHub Pages serves no SPA rewrite, so deep links
            like /#/k8s-install work without a 404.html fallback. */}
        <HashRouter>
          <App />
        </HashRouter>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
