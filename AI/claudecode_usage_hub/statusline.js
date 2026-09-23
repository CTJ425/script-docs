#!/usr/bin/env node
"use strict";

/**
 * Claude Code Usage HUD statusline.
 * Reads the statusLine hook JSON payload from stdin and prints one ASCII line:
 *   <model> | 5h pct% (reset) | Wk pct% (reset) | Ctx used/max
 *
 * Field paths (per Claude Code's documented statusline payload):
 *   model.display_name                          -> model name
 *   rate_limits.five_hour.used_percentage        -> 5h usage %
 *   rate_limits.five_hour.resets_at              -> 5h reset (unix seconds)
 *   rate_limits.seven_day.used_percentage        -> weekly usage %
 *   rate_limits.seven_day.resets_at              -> weekly reset (unix seconds)
 *   context_window.used_percentage               -> context usage % (may be
 *                                                    null early in a session --
 *                                                    treated as 0)
 *   context_window.context_window_size           -> context max tokens
 *
 * Used token count is derived as round(used_percentage / 100 * context_window_size)
 * rather than read from a raw token-count field, since the docs describe the
 * percentage/size pair as the stable, always-present contract.
 *
 * `rate_limits` is absent until the session's first API response, so the last
 * known values are cached on disk (see CACHE_FILE) and used as a fallback --
 * otherwise every new session would open with "N/A". A cached window whose
 * resets_at has already passed has rolled over, so it renders as 0.0% with no
 * countdown.
 *
 * Any field that is missing/malformed (and has no usable cache) renders as
 * "N/A" for that segment only. Any top-level failure (bad JSON, non-object,
 * empty stdin) prints a static fallback line and exits 0 -- this must never
 * throw or hang Claude Code. Cache reads/writes fail silently for the same
 * reason.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const COLOR_RESET = "\x1b[0m";
const COLOR_GREEN = "\x1b[1;32m";
const COLOR_YELLOW = "\x1b[1;33m";
const COLOR_RED = "\x1b[1;31m";
const COLOR_DIM = "\x1b[2m";
const COLOR_CYAN = "\x1b[1;36m";

const FALLBACK_LINE =
  `${COLOR_DIM}5h N/A | Wk N/A | Ctx N/A${COLOR_RESET}`;

const CACHE_FILE =
  process.env.USAGE_HUB_CACHE ||
  path.join(os.homedir(), ".claude", "usage_hub", "cache.json");
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_SECONDS = 7 * 86400;
// saved_at is rounded to whole seconds, so a cache written moments ago can look
// slightly in the future; tolerate that (and minor clock skew) instead of
// discarding an obviously valid cache.
const CACHE_FUTURE_SLACK_SECONDS = 300;
const BUCKET_KEYS = ["five_hour", "seven_day"];

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function clampPercent(pct) {
  if (!isFiniteNumber(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

function colorFor(pct) {
  if (pct >= 90) return COLOR_RED;
  if (pct >= 70) return COLOR_YELLOW;
  return COLOR_GREEN;
}

function formatCountdown(resetsAt) {
  if (!isFiniteNumber(resetsAt)) return null;
  const now = Date.now() / 1000;
  let seconds = Math.round(resetsAt - now);
  if (seconds < 0) seconds = 0;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function cacheIsFresh(cache) {
  if (!cache || !isFiniteNumber(cache.saved_at)) return false;
  const age = Date.now() / 1000 - cache.saved_at;
  return age >= -CACHE_FUTURE_SLACK_SECONDS && age <= CACHE_MAX_AGE_SECONDS;
}

function cachedBucket(cache, key) {
  const rateLimits = cache && cache.rate_limits;
  if (!rateLimits || typeof rateLimits !== "object") return null;
  const bucket = rateLimits[key];
  if (!bucket || typeof bucket !== "object") return null;
  if (!isFiniteNumber(bucket.used_percentage)) return null;
  return bucket;
}

/**
 * Chooses which bucket to persist between a live payload bucket and the
 * previous cached bucket, for a single rate-limit window. The cache is shared
 * by every Claude Code session on the machine, and an idle session keeps
 * re-rendering with the rate_limits of its own last (possibly stale) API
 * response -- so a live bucket only loses to the cache when it is provably
 * stale: its reset time has already passed while the cached window is still
 * live. That is the only case an idle session can actually be in (it is
 * replaying an old response), so it is the only case worth distrusting live
 * data for:
 *   - both have a finite resets_at, equal -> keep the higher used_percentage
 *     (same window; usage never decreases inside one window)
 *   - both have a finite resets_at, live's has already passed and the
 *     cached one has not -> keep the cached bucket (live is a stale replay)
 *   - otherwise -> use the live bucket (new/expiring window, or no evidence
 *     of age when a resets_at is missing)
 */
