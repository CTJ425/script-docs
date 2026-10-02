/**
 * Where the site's content comes from, in plain Node.
 *
 * This module is the one place that knows how the repository is laid out, and
 * it is deliberately free of Astro and Vite so the same code serves the build
 * (src/content.config.ts), astro.config.mjs and the verify scripts.
 *
 *   posts/<slug>.md                  articles       (frontmatter)
 *   tools/<slug>.md                  tools          (frontmatter)
 *   pages/{home,about}.md            fixed pages    (frontmatter)
 *   <category>/<project>/README.md   scripts        (verbatim, no frontmatter)
 *
 * The scripts are the one place the site is not allowed to touch the prose: a
 * README is read as bytes and rendered, never rewritten, so the page and the
 * file on GitHub are one version.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_ORDER } from '../src/lib/categories.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(SITE_ROOT, '..');

/**
 * Directories that never hold a script README. The first group is tooling and
 * generated output; the second is content that lives at the repo root but is
 * not a `<category>/<project>` pair, so it must not be mistaken for a category.
 * `skill` holds Claude Code skills, which nest one level deeper than the site
 * publishes and are agent assets rather than something to run.
 */
const IGNORED = new Set([
  'site',
  'docs',
  'skill',
  'portal_preview',
  'node_modules',
  'dist',
  'posts',
  'tools',
  'pages',
]);

/**
 * Every script lives at `<category>/<project>/README.md`: exactly two levels.
 * The first level is the category and is the only thing that decides the
 * grouping, so filing the folder is the whole classification step.
 */
const DOC_DEPTH = 2;

/** Optional per-project sidecar. The README itself is never overridable. */
const META_FILE = 'docs.json';
const META_KEYS = new Set(['slug', 'tags', 'order']);

/** `> 最後更新：YYYY-MM-DD`, the line every published README carries. */
export const REVISION_LINE = /^>\s*最後更新[：:]\s*(\d{4}-\d{2}-\d{2})\s*$/m;

/* ------------------------------------------------------------------ */

function isIgnored(name) {
  return IGNORED.has(name) || name.startsWith('.');
}

/**
 * Directories holding a README.md, searched one level deeper than a valid
 * script so a README at the wrong depth is found and reported rather than
 * quietly never appearing.
 */
function findReadmeDirs(absDir, relDir = '', depth = 0) {
  const found = [];
  if (depth > 0 && existsSync(join(absDir, 'README.md'))) found.push({ relDir, depth });
  if (depth > DOC_DEPTH) return found;

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || isIgnored(entry.name)) continue;
    found.push(
      ...findReadmeDirs(
        join(absDir, entry.name),
        relDir ? posix.join(relDir, entry.name) : entry.name,
        depth + 1
      )
    );
  }
  return found;
}

/**
 * The script directories, with anything at the wrong depth turned into a build
 * failure. Being off by one level is the mistake that costs nothing at build
 * time and produces a page nobody can reach.
 */
export function findScriptDirs(root = REPO_ROOT) {
  const all = findReadmeDirs(root);
  const misplaced = all.filter((d) => d.depth !== DOC_DEPTH);
  if (misplaced.length) {
    const lines = misplaced.map((d) =>
      d.depth < DOC_DEPTH
        ? `  ${d.relDir}/README.md sits at the repo root — move it into a category, e.g. ${CATEGORY_ORDER[2]}/${d.relDir}/`
        : `  ${d.relDir}/README.md is nested too deep — scripts are <category>/<project>/README.md`
    );
    throw new Error(
      `[content] ${misplaced.length} README.md in the wrong place:\n${lines.join('\n')}\n` +
        `Categories in use: ${CATEGORY_ORDER.join(', ')} (a new top-level folder becomes a new category).`
    );
  }
  return all.map((d) => d.relDir).sort();
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[/_\s.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** First level-1 heading, else the fallback. */
export function titleOf(markdown, fallback) {
  const h1 = markdown.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : fallback;
}

/**
 * The first prose paragraph under the H1, as plain text.
 *
 * Derived from the README rather than written beside it, so a list card can
 * quote a script without a second copy of what it says existing anywhere.
 */
export function leadOf(markdown, max = 140) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  let i = h1 + 1;
  const isProse = (l) => l.trim() && !/^(```|~~~|\||#|>|[-*+]\s|\d+\.\s|---|<)/.test(l.trim());

  while (i < lines.length && !isProse(lines[i])) i++;
  const para = [];
  for (; i < lines.length && lines[i].trim(); i++) {
    if (!isProse(lines[i])) break;
    para.push(lines[i].trim());
  }

  const CJK = '\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef';
  const text = para
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    // Markup only: `~/.claude` and `pve_link_iso` are text, not emphasis.
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|\W)([*_])([^*_]+)\2(?=\W|$)/g, '$1$3')
    // Source lines are wrapped; a wrap between two CJK characters is not a space.
    .replace(new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, 'g'), '$1')
    .trim();
  if (text.length <= max) return text;

  // Cut where a sentence ends if one ends in the back half, else at a word.
  const head = text.slice(0, max);
  const stop = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.search(/\.\s[^.]*$/));
  if (stop > max * 0.5) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max * 0.6 ? head.slice(0, space) : head).trimEnd()}…`;
}

function readSidecar(absDir) {
  const file = join(absDir, META_FILE);
  if (!existsSync(file)) return {};
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`[content] ${relative(REPO_ROOT, file)} is not valid JSON: ${err.message}`);
  }
  const unknown = Object.keys(raw).filter((k) => !META_KEYS.has(k));
  if (unknown.length) {
    throw new Error(
      `[content] ${relative(REPO_ROOT, file)}: unknown key(s) ${unknown.join(', ')}. ` +
        `Allowed: ${[...META_KEYS].join(', ')} — the title and the text come from README.md, never from here.`
    );
  }
  return raw;
}

