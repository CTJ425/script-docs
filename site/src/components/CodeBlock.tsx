import { Highlight } from 'prism-react-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

interface Props {
  /** The code exactly as it appears in the README. */
  code: string;
  language: string;
}

/**
 * Prism ships its own inline styles through the theme object. This one is
 * deliberately empty so the tokens keep their class names and nothing but
 * code.css decides what a command looks like — a stock editor theme inside a
 * committed world is the lapse the world exists to avoid.
 */
const NO_INLINE_THEME = { plain: {}, styles: [] };

/**
 * Does this command ask for root?
 *
 * A read of the text, not a judgement about it: the string `sudo` is in the
 * block, or the block is written at a root prompt. The reader is about to
 * paste this into a machine they care about, so it is said at window size.
 */
function asksForRoot(code: string): boolean {
  return /(^|[\s|(])sudo\s/.test(code) || /^\s*#\s/m.test(code);
}

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path (insecure origin, denied permission) */
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/**
 * A window punched through the leaf to the board beneath it.
 *
 * The command is the one thing on this site that leaves with the reader, so
 * it gets the loudest surface on the page and the only primary action.
 */
export default function CodeBlock({ code, language }: Props) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number>();
  const root = asksForRoot(code);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    // `code` is the original string from the markdown AST — never text scraped
    // out of the DOM, so a command containing the word "Copy" stays intact.
    const ok = await writeClipboard(code);
    setStatus(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 2000);
  }, [code]);

  return (
    <div className="win">
      <div className="win__head">
        <span className="win__lang">{language || 'text'}</span>
        {root && <span className="win__sudo">sudo</span>}
        <button type="button" className="win__copy" data-status={status} onClick={copy}>
          {status === 'copied' ? <CheckIcon /> : <CopyIcon />}
          {status === 'copied' ? 'Copied' : status === 'failed' ? 'Failed' : 'Copy'}
        </button>
      </div>

      <Highlight code={code} language={language || 'bash'} theme={NO_INLINE_THEME}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="win__pre">
            <code>
              {tokens.map((line, i) => (
                <span key={i} {...getLineProps({ line })} className="win__line">
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                </span>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}
