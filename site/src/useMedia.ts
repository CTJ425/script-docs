import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a media query.
 *
 * The server snapshot is always false, which is deliberate rather than lazy:
 * the narrow layout is the one that renders without a window, so the smoke
 * test and the first paint agree, and the wide arrangement is an upgrade
 * applied once the browser can actually answer the question.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Wide enough for the fore-edge margin to hold the page's own contents
 * *without* taking them out of the command window.
 *
 * The margin column costs about 210px, and that is very close to what a
 * `curl | sudo bash` one-liner needs to sit on one line. A reader who has to
 * drag a command sideways cannot check it before running it, and checking it
 * before running it is the entire product — so below this width the contents
 * go back under the index and the sheet keeps its full span.
 */
export const WIDE = '(min-width: 1600px)';
