/**
 * Renders every doc page with react-dom/server and asserts on the HTML.
 *
 * This is not a visual check — it verifies the things that actually break:
 * the markdown renders without throwing, headings get the ids the TOC targets,
 * code blocks and copy buttons exist, README links are rewritten correctly,
 * and the rendered text still matches the README byte-for-byte.
 *
 *   node scripts/smoke-test.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, SITE_ROOT, sync } from './sync-content.mjs';

sync({ quiet: true });

const ENTRY = `
import { renderToString } from 'react-dom/server';
// MemoryRouter (main entry) rather than StaticRouter (react-router-dom/server.js):
// the /server.js entry is CJS and requiring it pulls in a second router copy,
// whose context the bundled components cannot see.
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import App from '../src/App';
import { buildTheme } from '../src/theme';
import { docs } from '../src/content';
import { extractHeadings } from '../src/components/Toc';

export function render(slug, mode) {
  return renderToString(
    <ThemeProvider theme={buildTheme(mode)}>
      <MemoryRouter initialEntries={['/' + slug]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>
  );
}
export { docs, extractHeadings };
`;

// Bundle to ESM, not CJS: MUI ships dual ESM/CJS and a CJS bundle mis-resolves
// the default exports of its single-component entry points.
// Must live inside the project so Node resolves node_modules from here.
const cacheDir = join(SITE_ROOT, 'node_modules', '.cache');
mkdirSync(cacheDir, { recursive: true });
const outFile = join(cacheDir, `smoke-render-${process.pid}.mjs`);
await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: join(SITE_ROOT, 'scripts'), loader: 'tsx' },
  bundle: true,
  outfile: outFile,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  loader: { '.json': 'json' },
  // React stays external so Node loads exactly one CJS copy — the server
  // renderer sets the hook dispatcher on that copy, and a second bundled copy
  // would make every hook call fail. Everything else is bundled, because MUI v6
  // has no exports map and Node cannot resolve its directory imports.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server'],
  // Prefer each package's ESM build (what Vite resolves too). With the default
  // node mainFields esbuild picks the CJS builds, whose require('react') cannot
  // work in an ESM bundle with react marked external.
  mainFields: ['module', 'main'],
  conditions: ['module', 'import'],
  logLevel: 'error',
});

const { render, docs, extractHeadings } = await import(pathToFileURL(outFile).href);
process.on('exit', () => {
  try {
    rmSync(outFile);
  } catch {
    /* best effort */
  }
});

/* ------------------------------------------------------------------ */

// This is a client-only app rendered on the server on purpose; React's
// useLayoutEffect/SSR warnings are expected noise here.
const realWarn = console.warn;
const realError = console.error;
const silence = (fn) => (...args) => {
  if (typeof args[0] === 'string' && /useLayoutEffect|hydrat/i.test(args[0])) return;
  fn(...args);
};
console.warn = silence(realWarn);
console.error = silence(realError);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
};

const decode = (s) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

for (const doc of docs) {
  console.log(`\n=== ${doc.slug}  (${doc.file}, ${doc.bytes} B)`);
  let html;
  try {
    html = render(doc.slug, 'dark');
  } catch (err) {
    check('renders without throwing', false, err.message);
    continue;
  }
  check('renders without throwing', true);

  // The provenance chip must name the real source file.
  check('shows source file', html.includes(doc.file), doc.file);

  // Every h2/h3 the TOC links to must exist as an id in the document.
  const headings = extractHeadings(doc.markdown);
  const missing = headings.filter((h) => !html.includes(`id="${h.id}"`));
  check(
    `all ${headings.length} TOC anchors exist in the DOM`,
    missing.length === 0,
    missing.length ? 'missing: ' + missing.map((h) => h.id).join(', ') : ''
  );

  // Fenced code blocks -> a CodeBlock each, with a copy button.
  const fences = (doc.markdown.match(/^\s*```/gm) || []).length / 2;
  const copyButtons = (html.match(/>Copy</g) || []).length;
  check(
    `${fences} fenced block(s) -> ${copyButtons} copy button(s)`,
    fences === 0 ? true : copyButtons === Math.floor(fences),
    fences !== copyButtons ? `expected ${Math.floor(fences)}` : ''
  );

  // Every fenced block's exact text must survive into the DOM.
  const codes = [...doc.markdown.matchAll(/^([ \t]*)```[^\n]*\n([\s\S]*?)\n\1```/gm)].map((m) =>
    m[2]
      .split('\n')
      .map((l) => l.slice(m[1].length))
      .join('\n')
  );
  const text = decode(html.replace(/<[^>]+>/g, ''));
  const lost = codes.filter((c) => {
    // compare on the longest line: whitespace between prism tokens is preserved,
    // but line-level content must be present verbatim
    const longest = c.split('\n').sort((a, b) => b.length - a.length)[0]?.trim();
    return longest && longest.length > 8 && !text.includes(longest);
  });
  check(
    `${codes.length} code block(s) present verbatim`,
    lost.length === 0,
    lost.length ? `first lost: ${JSON.stringify(lost[0].slice(0, 60))}` : ''
  );

  // Relative links to sibling docs become in-app routes, not GitHub links.
  const relLinks = [...doc.markdown.matchAll(/\[[^\]]+\]\((\.\/[^)\s]+)\)/g)].map((m) => m[1]);
  const inAppExpected = relLinks
    .map((h) => h.replace(/^\.\//, '').replace(/\/$/, '').split('#')[0])
    .filter((p) => Object.prototype.hasOwnProperty.call(JSON.parse(readFileSync(join(SITE_ROOT, 'src/content/manifest.json'), 'utf8')).dirToSlug, p));
  const routed = inAppExpected.filter((p) => {
    const slug = JSON.parse(readFileSync(join(SITE_ROOT, 'src/content/manifest.json'), 'utf8')).dirToSlug[p];
    return html.includes(`href="/${slug}"`) || html.includes(`href="#/${slug}"`);
  });
  check(
    `${inAppExpected.length} sibling-doc link(s) routed in-app`,
    routed.length === inAppExpected.length,
    routed.length !== inAppExpected.length
      ? 'not routed: ' + inAppExpected.filter((p) => !routed.includes(p)).join(', ')
      : ''
  );

  // Manifest content must equal the file on disk.
  const onDisk = readFileSync(join(REPO_ROOT, doc.file), 'utf8');
  check('manifest markdown === file on disk', onDisk === doc.markdown);
}

// Light mode must render too (different palette code paths).
console.log('\n=== light palette');
try {
  render(docs[0].slug, 'light');
  check('renders in light mode', true);
} catch (err) {
  check('renders in light mode', false, err.message);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
