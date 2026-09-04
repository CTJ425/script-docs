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
## The HTML must stay in sync with the READMEs

The site is not a second copy of the docs: `site/scripts/sync-content.mjs`
renders every `README.md` **verbatim**, and each file's first `#` heading
becomes that page's title *and* its nav label. So the only text the HTML/TSX
may hold is chrome — product name, tagline, meta description. Whenever that
chrome disagrees with a README, the product appears under two different names
and the site is wrong no matter which one is "right".

**When a README's title or positioning changes, update all of these in the same
commit:**

| Where | What must match |
| --- | --- |
| `README.md` (root) | H1 = the product name; opening line = the tagline. This *is* the landing page. |
| `site/index.html` | `<title>` = the root H1; `<meta name="description">` = the tagline + what the project contains |
| `site/src/components/AppShell.tsx` | App bar title = the root H1; subtitle = the tagline |
| `<subproject>/README.md` | H1 = that page's nav label — renaming the H1 renames the nav entry |
| `<subproject>/SPEC.md`, `TROUBLESHOOTING.md` | Their headings carry the same product name as the subproject's H1 |

**Rules**

- **One product, one name.** Never leave the tab title, the header and the
  landing page naming the same thing differently.
- **Never hand-write doc content into HTML/TSX.** Prose belongs in a `README.md`
  so the site and the repo cannot drift; the HTML holds chrome only.
- **Never edit `site/src/content/manifest.json`.** It is generated (and
  gitignored) — edit the source README instead.
- **Every published README carries a `> 最後更新：YYYY-MM-DD` line** directly
  under its H1, and it is maintained by hand. **Change a README's content and
  you change that date in the same commit** — a date nobody updates is worse
  than no date, because it asserts freshness the file does not have. The date
  states when the *content* last changed, so a commit that only touches the
  date line, or reformats without changing meaning, leaves it alone.
- Adding a subproject means adding a folder with a `README.md`. Nothing in the
  front end is hardcoded per project, so no TSX change should be needed.

**Verify before committing**

```bash
cd site && npm ci && npm run verify   # typecheck + smoke test + production build
```

The smoke test asserts the manifest's markdown is byte-identical to the files on
disk, so a README edited without re-syncing fails here rather than on the
published site.

<!-- classification -->
## Where a new subproject goes

Every subproject is `<category>/<project>/README.md` — **exactly two levels**.
The first level is the category and it is the only thing that decides the
sidebar group, so choosing the folder *is* the classification step. No front-end
change is ever needed to add or re-file a project.

| Category | Put it here when the subject is… |
| --- | --- |
| `AI/` | something that plugs into an AI CLI or agent — statuslines, plugins, prompt tooling (`agy`, Claude Code) |
| `container/` | containers or Kubernetes — compose stacks, cluster install, node prep |
| `script/` | a plain script that runs on a host and exits — VM sealing, ISO linking |

- **Classify by the subject, not the file type.** A shell script that builds a
  Kubernetes cluster is `container/` — the subject is the cluster. `script/` is
  for host-level one-offs, not "everything written in bash".
- **A fourth category is just a new top-level folder.** It becomes a sidebar
  group automatically. Add it to `CATEGORY_ORDER` in
  `site/scripts/sync-content.mjs` only when its position in the sidebar matters;
  unlisted categories sort after the listed ones, alphabetically.
- **The wrong depth fails the build, on purpose.** A `README.md` left at the
  repo root (uncategorised) or buried a level too deep used to produce a page
  that simply never appeared; `sync-content.mjs` now rejects both with the fix
  spelled out in the error.
- Re-filing a project is `git mv` plus a sweep of its `raw.githubusercontent.com`
  URLs — the paths are published install commands, so every one of them, in
  every README and installer, has to move with the folder.

<!-- these three files are byte-identical mirrors -->
> [!IMPORTANT]
> `CLAUDE.md`, `.cursorrules` and `.windsurfrules` are kept byte-identical.
> Edit one, copy it over the other two in the same commit.
