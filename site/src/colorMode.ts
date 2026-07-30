import { createContext } from 'react';

/**
 * Palette-mode context.
 *
 * Kept in its own module rather than in main.tsx: main.tsx calls createRoot()
 * at import time, so anything importing the context from there could not be
 * rendered outside a browser (and could not be smoke-tested).
 */
export const MODE_STORAGE_KEY = 'scd-color-mode';

export interface ColorMode {
  mode: 'light' | 'dark';
  toggle: () => void;
}

export const ColorModeContext = createContext<ColorMode>({
  mode: 'light',
  toggle: () => {},
});
