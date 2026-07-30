import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Highlight, themes } from 'prism-react-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { monoFont } from '../theme';

interface Props {
  /** The code exactly as it appears in the README. */
  code: string;
  language: string;
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

export default function CodeBlock({ code, language }: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    // `code` is the original string from the markdown AST — never text scraped
    // out of the DOM, so a command containing the word "Copy" stays intact.
    const ok = await writeClipboard(code);
    setStatus(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 2000);
  }, [code]);

  const prismTheme = theme.palette.mode === 'dark' ? themes.vsDark : themes.vsLight;

  return (
    <Paper
      variant="outlined"
      sx={{
        my: 2,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? '#272727' : '#f5f5f5',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
          pl: 2,
          pr: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography
          component="span"
          sx={{ fontFamily: monoFont, fontSize: '0.75rem', color: 'text.secondary' }}
        >
          {language || 'text'}
        </Typography>
        <Button
          size="small"
          onClick={copy}
          startIcon={status === 'copied' ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          color={status === 'copied' ? 'success' : status === 'failed' ? 'error' : 'primary'}
          sx={{ fontSize: '0.75rem' }}
        >
          {status === 'copied' ? 'Copied' : status === 'failed' ? 'Failed' : 'Copy'}
        </Button>
      </Box>

      <Highlight code={code} language={language || 'bash'} theme={prismTheme}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              overflowX: 'auto',
              fontFamily: monoFont,
              fontSize: '0.8125rem',
              lineHeight: 1.75,
              background: 'transparent',
            }}
            style={{ color: style.color }}
          >
            <code>
              {tokens.map((line, i) => (
                <span key={i} {...getLineProps({ line })} style={{ display: 'block' }}>
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                </span>
              ))}
            </code>
          </Box>
        )}
      </Highlight>
    </Paper>
  );
}
