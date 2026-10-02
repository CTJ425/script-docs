<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.

<!-- docs/site consistency -->
## Who owns the words

The site is a personal blog (**ivan note**) that publishes this repository. Every
page is built from a file in the repo, and *which kind of file* decides who owns
its prose:

| Kind | Source | The site may… |
| --- | --- | --- |
| **Script** | `<category>/<project>/README.md` | render it **verbatim** and nothing else. No intro, no summary, no badge added to the page. What may sit beside the text is *derived state*: file name, byte count, revision date, category. |
| **Post** | `posts/<slug>.md` (frontmatter) | render it. Written for this site, in the author's voice. |
| **Tool** | `tools/<slug>.md` (frontmatter) | render it. Same. |
| **Page** | `pages/{home,about}.md` (frontmatter) | render it. Same. |
| **Chrome** | `.astro` / `.ts` / `.css` | hold the product name, the tagline, nav and UI labels (搜尋, 本頁目錄…) and **no other prose**. |

- **Never hand-write content into `.astro` / `.ts`.** If a sentence belongs to a
  reader, it belongs in a markdown file.
- **Never edit generated output**: `site/dist/`, `site/.astro/`.
- A script's `docs.json` sidecar may hold only `slug`, `tags` and `order`. The title
  and the text come from the README; the build rejects any other key.

## One product, one name

The product name is the root `README.md`'s first `#` heading, and its tagline is the
root README's first paragraph. `site/astro.config.mjs` reads both and
`site/src/lib/site.ts` exposes them, so the masthead, the home `<title>`, the feed
and the repository's front page cannot drift. `verify-dist` asserts it.

Renaming the product therefore means: edit the root README H1 (and tagline), then
update the headings in `PRODUCT.md` and `site/DESIGN.md`. Nothing in the front end
holds the name.

## Dates

- Every **script README** carries `> 最後更新：YYYY-MM-DD` directly under its H1
  (`verify-content` asserts it). It is maintained by hand: **change a README's
  content and you change that date in the same commit.** The date states when the
  *content* last changed, so a commit that only reformats leaves it alone.
- A **post** has `date` (first published) and, once it changes in a way a reader
  would care about, `updated`. A **tool** has `updated`. The age mark on a page
  (yellowing at 90 days, bleaching at 270) is derived from these; never fake it.

## Where a new script goes

Every script is `<category>/<project>/README.md` — **exactly two levels**. The first
level is the category and is the only thing that decides the grouping, so choosing
the folder *is* the classification step. No front-end change is ever needed.

| Category | Put it here when the subject is… |
| --- | --- |
| `AI/` | something that plugs into an AI CLI or agent — statuslines, plugins, prompt tooling (`agy`, Claude Code) |
| `container/` | containers or Kubernetes — compose stacks, cluster install, node prep |
| `script/` | a plain script that runs on a host and exits — VM sealing, ISO linking |

- **Classify by the subject, not the file type.** A shell script that builds a
  Kubernetes cluster is `container/` — the subject is the cluster.
- **A fourth category is just a new top-level folder.** It becomes a group and gets
  the next hue automatically. List it in `CATEGORY_ORDER` in
  `site/src/lib/categories.mjs` only when its position matters.
- **The wrong depth fails the build, on purpose**, with the fix spelled out.
- The page URL is `/scripts/<project>/` (the project folder, slugified). Two projects
  that collide fail the build; set `"slug"` in one `docs.json`.
- Re-filing a project is `git mv` plus a sweep of its `raw.githubusercontent.com`
  URLs — those paths are published install commands, so every one of them, in every
  README, post and installer, has to move with the folder.

Posts and tools reference scripts by slug (`scripts: [pve-link-iso]`) and tools by
file name (`tools: [ollama]`). An unknown slug fails the build.

## Design invariants

Full rules are in `site/DESIGN.md`; the ones a change must not break:

- **Colour is derived, never typed.** Paper, ink, rules, danger and every category
  fill come from `site/src/lib/design.mjs` and are inlined into `<head>`. No hex or
  `rgb()` in a stylesheet. A new colour meaning is a new derivation rule, not a swatch.
- **Contrast is enforced, not hoped for.** `site/scripts/check-contrast.mjs` measures
  every ink on every surface (paper, recess, aged paper, danger field) in both themes.
- **Vermilion means danger and nothing else.** Not a brand colour, not hover, not a
  category hue.
- **Category colour is by position, never by name.**
- **State is a mark plus a word**, never colour alone (status squares, TOC circle /
  crease / hole).
- **One motion grammar:** `--hinge` (90ms, two steps). No easing, no fade, no smooth scroll.
- **The command is the product.** The command window keeps its `sudo` / `dry-run`
  flags (literal reads of the text) and its copy button reads the `<pre>`'s own text.
- **Light and dark both**, with the stored choice applied before first paint.

## Verify before committing

```bash
cd site && npm ci && npm run verify
```

`verify` = `astro check` (types) + `check-contrast` + `verify-content` (the repo
before the build) + `astro build` and the Pagefind index + `verify-dist` (the built
site: every route, every internal link and anchor, per-page title / description /
canonical / Open Graph, the feed, the sitemap, the search index, and for each script
that the page was rendered from exactly the bytes on disk).

## Deploying

The site is static (`site/dist`). Where it is served from comes from the environment:

| Variable | Meaning | Default |
| --- | --- | --- |
| `SITE_URL` | public origin, e.g. `https://note.example.com` | `https://<owner>.github.io` on GitHub Actions; `CF_PAGES_URL` on Cloudflare Pages |
| `BASE_PATH` | path prefix, `/` at a domain root | `/<repo>` on GitHub Actions, `/` elsewhere |

Cloudflare Pages: root directory `site`, build command `npm ci && npm run build`,
output directory `dist`, `NODE_VERSION=22`, and `SITE_URL` set to the production domain.

> [!IMPORTANT]
> `CLAUDE.md`, `.cursorrules` and `.windsurfrules` are kept byte-identical.
> Edit one, copy it over the other two in the same commit.