function pickBucketForCache(live, prev) {
  if (!prev) return live;
  if (!live) return prev;

  if (isFiniteNumber(live.resets_at) && isFiniteNumber(prev.resets_at)) {
    if (live.resets_at === prev.resets_at) {
      return live.used_percentage >= prev.used_percentage ? live : prev;
    }
    const now = Date.now() / 1000;
    if (live.resets_at <= now && prev.resets_at > now) return prev;
  }

  return live;
}

/**
 * Builds the cache contents to persist, merging live buckets over the previous
 * cache so a payload carrying only one bucket doesn't drop the other.
 * Returns null when there is nothing worth caching.
 */
function buildCacheContents(liveRateLimits, liveContextSize, previous) {
  const rateLimits = {};

  for (const key of BUCKET_KEYS) {
    const rawLive = liveRateLimits[key];
    const live =
      rawLive && typeof rawLive === "object" && isFiniteNumber(rawLive.used_percentage)
        ? {
            used_percentage: rawLive.used_percentage,
            resets_at: isFiniteNumber(rawLive.resets_at) ? rawLive.resets_at : null,
          }
        : null;
    const prev = cachedBucket(previous, key);
    const prevNormalized = prev
      ? {
          used_percentage: prev.used_percentage,
          resets_at: isFiniteNumber(prev.resets_at) ? prev.resets_at : null,
        }
      : null;

    const chosen = pickBucketForCache(live, prevNormalized);
    if (chosen) rateLimits[key] = chosen;
  }

  const contextSize = isFiniteNumber(liveContextSize)
    ? liveContextSize
    : previous && isFiniteNumber(previous.context_window_size)
      ? previous.context_window_size
      : null;

  if (Object.keys(rateLimits).length === 0 && contextSize === null) return null;

  return {
    version: CACHE_VERSION,
    saved_at: Math.round(Date.now() / 1000),
    rate_limits: rateLimits,
    context_window_size: contextSize,
  };
}

function sameCachePayload(a, b) {
  if (!a || !b) return false;
  if (a.context_window_size !== b.context_window_size) return false;

  for (const key of BUCKET_KEYS) {
    const x = (a.rate_limits || {})[key] || null;
    const y = (b.rate_limits || {})[key] || null;
    if (!x !== !y) return false;
    if (!x) continue;
    if (x.used_percentage !== y.used_percentage) return false;
    if (x.resets_at !== y.resets_at) return false;
  }
  return true;
}

/**
 * Writes the cache only when its meaningful contents changed, so the per-render
 * invocation doesn't hammer the disk. Never throws.
 */
