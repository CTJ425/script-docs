import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import DescriptionIcon from '@mui/icons-material/Description';
import GitHubIcon from '@mui/icons-material/GitHub';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useContext, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ColorModeContext } from '../colorMode';
import { docs, manifest } from '../content';
import { appBarHeight, drawerWidth } from '../theme';

function DocIcon({ icon }: { icon: string }) {
  if (icon === 'home') return <HomeOutlinedIcon fontSize="small" />;
  if (icon === 'description') return <DescriptionIcon fontSize="small" />;
  return <ArticleOutlinedIcon fontSize="small" />;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { mode, toggle } = useContext(ColorModeContext);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();
  const activeSlug = pathname.replace(/^\//, '');

  // Search covers titles and body text — the manifest already holds every byte.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.markdown.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups = new Map<string | null, typeof docs>();
    for (const d of results) {
      const key = d.group ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return [...groups.entries()];
  }, [results]);

  const drawerContent = (
    <Box sx={{ overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="搜尋文件內容…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <List sx={{ flex: 1, px: 1 }}>
        {results.length === 0 && (
          <ListItem>
            <ListItemText
              primary="沒有符合的文件"
              slotProps={{ primary: { fontSize: '0.875rem', color: 'text.secondary' } }}
            />
          </ListItem>
        )}

        {grouped.map(([group, items]) => (
          <Box key={group ?? '_root'} component="li" sx={{ listStyle: 'none' }}>
            {group && (
              <ListSubheader
                disableSticky
                sx={{ bgcolor: 'transparent', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 2.5 }}
              >
                {group}
              </ListSubheader>
            )}
            <List disablePadding>
              {items.map((d) => (
                <ListItem key={d.slug} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    component={RouterLink}
                    to={`/${d.slug}`}
                    selected={d.slug === activeSlug}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <DocIcon icon={d.icon} />
                    </ListItemIcon>
                    <ListItemText
                      primary={d.title}
                      slotProps={{
                        primary: {
                          fontSize: '0.875rem',
                          fontWeight: d.slug === activeSlug ? 500 : 400,
                          sx: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </List>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.7 }}>
          此清單由 <code>scripts/sync-content.mjs</code> 掃描各專案 <code>README.md</code> 自動產生。
          新增資料夾放入 README 後 push，就會自動出現在這裡。
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ minHeight: appBarHeight, gap: 1 }}>
          {!isDesktop && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} aria-label="開啟導覽">
              <MenuIcon />
            </IconButton>
          )}
          <Box
            component={RouterLink}
            to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none' }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.16)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <DescriptionIcon fontSize="small" />
            </Box>
            <Box>
              {/* Keep in step with <title> in index.html and the root README's
                  H1 — the tab, the header and the landing page are the same
                  product and must not name it three different things. */}
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 500, lineHeight: 1.25 }}>
                Script Docs
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, display: { xs: 'none', sm: 'block' } }}>
                可以直接執行的維運手冊，內容渲染自各專案 README.md
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={mode === 'dark' ? '切換為淺色主題' : '切換為深色主題'}>
            <IconButton color="inherit" onClick={toggle} aria-label="切換主題">
              {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Tooltip>
          {manifest.repo.url && (
            <Tooltip title="在 GitHub 檢視原始碼">
              <IconButton
                color="inherit"
                component="a"
                href={manifest.repo.url}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <GitHubIcon />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              ...(isDesktop ? { top: appBarHeight, height: `calc(100% - ${appBarHeight}px)` } : {}),
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', minWidth: 0, mt: `${appBarHeight}px` }}>{children}</Box>
    </Box>
  );
}
