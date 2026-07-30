import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import GithubSlugger from 'github-slugger';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { tocWidth } from '../theme';

interface Heading {
  depth: 2 | 3;
  text: string;
  id: string;
}

/**
 * Extract h2/h3 headings straight from the markdown source.
 *
 * Uses github-slugger — the same implementation rehype-slug uses — so the ids
 * here always match the ids rendered into the document, including the repeated
 * -1/-2 suffixes for duplicate headings.
 */
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

export default function Toc({ markdown }: { markdown: string }) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  if (headings.length < 2) return null;

  return (
    <Box
      component="nav"
      aria-label="On this page"
      sx={{
        width: tocWidth,
        flexShrink: 0,
        display: { xs: 'none', lg: 'block' },
        position: 'sticky',
        alignSelf: 'flex-start',
        top: 80,
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
        px: 2,
        py: 4,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.75rem',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'text.secondary',
          mb: 1,
        }}
      >
        On this page
      </Typography>
      {headings.map((h, i) => (
        <Link
          key={`${h.id}-${i}`}
          component={RouterLink}
          // hash-only target: keeps the current route under HashRouter
          to={{ hash: `#${h.id}` }}
          underline="none"
          sx={{
            display: 'block',
            fontSize: h.depth === 3 ? '0.75rem' : '0.8125rem',
            color: 'text.secondary',
            pl: h.depth === 3 ? 2 : 0.75,
            py: 0.4,
            borderRadius: 1,
            lineHeight: 1.4,
            '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
          }}
        >
          {h.text}
        </Link>
      ))}
    </Box>
  );
}
