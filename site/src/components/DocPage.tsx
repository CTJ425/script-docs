import LaunchIcon from '@mui/icons-material/Launch';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getDoc, sourceUrl } from '../content';
import { appBarHeight, monoFont } from '../theme';
import Markdown from './Markdown';
import Toc from './Toc';

export default function DocPage() {
  const { slug } = useParams();
  const { hash } = useLocation();
  const doc = getDoc(slug);

  // New document -> start at the top (only when there is no target anchor).
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // React Router does not scroll to a hash target on its own.
  useEffect(() => {
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      id = hash.slice(1);
    }
    // Wait a frame so the markdown has been committed to the DOM.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - (appBarHeight + 16);
      window.scrollTo({ top, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [hash, slug]);

  if (!doc) {
    return (
      <Box sx={{ flex: 1, p: { xs: 2, md: 6 }, minWidth: 0 }}>
        <Alert severity="warning">
          找不到文件 <code>{slug}</code>。請從左側清單選擇。
        </Alert>
      </Box>
    );
  }

  const gh = sourceUrl(doc);

  return (
    <>
      <Box
        component="main"
        sx={{ flex: 1, minWidth: 0, px: { xs: 2, sm: 3, md: 6 }, pt: { xs: 3, md: 4 }, pb: 10 }}
      >
        {/* Provenance: makes the single-source-of-truth guarantee visible. */}
        <Paper variant="outlined" sx={{ px: 2, py: 1.25, mb: 3, bgcolor: 'action.hover' }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              此頁內容直接渲染自
            </Typography>
            <Chip
              size="small"
              label={doc.file}
              sx={{ fontFamily: monoFont, fontSize: '0.6875rem', height: 20 }}
            />
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              （{doc.bytes.toLocaleString()} bytes，未經改寫）
            </Typography>
            {gh && (
              <Link
                href={gh}
                target="_blank"
                rel="noreferrer"
                sx={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
              >
                在 GitHub 檢視
                <LaunchIcon sx={{ fontSize: '0.875rem' }} />
              </Link>
            )}
          </Stack>
        </Paper>

        <Box sx={{ maxWidth: '46rem' }}>
          <Markdown markdown={doc.markdown} baseDir={doc.dir} />
        </Box>
      </Box>

      <Toc markdown={doc.markdown} />
    </>
  );
}
