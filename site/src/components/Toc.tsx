import GithubSlugger from 'github-slugger';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

interface Heading {
  depth: 2 | 3;
  text: string;
  id: string;
}

/**
 * Reduce heading markdown to the plain text rehype-slug will see.
 *
 * rehype-slug hashes the heading's *text content*, so link and emphasis syntax
 * has to be resolved first. Headings like `### 🐳 [Container](./Container)` are
 * common in these READMEs; slugging the raw source would yield
 * "-containercontainer" and every TOC link would dead-end.
 */
function headingText(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images contribute no text content
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> their label
    .replace(/<[^>]+>/g, '') // inline HTML tags (e.g. <br>)
    .replace(/[*_`~]/g, '') // emphasis / code marks, keeping inner text
    .trim();
}

/**
 * Extract h2/h3 headings straight from the markdown source.
 *
 * Uses github-slugger — the same implementation rehype-slug uses — so the ids
 * here always match the ids rendered into the document, including the repeated
 * -1/-2 suffixes for duplicate headings.
 */
export function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;

    // Every heading must be slugged, even h1/h4+, or the counters drift out of
    // sync with rehype-slug and the anchors break.
    const text = headingText(m[2]);
    const id = slugger.slug(text);
    const depth = m[1].length;
    if (depth === 2 || depth === 3) headings.push({ depth, text, id });
  }
  return headings;
}

/**
 * The margin column.
 *
 * It keeps position rather than merely listing headings: what the reader has
 * passed stays creased, where they are is punched, what is ahead is a tick.
 * The three are different *marks*, not three shades of the same colour, so the
 * column still reads with the hue stripped out.
 */
export default function Toc({ markdown, className }: { markdown: string; className?: string }) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setCurrent(0);
    if (headings.length < 2) return;

    let queued = false;
    const read = () => {
      queued = false;
      const band = document.querySelector('.band')?.getBoundingClientRect().height ?? 76;
      const line = band + 24;
      let i = 0;
      for (let k = 0; k < headings.length; k++) {
        const el = document.getElementById(headings[k].id);
        if (el && el.getBoundingClientRect().top <= line) i = k;
        else break;
      }
      setCurrent(i);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className={className ? `toc ${className}` : 'toc'} aria-label="本頁章節">
      <p className="label toc__head">本頁</p>
      <ul className="toc__list">
        {headings.map((h, i) => (
          <li key={`${h.id}-${i}`} className={h.depth === 3 ? 'toc__d3' : undefined}>
            <RouterLink
              // hash-only target: keeps the current route under HashRouter
              to={{ hash: `#${h.id}` }}
              data-state={i === current ? 'current' : i < current ? 'passed' : 'ahead'}
              aria-current={i === current ? 'location' : undefined}
            >
              <span className="toc__mark" aria-hidden="true" />
              <span>{h.text}</span>
            </RouterLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
