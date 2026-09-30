/**
 * Proves the design system's central claim.
 *
 * The leaf's alpha is binary-searched at runtime so that the reading field
 * lands in a fixed luminance band whatever board it sits on. That is only
 * worth anything if the ink tokens actually clear 4.5:1 against every solved
 * field — on every category, in both themes, including a category nobody has
 * created yet. This asserts exactly that, so a new hue or a retuned band fails
 * here rather than on someone's screen.
 *
 *   node scripts/check-contrast.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_ROOT } from './sync-content.mjs';

const cacheDir = join(SITE_ROOT, 'node_modules', '.cache');
mkdirSync(cacheDir, { recursive: true });
const outFile = join(cacheDir, `design-${process.pid}.mjs`);

const { code } = await esbuild.transform(readFileSync(join(SITE_ROOT, 'src/design.ts'), 'utf8'), {
  loader: 'ts',
  format: 'esm',
});
writeFileSync(outFile, code);

const design = await import(pathToFileURL(outFile).href);
process.on('exit', () => {
  try {
    rmSync(outFile);
  } catch {
    /* best effort */
  }
});

const {
  BOARD_HUES,
  BINDER_HUE,
  DANGER,
  MILK,
  INK,
  boardFor,
  solveLeaf,
  inkOn,
  readableOn,
  hexToRgb,
  contrast,
} = design;

const BODY = 4.5;
const LARGE = 3;

let failures = 0;
const check = (label, ratio, min) => {
  const ok = ratio >= min;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${ratio.toFixed(2)}:1 (need ${min})`);
};

// Every board a category can ever land on, plus the binder the overview uses.
const boards = [...BOARD_HUES, BINDER_HUE];

for (const mode of ['light', 'dark']) {
  const ink = INK[mode];
  console.log(`\n=== ${mode}`);

  for (const hue of boards) {
    const board = boardFor(hue, mode);
    const leaf = solveLeaf(board, mode);
    const field = hexToRgb(leaf.hex);

    check(`${hue}  body ink on the solved leaf`, contrast(hexToRgb(ink.primary), field), BODY);
    check(`${hue}  secondary ink on the solved leaf`, contrast(hexToRgb(ink.secondary), field), BODY);
    check(`${hue}  tertiary ink on the solved leaf`, contrast(hexToRgb(ink.tertiary), field), BODY);

    // The band, the spine and the open tab are the board at full strength.
    const on = inkOn(board, INK.light.primary, INK.dark.primary);
    check(`${hue}  chosen ink on the board itself`, contrast(hexToRgb(on), hexToRgb(board)), BODY);

    // The hue used as ink, after readableOn has mixed it toward the page.
    check(
      `${hue}  board-as-ink on the leaf`,
      contrast(hexToRgb(readableOn(board, leaf.hex, ink.primary)), field),
      BODY
    );

    // Vermilion only ever appears on the leaf, and only for danger — and it
    // is set as small text there, so it is held to the body ratio.
    check(
      `${hue}  danger-as-ink on the leaf`,
      contrast(hexToRgb(readableOn(DANGER[mode], leaf.hex, ink.primary)), field),
      BODY
    );
  }
}

/*
 * The ageing raise: a leaf whose revision is old yellows by a measurable step.
 * No page in this repo is old enough to show it yet, so the behaviour is
 * asserted here rather than left as a claim nobody can check.
 */
/*
 * Everything above measures design.ts. The browser paints tokens.css — so if
 * the two disagree, every assertion here is about a value nobody ships. That
 * is exactly what happened once: design.ts moved its light tertiary ink to
 * clear the floor, tokens.css kept the old one, and this script stayed green
 * while the page shipped 4.34:1. The values are compared here so that drift
 * fails the build instead of hiding behind it.
 */
console.log('\n=== design.ts vs tokens.css');
{
  const css = readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf8');

  // Innermost brace pairs, each with the selector that precedes it. The block
  // inside the prefers-color-scheme query is recognised by its own selector,
  // `:root:not([data-theme='light'])`, because backtracking leaves the @media
  // line out of the text captured before it.
  const themed = { light: [], dark: [] };
  for (const [, before, body] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // Dark is tested first, and by the negation: the dark media block's own
    // selector mentions `data-theme='light'` and would otherwise read as light.
    if (/data-theme='dark'|:not\(\[data-theme='light'\]\)/.test(before)) themed.dark.push(body);
    else if (/data-theme='light'/.test(before)) themed.light.push(body);
  }

  // The dark values are written twice — an explicit [data-theme='dark'] block
  // and a prefers-color-scheme block — so every occurrence is checked, which
  // also catches the two copies drifting apart from each other.
  const same = (label, name, theme, expected) => {
    const want = expected.toLowerCase();
    const found = themed[theme]
      .map((b) => b.match(new RegExp(`--${name}:\\s*([^;]+);`)))
      .filter(Boolean)
      .map((m) => m[1].trim().toLowerCase());
    const ok = found.length > 0 && found.every((v) => v === want);
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${label} — design.ts ${want}, tokens.css ${
        found.length ? found.join(' / ') : '(not found)'
      }`
    );
  };

  for (const theme of ['light', 'dark']) {
    same(`${theme}  --ink`, 'ink', theme, INK[theme].primary);
    same(`${theme}  --ink-2`, 'ink-2', theme, INK[theme].secondary);
    same(`${theme}  --ink-3`, 'ink-3', theme, INK[theme].tertiary);
    same(`${theme}  --danger`, 'danger', theme, DANGER[theme]);
    same(`${theme}  --milk`, 'milk', theme, MILK[theme]);
  }
}

// The `sudo` chip and the 404 panel print text directly on a vermilion fill.
console.log('\n=== text on a danger fill');
for (const [mode, on] of [
  ['light', '#FBF7EC'],
  ['dark', '#16150F'],
]) {
  check(
    `${mode}  chosen ink on the vermilion fill`,
    contrast(hexToRgb(on), hexToRgb(DANGER[mode])),
    BODY
  );
}

console.log('\n=== revision ageing');
const at = (days) => {
  const then = new Date(Date.UTC(2026, 0, 1));
  const now = new Date(then.getTime() + days * 86400000);
  return design.revisionOf(`# X\n\n> 最後更新：2026-01-01\n`, now);
};
const step = (label, days, want) => {
  const got = at(days)?.step;
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — step ${got}, expected ${want}`);
};
step('fresh, 10 days', 10, 0);
step('one day short of a quarter', 89, 0);
step('a quarter old, yellowing', 90, 1);
step('269 days, still yellowing', 269, 1);
step('three quarters old, bleached', 270, 2);
{
  const none = design.revisionOf('# X\n\nno revision line\n');
  const ok = none === null;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} a README with no revision line ages not at all`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall design-system checks passed');
process.exit(failures ? 1 : 0);
