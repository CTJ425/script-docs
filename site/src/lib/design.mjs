/**
 * The design system, as code.
 *
 * The page is a field notebook: warm paper (graphite in the dark), one ink, a
 * hairline rule, and a single saturated thing — the punched command window —
 * whose colour comes from where the command came from. Everything here exists
 * so those colours can be *derived* and then *checked*, instead of picked.
 *
 * Plain .mjs with JSDoc, because two consumers cannot import TypeScript: the
 * contrast script (plain Node) and the stylesheet generator below, which runs
 * inside the Astro build. Both read this one file, so the colour a test measures
 * is the colour that ships — there is no second copy in a CSS file to drift.
 */

/* ---------------------------------------------------------------- colour */

/** @typedef {[number, number, number]} Rgb */

/** @param {string} hex @returns {Rgb} */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {Rgb} rgb */
export function rgbToHex([r, g, b]) {
  const to = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** WCAG relative luminance. @param {Rgb} rgb */
export function luminance(rgb) {
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two opaque colours. @param {Rgb} a @param {Rgb} b */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB source-over: `over` painted at `alpha` on top of `under`. @param {Rgb} over @param {Rgb} under @param {number} alpha @returns {Rgb} */
export function composite(over, under, alpha) {
  return [
    over[0] * alpha + under[0] * (1 - alpha),
    over[1] * alpha + under[1] * (1 - alpha),
    over[2] * alpha + under[2] * (1 - alpha),
  ];
}

/**
 * Mix `from` toward `toward` until the result clears `min` against `field`.
 *
 * The search runs in float; what ships is an 8-bit hex, and rounding can cost a
 * hundredth of a ratio — which is the difference between passing and failing.
 * So the value returned is one that was measured *after* rounding.
 *
 * @param {Rgb} from @param {Rgb} toward @param {Rgb} field @param {number} min
 * @returns {string | null}
 */
function mixUntil(from, toward, field, min) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(composite(toward, from, mid), field) >= min) hi = mid;
    else lo = mid;
  }
  for (let mix = hi; mix <= 1.0001; mix += 0.004) {
    const hex = rgbToHex(composite(toward, from, Math.min(1, mix)));
    if (contrast(hexToRgb(hex), field) >= min) return hex;
  }
  return null;
}

/**
 * A hue, made readable as ink on the page.
 *
 * A colour chosen to be printed at full strength across a window head is not a
 * colour that can be set at 13px on paper: chrome yellow on cream is about
 * 1.5:1. Rather than hand-tuning a second "text version" of every category
 * colour, mix the hue toward the page's own ink until it clears the ratio. The
 * same search covers a category added next year.
 *
 * @param {string} hue @param {string} field @param {string} ink
 */
export function readableOn(hue, field, ink, min = 4.5) {
  const f = hexToRgb(field);
  const start = hexToRgb(hue);
  if (contrast(start, f) >= min) return hue;
  // Monotonic: on light paper `ink` is darker than any hue, on dark paper it is
  // lighter, so contrast rises with the mix in both directions.
  return mixUntil(start, hexToRgb(ink), f, min) ?? ink;
}

/**
 * Whichever of the two inks reads better on a fill printed at full strength.
 * Chrome yellow takes the dark ink, ultramarine takes the light one, and a
 * category added next year gets the right answer without anyone deciding.
 *
 * @param {string} fill @param {string} dark @param {string} light
 */
export function inkOn(fill, dark, light) {
  const b = hexToRgb(fill);
  return contrast(b, hexToRgb(dark)) >= contrast(b, hexToRgb(light)) ? dark : light;
}

/* ------------------------------------------------------------ the palette */

/** Paper, ink and danger: the only colours that are not derived. */
export const PAPER = { light: '#FBF7EC', dark: '#141310' };

export const INK = {
  // Tertiary is the quietest ink: dates, tags, comments inside a command. It is
  // still measured on every surface, including the recess of a page that has
  // aged, which is what pulled the two tiers this close together.
  light: { primary: '#16150F', secondary: '#4D4937', tertiary: '#635E49' },
  dark: { primary: '#F2EDE0', secondary: '#BAB4A2', tertiary: '#A29D8B' },
};

/**
 * Held out of the hue palette below. Danger only: a destructive command, a
 * missing page. Two values, because a vermilion that reads on warm paper is not
 * one that reads on graphite.
 */
export const DANGER = { light: '#CE2E1A', dark: '#FF7A63' };
/** What is printed on a vermilion fill. */
export const ON_DANGER = { light: '#FBF7EC', dark: '#16150F' };

/**
 * The hues categories claim, in order. Nothing is keyed to a category name:
 * `hueFor()` assigns by position, so a fourth top-level folder lands on grass
 * without a line of code changing. Vermilion is deliberately absent.
 */
