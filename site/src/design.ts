/**
 * The design system, as code.
 *
 * The world is a boxed-software reference manual: a milk-acetate leaf hinged a
 * millimetre above a section board printed at full strength. The leaf is the
 * reading field; the board is the category. Everything below exists to make
 * that object behave correctly at runtime rather than to look like it.
 *
 * The one mechanism worth reading twice is solveLeaf(): the leaf's alpha is not
 * a designer's guess, it is binary-searched per board hue until the composited
 * reading field lands in a fixed luminance band. That is what guarantees body
 * contrast no matter which category you are standing on, and it is why the ink
 * tokens below can be stated as fixed values at all.
 */

/* ---------------------------------------------------------------- colour */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
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

export function rgbToHex([r, g, b]: Rgb): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** WCAG relative luminance. */
export function luminance(rgb: Rgb): number {
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB source-over: `over` painted at `alpha` on top of `under`. */
export function composite(over: Rgb, under: Rgb, alpha: number): Rgb {
  return [
    over[0] * alpha + under[0] * (1 - alpha),
    over[1] * alpha + under[1] * (1 - alpha),
    over[2] * alpha + under[2] * (1 - alpha),
  ];
}

/**
 * Pick whichever of the two inks reads better on a board printed at full
 * strength. Chrome yellow takes black, ultramarine takes the leaf — and a
 * category added next year gets the right answer without anyone deciding.
 */
export function inkOn(board: string, dark: string, light: string): string {
  const b = hexToRgb(board);
  return contrast(b, hexToRgb(dark)) >= contrast(b, hexToRgb(light)) ? dark : light;
}

/* ------------------------------------------------------------ the leaf */

/**
 * Luminance band the composited reading field must land in, per mode.
 *
 * Each target sits away from the milk's own luminance on the board's side, or
 * the search would settle on alpha 1 and the acetate would be opaque — a leaf
 * that never lets its board through is just a page, and the whole object goes
 * with it.
 */
const LEAF_TARGET = { light: 0.78, dark: 0.0115 } as const;
// 0.78 rather than a brighter page: a surface cannot be both very light and
// visibly coloured, so pinning the band near white made every mid-luminance
// board arrive at the leaf as a chroma of about 9 — the same near-white on
// teal, ultramarine and violet alike, which is the acetate premise failing
// quietly. At 0.78 each category reaches the reading field, and the ink tokens
// were moved to suit the field rather than the field trimmed to suit them.

/** The acetate itself, before it is composited over anything. */
export const MILK = { light: '#FBF7EC', dark: '#141310' } as const;

/** How much of the board's own colour the acetate carries. */
const TINT = 0.14;

/**
 * Scale a hue to a given luminance without moving it off its own colour.
 *
 * Mixing toward white or black is what luminance targeting normally does, and
 * it costs chroma at exactly the rate you need it. This searches a mix against
 * a neutral instead and returns the result, so the caller gets the board's hue
 * at the milk's brightness rather than a pastel of it.
 */
function atLuminance(hue: Rgb, target: number): Rgb {
  const toward: Rgb = luminance(hue) < target ? [255, 255, 255] : [0, 0, 0];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(composite(toward, hue, mid)) < target) lo = mid;
    else hi = mid;
  }
  return composite(toward, hue, (lo + hi) / 2);
}

/**
 * The acetate, carrying a trace of the board it will lie on.
 *
 * Solving alpha alone is not enough in light mode: the milk is bright, every
 * mid-luminance board is not, and the search settles near alpha 0.95 — which
 * pins the luminance correctly and leaves a leaf with a chroma of about 8,
 * indistinguishable from the next category's. Carrying the board's hue into
 * the milk *at the milk's own luminance* adds colour without moving
 * brightness, so the band still holds and the category becomes visible.
 */
