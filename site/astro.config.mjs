import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { REPO_ROOT, deployment, siteIdentity } from './scripts/content-sources.mjs';

/**
 * Where the site is served from is decided by the environment, not by this
 * file: SITE_URL / BASE_PATH win, and without them (Cloudflare Pages, local) the
 * site sits at the root. Moving hosts is therefore a setting, not an edit.
 */
const { site, base, repo } = deployment();

export default defineConfig({
  site,
  base,
  // Every page is a directory with an index.html: it works unchanged on any static
  // host, and a trailing slash is the canonical form.
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !/\/(404|search)\/?$/.test(page) })],
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
