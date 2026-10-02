/**
 * Markdown -> HTML, for every page on the site.
 *
 * One pipeline serves posts, tools, pages and the script READMEs, so a code
 * block, an alert or a table cannot look different depending on which folder
 * the file happened to be in. It is plain Node (no Astro, no Vite) so the verify
 * scripts can run the exact renderer the build runs.
 *
 *   remark-parse -> gfm -> remark-rehype -> raw -> sanitize -> slug -> prose
 *
 * Sanitising runs *before* the site's own transform, so the classes and
 * attributes added below are never stripped, and nothing a file contains can
 * add a script or an event handler.
 */
import { statSync } from 'node:fs';
import { posix } from 'node:path';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import { toString } from 'hast-util-to-string';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

loadLanguages([
  'bash',
  'yaml',
  'json',
  'ini',
  'toml',
  'python',
  'javascript',
  'typescript',
  'docker',
  'markup',
  'css',
  'diff',
  'sql',
  'powershell',
]);

/** Fence names that Prism knows under another name. Anything else is plain text. */
const LANG_ALIAS = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  jsonc: 'json',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  html: 'markup',
  xml: 'markup',
  dockerfile: 'docker',
  ps1: 'powershell',
};

/**
 * GFM alert syntax: a blockquote whose first line is `[!NOTE]` and so on.
 *
 * Two levels, because vermilion is held out of the whole palette so that it
 * means one thing when it appears. WARNING and CAUTION are about the machine;
 * everything else is set in ink.
 */
const ALERT_LEVEL = {
  NOTE: 'plain',
  TIP: 'plain',
  IMPORTANT: 'plain',
  WARNING: 'danger',
  CAUTION: 'danger',
};

const el = (tagName, properties = {}, children = []) => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value) => ({ type: 'text', value });

/* ------------------------------------------------------------- code windows */

function tokensToHast(tokens) {
  return tokens.map((t) =>
    typeof t === 'string'
      ? text(t)
      : el(
          'span',
          { className: ['token', t.type, ...(t.alias ? [].concat(t.alias) : [])] },
          tokensToHast([].concat(t.content))
        )
  );
}

function highlight(code, lang) {
  const grammar = Prism.languages[LANG_ALIAS[lang] ?? lang];
  return grammar ? tokensToHast(Prism.tokenize(code, grammar)) : [text(code)];
}

/**
 * Does this command say `sudo`?
 *
 * A read of the text, not a judgement about it: the string is in the block. The
 * reader is about to paste it into a machine they care about, so it is said at
 * window size.
 */