function milkFor(board: string, mode: 'light' | 'dark'): Rgb {
  const milk = hexToRgb(MILK[mode]);
  // Mix the board at full strength — scaling it to the milk's brightness first
  // would wash it out before it ever reaches the acetate — then put the
  // luminance back where it was. Compositing two colours of equal luminance in
  // sRGB does not preserve luminance, which is why this correction is not
  // optional: without it the dark chrome-yellow leaf oversteps its band at
  // alpha 1 and the solver has nowhere left to go.
  return atLuminance(composite(hexToRgb(board), milk, TINT), luminance(milk));
}

export interface Leaf {
  /** The composited reading field, opaque, ready to paint. */
  hex: string;
  /** The alpha the search settled on — published so the shadow can match it. */
  alpha: number;
}

/**
 * Solve the leaf's alpha over a given board hue.
 *
 * Binary search on alpha until the source-over composite's relative luminance
 * lands in the mode's target band. A dark board needs more milk, a pale board
 * needs less; either way the reader gets the same reading field, so body text
 * contrast is a property of the system rather than of the category they picked.
 */
export function solveLeaf(board: string, mode: 'light' | 'dark'): Leaf {
  const target = LEAF_TARGET[mode];
  const milk = milkFor(board, mode);
  const under = hexToRgb(board);

  // Monotonic in alpha only if milk and board sit on opposite sides of the
  // target; when the board alone is already past it, no alpha can help and the
  // milk at full strength is the honest answer.
  let lo = 0;
  let hi = 1;
  const rising = luminance(milk) > luminance(under);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const l = luminance(composite(milk, under, mid));
    if (rising === l < target) lo = mid;
    else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  return { hex: rgbToHex(composite(milk, under, alpha)), alpha };
}

/* ----------------------------------------------------------- the board */

/**
 * The section-board palette, in the order categories claim it.
 *
 * Nothing here is keyed to a category name: `hueFor()` assigns by position, so
 * a fourth top-level folder becomes a page on grass without a line of code
 * changing. Vermilion is deliberately absent — it is held out of the whole
 * system and spends only on danger, so it can never be mistaken for a category.
 */
export const BOARD_HUES = [
  '#F2B32B', // chrome yellow
  '#0F8A80', // teal
  '#1F55B8', // ultramarine
  '#4E8B3C', // grass
  '#DE5F26', // oxide orange
  '#6A55C0', // violet
  '#8C4A2B', // sienna
] as const;

/**
 * Held out of the palette above. Danger only: destructive commands, errata.
 *
 * Two values, because a vermilion that reads on a warm page is not one that
 * reads on a graphite one. Both are also the literal values tokens.css paints,
 * so the contrast script measures what ships.
 */
export const VERMILION = '#CE2E1A';
export const DANGER = { light: '#CE2E1A', dark: '#FF7A63' } as const;

/**
 * The board for the overview, which belongs to no category: the binder itself.
 *
 * Tan buckram rather than a neutral grey. A hue with no chroma mixed into the
 * milk at full strength bleaches it instead of tinting it, and the landing page
 * — the first screen the first-time visitor sees — came out a cool grey on a
 * world whose ground is warm manual paper.
 */
export const BINDER_HUE = '#7A5A34';

/**
 * A category's board hue, by its position in the sidebar order.
 *
 * Deterministic and unbounded: past the end of the palette it wraps, so a
 * repo with eight categories still renders rather than falling back to grey.
 */
export function hueFor(index: number | null): string {
  if (index === null || index < 0) return BINDER_HUE;
  return BOARD_HUES[index % BOARD_HUES.length];
}

/**
 * Mix `from` toward `toward` until the result clears `min` against `field`.
 *
 * The search runs in float; what ships is an 8-bit hex, and rounding can cost a
 * hundredth of a ratio — which is the difference between passing and failing.
 * So the value returned is one that was measured *after* rounding.
 */
