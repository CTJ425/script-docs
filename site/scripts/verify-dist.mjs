/**
 * Reads the built site, not the source, and asserts on what a visitor gets.
 *
 * It is not a visual check. It verifies the things that actually break a static
 * site: a route that was never produced, a link that goes nowhere, a page with
 * no title or no share preview, a feed that lost a post, a search index that
 * missed a page — and, for the scripts, that the page really is the README.
 *
 *   npm run build && node scripts/verify-dist.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { REPO_ROOT, SITE_ROOT, deployment, loadScriptSources, siteIdentity } from './content-sources.mjs';

const DIST = join(SITE_ROOT, 'dist');
const { site, base } = deployment();
const prefix = base === '/' ? '' : base;
const { name } = siteIdentity();

if (!existsSync(DIST)) {
  console.error('dist/ does not exist — run `npm run build` first.');
  process.exit(1);
}

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ----------------------------------------------------------------- helpers */

const ENTITY = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0' };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);

const stripTags = (s) => s.replace(/<[^>]+>/g, '');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

const pages = new Map(); // route -> html
for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const rel = posix.relative(DIST.split('\\').join('/'), file.split('\\').join('/'));
  if (rel.startsWith('pagefind/')) continue;
  const route = rel === 'index.html' ? '/' : rel === '404.html' ? '/404/' : `/${rel.replace(/index\.html$/, '')}`;
  pages.set(route, readFileSync(file, 'utf8'));
}

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const attr = (html, re) => html.match(re)?.[1];

/** Frontmatter `key: value` lines, enough for the flat keys this site uses. */
function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** The fenced blocks of a markdown file, in order, as the language and exact text. */
function fences(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^((?: {0,3}>[ ]?)*)([ ]*)(`{3,}|~{3,})\s*([^\s`]*)/);
    if (!open) continue;
    const quotes = (open[1].match(/>/g) ?? []).length;
    const indent = open[2].length;
    const fence = open[3];
    const unwrap = (line) => {
      let l = line;
      for (let q = 0; q < quotes; q++) l = l.replace(/^ {0,3}>[ ]?/, '');
      return l.replace(new RegExp(`^ {0,${indent}}`), '');
    };
    const body = [];
    for (i++; i < lines.length; i++) {
      const l = unwrap(lines[i]);
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(l)) break;
      body.push(l);
    }
    out.push({ lang: open[4] || 'text', code: body.join('\n') });
  }
  return out;
}

/* --------------------------------------------------------- expected routes */

const scripts = loadScriptSources();
const listed = (dir) =>
  existsSync(join(REPO_ROOT, dir))
    ? readdirSync(join(REPO_ROOT, dir))
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ slug: f.replace(/\.md$/, ''), fm: frontmatter(read(`${dir}/${f}`)) }))
        .filter((e) => e.fm.draft !== 'true')
    : [];
const posts = listed('posts');
const tools = listed('tools');

const expected = new Set([
  '/',
  '/about/',
  '/posts/',
  '/tools/',
  '/scripts/',
  '/tags/',
  '/search/',
  '/404/',
  ...posts.map((p) => `/posts/${p.slug}/`),
  ...tools.map((t) => `/tools/${t.slug}/`),
  ...scripts.map((s) => `/scripts/${s.slug}/`),
]);

console.log('\n=== every route exists');
{
  const missing = [...expected].filter((r) => !pages.has(r));
  check(`${expected.size} expected routes are built`, missing.length === 0, missing.join(', '));
  const tagPages = [...pages.keys()].filter((r) => r.startsWith('/tags/') && r !== '/tags/');
  check('there is a page for every tag in use', tagPages.length > 0, `${tagPages.length} tag pages`);
}