function writeCache(liveRateLimits, liveContextSize, previous) {
  try {
    // Only carry values forward from a cache that is still fresh. Merging from
    // an expired one and stamping saved_at = now would launder a >7-day-old
    // figure into a "fresh" cache, and the age limit could then never expire it.
    const usable = cacheIsFresh(previous) ? previous : null;
    const next = buildCacheContents(liveRateLimits, liveContextSize, usable);
    if (!next) return;
    if (sameCachePayload(next, usable)) return;

    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmp = `${CACHE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(next) + "\n");
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    // Cache is a nice-to-have; never let it affect the rendered line.
  }
}

/**
 * Picks the values to display for one rate-limit bucket: live payload first,
 * then a fresh on-disk cache, else nothing. Returns { pct, resetsAt } with
 * pct === null meaning "N/A".
 */
function resolveBucket(liveBucket, cache, key) {
  const livePct = liveBucket ? clampPercent(liveBucket.used_percentage) : null;
  if (livePct !== null) {
    // The same precedence rule used for the cache write also picks the
    // rendered value: an idle session must not show its own stale figure
    // when another session already wrote a newer one to the shared cache.
    if (cacheIsFresh(cache)) {
      const cached = cachedBucket(cache, key);
      if (cached) {
        const liveNormalized = {
          used_percentage: liveBucket.used_percentage,
          resets_at: isFiniteNumber(liveBucket.resets_at) ? liveBucket.resets_at : null,
        };
        const cachedNormalized = {
          used_percentage: cached.used_percentage,
          resets_at: isFiniteNumber(cached.resets_at) ? cached.resets_at : null,
        };
        const chosen = pickBucketForCache(liveNormalized, cachedNormalized);
        // Only a current cached window may replace the live figure; a
        // rolled-over one would render a stale percentage with a (0m) countdown.
        const cachedCurrent =
          isFiniteNumber(cached.resets_at) && cached.resets_at > Date.now() / 1000;
        if (chosen === cachedNormalized && cachedCurrent) {
          return { pct: clampPercent(cached.used_percentage), resetsAt: cached.resets_at };
        }
      }
    }
    return { pct: livePct, resetsAt: liveBucket.resets_at };
  }

  if (!cacheIsFresh(cache)) return { pct: null, resetsAt: null };

  const bucket = cachedBucket(cache, key);
  if (!bucket) return { pct: null, resetsAt: null };

  // A cached window whose reset time has passed has rolled over: no usage has
  // accrued since (nothing ran), so show 0% and drop the misleading countdown.
  // Only a *known* past reset proves that. A cached bucket with no resets_at
  // says nothing about rollover, and rendering it as a green 0.0% would turn
  // "85% used, reset time unknown" into "quota barely touched" -- show the
  // cached figure without a countdown instead.
  const rolledOver =
    isFiniteNumber(bucket.resets_at) && bucket.resets_at <= Date.now() / 1000;
  if (rolledOver) return { pct: 0, resetsAt: null };

  return { pct: clampPercent(bucket.used_percentage), resetsAt: bucket.resets_at };
}

function renderRateLimitSegment(label, bucketValues) {
  const pct = bucketValues.pct;

  if (pct === null) {
    return `${label} ${COLOR_DIM}N/A${COLOR_RESET}`;
  }

  const color = colorFor(pct);
  const countdown = formatCountdown(bucketValues.resetsAt);
  const resetPart = countdown ? ` ${COLOR_DIM}(${countdown})${COLOR_RESET}` : "";

  return `${label} ${color}${pct.toFixed(1)}%${COLOR_RESET}${resetPart}`;
}

function formatTokenCount(n) {
  if (!isFiniteNumber(n)) return null;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

function renderContextSegment(contextWindow, cache) {
  const window =
    contextWindow && typeof contextWindow === "object" ? contextWindow : {};

  // Fall back to the cached window size so a payload without context_window
  // (or without the size) still renders tokens instead of N/A.
  let max = isFiniteNumber(window.context_window_size)
    ? window.context_window_size
    : null;
  if (max === null && cacheIsFresh(cache) && isFiniteNumber(cache.context_window_size)) {
    max = cache.context_window_size;
  }

  if (max === null) {
    return `Ctx ${COLOR_DIM}N/A${COLOR_RESET}`;
  }

  // used_percentage may be null early in a session (no usage yet) -> treat as 0.
  const pct = isFiniteNumber(window.used_percentage)
    ? clampPercent(window.used_percentage)
    : 0;

  const used = Math.round((pct / 100) * max);

  return `Ctx ${formatTokenCount(used)}/${formatTokenCount(max)}`;
}

function sanitizeAscii(text) {
  let s = typeof text === "string" ? text : String(text == null ? "" : text);
  let out = "";
  for (const ch of s) {
    if (ch.codePointAt(0) < 128) out += ch;
  }
  return out;
}

function renderModelSegment(data) {
  const raw =
    (data.model && (data.model.display_name || data.model.id)) || "";
  const name = sanitizeAscii(raw).slice(0, 20);
  return name ? `${COLOR_CYAN}${name}${COLOR_RESET}` : null;
}

function renderStatusLine(data, cache) {
  const parts = [];

  const modelPart = renderModelSegment(data);
  if (modelPart) parts.push(modelPart);

  const rateLimits = data.rate_limits && typeof data.rate_limits === "object"
    ? data.rate_limits
    : {};

  parts.push(
    renderRateLimitSegment("5h", resolveBucket(rateLimits.five_hour, cache, "five_hour"))
  );
  parts.push(
    renderRateLimitSegment("Wk", resolveBucket(rateLimits.seven_day, cache, "seven_day"))
  );
  parts.push(renderContextSegment(data.context_window, cache));

  return sanitizeAscii(parts.join(` ${COLOR_DIM}|${COLOR_RESET} `));
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (e) {
    console.log(FALLBACK_LINE);
    return;
  }

  if (!raw || !raw.trim()) {
    console.log(FALLBACK_LINE);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log(FALLBACK_LINE);
    return;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.log(FALLBACK_LINE);
    return;
  }

  const cache = readCache();

  try {
    console.log(renderStatusLine(data, cache));
  } catch (e) {
    console.log(FALLBACK_LINE);
  }

  const rateLimits = data.rate_limits && typeof data.rate_limits === "object"
    ? data.rate_limits
    : {};
  const contextSize =
    data.context_window && typeof data.context_window === "object"
      ? data.context_window.context_window_size
      : null;
  writeCache(rateLimits, contextSize, cache);
}

main();
