import { getCollection, type CollectionEntry } from 'astro:content';
import { categoryRank } from './categories.mjs';
import { ageOf, hueFor } from './design.mjs';
import { readingMinutes, renderMarkdown } from './markdown.mjs';
import { SITE, absolute, isoDate, url } from './site';

/**
 * Everything the pages ask of the content, in one place.
 *
 * Pages never call getCollection themselves: the ordering, the draft rule, the
 * cross-references between posts, tools and scripts, and the tag index are all
 * decided here, so a list on the home page and the same list on /tags/ cannot
 * disagree.
 */

export type Post = CollectionEntry<'posts'>;
export type Tool = CollectionEntry<'tools'>;
export type Script = CollectionEntry<'scripts'>;
export type Status = Tool['data']['status'];

export const STATUS_ORDER: Status[] = ['using', 'tried', 'dropped'];
export const STATUS_LABEL: Record<Status, string> = {
  using: '使用中',
  tried: '試過',
  dropped: '已淘汰',
};

/** A draft is visible while writing (dev) and absent from every published page. */
const published = <T extends { data: { draft?: boolean } }>(e: T) =>
  import.meta.env.DEV || !e.data.draft;

const zh = (a: string, b: string) => a.localeCompare(b, 'zh-Hant');

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', published);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getTools(): Promise<Tool[]> {
  const all = await getCollection('tools', published);
  return all.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.data.status) - STATUS_ORDER.indexOf(b.data.status) ||
      zh(a.data.title, b.data.title)
  );
}

export async function getScripts(): Promise<Script[]> {
  const all = await getCollection('scripts');
  return all.sort(
    (a, b) =>
      categoryRank(a.data.category) - categoryRank(b.data.category) ||
      a.data.category.localeCompare(b.data.category) ||
      a.data.order - b.data.order ||
      zh(a.data.title, b.data.title)
  );
}

export async function getPage(id: 'home' | 'about') {
  const pages = await getCollection('pages');
  const page = pages.find((p) => p.id === id);
  if (!page) throw new Error(`[content] pages/${id}.md is missing`);
  return page;
}

/* ------------------------------------------------------------- categories */

export interface Category {
  name: string;
  /** Position in the display order. It is the only thing that picks the hue. */
  index: number;
  hue: string;
  scripts: Script[];
}

/** Categories in display order; their position, never their name, picks the colour. */
export async function getCategories(): Promise<Category[]> {
  const scripts = await getScripts();
  const byName = new Map<string, Script[]>();
  for (const s of scripts) {
    if (!byName.has(s.data.category)) byName.set(s.data.category, []);
    byName.get(s.data.category)!.push(s);
  }
  return [...byName].map(([name, list], index) => ({ name, index, hue: hueFor(index), scripts: list }));
}

/** The `hue-N` class that gives a subtree its category colour. */
export async function hueClassFor(category: string): Promise<string> {
  const cats = await getCategories();
  const i = cats.findIndex((c) => c.name === category);
  return i === -1 ? '' : `hue-${i % 7}`;
}

/* ---------------------------------------------------------------- rendering */

/**
 * Render an entry's markdown. `baseDir` is where the file lives in the repo, so
 * the relative links it was written with (for GitHub) resolve to the right place.
 */
export async function renderEntry(
  body: string | undefined,
  baseDir: string,
  opts: { origin?: string } = {}
) {
  const scripts = (await getScripts()).map((s) => ({ dir: s.data.dir, slug: s.id }));
  const out = await renderMarkdown(body ?? '', {
    baseDir,
    base: SITE.base,
    scripts,
    repo: SITE.repo,
    repoRoot: SITE.repoRoot,
    origin: opts.origin ?? '',
  });
  return { ...out, minutes: readingMinutes(out.stats) };
}

/* -------------------------------------------------------------------- cards */

/** The one shape every list on the site renders, whatever the entry is. */
export interface Card {
  kind: 'post' | 'tool' | 'script';
  id: string;
  href: string;
  title: string;
  summary: string;
  /** `YYYY-MM-DD`: the date the list is about (published, or last updated). */
  date: string | null;
  tags: string[];
  status?: Status;
  mine?: boolean;
  /** `hue-N` for a script's category. */
  hue?: string;
  category?: string;
}

