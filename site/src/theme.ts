import { createTheme, type Theme } from '@mui/material/styles';

/**
 * MUI Material theme. Light uses Blue 700 (#1976d2), dark uses Blue 200
 * (#90caf9) per the Material dark-theme guidance on contrast.
 */
export const drawerWidth = 280;
export const tocWidth = 240;
export const appBarHeight = 64;

export function buildTheme(mode: 'light' | 'dark'): Theme {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? '#90caf9' : '#1976d2' },
      secondary: { main: isDark ? '#ce93d8' : '#9c27b0' },
      background: isDark
        ? { default: '#121212', paper: '#1e1e1e' }
        : { default: '#ffffff', paper: '#ffffff' },
    },
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: ['Roboto', '-apple-system', 'Segoe UI', 'Noto Sans TC', 'sans-serif'].join(','),
      h1: { fontSize: '2.125rem', fontWeight: 400, lineHeight: 1.235 },
      h2: { fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.334 },
      h3: { fontSize: '1.25rem', fontWeight: 500, lineHeight: 1.6 },
      h4: { fontSize: '1rem', fontWeight: 500 },
      button: { textTransform: 'uppercase', letterSpacing: '0.02857em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollBehavior: 'smooth', scrollPaddingTop: appBarHeight + 16 },
        },
      },
      MuiAppBar: {
        // Material AppBar: primary fill in light, elevated surface in dark
        styleOverrides: {
          colorPrimary: isDark ? { backgroundColor: '#272727', color: '#ffffff' } : undefined,
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 24, minHeight: 48 },
        },
      },
    },
  });
}

/** Monospace stack used for code, inline code and the source label. */
export const monoFont = ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'].join(',');