export const HUES = [
  '#F2B32B', // chrome yellow
  '#0F8A80', // teal
  '#1F55B8', // ultramarine
  '#4E8B3C', // grass
  '#DE5F26', // oxide orange
  '#6A55C0', // violet
  '#8C4A2B', // sienna
];

/**
 * The hue for things that belong to no category: the binder itself. Tan
 * buckram rather than a neutral grey, because a hue with no chroma mixed toward
 * paper only bleaches it.
 */
export const BINDER_HUE = '#7A5A34';

/** A category's hue by its position, wrapping past the end instead of going grey. */
export function hueFor(index) {
  if (index === null || index === undefined || index < 0) return BINDER_HUE;
  return HUES[index % HUES.length];
}

/**
 * A fill you can actually print on.
 *
 * The command window's head carries text directly on the hue at full strength,
 * and a mid-luminance hue — teal, grass — clears 4.5:1 against neither ink.
 * Push the hue whichever way needs the smaller move until one of the two reads.
 *
 * @param {string} hue
 */
function printable(hue, min = 4.5) {
  const start = hexToRgb(hue);
  const dark = hexToRgb(INK.light.primary);
  const light = hexToRgb(INK.dark.primary);
  if (Math.max(contrast(start, dark), contrast(start, light)) >= min) return hue;

  // Darkening the fill is what makes the light ink read, and vice versa.
  const darker = mixUntil(start, dark, light, min);
  const lighter = mixUntil(start, light, dark, min);
  if (!darker) return lighter ?? hue;
  if (!lighter) return darker;
  const moved = (hex) => Math.abs(luminance(hexToRgb(hex)) - luminance(start));
  return moved(darker) <= moved(lighter) ? darker : lighter;
}

/**
 * The hue as a window head: deepened in the dark so a full-width bar does not
 * glare, then made printable.
 *
 * @param {string} hue @param {'light' | 'dark'} mode
 */
export function fillFor(hue, mode) {
  const seated =
    mode === 'light' ? hue : rgbToHex(composite(hexToRgb(hue), hexToRgb('#100F0C'), 0.78));
  return printable(seated);
}

/**
 * Everything one hue contributes, resolved for one mode.
 *
 * @param {string} hue @param {'light' | 'dark'} mode
 */
export function resolveHue(hue, mode) {
  const fill = fillFor(hue, mode);
  return {
    fill,
    onFill: inkOn(fill, INK.light.primary, INK.dark.primary),
    // The hue speaking rather than filling: a chip label, a link underline.
    ink: inkFor(hue, mode),
  };
}

/** The ageing washes laid over the paper, by step. */
export const AGE = {
  light: ['transparent', 'rgba(210, 160, 30, 0.085)', 'rgba(190, 132, 24, 0.17)'],
  dark: ['transparent', 'rgba(214, 170, 60, 0.07)', 'rgba(214, 170, 60, 0.14)'],
};

/** Hairlines and the recess are the ink at low alpha, not separate greys. */
export const WASH = {
  light: { recess: 0.055, rule: 0.17, ruleStrong: 0.42, rgb: '22, 21, 15' },
  dark: { recess: 0.06, rule: 0.16, ruleStrong: 0.4, rgb: '242, 237, 224' },
};

/**
 * Every opaque colour text can land on, in one mode.
 *
 * The paper; the recess (a code window, a table head, inline code), which is the
 * ink at low alpha *over* the paper and so is a different colour; the danger
 * field behind an alert; and each of those again on paper that has yellowed with
 * age. An ink is only readable if it clears all of them, so the derivations
 * below and the contrast script both walk this list rather than a hand-picked
 * subset.
 *
 * @param {'light' | 'dark'} mode
 * @returns {{ name: string, rgb: Rgb }[]}
 */
