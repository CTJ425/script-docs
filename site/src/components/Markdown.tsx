import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link as RouterLink } from 'react-router-dom';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { manifest, repoUrl, resolveRelative } from '../content';
import { monoFont } from '../theme';
import CodeBlock from './CodeBlock';

/** GFM alert syntax: a blockquote whose first line is [!NOTE] etc. */
const ALERT_SEVERITY: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  NOTE: 'info',
  TIP: 'success',
  IMPORTANT: 'info',
  WARNING: 'warning',
  CAUTION: 'error',
};

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: monoFont,
        fontSize: '0.8125em',
        bgcolor: 'action.selected',
        color: 'primary.main',
        px: 0.5,
        py: '1px',
        borderRadius: 1,
        wordBreak: 'break-word',
      }}
    >
      {children}
    </Box>
  );
}

/** Flatten a React subtree to plain text (used to sniff alert markers). */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in (node as never)) {
    return textOf((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}

interface Props {
  markdown: string;
  /** Directory of the doc being rendered, so relative links resolve correctly. */
  baseDir: string;
}

export default function Markdown({ markdown, baseDir }: Props) {
  const components = useMemo<Components>(
    () => ({
      // `id` comes from rehype-slug and must be forwarded — it is what the TOC
      // and the READMEs' own anchor links jump to.
      h1: ({ children, id }) => (
        <Typography id={id} variant="h1" component="h1" sx={{ mb: 2, mt: 0 }}>
          {children}
        </Typography>
      ),
      h2: ({ children, id }) => (
        <Typography
          id={id}
          variant="h2"
          component="h2"
          sx={{ mt: 5, mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          {children}
        </Typography>
      ),
      h3: ({ children, id }) => (
        <Typography id={id} variant="h3" component="h3" sx={{ mt: 4, mb: 1.25 }}>
          {children}
        </Typography>
      ),
      h4: ({ children, id }) => (
        <Typography id={id} variant="h4" component="h4" sx={{ mt: 3, mb: 1 }}>
          {children}
        </Typography>
      ),
      h5: ({ children, id }) => (
        <Typography id={id} variant="h4" component="h5" sx={{ mt: 2.5, mb: 1 }}>
          {children}
        </Typography>
      ),
      h6: ({ children, id }) => (
        <Typography id={id} variant="h4" component="h6" sx={{ mt: 2.5, mb: 1 }}>
          {children}
        </Typography>
      ),
      p: ({ children }) => (
        <Typography paragraph sx={{ color: 'text.secondary', mb: 2 }}>
          {children}
        </Typography>
      ),
      hr: () => <Divider sx={{ my: 4 }} />,

      a: ({ href, children }) => {
        if (!href) return <>{children}</>;

        // In-page heading anchor (rehype-slug generated the ids). Under
        // HashRouter a bare href="#id" would overwrite the route, so navigate
        // with a hash-only target that keeps the current pathname.
        if (href.startsWith('#')) {
          return (
            <Link component={RouterLink} to={{ hash: href }}>
              {children}
            </Link>
          );
        }
        // absolute / mailto
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
          return (
            <Link href={href} target="_blank" rel="noreferrer">
              {children}
            </Link>
          );
        }

        // Relative link inside a README. If it points at a folder that has its
        // own README, keep the reader in the app; otherwise send them to the
        // file on GitHub (README links are written for GitHub, not for a SPA).
        const [pathPart, hashPart = ''] = href.split('#');
        const resolved = resolveRelative(baseDir, pathPart);
        const slug = manifest.dirToSlug[resolved];
        if (slug) {
          return (
            <Link component={RouterLink} to={`/${slug}${hashPart ? `#${hashPart}` : ''}`}>
              {children}
            </Link>
          );
        }
        const gh = repoUrl(resolved);
        return gh ? (
          <Link href={gh} target="_blank" rel="noreferrer">
            {children}
          </Link>
        ) : (
          <>{children}</>
        );
      },

      ul: ({ children }) => (
        <Box component="ul" sx={{ pl: 3, mb: 2, '& > li::marker': { color: 'primary.main' } }}>
          {children}
        </Box>
      ),
      ol: ({ children }) => (
        <Box component="ol" sx={{ pl: 3, mb: 2, '& > li::marker': { color: 'primary.main' } }}>
          {children}
        </Box>
      ),
      li: ({ children }) => (
        <Box
          component="li"
          sx={{
            color: 'text.secondary',
            my: 0.5,
            // paragraphs inside list items should not add block spacing
            '& > p': { mb: 1, display: 'inline' },
            '& > p:has(+ *)': { display: 'block' },
          }}
        >
          {children}
        </Box>
      ),

      code: ({ className, children }) => {
        const match = /language-(\w[\w+-]*)/.exec(className ?? '');
        const raw = String(children ?? '');
        // Fenced block: react-markdown passes the language via className.
        if (match) {
          return <CodeBlock code={raw.replace(/\n$/, '')} language={match[1]} />;
        }
        // A fence with no language still arrives as a block via `pre`.
        if (raw.includes('\n')) {
          return <CodeBlock code={raw.replace(/\n$/, '')} language="text" />;
        }
        return <InlineCode>{children}</InlineCode>;
      },
      // CodeBlock already renders its own <pre>; drop the wrapper to avoid nesting.
      pre: ({ children }) => <>{children}</>,

      blockquote: ({ children }) => {
        const text = textOf(children).trim();
        const marker = text.match(/^\[!(\w+)\]/);
        const severity = marker ? ALERT_SEVERITY[marker[1].toUpperCase()] : undefined;

        if (severity && marker) {
          const label = marker[1].toUpperCase();
          const body = text.slice(marker[0].length).trim();
          return (
            <Alert severity={severity} sx={{ my: 2 }}>
              <AlertTitle sx={{ textTransform: 'capitalize' }}>{label.toLowerCase()}</AlertTitle>
              {body}
            </Alert>
          );
        }
        return (
          <Box
            sx={{
              my: 2,
              pl: 2,
              py: 1,
              borderLeft: 4,
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
              '& p': { mb: 0 },
            }}
          >
            {children}
          </Box>
        );
      },

      table: ({ children }) => (
        <TableContainer component={Paper} variant="outlined" sx={{ my: 2 }}>
          <Table size="small">{children}</Table>
        </TableContainer>
      ),
      thead: ({ children }) => <TableHead>{children}</TableHead>,
      tbody: ({ children }) => <TableBody>{children}</TableBody>,
      tr: ({ children }) => <TableRow hover>{children}</TableRow>,
      th: ({ children, style }) => (
        <TableCell
          component="th"
          scope="col"
          align={(style?.textAlign as 'left' | 'center' | 'right') ?? 'left'}
          sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {children}
        </TableCell>
      ),
      td: ({ children, style }) => (
        <TableCell
          align={(style?.textAlign as 'left' | 'center' | 'right') ?? 'left'}
          sx={{ color: 'text.secondary', verticalAlign: 'top' }}
        >
          {children}
        </TableCell>
      ),

      img: ({ src, alt }) => (
        <Box
          component="img"
          src={typeof src === 'string' ? src : undefined}
          alt={alt}
          sx={{ maxWidth: '100%', borderRadius: 1, my: 2 }}
        />
      ),
    }),
    [baseDir]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
