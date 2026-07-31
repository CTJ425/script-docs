# AGY Usage HUD — Spec

## Purpose
A statusline for Antigravity CLI (`agy`) that shows, on one line:
1. Current model name
2. 5-hour rolling quota usage + reset countdown
3. Weekly quota usage + reset countdown

## Scope decisions
- Reads one JSON payload from stdin per render. No HTTP, no daemon, no state
  on disk, no reading of local transcripts.
- Pure ASCII output (ANSI colour codes aside). Every emitted character must
  satisfy `ord(c) < 128`, so the line cannot break on a terminal without a
  Unicode font or with ambiguous east-asian widths.
- Standard library only, so the script can be curl'd to a machine and run.
- Values are displayed, never estimated. A window with no usable figure in the
  payload is rendered as unknown, not as a number.

## Output format
```text
Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)
```
- Model name first: it is the only field that is always short and always
  known, so it anchors the line when a narrow terminal truncates the tail.
  Non-ASCII stripped, then truncated to 24 characters — the longest observed
  `display_name`, "Gemini 3.6 Flash (High)", is 23, and a 20-char cap chopped
  it mid-word. Omitted entirely (along with its separator) when the payload
  carries no model, so the line then starts with `5h`.
- Percentage only, no progress bar. Usage level is carried entirely by the
  colour of the number, which costs no horizontal space — a bar spends eight
  columns per window to say what the colour already says.
- Percentage always to one decimal place, clamped to 0-100.
- Colour thresholds: green <70%, yellow 70-89.9%, red >=90%.
- Countdown: `XdYYh` if >=1 day, `XhYYm` if >=1 hour, else `Xm`; `<=0` is `0m`.
- Segments joined by a dim ` | `.

This matches the sibling [Claude Code HUD](../claudecode_usage_hub/SPEC.md)
field for field, so the two tools read identically side by side.

## Unknown vs zero
A window whose usage cannot be determined renders as a dim `--%` with no
countdown. This is deliberate and is the one rule worth stating twice:
a green `0.0%` reads as "quota barely touched", which is a claim the script
cannot make when the payload simply did not carry the figure. A window is
unknown when its bucket is missing, is not an object, carries none of
`used_percent` / `used_percentage` / `remaining_fraction`, or carries a value
that will not parse as a finite number.

A genuine `0.0` in the payload still renders as `0.0%`. Tier-7 tests pin both
directions.

## Total failure
Empty stdin, invalid JSON, a non-object payload, or any unhandled exception
prints the static fallback line and exits 0:
```text
5h --% | Wk --%
```
This runs on every prompt render, so it must never raise, never block, and
never return non-zero — a crash here would disrupt the TUI, not just the line.

## Data source (agy statusline stdin JSON)
Antigravity CLI's statusline payload is **not publicly documented**. The shape
below was captured from Antigravity CLI 1.1.8 by teeing the statusline's stdin
(see TROUBLESHOOTING.md); the same payloads are embedded verbatim as Tier 0
test fixtures, so the contract is pinned to observation rather than guesswork.

Abridged capture, with the fields this script reads:
```json
{
  "model": { "id": "...", "display_name": "Gemini 3.6 Flash (High)", "effort": "high" },
  "quota": {
    "gemini-5h":     { "remaining_fraction": 0.9986155, "reset_time": "...Z", "reset_in_seconds": 11515 },
    "gemini-weekly": { "remaining_fraction": 0.8492495, "reset_time": "...Z", "reset_in_seconds": 431793 },
    "3p-5h":         { "remaining_fraction": 1, "reset_time": "...Z", "reset_in_seconds": 17996 },
    "3p-weekly":     { "remaining_fraction": 1, "reset_time": "...Z", "reset_in_seconds": 604796 }
  },
  "context_window": { "used_percentage": 0.0139, "remaining_percentage": 99.986, "...": "..." },
  "agent_state": "idle", "plan_tier": "Google AI Pro", "version": "1.1.8"
}
```

### Model
`active_model`, else `model`. It is an **object**, not a string: the name is
`display_name`, else `id`. A plain string is still accepted in case the shape
reverts. Anything else (including the `null` sent while the CLI authenticates)
yields no model, and the line starts at `5h`. The object is never stringified —
doing so once rendered `{'id': 'Gemini 3.6 F` as the model name.

### Quota family
Antigravity meters Gemini models and third-party models against separate pools,
sent side by side as `gemini-*` and `3p-*`. Only the pool the active model
draws from is worth showing, so the family is chosen by the model name:
`gemini` when it contains "gemini" (case-insensitive), else `3p`. Bucket
lookup, per window, in order:

1. `<family>-<window>`, e.g. `gemini-5h`
2. the unprefixed `<window>` key
3. any other family's `<window>` bucket, taken in sorted key order so the
   choice is deterministic rather than dict-order luck

Bucket keys are matched case-insensitively. Window names accepted after the
prefix: `5h`, `rolling_5h`, `rolling5h`, `five_hour`, `5_hour`; and `weekly`,
`week`, `7d`, `seven_days`.

### Within a bucket
- Usage: `used_percent`, else `used_percentage`, else `remaining_fraction`
  (a 0–1 fraction, converted as `(1 - fraction) * 100`).
- Reset: `reset_in_seconds`, else `reset_in`. Numeric strings are accepted;
  `NaN`/`inf`/missing become `0`. `reset_time` is carried in the payload but is
  not read — deriving a countdown from it would mean trusting the local clock.

### Not read
`context_window.used_percentage` measures the **context window**, not quota.
Reading it as quota would print a confident number for a window the payload
says nothing about. Tier 0 pins this.

## Testing
`test_statusline.py` runs the script as a subprocess and asserts on stdout,
stderr and exit code. Nine tiers, 47 cases:

| Tier | Covers |
|---|---|
| 0 | Payloads captured from agy 1.1.8, replayed verbatim (authenticating / initializing / idle), plus context-window-is-not-quota |
| 1 | Colour thresholds, including the exact 70.0% and 90.0% boundaries |
| 2 | Quota family selection: gemini vs 3p, key casing, single-family fallback, unprefixed keys, buckets at the top level with no `quota` wrapper |
| 3 | Model extraction: object vs string, `display_name` over `id`, no-repr regression, truncation, non-ASCII |
| 4 | Usage field variations: `used_percent`, `used_percentage`, `remaining_fraction`, precedence, reset aliases |
| 5 | Boundaries: clamping, `NaN`/`inf`, string and negative reset values, day/hour countdown formats |
| 6 | Malformed payloads: empty stdin, bad JSON, arrays, primitives, `{}`, non-object `quota` and buckets |
| 7 | Unknown vs zero: missing bucket, missing field, unparseable value, and a genuine `0.0` |
| 8 | Line layout: model first, no bar characters, and the model-less line starting at `5h` |

Every case additionally asserts exit code 0, empty stderr, and pure-ASCII
output. The suite is only meaningful because Tier 0 is real: the previous
suite was written against an invented schema and passed 25/25 while the
statusline was visibly broken in the TUI.