/**
 * Every script, README bytes verbatim.
 *
 * `body` is the file as read from disk with nothing trimmed, normalised or
 * stripped; verify-content.mjs and verify-dist.mjs both hold the site to it.
 */
export function loadScriptSources(root = REPO_ROOT) {
  const scripts = [];
  for (const relDir of findScriptDirs(root)) {
    const absDir = join(root, relDir);
    const [category, project] = relDir.split('/');
    const body = readFileSync(join(absDir, 'README.md'), 'utf8');
    const meta = readSidecar(absDir);
    const updated = body.match(REVISION_LINE)?.[1] ?? null;

    scripts.push({
      slug: meta.slug ?? slugify(project),
      dir: relDir,
      file: posix.join(relDir, 'README.md'),
      category,
      project,
      title: titleOf(body, project),
      summary: leadOf(body),
      updated,
      tags: meta.tags ?? [],
      order: meta.order ?? 0,
      bytes: Buffer.byteLength(body),
      body,
    });
  }

  // Two folders can slugify to one URL; one page would silently shadow the
  // other, so fail the build instead.
  const seen = new Map();
  for (const s of scripts) {
    if (seen.has(s.slug)) {
      throw new Error(
        `[content] duplicate script slug "${s.slug}": ${seen.get(s.slug)} and ${s.file}. ` +
          'Set a distinct "slug" in one of their docs.json files.'
      );
    }
    seen.set(s.slug, s.file);
  }
  return scripts;
}

/* ------------------------------------------------------------------ */

/**
 * The site's own name and tagline, read from the root README.
 *
 * The root README is the repository's front page on GitHub and the one place
 * the product is named, so the masthead, the <title> and the feed all read it
 * from here and cannot drift into calling it three different things.
 */
export function siteIdentity(root = REPO_ROOT) {
  const markdown = readFileSync(join(root, 'README.md'), 'utf8');
  const name = titleOf(markdown, 'site');
  const tagline = leadOf(markdown, 200);
  return { name, tagline };
}

/** owner/repo + default branch, so GitHub links needn't hardcode the URL. */
export function repoInfo() {
  const fallback = { url: null, branch: 'main', slug: null, owner: null, name: null };
  const from = (slug, branch) => ({
    url: `https://github.com/${slug}`,
    branch,
    slug,
    owner: slug.split('/')[0],
    name: slug.split('/')[1],
  });

  // In GitHub Actions this is authoritative and needs no git remote.
  if (process.env.GITHUB_REPOSITORY) {
    return from(process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME || 'main');
  }
  try {
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    const m = git('remote', 'get-url', 'origin').match(/github\.com[:/](.+?)(?:\.git)?$/);
    // Proxied remotes (e.g. http://127.0.0.1:PORT/git/owner/repo) carry the slug
    // at the end rather than after github.com.
    const slug = m?.[1] ?? git('remote', 'get-url', 'origin').match(/([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
    if (!slug) return fallback;
    // The branch a link should point at is the published one, not whichever
    // branch happens to be checked out.
    return from(slug, 'main');
  } catch {
    return fallback;
  }
}

/**
 * Where the site is served from.
 *
 * Nothing here is hardcoded to GitHub Pages, because the site is moving to
 * Cloudflare Pages: set SITE_URL (and BASE_PATH if it is not at the root) and
 * the build follows. On GitHub Actions the Pages defaults apply; anywhere else
 * the base is `/`.
 */
export function deployment() {
  const repo = repoInfo();
  const onGitHub = Boolean(process.env.GITHUB_ACTIONS && repo.slug);

  const site =
    process.env.SITE_URL ??
    process.env.CF_PAGES_URL ??
    (onGitHub ? `https://${repo.owner.toLowerCase()}.github.io` : 'http://localhost:4321');

  let base = process.env.BASE_PATH ?? (onGitHub ? `/${repo.name}` : '/');
  if (!base.startsWith('/')) base = `/${base}`;
  base = base.replace(/\/+$/, '') || '/';

  return { site: site.replace(/\/+$/, ''), base, repo };
}
