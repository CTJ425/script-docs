import type { SessionRateLimit, SessionContextUsage } from 'claude-code'

import type { Bucket, Buckets, Icon, Span } from '../types'

/**
 * Pure logic of the usage HUD: what to show and what to share between
 * sessions. No `$` here, so every rule is testable with plain values.
 *
 * Times are milliseconds since the epoch ($.clock.now()).
 */

export const KINDS = ['five_hour', 'seven_day'] as const
export type Kind = (typeof KINDS)[number]

export type { Bucket, Buckets }

/** What every session shares through $.store: the newest usage seen. */
export type Shared = { savedAt: number; buckets: Buckets }

export const MAX_AGE_MS = 7 * 86_400_000
// savedAt from another process's clock may sit slightly ahead of ours.
const FUTURE_SLACK_MS = 300_000

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const clamp = (pct: number) => Math.max(0, Math.min(100, pct))

export function liveBuckets(rateLimits: readonly SessionRateLimit[]): Buckets {
  const out: Buckets = {}
  for (const rl of rateLimits) {
    if (!(KINDS as readonly string[]).includes(rl.kind) || !isNum(rl.percentUsed)) continue
    const resetsAt = rl.resetsAt ? Date.parse(rl.resetsAt) : NaN
    out[rl.kind as Kind] = { pct: rl.percentUsed, resetsAt: isNum(resetsAt) ? resetsAt : null }
  }
  return out
}

function sameBucket(a: Bucket | undefined, b: Bucket | undefined) {
  if (!a || !b) return !a && !b
  return a.pct === b.pct && a.resetsAt === b.resetsAt
}

export function sameBuckets(a: Buckets, b: Buckets) {
  return KINDS.every(k => sameBucket(a[k], b[k]))
}

function parseBucket(v: unknown): Bucket | undefined {
  if (!v || typeof v !== 'object') return undefined
  const { pct, resetsAt } = v as Record<string, unknown>
  if (!isNum(pct)) return undefined
  return { pct, resetsAt: isNum(resetsAt) ? resetsAt : null }
}

/** The shared value as stored, or null when absent, malformed or older than 7 days. */
export function parseShared(v: unknown, now: number): Shared | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const { savedAt, buckets } = v as Record<string, unknown>
  if (!isNum(savedAt)) return null
  const age = now - savedAt
  if (age < -FUTURE_SLACK_MS || age > MAX_AGE_MS) return null
  const out: Buckets = {}
  if (buckets && typeof buckets === 'object') {
    for (const k of KINDS) {
      const b = parseBucket((buckets as Record<string, unknown>)[k])
      if (b) out[k] = b
    }
  }
  return { savedAt, buckets: out }
}

const isCurrent = (b: Bucket, now: number) => b.resetsAt !== null && b.resetsAt > now

/**
 * Picks between this session's live bucket and the shared one for one window.
 * `fresh`: this session's rate limits changed since it last looked, i.e. it
 * just got an API response; otherwise its figure is an idle replay.
 *   - live window has ended while the shared one is current -> shared
 *   - fresh -> live, even when lower inside the same window
 *   - replay -> shared while its window is current, else live
 */
export function pick(live: Bucket | undefined, prev: Bucket | undefined, fresh: boolean, now: number) {
  if (!prev) return live
  if (!live) return prev
  if (live.resetsAt !== null && live.resetsAt <= now && isCurrent(prev, now)) return prev
  if (fresh) return live
  return isCurrent(prev, now) ? prev : live
}

/** What to show for one window; pct null means no figure (`–`). */
export function resolve(
  live: Bucket | undefined,
  shared: Bucket | undefined,
  fresh: boolean,
  now: number,
): { pct: number | null; resetsAt: number | null } {
  if (live) {
    if (shared && pick(live, shared, fresh, now) === shared && isCurrent(shared, now)) {
      return { pct: clamp(shared.pct), resetsAt: shared.resetsAt }
    }
    return { pct: clamp(live.pct), resetsAt: live.resetsAt }
  }
  if (!shared) return { pct: null, resetsAt: null }
  // A known past reset means the window rolled over with nothing run since.
  if (shared.resetsAt !== null && shared.resetsAt <= now) return { pct: 0, resetsAt: null }
  return { pct: clamp(shared.pct), resetsAt: shared.resetsAt }
}

/** The shared value to store after this look, or null when there is nothing to keep. */
export function nextShared(live: Buckets, prev: Shared | null, fresh: boolean, now: number): Shared | null {
  const buckets: Buckets = {}
  for (const k of KINDS) {
    const chosen = pick(live[k], prev?.buckets[k], fresh, now)
    if (chosen) buckets[k] = chosen
  }
  if (Object.keys(buckets).length === 0) return null
  return { savedAt: now, buckets }
}

