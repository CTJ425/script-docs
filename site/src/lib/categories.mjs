/**
 * Display order of the script categories.
 *
 * A category not listed here still works: it sorts after these, alphabetically.
 * Position in the order is also what picks a category's colour (see design.mjs),
 * never its name, so listing a new one here is only ever about where it sits.
 *
 * Kept apart from scripts/content-sources.mjs because that module reads the
 * filesystem relative to its own location and so must never be bundled into the
 * server build; this one is pure and can be imported from anywhere.
 */
export const CATEGORY_ORDER = ['AI', 'container', 'script'];

/** @param {string} category */
export function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