function mixUntil(from: Rgb, toward: Rgb, field: Rgb, min: number): string | null {
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
 * The board hue, made readable as ink on the leaf.
 *
 * A hue chosen to be printed at full strength across a whole field is not a
 * hue that can be set at 13px on a pale page: chrome yellow on the light leaf
 * is about 1.5:1. Rather than picking a second, hand-tuned "text version" of
 * every category colour, mix the hue toward the page's own ink until it clears
 * the ratio — same search, same discipline, and a category added next year is
 * covered by it too.
 */
export function readableOn(hue: string, leaf: string, ink: string, min = 4.5): string {
  const field = hexToRgb(leaf);
  const start = hexToRgb(hue);
  if (contrast(start, field) >= min) return hue;
  // Monotonic: on a light leaf `ink` is darker than any hue, on a dark leaf it
  // is lighter, so contrast rises with the mix in both directions.
  return mixUntil(start, hexToRgb(ink), field, min) ?? ink;
}

/**
 * A board you can actually print on.
 *
 * The band, the spine and the open tab carry text directly on the board at
 * full strength, and a mid-luminance hue — teal, grass — clears 4.5:1 against
 * neither the dark ink nor the light one. Rather than hand-tuning those two
 * swatches and leaving the next category to rediscover the problem, push the
 * hue whichever way needs the smaller move until one of the two inks reads.
 */
function printable(hue: string, min = 4.5): string {
  const start = hexToRgb(hue);
  const dark = hexToRgb(INK.light.primary);
  const light = hexToRgb(INK.dark.primary);
  if (Math.max(contrast(start, dark), contrast(start, light)) >= min) return hue;

  // Darkening the board is what makes the light ink read, and vice versa.
  const darker = mixUntil(start, dark, light, min);
  const lighter = mixUntil(start, light, dark, min);
  if (!darker) return lighter ?? hue;
  if (!lighter) return darker;
  // Whichever moved the hue less is the one that still looks like the category.
  const moved = (hex: string) => {
    const c = hexToRgb(hex);
    return Math.abs(luminance(c) - luminance(start));
  };
  return moved(darker) <= moved(lighter) ? darker : lighter;
}

/** A board hue deepened for the dark leaf, so a full-bleed band does not glare. */
export function boardFor(hue: string, mode: 'light' | 'dark'): string {
  const seated = mode === 'light' ? hue : rgbToHex(composite(hexToRgb(hue), hexToRgb('#100F0C'), 0.78));
  return printable(seated);
}

/* ------------------------------------------------------------- the ink */

/**
 * Ink values, fixed because the leaf's luminance is pinned by solveLeaf().
 * Every pair below clears 4.5:1 against the solved reading field; the check
 * lives in scripts/check-contrast.mjs and runs as part of `npm test`.
 */
export const INK = {
  light: { primary: '#16150F', secondary: '#57533F', tertiary: '#68634d' },
  dark: { primary: '#F2EDE0', secondary: '#A9A391', tertiary: '#8D8875' },
} as const;

/* ---------------------------------------------------------- the ageing */

/** `> 最後更新：YYYY-MM-DD`, the line every published README carries. */
const REVISION = /^>\s*最後更新[：:]\s*(\d{4}-\d{2}-\d{2})\s*$/m;

export interface Revision {
  date: string;
  days: number;
  /** 0 fresh, 1 yellowing, 2 bleached. A stale page admits it in the material. */
  step: 0 | 1 | 2;
}

/**
 * Read a page's own revision line and turn its age into a material step.
 *
 * This reads content but never restates it: the date is already on the page,
 * rendered verbatim from the README. What is derived here is state — the same
 * kind of thing as the byte count — and it is spent on yellowing the leaf and
 * on a mark in the provenance strip, never on new prose.
 */
export function revisionOf(markdown: string, now = new Date()): Revision | null {
  const m = markdown.match(REVISION);
  if (!m) return null;
  const then = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
  // A quarter is a real staleness horizon for a runbook that pins Kubernetes
  // and Supabase versions; three quarters is suspect. Tuned to what the work
  // actually is, not to what makes a screenshot show the effect.
  return { date: m[1], days, step: days >= 270 ? 2 : days >= 90 ? 1 : 0 };
}

/* ------------------------------------------------------------- measure */

export const SPINE = 40;
export const RAIL = 56;
export const INDEX = 288;
export const BAND = 76;