/**
 * The effort the settings give `model`: `modelSettings[model].effortLevel`,
 * else the top-level `effortLevel`; null when neither names one. Only a guess
 * until the first request says what was actually sent.
 */
export function settingsEffort(settings: Readonly<Record<string, unknown>>, model: string): string | null {
  const per = settings.modelSettings
  const own =
    per && typeof per === 'object' ? (per as Record<string, unknown>)[model] : undefined
  const level = own && typeof own === 'object' ? (own as Record<string, unknown>).effortLevel : undefined
  if (typeof level === 'string' && level) return level
  return typeof settings.effortLevel === 'string' && settings.effortLevel ? settings.effortLevel : null
}

export function countdown(resetsAt: number | null, now: number): string | null {
  if (resetsAt === null) return null
  const s = Math.max(0, Math.round((resetsAt - now) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d${String(h).padStart(2, '0')}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

// At or past this, a window is marked with `!` and drawn in the warning
// color; the mark keeps the warning legible where color is not.
export const WARN_PCT = 90

/**
 * What a run of text is for: `label` names a segment (`◷`, `⊞`, `◧`),
 * `data` is a value, `warn` a value at or past WARN_PCT. No tone: the
 * separators and `–`.
 */
export type { Icon, Span }
export type Tone = NonNullable<Span['tone']>

// The terminal's glyph for each label: one column wide (East Asian Width N,
// not A), so a CJK locale doesn't draw it double and shift the truncation.
// Other surfaces draw an icon of their own in its place.
export const GLYPH: Record<Icon, string> = { five_hour: '◷', seven_day: '⊞', context: '◧' }
const label = (icon: Icon): Span => ({ text: GLYPH[icon], tone: 'label', icon })

const SEP: Span = { text: '   ' }
const BIND: Span = { text: ' · ' }
const SPACE: Span = { text: ' ' }

function rateSegment(icon: Icon, v: { pct: number | null; resetsAt: number | null }, now: number, withReset: boolean): Span[] {
  const head: Span[] = [label(icon), SPACE]
  if (v.pct === null) return [...head, { text: '–' }]
  // The rounded figure decides the mark too, so "90%" is never shown unmarked.
  const pct = Math.round(v.pct)
  const warn = pct >= WARN_PCT
  const shown: Span = { text: `${pct}%${warn ? '!' : ''}`, tone: warn ? 'warn' : 'data' }
  const cd = withReset ? countdown(v.resetsAt, now) : null
  return cd ? [...head, shown, BIND, { text: cd, tone: 'data' }] : [...head, shown]
}

function tokens(n: number) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}

function contextSegment(ctx: SessionContextUsage): Span[] {
  const head: Span[] = [label('context'), SPACE]
  if (!isNum(ctx.window) || ctx.window <= 0) return [...head, { text: '–' }]
  // tokens is absent until the live window's first response: nothing used yet.
  const used = isNum(ctx.tokens) ? ctx.tokens : 0
  return [...head, { text: `${tokens(used)}/${tokens(ctx.window)}`, tone: 'data' }]
}

/**
 * `Opus 5.5 · high   ◷ 45% · 2h10m   ⊞ 23%   ◧ 156K/1M`, as tagged runs.
 * Segments are three spaces apart; `·` binds a value to its qualifier.
 */
export function renderSpans(
  model: string,
  effort: string | null,
  live: Buckets,
  shared: Shared | null,
  fresh: boolean,
  ctx: SessionContextUsage,
  now: number,
): Span[] {
  const segments: Span[][] = []
  const name = model.slice(0, 20)
  if (name) {
    const m: Span = { text: name, tone: 'data' }
    segments.push(effort ? [m, BIND, { text: effort, tone: 'data' }] : [m])
  }
  segments.push(rateSegment('five_hour', resolve(live.five_hour, shared?.buckets.five_hour, fresh, now), now, true))
  segments.push(rateSegment('seven_day', resolve(live.seven_day, shared?.buckets.seven_day, fresh, now), now, false))
  segments.push(contextSegment(ctx))
  return segments.flatMap((seg, i) => (i === 0 ? seg : [SEP, ...seg]))
}

export const lineText = (spans: readonly Span[]) => spans.map(s => s.text).join('')

export function sameShared(a: Shared | null, b: Shared | null) {
  if (!a || !b) return a === b
  return sameBuckets(a.buckets, b.buckets)
}
