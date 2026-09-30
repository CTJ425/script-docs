import { Fragment, cloneElement, isValidElement, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Link as RouterLink } from 'react-router-dom';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { manifest, repoUrl, resolveRelative } from '../content';
import CodeBlock from './CodeBlock';

/**
 * GFM alert syntax: a blockquote whose first line is [!NOTE] etc.
 *
 * Only two levels exist here, because vermilion is held out of the whole
 * palette so that it means exactly one thing when it appears. WARNING and
 * CAUTION are about the machine; everything else is set in ink.
 */
const ALERT_LEVEL: Record<string, 'danger' | 'plain'> = {
  NOTE: 'plain',
  TIP: 'plain',
  IMPORTANT: 'plain',
  WARNING: 'danger',
  CAUTION: 'danger',
};

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

/**
 * Remove the leading `[!NOTE]` marker from the first text node of a subtree,
 * leaving the rest of the tree (links, code, lists) intact.
 */
function stripMarker(node: React.ReactNode, marker: string): React.ReactNode {
  let done = false;

  const walk = (n: React.ReactNode): React.ReactNode => {
    if (done) return n;
    if (typeof n === 'string') {
      const i = n.indexOf(marker);
      if (i === -1) return n;
      done = true;
      // The marker sits on its own line; drop the newline it leaves behind.
      return n.slice(i + marker.length).replace(/^[ \t]*\r?\n?/, '');
    }
    if (Array.isArray(n)) {
      return n.map((child, i) => <Fragment key={i}>{walk(child)}</Fragment>);
    }
    if (isValidElement(n)) {
      const children = (n.props as { children?: React.ReactNode }).children;
      if (children == null) return n;
      return cloneElement(n, undefined, walk(children));
    }
    return n;
  };

  return walk(node);
}

/**
 * Protocols a README link may use. Anything else (notably `javascript:` and
 * `data:`) is rendered as plain text rather than a clickable link.
 */
const SAFE_PROTOCOL = /^(https?|mailto|ftp|tel):/i;

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
        <h1 id={id} className="md-h1">
          {children}
        </h1>
      ),
      h2: ({ children, id }) => (
        <h2 id={id} className="md-h2">
          {children}
        </h2>
      ),
      h3: ({ children, id }) => (
        <h3 id={id} className="md-h3">
          {children}
        </h3>
      ),
      h4: ({ children, id }) => (
        <h4 id={id} className="md-h4">
          {children}
        </h4>
      ),
      h5: ({ children, id }) => (
        <h5 id={id} className="md-h5">
          {children}
        </h5>
      ),
      h6: ({ children, id }) => (
        <h6 id={id} className="md-h6">
          {children}
        </h6>
      ),
      p: ({ children }) => <p className="md-p">{children}</p>,
      hr: () => <hr className="md-rule" />,

      a: ({ href, children }) => {
        if (!href) return <>{children}</>;

        // In-page heading anchor (rehype-slug generated the ids). Under
        // HashRouter a bare href="#id" would overwrite the route, so navigate
        // with a hash-only target that keeps the current pathname.
        if (href.startsWith('#')) {
          return (
            <RouterLink className="md-a" to={{ hash: href }}>
              {children}
            </RouterLink>
          );
        }
        // Absolute URL (or protocol-relative). Only well-known navigable
        // protocols become links; a README carrying `javascript:` or a
        // `file://` path that means nothing to a reader renders as text.
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
          if (!SAFE_PROTOCOL.test(href) && !href.startsWith('//')) {
            return <>{children}</>;
          }
          return (
            <a className="md-a" href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
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
            <RouterLink className="md-a" to={`/${slug}${hashPart ? `#${hashPart}` : ''}`}>
              {children}
            </RouterLink>
          );
        }
        const gh = repoUrl(resolved);
        return gh ? (
          <a className="md-a" href={gh} target="_blank" rel="noreferrer">
            {children}
          </a>
        ) : (
          <>{children}</>
        );
      },

      ul: ({ children }) => <ul className="md-ul">{children}</ul>,
      ol: ({ children }) => <ol className="md-ol">{children}</ol>,
      li: ({ children }) => <li className="md-li">{children}</li>,

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
        return <code className="md-code">{children}</code>;
      },
      // CodeBlock already renders its own <pre>; drop the wrapper to avoid nesting.
      pre: ({ children }) => <>{children}</>,

      blockquote: ({ children }) => {
        const text = textOf(children).trim();
        const marker = text.match(/^\[!(\w+)\]/);
        const level = marker ? ALERT_LEVEL[marker[1].toUpperCase()] : undefined;

        if (level && marker) {
          // Render the real children, not textOf(children): flattening to a
          // string would drop every link, code span and fenced block inside
          // the alert. Only the "[!NOTE]" marker itself is stripped, from the
          // first text node it appears in.
          return (
            <div className="md-alert" data-level={level}>
              <span className="md-alert__label">{marker[1].toUpperCase()}</span>
              {stripMarker(children, marker[0])}
            </div>
          );
        }
        return <blockquote className="md-quote">{children}</blockquote>;
      },

      table: ({ children }) => (
        <div className="md-tablewrap">
          <table className="md-table">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children, style }) => (
        <th scope="col" style={{ textAlign: (style?.textAlign as 'left') ?? 'left' }}>
          {children}
        </th>
      ),
      td: ({ children, style }) => (
        <td style={{ textAlign: (style?.textAlign as 'left') ?? undefined }}>{children}</td>
      ),

      img: ({ src, alt }) => (
        <img className="md-img" src={typeof src === 'string' ? src : undefined} alt={alt} />
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
