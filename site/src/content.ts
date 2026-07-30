/**
 * Typed access to the generated content manifest.
 *
 * Everything the UI knows about the repo's subprojects comes from here, so
 * adding a folder with a README.md is the only step needed to publish a page.
 */
import manifestJson from './content/manifest.json';

export interface Doc {
  slug: string;
  /** Repo-relative directory ('' for the root README). */
  dir: string;
  /** Repo-relative path of the source file, e.g. "k8s_install/README.md". */
  file: string;
  title: string;
  icon: string;
  group: string | null;
  tags: string[];
  order: number;
  bytes: number;
  /** The README's bytes, verbatim. */
  markdown: string;
}

export interface Manifest {
  generatedAt: string;
  repo: { url: string | null; branch: string };
  /** Repo directory -> doc slug, for rewriting relative README links. */
  dirToSlug: Record<string, string>;
  docs: Doc[];
}

export const manifest = manifestJson as Manifest;
export const docs = manifest.docs;

export function getDoc(slug: string | undefined): Doc | undefined {
  return docs.find((d) => d.slug === slug);
}

export const defaultSlug = docs[0]?.slug ?? 'overview';

/** Permalink to the source file on GitHub. */
export function sourceUrl(doc: Doc): string | null {
  const { url, branch } = manifest.repo;
  return url ? `${url}/blob/${branch}/${doc.file}` : null;
}

/** Permalink to any repo-relative path on GitHub (files, folders). */
export function repoUrl(path: string): string | null {
  const { url, branch } = manifest.repo;
  if (!url) return null;
  return `${url}/blob/${branch}/${path.replace(/^\/+/, '')}`;
}

/**
 * Resolve a relative link found inside a README against the doc's own folder.
 * Returns a repo-relative posix path with no leading "./" or trailing slash.
 */
export function resolveRelative(fromDir: string, href: string): string {
  const stack = fromDir ? fromDir.split('/') : [];
  for (const part of href.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}
