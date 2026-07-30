import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { REPO_ROOT, repoName, sync, watchTargets } from './scripts/sync-content.mjs';

/**
 * Regenerates src/content/manifest.json from the repo's README.md files.
 *
 * - on build: once, before bundling (so CI needs no extra step)
 * - on dev:   whenever any README.md / docs.json is added, changed or removed,
 *             so adding a new subproject shows up without restarting Vite
 */
function readmeContent(): Plugin {
  const isDoc = (file: string) => /(?:^|[/\\])(README\.md|docs\.json)$/.test(file);

  return {
    name: 'readme-content',
    buildStart() {
      sync();
    },
    configureServer(server) {
      for (const file of watchTargets()) server.watcher.add(file);
      // Also watch the repo root so a README in a brand new subproject folder
      // is noticed. This has to be a plain directory path, not a glob: Vite
      // runs chokidar with disableGlobbing, so glob patterns would be treated
      // as literal filenames and silently never match. Vite's default ignores
      // (.git, node_modules, outDir) keep this cheap.
      server.watcher.add(REPO_ROOT);

      const refresh = (file: string) => {
        if (!isDoc(file)) return;
        try {
          sync({ quiet: true });
          server.config.logger.info(`[readme-content] manifest updated (${file})`);
          server.ws.send({ type: 'full-reload' });
        } catch (err) {
          server.config.logger.error(`[readme-content] ${(err as Error).message}`);
        }
      };

      server.watcher.on('change', refresh);
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

// GitHub Pages project sites are served from /<repo>/, so the base path has to
// match the repository name. Derived from GITHUB_REPOSITORY (in Actions) or the
// git remote (locally) so renaming or moving the repo cannot silently break
// every asset URL. Override with SITE_BASE if the site is hosted elsewhere.
const base = process.env.SITE_BASE ?? (repoName() ? `/${repoName()}/` : '/');

export default defineConfig({
  base,
  plugins: [readmeContent(), react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // One vendor chunk. Splitting MUI and the markdown stack into separate
        // chunks produced a circular chunk (markdown -> mui -> markdown) and
        // risked bad module init order; app -> vendor cannot be circular.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
});