const asksForRoot = (code) => /(^|[\s|(])sudo(\s|$)/.test(code);

/** Does it rehearse? Same standard: the flag is literally in the text. */
const rehearses = (code) => /(^|\s)--dry-run(\s|=|$)/.test(code);

function codeWindow(code, lang) {
  const flags = [];
  if (asksForRoot(code)) flags.push(el('span', { className: ['win__flag', 'win__sudo'] }, [text('sudo')]));
  if (rehearses(code)) flags.push(el('span', { className: ['win__flag', 'win__dry'] }, [text('dry-run')]));

  return el('div', { className: ['win'] }, [
    el('div', { className: ['win__head'] }, [
      el('span', { className: ['win__lang'] }, [text(lang || 'text')]),
      ...flags,
      el('button', { type: 'button', className: ['win__copy'], dataCopy: '' }, [text('Copy')]),
    ]),
    // No wrapper spans between lines: the text of this <pre> is the command,
    // exactly, which is what the copy button reads.
    el('pre', { className: ['win__pre'] }, [el('code', {}, highlight(code, lang))]),
  ]);
}

/* ------------------------------------------------------------------- links */

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Where a link written in a file should really go.
 *
 * README links are written for GitHub. A relative link to a folder that is a
 * published script keeps the reader on the site; any other path goes to the file
 * on GitHub. Anything that leaves the repository, or has no safe destination,
 * comes back null and renders as plain text instead of a dead or hostile link.
 */
function makeResolver({ baseDir, base, origin, scriptSlugByDir, repo, repoRoot }) {
  const site = (path) => `${origin}${base}${path}`;

  return function resolve(href) {
    if (!href) return null;

    if (href.startsWith('#')) return { href };
    if (ABSOLUTE.test(href) || href.startsWith('//')) {
      return /^(https?:|mailto:)/i.test(href) || href.startsWith('//')
        ? { href, external: !href.startsWith('mailto:') }
        : null;
    }
    // A site path, written as `/tools/ollama/`: only the deploy base is added.
    if (href.startsWith('/')) return { href: href.startsWith(`${base}/`) ? `${origin}${href}` : site(href) };

    const [pathPart, hash = ''] = href.split('#');
    const resolved = posix.normalize(posix.join(baseDir, pathPart)).replace(/\/$/, '');
    if (resolved.startsWith('..')) return null;
    const frag = hash ? `#${hash}` : '';

    const dir = resolved.replace(/\/README\.md$/, '');
    const slug = scriptSlugByDir.get(dir);
    if (slug) return { href: site(`/scripts/${slug}/${frag}`) };

    if (!repo.url) return null;
    let kind = 'blob';
    try {
      if (resolved === '' || statSync(posix.join(repoRoot, resolved)).isDirectory()) kind = 'tree';
    } catch {
      /* a path that no longer exists still deserves a link to where it was */
    }
    return {
      href: resolved ? `${repo.url}/${kind}/${repo.branch}/${resolved}${frag}` : repo.url,
      external: true,
    };
  };
}

/* ----------------------------------------------------------------- the plugin */

const firstElement = (node) => node.children.find((c) => c.type === 'element');

function rehypeProse(ctx) {
  const resolve = makeResolver(ctx);

  return (tree, file) => {
    const headings = [];
    const stats = { cjk: 0, words: 0 };

    // Reading length, from prose only: a command is not something one reads.
    // Counted first, while a command is still a bare <pre><code> and its text
    // has a direct <code> parent.
    visit(tree, 'text', (node, _i, parent) => {
      if (parent?.tagName === 'code' || parent?.tagName === 'pre') return;
      stats.cjk += (node.value.match(/[㐀-鿿]/g) ?? []).length;
      stats.words += (node.value.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? []).length;
    });

    // Code first, so nothing below sees a bare <pre>.
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return;
      const code = firstElement(node);
      if (!code || code.tagName !== 'code') return;
      const lang = String([].concat(code.properties?.className ?? []).find((c) => /^language-/.test(c)) ?? '')
        .replace(/^language-/, '');
      const source = toString(code).replace(/\n$/, '');
      parent.children[index] = codeWindow(source, lang);
      return 'skip';
    });

    visit(tree, 'element', (node, index, parent) => {
      switch (node.tagName) {
        case 'a': {
          const target = resolve(node.properties?.href);
          if (!target) {
            // No safe destination: keep what the link said, drop the link.
            if (parent && index !== undefined) parent.children.splice(index, 1, ...node.children);
            return index;
          }
          node.properties.href = target.href;
          if (target.external) {
            node.properties.target = '_blank';
            node.properties.rel = ['noreferrer', 'noopener'];
          }
          break;
        }
        case 'img': {
          const src = node.properties?.src;
          if (typeof src === 'string' && src.startsWith('/')) node.properties.src = `${ctx.base}${src}`;
          node.properties.loading = 'lazy';
          node.properties.decoding = 'async';
          break;
        }
        case 'table': {
          // Wrap once, then re-enter the wrapper: the cells still hold links that
          // need rewriting, so the table itself must not be skipped.
          const wrapped = [].concat(parent?.properties?.className ?? []).includes('tablewrap');
          if (!wrapped && parent && index !== undefined) {
            parent.children[index] = el('div', { className: ['tablewrap'] }, [node]);
            return index;
          }
          break;
        }
        case 'blockquote': {
          const p = firstElement(node);
          const first = p?.tagName === 'p' ? p.children[0] : undefined;
          const marker = first?.type === 'text' ? first.value.match(/^\[!(\w+)\][ \t]*\r?\n?/) : null;
          const level = marker ? ALERT_LEVEL[marker[1].toUpperCase()] : undefined;
          if (!marker || !level || !parent || index === undefined) break;

          first.value = first.value.slice(marker[0].length);
          if (!first.value) p.children.shift();
          const kids = p.children.length ? node.children : node.children.filter((c) => c !== p);
          parent.children[index] = el('div', { className: ['alert'], dataLevel: level }, [
            el('span', { className: ['alert__label'] }, [text(marker[1].toUpperCase())]),
            ...kids,
          ]);
          return index;
        }
        case 'h2':
        case 'h3':
          if (node.properties?.id) {
            headings.push({
              depth: Number(node.tagName[1]),
              text: toString(node).trim(),
              id: String(node.properties.id),
            });
          }
          break;
        default:
      }
      return undefined;
    });

    file.data.prose = { headings, stats };
  };
}

/* --------------------------------------------------------------------- API */

/**
 * @typedef {object} RenderContext
 * @property {string} baseDir  Repo-relative directory of the file, so its relative links resolve.
 * @property {string} [base]   Deploy base path, no trailing slash ('' at the root).
 * @property {string} [origin] Prefix for absolute links (feeds need them; pages do not).
 * @property {{ dir: string, slug: string }[]} [scripts] Published scripts, for README link rewriting.
 * @property {{ url: string | null, branch: string }} [repo]
 * @property {string} [repoRoot] Absolute path of the repository, to tell a folder link from a file link.
 */

/**
 * @param {string} source
 * @param {RenderContext} context
 * @returns {Promise<{ html: string, headings: { depth: number, text: string, id: string }[], stats: { cjk: number, words: number } }>}
 */
export async function renderMarkdown(source, context) {
  const ctx = {
    base: '',
    origin: '',
    scripts: [],
    repo: { url: null, branch: 'main' },
    repoRoot: '',
    ...context,
  };
  ctx.base = ctx.base === '/' ? '' : ctx.base;
  ctx.scriptSlugByDir = new Map(ctx.scripts.map((s) => [s.dir, s.slug]));

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeSlug)
    .use(rehypeProse, ctx)
    .use(rehypeStringify)
    .process(source);

  return { html: String(file), ...file.data.prose };
}

/** Minutes to read: Chinese at ~400 characters a minute, Latin at ~220 words. */
export function readingMinutes({ cjk, words }) {
  return Math.max(1, Math.ceil(cjk / 400 + words / 220));
}
