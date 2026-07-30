/**
 * Content pipeline: repo READMEs -> src/content/manifest.json
 *
 * This is the whole point of the site. Every README.md in the repo becomes a
 * page, and nav / routes / search are all derived from the generated manifest.
 * Nothing about a subproject is hardcoded anywhere in the React app, so
 * "write a new script, add a README, git push" is all it takes to publish.
 *
 * The `markdown` field is the file's bytes, verbatim. Never transform it here —
 * that guarantee is what makes the README and the web page a single version.
 *
 * Usage:
 *   node scripts/sync-content.mjs        # write the manifest
 *   import { sync } from './sync-content.mjs'   # used by vite.config.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = resolve(scriptDir, '..');
export const REPO_ROOT = resolve(SITE_ROOT, '..');
const OUT_FILE = join(SITE_ROOT, 'src', 'content', 'manifest.json');

/** Directories that never hold publishable docs. */
const IGNORED = new Set([
  'site',
  'docs',
  'portal_preview',
  'node_modules',
  '.git',
  '.github',
  '.claude',
  '.code-review-graph',
  'dist',
]);

/**
 * Every subproject lives at `<category>/<project>/README.md` — exactly two
 * levels. The first level is the category, and it is the *only* thing that
 * decides the sidebar group, so putting the folder in the right place is the
 * whole classification step. Anything shallower or deeper is rejected below
 * rather than silently dropped from the site.
 */
const DOC_DEPTH = 2;

/**
 * Sidebar order of the categories. A category not listed here still works —
 * it sorts after these, alphabetically — so adding a fourth category means
 * creating a folder, and listing it here only when its position matters.
 */
const CATEGORY_ORDER = ['AI', 'container', 'script'];

/** Per-folder optional overrides. Absent for most folders — defaults are fine. */
const META_FILE = 'docs.json';

/* ------------------------------------------------------------------ */

function isIgnored(name) {
  return IGNORED.has(name) || name.startsWith('.');
}

/**
 * Collect every directory (relative, posix) holding a README.md, one level
 * deeper than a valid doc so a too-deep README is found and reported instead
 * of quietly never appearing.
 */
function findReadmeDirs(absDir, relDir = '', depth = 0) {
  const found = [];
  if (depth > 0 && existsSync(join(absDir, 'README.md'))) found.push({ relDir, depth });
  if (depth > DOC_DEPTH) return found;

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || isIgnored(entry.name)) continue;
    found.push(
      ...findReadmeDirs(join(absDir, entry.name), relDir ? posix.join(relDir, entry.name) : entry.name, depth + 1)
    );
  }
  return found;
}

/**
 * The doc dirs, with anything at the wrong depth turned into a build failure.
 * Being off by one level is the one mistake that used to cost nothing at build
 * time and produce a page nobody could reach.
 */
function findDocDirs(root = REPO_ROOT) {
  const all = findReadmeDirs(root);

  const misplaced = all.filter((d) => d.depth !== DOC_DEPTH);
  if (misplaced.length) {
    const lines = misplaced.map((d) =>
      d.depth < DOC_DEPTH
        ? `  ${d.relDir}/README.md sits at the repo root — move it into a category, e.g. ${CATEGORY_ORDER[2]}/${d.relDir}/`
        : `  ${d.relDir}/README.md is nested too deep — the site only publishes <category>/<project>/README.md`
    );
    throw new Error(
      `[sync-content] ${misplaced.length} README.md in the wrong place:\n${lines.join('\n')}\n` +
        `Categories in use: ${CATEGORY_ORDER.join(', ')} (a new top-level folder becomes a new category).`
    );
  }

  return all.map((d) => d.relDir);
}