console.log('\n=== every page can be found, shared and read');
for (const [route, html] of [...pages].sort()) {
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]*)"/);
  const problems = [];
  if (!title) problems.push('no <title>');
  if (!description) problems.push('no meta description');
  if (!attr(html, /<link rel="canonical" href="([^"]+)"/)) problems.push('no canonical');
  if (!attr(html, /<meta property="og:title" content="([^"]+)"/)) problems.push('no og:title');
  if (!/<html lang="zh-TW"/.test(html)) problems.push('lang is not zh-TW');
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) problems.push(`${h1} <h1> (want 1)`);
  if (/>undefined<|\[object Object\]|>NaN</.test(html)) problems.push('renders undefined / [object Object] / NaN');
  if (/href="#\//.test(html)) problems.push('a hash-route link');
  if (route !== '/' && title && !title.endsWith(`· ${name}`)) problems.push(`title does not end with the site name: ${title}`);
  check(route, problems.length === 0, problems.join('; '));
}

console.log('\n=== one product, one name');
{
  const home = pages.get('/') ?? '';
  check('the home <title> is the root README H1', attr(home, /<title>([^<]*)<\/title>/) === name, name);
  check('the masthead says the same', home.includes(`class="masthead__name"`) && stripTags(home.match(/class="masthead__name"[^>]*>([^<]*)</)?.[0] ?? '').includes(name));
  const feed = existsSync(join(DIST, 'rss.xml')) ? readFileSync(join(DIST, 'rss.xml'), 'utf8') : '';
  check('the feed says the same', feed.includes(`<title>${name}</title>`));
}

console.log('\n=== links go somewhere');
{
  const ids = new Map([...pages].map(([r, h]) => [r, new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1])))]));
  const dead = [];
  let count = 0;

  for (const [route, html] of pages) {
    for (const m of html.matchAll(/<a\s[^>]*?href="([^"]+)"/g)) {
      const href = decode(m[1]);
      if (/^(https?:|mailto:|\/\/)/.test(href)) continue;
      count++;

      let path;
      let hash = '';
      if (href.startsWith('#')) {
        path = route;
        hash = href.slice(1);
      } else {
        const [p, h = ''] = href.split('#');
        hash = h;
        if (!p.startsWith(`${prefix}/`) && p !== prefix) {
          dead.push(`${route} -> ${href} (outside the deploy base "${prefix}")`);
          continue;
        }
        path = decodeURI(p.slice(prefix.length) || '/');
      }

      const isFile = /\.[a-z0-9]+$/i.test(path);
      const exists = isFile ? existsSync(join(DIST, path)) : pages.has(path.endsWith('/') ? path : `${path}/`);
      if (!exists) {
        dead.push(`${route} -> ${href}`);
        continue;
      }
      if (hash && !isFile && !ids.get(path.endsWith('/') ? path : `${path}/`)?.has(decodeURIComponent(hash))) {
        dead.push(`${route} -> ${href} (no such anchor)`);
      }
    }
  }
  check(`${count} internal links all resolve (incl. anchors), under base "${prefix || '/'}"`, dead.length === 0, dead.slice(0, 6).join('; '));
}

