/**
 * Holds the design system to its contrast claims.
 *
 * Every colour that carries text is derived in src/lib/design.mjs and inlined
 * into <head> by the base layout, so the value measured here is the value that
 * ships — there is no second copy in a stylesheet to drift. What this asserts is
 * that every ink clears 4.5:1 on every surface it can land on: the paper, the
 * recessed wells (code windows, table heads, inline code), the ageing washes,
 * the danger fill, and the category fills — in both themes, for every hue,
 * including the ones no category has claimed yet.
 *
 *   node scripts/check-contrast.mjs
 */
import {
  AGE,
  BINDER_HUE,
  DANGER,
  HUES,
  INK,
  ON_DANGER,
  PAPER,
  ageOf,
  colorCss,
  contrast,
  hexToRgb,
  hueFor,
  inkFor,
  resolveHue,
  surfacesFor,
} from '../src/lib/design.mjs';

const BODY = 4.5;

let failures = 0;
const check = (label, ratio, min = BODY) => {
  const ok = ratio >= min;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${ratio.toFixed(2)}:1 (need ${min})`);
};
const ok = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

for (const mode of ['light', 'dark']) {
  const ink = INK[mode];
  const surfaces = surfacesFor(mode);

  console.log(`\n=== ${mode}: ink on every surface`);
  for (const [name, hex] of Object.entries(ink)) {
    for (const s of surfaces) {
      // The danger field sits behind an alert's label and body; the quietest ink is
      // never set there, so it is not held to a surface it cannot appear on.
      if (name === 'tertiary' && s.name.startsWith('danger field')) continue;
      check(`${name} on ${s.name}`, contrast(hexToRgb(hex), s.rgb));
    }
  }

  console.log(`\n=== ${mode}: danger`);
  const dangerInk = hexToRgb(inkFor(DANGER[mode], mode));
  for (const s of surfaces) check(`danger as ink on ${s.name}`, contrast(dangerInk, s.rgb));
  check(
    'text printed on the vermilion fill (sudo flag, failed copy)',
    contrast(hexToRgb(ON_DANGER[mode]), hexToRgb(DANGER[mode]))
  );

  console.log(`\n=== ${mode}: every hue a category can claim`);
  for (const hue of [BINDER_HUE, ...HUES]) {
    const r = resolveHue(hue, mode);
    check(`${hue}  ink printed on the window head`, contrast(hexToRgb(r.onFill), hexToRgb(r.fill)));
    // Link underlines and syntax tokens in the hue sit on the paper, in a
    // code window's recess, and on a page that has aged.
    for (const s of surfaces) check(`${hue}  hue as ink on ${s.name}`, contrast(hexToRgb(r.ink), s.rgb));
  }
}

console.log('\n=== the stylesheet that ships');
{
  const css = colorCss();

  // Three blocks carry the full custom-property set: light, an explicit dark,
  // and dark under prefers-color-scheme. They come from one function, but the
  // check is cheap and catches a block that quietly loses a property.
  const blocks = [];
  for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*--ink:[^{}]*)\}/g)) {
    blocks.push({ head: head.trim().split('\n').pop().trim(), props: [...body.matchAll(/(--[\w-]+):/g)].map((m) => m[1]) });
  }
  ok('three theme blocks are emitted (light, dark, dark-by-preference)', blocks.length === 3, blocks.map((b) => b.head).join(' | '));
  const sets = blocks.map((b) => [...new Set(b.props)].sort().join(','));
  ok('every theme block defines the same custom properties', sets.every((s) => s === sets[0]));

  const has = (needle) => css.includes(needle);
  ok('paper and ink are the design-system values', has(`--paper: ${PAPER.light}`) && has(`--paper: ${PAPER.dark}`) && has(`--ink: ${INK.light.primary}`) && has(`--ink: ${INK.dark.primary}`));
  ok('a hue class exists for every palette entry', HUES.every((_, i) => has(`.hue-${i} {`)));
  ok('the stored theme beats the system setting in both directions', has(`:root[data-theme='dark']`) && has(`:root:not([data-theme='light'])`));
}

console.log('\n=== hue assignment');
ok('by position: the first category is the first hue', hueFor(0) === HUES[0]);
ok('wraps past the palette instead of going grey', hueFor(HUES.length) === HUES[0] && hueFor(HUES.length + 2) === HUES[2]);
ok('no category is the binder', hueFor(null) === BINDER_HUE && hueFor(-1) === BINDER_HUE);
ok('vermilion is held out of the palette', !HUES.some((h) => h.toLowerCase() === DANGER.light.toLowerCase() || h.toLowerCase() === DANGER.dark.toLowerCase()));

console.log('\n=== ageing');
{
  const at = (days) => {
    const then = new Date(Date.UTC(2026, 0, 1));
    return ageOf('2026-01-01', new Date(then.getTime() + days * 86400000));
  };
  const step = (label, days, want) => ok(label, at(days)?.step === want, `step ${at(days)?.step}, expected ${want}`);
  step('fresh, 10 days', 10, 0);
  step('one day short of a quarter', 89, 0);
  step('a quarter old: yellowing', 90, 1);
  step('269 days: still yellowing', 269, 1);
  step('three quarters old: bleached', 270, 2);
  ok('a date from a Date object reads the same as the string', ageOf(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 3, 1)))?.days === 90);
  ok('no date, no age', ageOf(null) === null && ageOf(undefined) === null);
  ok('a malformed date, no age', ageOf('not-a-date') === null);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall design-system checks passed');
process.exit(failures ? 1 : 0);
