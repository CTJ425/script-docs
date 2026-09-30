import { useContext, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ColorModeContext } from '../colorMode';
import { docs, getDoc, manifest } from '../content';
import {
  BINDER_HUE,
  boardFor,
  DANGER,
  hueFor,
  INK,
  inkOn,
  readableOn,
  revisionOf,
  solveLeaf,
  type Revision,
} from '../design';
import { useMedia, WIDE } from '../useMedia';
import { GitHubIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from './Icons';
import Toc from './Toc';

/**
 * The manual.
 *
 * The board frames the leaf: the band across the head, the spine down the
 * left, the stepped tab rail down the right fore edge. Which board you are
 * standing on is the category, and it is derived from the manifest — nothing
 * here knows that `AI` exists, so a fourth top-level folder gets its own
 * colour, its own tab and its own extent without a line of this file changing.
 */

interface Category {
  name: string;
  hue: string;
  docs: typeof docs;
}

/** Categories in the manifest's own order; position in that order is the hue. */
function categoriesOf(): Category[] {
  const seen: string[] = [];
  const byName = new Map<string, typeof docs>();
  for (const d of docs) {
    if (!d.group) continue;
    if (!byName.has(d.group)) {
      seen.push(d.group);
      byName.set(d.group, []);
    }
    byName.get(d.group)!.push(d);
  }
  return seen.map((name, i) => ({ name, hue: hueFor(i), docs: byName.get(name)! }));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, toggle } = useContext(ColorModeContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();
  // Wide enough and the page's own contents move to the fore-edge margin,
  // where a manual keeps them; narrower, they stay under the index.
  const wide = useMedia(WIDE);

  const activeSlug = decodeURIComponent(pathname.replace(/^\//, ''));
  const activeDoc = getDoc(activeSlug);
  const categories = useMemo(categoriesOf, []);

  const activeHue = activeDoc?.group
    ? (categories.find((c) => c.name === activeDoc.group)?.hue ?? BINDER_HUE)
    : BINDER_HUE;

  const revision: Revision | null = activeDoc ? revisionOf(activeDoc.markdown) : null;

  /*
   * The runtime loop that makes the world work.
   *
   * The leaf's alpha over this board is binary-searched until the composited
   * reading field lands in its luminance band, so body contrast is the same on
   * chrome yellow as on ultramarine. The result, the board, the ink that reads
   * on the board, and the page's age all get published as custom properties
   * and every stylesheet consumes them from there.
   */
  useEffect(() => {
    const root = document.documentElement;
    const board = boardFor(activeHue, mode);
    const leaf = solveLeaf(board, mode);

    root.style.setProperty('--board', board);
    root.style.setProperty('--leaf', leaf.hex);
    root.style.setProperty('--leaf-alpha', leaf.alpha.toFixed(3));
    // Chrome yellow takes the dark ink, ultramarine takes the light one, and a
    // category added next year gets the right answer without anyone deciding.
    root.style.setProperty('--on-board', inkOn(board, INK.light.primary, INK.dark.primary));
    // The same hue, mixed toward the page's ink until it can be set as 13px
    // text on the leaf. Used wherever the board speaks rather than fills.
    root.style.setProperty('--board-ink', readableOn(board, leaf.hex, INK[mode].primary));
    // Vermilion gets the same treatment: it is a fill colour, and a fill
    // colour set as 13px text on the leaf is a colour nobody can read.
    root.style.setProperty(
      '--danger-ink',
      readableOn(DANGER[mode], leaf.hex, INK[mode].primary)
    );
    root.style.setProperty('--age', `var(--age-${revision?.step ?? 0})`);
  }, [activeHue, mode, revision?.step]);

  // Search covers titles and body text — the manifest already holds every byte.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.markdown.toLowerCase().includes(q)
    );
  }, [query]);

  const shown = useMemo(() => {
    const hue = new Map(categories.map((c) => [c.name, c.hue]));
    const groups: { name: string | null; hue: string; docs: typeof docs }[] = [];
    for (const d of results) {
      const name = d.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.docs.push(d);
      else groups.push({ name, hue: name ? (hue.get(name) ?? BINDER_HUE) : BINDER_HUE, docs: [d] });
    }
    return groups;
  }, [results, categories]);

  const name = getDoc('overview')?.title ?? 'Script Docs';

  return (
    <div className="manual">
      <header className="band">
        <button
          type="button"
          className="band__btn band__menu"
          onClick={() => setOpen(true)}
          aria-label="開啟索引"
        >
          <MenuIcon />
        </button>

        {/* Chrome, and the only copy this shell owns. The name is read from the
            root README's own H1 by way of the manifest, so the tab title, the
            band and the landing page cannot drift into three different names. */}
        <RouterLink className="band__mark" to="/overview">
          <span className="band__name">{name}</span>
          <span className="band__tagline">可以直接執行的維運手冊，內容渲染自各專案 README.md</span>
        </RouterLink>

        <div className="band__tools">
          <button
            type="button"
            className="band__btn"
            onClick={toggle}
            aria-label={mode === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
            title={mode === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
          >
            {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          {manifest.repo.url && (
            <a
              className="band__btn"
              href={manifest.repo.url}
              target="_blank"
              rel="noreferrer"
              aria-label="在 GitHub 檢視原始碼"
              title="在 GitHub 檢視原始碼"
            >
              <GitHubIcon />
            </a>
          )}
        </div>
      </header>

      <aside className="spine" aria-hidden="true">
        <span className="spine__hole" />
        <span className="spine__hole" />
        <span className="spine__label">
          {name} · REV {manifest.generatedAt.slice(0, 10)}
        </span>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="leaf">
        <nav className="index" data-open={open} aria-label="文件索引">
          <div className="index__search">
            <label className="field">
              <SearchIcon />
              <input
                type="search"
                value={query}
                placeholder="搜尋全文…"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="搜尋文件內容"
              />
            </label>
          </div>

          {shown.length === 0 && <p className="index__empty">沒有符合的文件。</p>}

          {shown.map((g) => (
            <ul className="index__group" key={g.name ?? '_root'} style={{ ['--chip' as string]: g.hue }}>
              {g.name && (
                <li className="index__rule">
                  <span className="index__chip" />
                  <span className="label">{g.name}</span>
                </li>
              )}
              {g.docs.map((d) => (
                <li className="index__item" key={d.slug}>
                  <RouterLink
                    to={`/${d.slug}`}
                    aria-current={d.slug === activeSlug ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {d.title}
                  </RouterLink>
                </li>
              ))}
            </ul>
          ))}

          {activeDoc && !wide && <Toc markdown={activeDoc.markdown} />}
        </nav>

        {children}
      </div>

      <nav className="rail" aria-label="分類">
        {categories.map((c) => (
          <RouterLink
            key={c.name}
            className="tab"
            to={`/${c.docs[0].slug}`}
            style={{
              ['--tab' as string]: boardFor(c.hue, mode),
              ['--tab-ink' as string]: inkOn(
                boardFor(c.hue, mode),
                INK.light.primary,
                INK.dark.primary
              ),
              // Extent: the fore edge is divided by how much manual each
              // category actually is, not into equal thirds.
              flexGrow: c.docs.length,
            }}
            aria-current={c.name === activeDoc?.group ? 'true' : undefined}
          >
            <span className="tab__label">{c.name}</span>
            <span className="tab__count">{c.docs.length}</span>
          </RouterLink>
        ))}
      </nav>
    </div>
  );
}
