import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_DIRS, REPO_ROOT, deployment, findScriptDirs, siteIdentity } from './scripts/content-sources.mjs';

/**
 * Where the site is served from is decided by the environment, not by this
 * file: SITE_URL / BASE_PATH win, and without them (Cloudflare Pages, local) the
 * site sits at the root. Moving hosts is therefore a setting, not an edit.
 */
const { site, base, repo } = deployment();

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/**
 * Images live beside the writing (posts/img/, tools/img/, a script's own folder)
 * so GitHub shows them; the site serves the same files under /media/<repo path>.
 * In dev they are read from the repo; a build copies the images, and only the
 * images, into dist.
 */
const mediaDirs = () => [...MEDIA_DIRS, ...findScriptDirs()];
const isImage = (path) => Boolean(IMAGE_TYPES[extname(path).toLowerCase()]);
const media = {
  name: 'repo-media',
  hooks: {
    'astro:server:setup': ({ server }) => {
      const prefix = `${base === '/' ? '' : base}/media/`;
      server.middlewares.use((req, res, next) => {
        const path = decodeURI((req.url ?? '').split('?')[0]);
        if (!path.startsWith(prefix)) return next();
        const rel = posix.normalize(path.slice(prefix.length));
        const file = join(REPO_ROOT, rel);
        const type = IMAGE_TYPES[extname(rel).toLowerCase()];
        if (!type || !mediaDirs().some((d) => rel.startsWith(`${d}/`)) || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        res.setHeader('Content-Type', type);
        res.end(readFileSync(file));
      });
    },
    'astro:build:done': ({ dir }) => {
      for (const d of mediaDirs()) {
        const from = join(REPO_ROOT, d);
        if (!existsSync(from)) continue;
        cpSync(from, join(fileURLToPath(dir), 'media', d), {
          recursive: true,
          filter: (src) => statSync(src).isDirectory() ? !/[/\\](node_modules|\.[^/\\]+)$/.test(src) : isImage(src),
        });
      }
    },
  },
};

export default defineConfig({
  site,
  base,
  // Every page is a directory with an index.html: it works unchanged on any static
  // host, and a trailing slash is the canonical form.
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !/\/(404|search)\/?$/.test(page) }), media],
  devToolbar: { enabled: false },
  vite: {
    // Scripts stay files, never inlined: Vite wraps the search page's dynamic
    // `import()` of the Pagefind bundle in a preload helper that only resolves when
    // the script is its own chunk. They are small and cache across pages anyway.
    build: { assetsInlineLimit: 0 },
    // Posts, tools, pages and script READMEs live above site/, in the repo.
    server: { fs: { allow: ['..'] } },
    // Read once, here, from the repository; src/lib/site.ts consumes it.
    define: {
      __SITE__: JSON.stringify({
        ...siteIdentity(),
        url: site,
        base: base === '/' ? '' : base,
        repo,
        repoRoot: REPO_ROOT,
      }),
    },
  },
});
