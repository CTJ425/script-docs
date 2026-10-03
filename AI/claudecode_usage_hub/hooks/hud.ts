import type { SessionRateLimit, SessionContextUsage } from 'claude-code'

import type { Bucket, Buckets } from '../types'

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

// At or past this, a window is marked with `!`: the status line has no
// colors, so one threshold is all a text mark can say without misreading.
export const WARN_PCT = 90

function rateSegment(label: string, v: { pct: number | null; resetsAt: number | null }, now: number, withReset: boolean) {
  if (v.pct === null) return `${label} –`
  // The rounded figure decides the mark too, so "90%" is never shown unmarked.
  const pct = Math.round(v.pct)
  const shown = `${label} ${pct}%${pct >= WARN_PCT ? '!' : ''}`
  const cd = withReset ? countdown(v.resetsAt, now) : null
  return cd ? `${shown} · ${cd}` : shown
}

function tokens(n: number) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}

function contextSegment(ctx: SessionContextUsage) {
  if (!isNum(ctx.window) || ctx.window <= 0) return 'Ctx –'
  // tokens is absent until the live window's first response: nothing used yet.
  const used = isNum(ctx.tokens) ? ctx.tokens : 0
  return `Ctx ${tokens(used)}/${tokens(ctx.window)}`
}

/**
 * `Opus 5.5 · high   5h 45% · 2h10m   Wk 23%   Ctx 156K/1M`
 * Segments are three spaces apart; `·` binds a value to its qualifier.
 */
export function renderLine(
  model: string,
  effort: string | null,
  live: Buckets,
  shared: Shared | null,
  fresh: boolean,
  ctx: SessionContextUsage,
  now: number,
): string {
  const parts: string[] = []
  const name = model.slice(0, 20)
  if (name) parts.push(effort ? `${name} · ${effort}` : name)
  parts.push(rateSegment('5h', resolve(live.five_hour, shared?.buckets.five_hour, fresh, now), now, true))
  parts.push(rateSegment('Wk', resolve(live.seven_day, shared?.buckets.seven_day, fresh, now), now, false))
  parts.push(contextSegment(ctx))
  return parts.join('   ')
}

export function sameShared(a: Shared | null, b: Shared | null) {
  if (!a || !b) return a === b
  return sameBuckets(a.buckets, b.buckets)
}
