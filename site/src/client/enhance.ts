/**
 * The only JavaScript the site ships on every page: the theme toggle, the copy
 * buttons and the table-of-contents marks. Each one is an enhancement — with
 * scripting off the page reads the same, it just cannot copy for you.
 */

const KEY = 'ivan-note-color-mode';

/* ---------------------------------------------------------------- theme */

function syncToggles(mode: string) {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(mode === 'dark'));
  });
}

syncToggles(document.documentElement.dataset.theme ?? 'light');

document.addEventListener('click', (e) => {
  const toggle = (e.target as Element).closest('[data-theme-toggle]');
  if (!toggle) return;
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  root.style.colorScheme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice lasts for this page view */
  }
  syncToggles(next);
});

/* ----------------------------------------------------------------- copy */

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

const timers = new WeakMap<Element, number>();

document.addEventListener('click', async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  // The <pre> holds the command and nothing else — no line wrappers, no labels —
  // so its text is exactly what was written in the file.
  const pre = btn.closest('.win')?.querySelector('pre');
  if (!pre) return;

  const ok = await writeClipboard(pre.textContent ?? '');
  btn.dataset.status = ok ? 'copied' : 'failed';
  btn.textContent = ok ? 'Copied' : 'Failed';
  window.clearTimeout(timers.get(btn));
  timers.set(
    btn,
    window.setTimeout(() => {
      delete btn.dataset.status;
      btn.textContent = 'Copy';
    }, 2000)
  );
});

/* ------------------------------------------------------------------ toc */

/**
 * Mark where the reader is in the page. Three marks, three shapes, so the state
 * survives losing colour: an open circle not yet reached, a crease once read,
 * a punched hole for the section on screen.
 */
function trackToc() {
  const lists = document.querySelectorAll<HTMLElement>('[data-toc]');
  if (!lists.length || !('IntersectionObserver' in window)) return;

  const links = new Map<string, HTMLElement[]>();
  lists.forEach((nav) =>
    nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
      links.set(id, [...(links.get(id) ?? []), a.parentElement!]);
    })
  );

  const heads = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el));
  if (!heads.length) return;

  const paint = () => {
    // The current section is the last heading that has reached the top third.
    const line = window.innerHeight * 0.33;
    let current = -1;
    heads.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= line) current = i;
    });
    heads.forEach((h, i) => {
      const state = i === current ? 'current' : i < current ? 'read' : 'unread';
      links.get(h.id)?.forEach((li) => (li.dataset.state = state));
    });
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  paint();
}

trackToc();

export {};
