import type { APIContext } from 'astro';
import { SITE } from '../lib/site';

export function GET(context: APIContext) {
  const sitemap = new URL(`${SITE.base}/sitemap-index.xml`, context.site!).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