/** Sidebar rank of a category: the root overview first, unknown ones last. */
function categoryRank(group) {
  if (!group) return -1;
  const i = CATEGORY_ORDER.indexOf(group);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function slugify(relDir) {
  return relDir
    .toLowerCase()
    .replace(/[/_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** First level-1 heading, else the folder name. */
function titleOf(markdown, relDir) {
  const h1 = markdown.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : relDir.split('/').pop();
}

function readMeta(absDir) {
  const file = join(absDir, META_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[sync-content] ignoring malformed ${relative(REPO_ROOT, file)}: ${err.message}`);
    return {};
  }
}

/** owner/repo + default branch, so link rewriting needn't hardcode the URL. */
export function repoInfo() {
  const fallback = { url: null, branch: 'main', slug: null };
  // In GitHub Actions this is authoritative and needs no git remote.
  if (process.env.GITHUB_REPOSITORY) {
    return {
      url: `https://github.com/${process.env.GITHUB_REPOSITORY}`,
      branch: process.env.GITHUB_REF_NAME || 'main',
      slug: process.env.GITHUB_REPOSITORY,
    };
  }
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (!m) return fallback;
    let branch = 'main';
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      /* detached HEAD in CI — 'main' is the right default */
    }
    if (!branch || branch === 'HEAD') branch = 'main';
    return { url: `https://github.com/${m[1]}`, branch, slug: m[1] };
  } catch {
    return fallback;
  }
}

/**
 * Repository name, used as the GitHub Pages base path.
 *
 * Derived rather than hardcoded so that renaming or moving the repository does
 * not silently break every asset URL on the published site.
 */
export function repoName() {
  const { slug } = repoInfo();
  return slug ? slug.split('/')[1] : null;
}

/** All README.md paths the manifest depends on — used by the dev watcher. */
export function watchTargets() {
  const dirs = findDocDirs(REPO_ROOT);
  const files = [join(REPO_ROOT, 'README.md')];
  for (const d of dirs) {
    files.push(join(REPO_ROOT, d, 'README.md'));
    const meta = join(REPO_ROOT, d, META_FILE);
    if (existsSync(meta)) files.push(meta);
  }
  return files;
}

export function sync({ quiet = false } = {}) {
  const docs = [];

  // Root README is the landing page.
  const rootReadme = join(REPO_ROOT, 'README.md');
  if (existsSync(rootReadme)) {
    const markdown = readFileSync(rootReadme, 'utf8');
    docs.push({
      title: titleOf(markdown, 'Overview'),
      icon: 'home',
      group: null,
      tags: [],
      order: -1,
      ...readMeta(REPO_ROOT),
      // Never overridable: identity and content. Spread order matters — with
      // the meta spread last, a root docs.json could replace the markdown and
      // break the verbatim guarantee this file exists to keep.
      slug: 'overview',
      dir: '',
      file: 'README.md',
      bytes: Buffer.byteLength(markdown),
      markdown,
    });
  }

  for (const relDir of findDocDirs(REPO_ROOT).sort()) {
    const absDir = join(REPO_ROOT, relDir);
    const markdown = readFileSync(join(absDir, 'README.md'), 'utf8');
    const meta = readMeta(absDir);
    docs.push({
      slug: slugify(relDir),
      dir: relDir,
      file: posix.join(relDir, 'README.md'),
      title: titleOf(markdown, relDir),
      icon: 'article',
      group: relDir.includes('/') ? relDir.split('/')[0] : null,
      tags: [],
      order: 0,
      ...meta,
      // never overridable: the content itself
      bytes: Buffer.byteLength(markdown),
      markdown,
    });
  }

  // Two different folders can slugify to the same value (a/b_c and a_b/c both
  // become "a-b-c"). getDoc() would silently serve the first and the second
  // page would be unreachable, so fail the build instead.
  const bySlug = new Map();
  for (const d of docs) {
    if (bySlug.has(d.slug)) {
      throw new Error(
        `[sync-content] duplicate slug "${d.slug}": ${bySlug.get(d.slug)} and ${d.file}. ` +
          'Rename one of the folders, or set a distinct "slug" in its docs.json.'
      );
    }
    bySlug.set(d.slug, d.file);
  }

  // Category first, so the sidebar groups keep a fixed order no matter what a
  // new project happens to be called; then docs.json's `order`, then title.
  docs.sort(
    (a, b) =>
      categoryRank(a.group) - categoryRank(b.group) ||
      (a.group ?? '').localeCompare(b.group ?? '') ||
      a.order - b.order ||
      a.title.localeCompare(b.title, 'zh-Hant')
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    repo: repoInfo(),
    // directory -> slug, so the app can turn README links into in-app routes
    dirToSlug: Object.fromEntries(docs.filter((d) => d.dir).map((d) => [d.dir, d.slug])),
    docs,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + '\n');

  if (!quiet) {
    console.log(`[sync-content] ${docs.length} docs -> ${relative(REPO_ROOT, OUT_FILE)}`);
    for (const d of docs) console.log(`  ${d.slug.padEnd(20)} ${String(d.bytes).padStart(6)} B  <- ${d.file}`);
  }
  return manifest;
}

// Direct invocation
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  sync();
}