export const KIND_LABEL = { post: '文章', tool: '工具', script: '腳本' } as const;

export const postCard = (p: Post): Card => ({
  kind: 'post',
  id: p.id,
  href: url(`/posts/${p.id}/`),
  title: p.data.title,
  summary: p.data.summary,
  date: isoDate(p.data.date),
  tags: p.data.tags,
});

export const toolCard = (t: Tool): Card => ({
  kind: 'tool',
  id: t.id,
  href: url(`/tools/${t.id}/`),
  title: t.data.title,
  summary: t.data.summary,
  date: t.data.updated ? isoDate(t.data.updated) : null,
  tags: t.data.tags,
  status: t.data.status,
  mine: t.data.mine,
});

export async function scriptCard(s: Script): Promise<Card> {
  return {
    kind: 'script',
    id: s.id,
    href: url(`/scripts/${s.id}/`),
    title: s.data.title,
    summary: s.data.summary,
    date: s.data.updated,
    tags: s.data.tags,
    category: s.data.category,
    hue: await hueClassFor(s.data.category),
  };
}

/* --------------------------------------------------------------------- refs */

function pick<T extends { id: string }>(all: T[], ids: string[], from: string, field: string): T[] {
  return ids.map((id) => {
    const found = all.find((e) => e.id === id);
    if (!found) throw new Error(`[content] ${from} lists ${field} "${id}", which does not exist`);
    return found;
  });
}

/** What a post is about: the tools and scripts it names. An unknown slug fails the build. */
export async function refsOfPost(post: Post) {
  const [tools, scripts] = await Promise.all([getTools(), getScripts()]);
  return {
    tools: pick(tools, post.data.tools, `posts/${post.id}.md`, 'tool'),
    scripts: pick(scripts, post.data.scripts, `posts/${post.id}.md`, 'script'),
  };
}

export async function refsOfTool(tool: Tool) {
  const [posts, tools, scripts] = await Promise.all([getPosts(), getTools(), getScripts()]);
  return {
    posts: posts.filter((p) => p.data.tools.includes(tool.id)),
    scripts: pick(scripts, tool.data.scripts, `tools/${tool.id}.md`, 'script'),
    replacedBy: tool.data.replacedBy
      ? pick(tools, [tool.data.replacedBy], `tools/${tool.id}.md`, 'replacedBy')[0]
      : undefined,
  };
}

export async function refsOfScript(script: Script) {
  const [posts, tools] = await Promise.all([getPosts(), getTools()]);
  return {
    posts: posts.filter((p) => p.data.scripts.includes(script.id)),
    tools: tools.filter((t) => t.data.scripts.includes(script.id)),
  };
}

/**
 * Every slug a post or tool points at must exist. Called once from the tag
 * index, which every build renders, so a typo fails the build instead of
 * publishing a card that links nowhere.
 */
async function assertRefs() {
  const [posts, tools] = await Promise.all([getPosts(), getTools()]);
  await Promise.all([...posts.map(refsOfPost), ...tools.map(refsOfTool)]);
}

/* --------------------------------------------------------------------- tags */

export interface TagEntry {
  tag: string;
  cards: Card[];
}

/** Tag -> everything carrying it, newest first, across all three kinds. */
export async function getTagIndex(): Promise<TagEntry[]> {
  await assertRefs();
  const [posts, tools, scripts] = await Promise.all([getPosts(), getTools(), getScripts()]);
  const cards: Card[] = [
    ...posts.map(postCard),
    ...tools.map(toolCard),
    ...(await Promise.all(scripts.map(scriptCard))),
  ];
  const byTag = new Map<string, Card[]>();
  for (const c of cards) {
    for (const t of c.tags) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t)!.push(c);
    }
  }
  return [...byTag]
    .map(([tag, list]) => ({
      tag,
      cards: list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    }))
    .sort((a, b) => b.cards.length - a.cards.length || a.tag.localeCompare(b.tag));
}

export const tagHref = (tag: string) => url(`/tags/${encodeURIComponent(tag)}/`);

/* --------------------------------------------------------------------- age */

/** Age of an entry, from the date a reader would call "last changed". */
export const ageOfEntry = (when: Date | string | null | undefined) => ageOf(when ?? null);

export { absolute, isoDate, url };
