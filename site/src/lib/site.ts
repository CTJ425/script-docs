/**
 * The site's identity and where it is served from.
 *
 * `name` and `tagline` are read from the root README's own H1 and first
 * paragraph, so the masthead, the <title>, the feed and the repository's front
 * page cannot name the product differently. Nothing else in the front end is
 * allowed to hold a product name.
 *
 * The values are computed once, in astro.config.mjs, and injected as a build-time
 * constant. That keeps this module free of filesystem access, which matters:
 * anything that reads paths relative to its own location breaks the moment the
 * bundler moves it.
 */
declare const __SITE__: {
  name: string;
  tagline: string;
  url: string;
  /** Deploy base with no trailing slash: '' at the root, '/script-docs' under Pages. */
  base: string;
  repo: { url: string | null; branch: string; slug: string | null; owner: string | null; name: string | null };
  repoRoot: string;
};

export const SITE = __SITE__;

/** A site path, with the deploy base added: `url('/posts/')`. */
export const url = (path: string) => `${SITE.base}${path}`;

/** The same, absolute: for canonical links and Open Graph. */
export const absolute = (path: string) => `${SITE.url}${SITE.base}${path}`;

/** `2026-10-02`, from a Date or an ISO string, without a timezone shifting the day. */
export const isoDate = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export const GITHUB_PROFILE = SITE.repo.owner ? `https://github.com/${SITE.repo.owner}` : null;
