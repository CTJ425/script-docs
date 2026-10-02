import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, renderEntry } from '../lib/content';
import { SITE } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  // Feeds are read away from the site, so every link inside an item is absolute.
  const origin = new URL(context.site!).origin;

  const items = await Promise.all(
    posts.map(async (post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `${SITE.base}/posts/${post.id}/`,
      categories: post.data.tags,
      content: (await renderEntry(post.body, 'posts', { origin })).html,
    }))
  );

  return rss({
    title: SITE.name,
    description: SITE.tagline,
    site: context.site!,
    items,
    customData: '<language>zh-TW</language>',
  });
}
