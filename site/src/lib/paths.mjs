/**
 * Where posts and their images sit in the repository.
 *
 * Kept apart from scripts/content-sources.mjs for the same reason as
 * categories.mjs: that module reads the filesystem relative to its own location
 * and must never be bundled into the server build; this one is pure.
 */
import { posix } from 'node:path';

/**
 * A post's file is `YYYY-MM-DD-<slug>.md`: the date orders the folder on GitHub,
 * the slug alone is the URL, so renaming never moves a published page.
 */
export const POST_FILE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;

/** The URL slug of a post file (a path or a bare file name). */
export function postSlug(file) {
  return posix.basename(file).replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/**
 * Folders whose images posts and tools link to relatively, so the same file
 * shows them on GitHub and on the site. The build serves them under /media/.
 */
export const MEDIA_DIRS = ['posts/img', 'tools/img'];
