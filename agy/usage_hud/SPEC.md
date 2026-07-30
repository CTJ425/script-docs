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
gemini-3.6-flash | 5h 35.0% (1h30m) | Wk 50.0% (2d00h)
```
- Model name first: it is the only field that is always short and always
  known, so it anchors the line when a narrow terminal truncates the tail.
  Non-ASCII stripped, then truncated to 20 characters. Omitted entirely (along
  with its separator) when the payload carries no model, so the line then
  starts with `5h`.
- Percentage only, no progress bar. Usage level is carried entirely by the
  colour of the number, which costs no horizontal space — a bar spends eight
  columns per window to say what the colour already says.
- Percentage always to one decimal place, clamped to 0-100.
- Colour thresholds: green <70%, yellow 70-89.9%, red >=90%.
- Countdown: `XdYYh` if >=1 day, `XhYYm` if >=1 hour, else `Xm`; `<=0` is `0m`.
- Segments joined by a dim ` | `.

This matches the sibling [Claude Code HUD](../../claudecode/usage_hub/SPEC.md)
field for field, so the two tools read identically side by side.

## Unknown vs zero
A window whose usage cannot be determined renders as a dim `--%` with no
countdown. This is deliberate and is the one rule worth stating twice:
a green `0.0%` reads as "quota barely touched", which is a claim the script
cannot make when the payload simply did not carry the figure. A window is
unknown when its bucket is missing, is not an object, carries neither
`used_percent` nor `remaining_fraction`, or carries a value that will not parse
as a finite number.

A genuine `0.0` in the payload still renders as `0.0%`. Tier-5 tests pin both
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
> [!NOTE]
> Unlike the sibling [Claude Code HUD](../../claudecode/usage_hub/SPEC.md), whose
> field paths are confirmed against published documentation, Antigravity CLI's
> statusline payload shape is **not publicly documented**. The key names below
> were derived from observed payloads, which is why the parser accepts several
> aliases per field and treats anything unrecognised as unknown rather than
> guessing. If you can capture a real payload (see TROUBLESHOOTING.md), that is
> the authoritative check.

Accepted shapes, in order of preference:
- Buckets under `quota`, else at the top level (either window's key is enough
  to treat the payload itself as the bucket container).
- 5h bucket key: `rolling_5h`, `5h`, `rolling5h`, `five_hour`, `5_hour`.
- Weekly bucket key: `weekly`, `week`, `7d`, `seven_days`.
- One extra level of nesting is tolerated (buckets under a model/plan key).
- Usage within a bucket: `used_percent`, else `remaining_fraction`
  (converted as `(1 - fraction) * 100`).
- Reset within a bucket: `reset_in_seconds`, else `reset_in`. Numeric strings
  are accepted; `NaN`/`inf`/missing become `0`.
- Model: `active_model`, else `model`.

## Testing
`test_statusline.py` runs the script as a subprocess and asserts on stdout,
stderr and exit code. Six tiers, 26 cases:

| Tier | Covers |
|---|---|
| 1 | Core rendering and the three colour thresholds |
| 2 | Field variations (`remaining_fraction`, alternative key names) |
| 3 | Boundaries: clamping, truncation, non-ASCII input, `NaN`/`inf`, string and negative reset values |
| 4 | Malformed payloads: empty stdin, bad JSON, arrays, primitives, `{}` |
| 5 | Unknown vs zero: missing bucket, missing field, unparseable value, and a genuine `0.0` |
| 6 | Line layout: model first, no bar characters, and the model-less line starting at `5h` |

Every case additionally asserts exit code 0 and pure-ASCII output.