export function surfacesFor(mode) {
  const w = WASH[mode];
  const washRgb = /** @type {Rgb} */ (w.rgb.split(',').map(Number));
  const dangerRgb = hexToRgb(DANGER[mode]);
  const dangerAlpha = mode === 'light' ? 0.09 : 0.12;

  const grounds = [{ name: 'paper', rgb: hexToRgb(PAPER[mode]) }];
  for (const [i, wash] of AGE[mode].entries()) {
    if (i === 0) continue;
    const m = wash.match(/rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
    grounds.push({
      name: `paper aged to step ${i}`,
      rgb: composite([+m[1], +m[2], +m[3]], hexToRgb(PAPER[mode]), +m[4]),
    });
  }
  return grounds.flatMap((g) => [
    g,
    { name: `recess on ${g.name}`, rgb: composite(washRgb, g.rgb, w.recess) },
    { name: `danger field on ${g.name}`, rgb: composite(dangerRgb, g.rgb, dangerAlpha) },
  ]);
}

/**
 * A hue, made readable as ink on *every* surface text can land on.
 *
 * readableOn() mixes toward the page ink until one field clears the ratio, and
 * mixing toward ink only ever raises contrast against any of them, so applying it
 * to each surface in turn leaves a colour that clears all.
 *
 * @param {string} hue @param {'light' | 'dark'} mode
 */
export function inkFor(hue, mode) {
  return surfacesFor(mode).reduce((c, s) => readableOn(c, rgbToHex(s.rgb), INK[mode].primary), hue);
}

/* -------------------------------------------------------- the stylesheet */

/** @param {'light' | 'dark'} mode */
function modeBlock(mode) {
  const ink = INK[mode];
  const w = WASH[mode];
  const binder = resolveHue(BINDER_HUE, mode);
  const lines = [
    `color-scheme: ${mode};`,
    `--tooth-blend: ${mode === 'light' ? 'multiply' : 'screen'};`,
    `--ink: ${ink.primary};`,
    `--ink-2: ${ink.secondary};`,
    `--ink-3: ${ink.tertiary};`,
    `--paper: ${PAPER[mode]};`,
    `--recess: rgba(${w.rgb}, ${w.recess});`,
    `--rule: rgba(${w.rgb}, ${w.rule});`,
    `--rule-strong: rgba(${w.rgb}, ${w.ruleStrong});`,
    `--danger: ${DANGER[mode]};`,
    `--on-danger: ${ON_DANGER[mode]};`,
    `--danger-ink: ${inkFor(DANGER[mode], mode)};`,
    `--danger-field: rgba(${hexToRgb(DANGER[mode]).join(', ')}, ${mode === 'light' ? 0.09 : 0.12});`,
    `--age-0: ${AGE[mode][0]};`,
    `--age-1: ${AGE[mode][1]};`,
    `--age-2: ${AGE[mode][2]};`,
    // The default fill and accent: the binder, for anything with no category.
    `--fill: ${binder.fill};`,
    `--on-fill: ${binder.onFill};`,
    `--accent: ${binder.ink};`,
    `--lift: ${
      mode === 'light' ? '0 2px 10px -6px rgba(22, 21, 15, 0.5)' : '0 2px 12px -6px rgba(0, 0, 0, 0.8)'
    };`,
  ];
  return lines;
}

/** @param {'light' | 'dark'} mode */
function hueBlock(mode) {
  return HUES.map((hue, i) => {
    const r = resolveHue(hue, mode);
    return `.hue-${i} { --fill: ${r.fill}; --on-fill: ${r.onFill}; --accent: ${r.ink}; }`;
  });
}

/**
 * The colour half of the stylesheet, as text. Inlined in <head> by the base
 * layout, so the first paint already has its colours and there is no request.
 *
 * The dark values are written twice — an explicit [data-theme='dark'] block and
 * a prefers-color-scheme block — because the stored choice has to beat the
 * system setting in both directions. Both are generated from the same function,
 * so the two copies cannot disagree.
 */
export function colorCss() {
  const body = (mode) => modeBlock(mode).join('\n  ');
  const hues = (mode) => hueBlock(mode).join('\n  ');
  return `
:root, :root[data-theme='light'] {
  ${body('light')}
}
${hueBlock('light')
  .map((l) => `:root ${l}`)
  .join('\n')}
:root[data-theme='dark'] {
  ${body('dark')}
}
${hueBlock('dark')
  .map((l) => `:root[data-theme='dark'] ${l}`)
  .join('\n')}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    ${body('dark')}
  }
  ${hues('dark')
    .split('\n')
    .map((l) => `:root:not([data-theme='light']) ${l.trim()}`)
    .join('\n  ')}
}
`.trim();
}

/* ------------------------------------------------------------ the ageing */

/**
 * Turn a date into an age and a material step.
 *
 * 0 fresh, 1 yellowing (a quarter), 2 bleached (three quarters). A quarter is a
 * real staleness horizon for a runbook that pins Kubernetes and Supabase
 * versions; three quarters is suspect. The thresholds follow what the work
 * actually is, not what makes a screenshot show the effect. The state is spent
 * on the paper and on a mark in the meta line, never on new prose.
 *
 * @param {string | Date | null | undefined} when `YYYY-MM-DD` or a Date
 * @param {Date} now
 * @returns {{ date: string, days: number, step: 0 | 1 | 2 } | null}
 */
export function ageOf(when, now = new Date()) {
  if (!when) return null;
  const iso = typeof when === 'string' ? when.slice(0, 10) : when.toISOString().slice(0, 10);
  const then = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
  return { date: iso, days, step: days >= 270 ? 2 : days >= 90 ? 1 : 0 };
}
