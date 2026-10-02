/**
 * The search page, over the Pagefind index that `npm run build` writes next to
 * the pages. The index covers the rendered text of every post, tool and script,
 * so it finds what a README says without the site holding a second copy of it.
 *
 * Pagefind exists only after a build; in `astro dev` the page says so instead of
 * failing.
 */

interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: { title?: string; kind?: string } }>;
}
interface Pagefind {
  options: (o: Record<string, unknown>) => Promise<void>;
  search: (q: string) => Promise<{ results: PagefindResult[] }>;
}

const form = document.querySelector<HTMLFormElement>('[data-search]')!;
const input = form.querySelector<HTMLInputElement>('input')!;
const statusEl = document.querySelector<HTMLElement>('[data-search-status]')!;
const list = document.querySelector<HTMLElement>('[data-search-results]')!;
const MAX = 20;

let engine: Promise<Pagefind | null> | null = null;

function load(): Promise<Pagefind | null> {
  engine ??= (async () => {
    try {
      const pf: Pagefind = await import(/* @vite-ignore */ form.dataset.index!);
      await pf.options({ baseUrl: `${form.dataset.base ?? ''}/` });
      return pf;
    } catch {
      return null;
    }
  })();
  return engine;
}

function row(r: { url: string; excerpt: string; meta: { title?: string; kind?: string } }) {
  const li = document.createElement('li');
  li.className = 'row';

  const lead = document.createElement('div');
  lead.className = 'row__lead label';
  lead.textContent = r.meta.kind ?? '';

  const main = document.createElement('div');
  main.className = 'row__main';
  const h = document.createElement('h3');
  h.className = 'row__title';
  const a = document.createElement('a');
  a.href = r.url;
  a.textContent = r.meta.title ?? r.url;
  h.append(a);
  const p = document.createElement('p');
  p.className = 'row__summary';
  // Pagefind's own excerpt: the page text, escaped, with <mark> around the hits.
  p.innerHTML = r.excerpt;

  main.append(h, p);
  li.append(lead, main);
  return li;
}

let seq = 0;
async function run(query: string) {
  const mine = ++seq;
  const q = query.trim();
  list.replaceChildren();

  if (!q) {
    statusEl.textContent = '';
    return;
  }
  statusEl.textContent = '搜尋中…';

  const pf = await load();
  if (!pf) {
    statusEl.textContent = '搜尋索引只會在 build 之後產生；開發模式下請先執行 npm run build。';
    return;
  }
  const found = await pf.search(q);
  const data = await Promise.all(found.results.slice(0, MAX).map((r) => r.data()));
  if (mine !== seq) return; // a newer keystroke already replaced this answer

  statusEl.textContent = found.results.length ? `${found.results.length} 筆結果` : '沒有符合的內容。';
  list.replaceChildren(...data.map(row));
}

let timer: number | undefined;
input.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const q = input.value.trim();
    const next = new URL(location.href);
    if (q) next.searchParams.set('q', q);
    else next.searchParams.delete('q');
    history.replaceState(null, '', next);
    void run(q);
  }, 160);
});
form.addEventListener('submit', (e) => e.preventDefault());

const initial = new URLSearchParams(location.search).get('q') ?? '';
input.value = initial;
if (initial) void run(initial);
input.focus();

// `/` jumps to the field from anywhere on the page, the way a docs site does.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !(e.target as HTMLElement).matches('input, textarea')) {
    e.preventDefault();
    input.focus();
  }
});

export {};
