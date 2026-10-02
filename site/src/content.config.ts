import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { join } from 'node:path';
import { REPO_ROOT, loadScriptSources } from '../scripts/content-sources.mjs';

/**
 * Four collections, one rule for each about who owns the words.
 *
 *   posts, tools, pages  — written for this site, with frontmatter.
 *   scripts              — the READMEs of the scripts themselves, verbatim.
 *
 * The scripts are not copied or generated: the loader reads each README as
 * bytes and the page renders those bytes, so a script's page and its README on
 * GitHub are the same version by construction.
 */

/** A tag is a lowercase word; `Docker` and `docker` are one tag. */
const tag = z
  .string()
  .trim()
  .min(1)
  .transform((t) => t.toLowerCase());

const slugRef = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'a slug: lowercase letters, digits and hyphens');

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: '../posts' }),
  schema: z.object({
    title: z.string().min(1),
    /** When it was first published. */
    date: z.coerce.date(),
    /** When it last changed in a way a reader would care about; drives the age mark. */
    updated: z.coerce.date().optional(),
    /** One or two sentences: the list card, the meta description and the feed. */
    summary: z.string().min(1),
    tags: z.array(tag).default([]),
    /** Slugs of tools this post is about. */
    tools: z.array(slugRef).default([]),
    /** Slugs of scripts this post is about. */
    scripts: z.array(slugRef).default([]),
    draft: z.boolean().default(false),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '*.md', base: '../tools' }),
  schema: z.object({
    /** The tool's name. */
    title: z.string().min(1),
    /** using: in use now. tried: used and set aside. dropped: used and replaced. */
    status: z.enum(['using', 'tried', 'dropped']),
    /** The verdict in one line: the list card and the meta description. */
    summary: z.string().min(1),
    /** Homepage, if it has one. */
    url: z.url().optional(),
    /** `owner/name` on GitHub. */
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, 'owner/name')
      .optional(),
    /** Written by me rather than found: shown as mine, and linked to its repo. */
    mine: z.boolean().default(false),
    since: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
    updated: z.coerce.date().optional(),
    /** Slug of the tool that took its place. */
    replacedBy: slugRef.optional(),
    tags: z.array(tag).default([]),
    /** Slugs of scripts that use or wrap this tool. */
    scripts: z.array(slugRef).default([]),
    draft: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: '../pages' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
  }),
});

const scripts = defineCollection({
  loader: {
    name: 'script-readmes',
    async load({ store, parseData, generateDigest, watcher, logger }) {
      store.clear();
      const sources = loadScriptSources();
      for (const s of sources) {
        const { body, ...rest } = s;
        const data = await parseData({ id: s.slug, data: rest, filePath: s.file });
        store.set({ id: s.slug, data, body, digest: generateDigest(body), filePath: s.file });
      }
      logger.info(`${sources.length} scripts from README.md`);

      // Editing a README in dev reloads its page.
      watcher?.add(sources.map((s) => join(REPO_ROOT, s.file)));
    },
  },
  schema: z.object({
    dir: z.string(),
    file: z.string(),
    category: z.string(),
    project: z.string(),
    title: z.string(),
    summary: z.string(),
    updated: z.string().nullable(),
    tags: z.array(tag).default([]),
    order: z.number().default(0),
    bytes: z.number(),
  }),
});

export const collections = { posts, tools, pages, scripts };