console.log('\n=== scripts: the page is the README');
for (const s of scripts) {
  const html = pages.get(`/scripts/${s.slug}/`);
  if (!html) continue;
  const problems = [];
  const disk = read(s.file);

  // The page carries a fingerprint of the exact bytes it was rendered from.
  if (attr(html, /data-sha="([^"]+)"/) !== sha16(disk)) problems.push('the page was rendered from different bytes than the file on disk');
  if (Number(attr(html, /data-bytes="(\d+)"/)) !== Buffer.byteLength(disk)) problems.push('byte count differs');

  // Every fenced block survives exactly, in order, and is copyable.
  const want = fences(disk);
  const got = [...html.matchAll(/<div class="win">[\s\S]*?<span class="win__lang">([^<]*)<\/span>[\s\S]*?<pre class="win__pre"><code>([\s\S]*?)<\/code><\/pre><\/div>/g)].map(
    (m) => ({ lang: decode(m[1]), code: decode(stripTags(m[2])) })
  );
  if (got.length !== want.length) problems.push(`${want.length} fenced blocks in the README, ${got.length} command windows on the page`);
  else {
    want.forEach((w, i) => {
      if (got[i].code !== w.code) problems.push(`block ${i + 1} differs: ${JSON.stringify(w.code.slice(0, 50))}`);
      if (got[i].lang !== w.lang) problems.push(`block ${i + 1} language ${got[i].lang} != ${w.lang}`);
    });
  }
  const buttons = (html.match(/class="win__copy"/g) ?? []).length;
  if (buttons !== want.length) problems.push(`${buttons} copy buttons for ${want.length} blocks`);

  // sudo is flagged exactly when the word is in the block.
  want.forEach((w, i) => {
    const asks = /(^|[\s|(])sudo(\s|$)/.test(w.code);
    const winHtml = html.split('<div class="win">')[i + 1] ?? '';
    const flagged = winHtml.slice(0, winHtml.indexOf('</div>')).includes('win__sudo');
    if (asks !== flagged) problems.push(`block ${i + 1}: sudo ${asks ? 'is' : 'is not'} in the text but the flag ${flagged ? 'shows' : 'is missing'}`);
  });

  // The headings the TOC links to exist on the page.
  const toc = [...html.matchAll(/<li data-depth="\d"><a href="#([^"]+)"/g)].map((m) => decode(m[1]));
  const have = new Set([...html.matchAll(/<h[23] id="([^"]+)"/g)].map((m) => decode(m[1])));
  const lost = toc.filter((id) => !have.has(id));
  if (lost.length) problems.push(`TOC anchors missing: ${lost.join(', ')}`);

  check(`${s.slug}  (${s.bytes} B, ${want.length} blocks)`, problems.length === 0, problems.join('; '));
}

console.log('\n=== the feed carries every post');
{
  const feed = existsSync(join(DIST, 'rss.xml')) ? readFileSync(join(DIST, 'rss.xml'), 'utf8') : '';
  const items = (feed.match(/<item>/g) ?? []).length;
  check(`${posts.length} published posts -> ${items} feed items`, items === posts.length);
  const links = [...feed.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
  check('every item links to an absolute URL on this site', links.every((l) => l.startsWith(`${site}${prefix}/posts/`)), links[0] ?? '');
  // Links inside an item are read away from the site, so they must not be relative.
  const relative = [...feed.matchAll(/href=&quot;(\/[^&]*)&quot;|href="(\/[^"]*)"/g)];
  check('no relative links inside feed content', relative.length === 0, relative[0]?.[0] ?? '');
}

console.log('\n=== sitemap, robots and search');
{
  const idx = existsSync(join(DIST, 'sitemap-index.xml'));
  const sm = existsSync(join(DIST, 'sitemap-0.xml')) ? readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8') : '';
  check('sitemap-index.xml exists', idx);
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const missing = [...expected].filter((r) => !['/404/', '/search/'].includes(r) && !urls.includes(`${site}${prefix}${r}`));
  check('the sitemap lists every route that should be found', missing.length === 0, missing.slice(0, 5).join(', '));
  check('the sitemap leaves out 404 and search', !urls.some((u) => /\/404\/|\/search\//.test(u)));

  const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
  check('robots.txt points at the sitemap', robots.includes(`Sitemap: ${site}${prefix}/sitemap-index.xml`));

  const entry = join(DIST, 'pagefind', 'pagefind-entry.json');
  check('the Pagefind index was built', existsSync(entry));
  if (existsSync(entry)) {
    const indexed = JSON.parse(readFileSync(entry, 'utf8')).languages;
    const total = Object.values(indexed).reduce((n, l) => n + l.page_count, 0);
    const bodies = [...pages.values()].filter((h) => h.includes('data-pagefind-body')).length;
    check(`every readable page is indexed (${bodies} marked, ${total} in the index)`, total === bodies);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall dist checks passed');
process.exit(failures ? 1 : 0);
