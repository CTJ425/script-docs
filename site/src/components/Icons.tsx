/**
 * The icon set, drawn here.
 *
 * One box (20), one stroke (1.5), butt caps, no fills except the GitHub mark,
 * which is a brand and has to be itself. Eight icons is the whole site's need;
 * a library would have shipped nine hundred.
 */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function MenuIcon() {
  return (
    <svg {...base}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.6 12.6 4 4" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg {...base}>
      <circle cx="10" cy="10" r="3.75" />
      <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M16 4l-1.4 1.4M5.4 14.6 4 16M16 16l-1.4-1.4M5.4 5.4 4 4" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...base}>
      <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...base} width={15} height={15} viewBox="0 0 20 20">
      <rect x="6.75" y="6.75" width="9.5" height="9.5" rx="1.25" />
      <path d="M13 4.25A1.25 1.25 0 0 0 11.75 3h-7.5A1.25 1.25 0 0 0 3 4.25v7.5A1.25 1.25 0 0 0 4.25 13" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base} width={15} height={15} viewBox="0 0 20 20">
      <path d="m3.75 10.5 4 4 8.5-9" />
    </svg>
  );
}

export function LaunchIcon() {
  return (
    <svg {...base} width={13} height={13} viewBox="0 0 20 20">
      <path d="M11.5 3.5H16.5V8.5" />
      <path d="M16.5 3.5 9.5 10.5" />
      <path d="M15 12v3.75a1.25 1.25 0 0 1-1.25 1.25H4.25A1.25 1.25 0 0 1 3 15.75V6.25A1.25 1.25 0 0 1 4.25 5H8" />
    </svg>
  );
}
