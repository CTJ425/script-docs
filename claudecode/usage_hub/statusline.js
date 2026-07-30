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
 * Builds the cache contents to persist, merging live buckets over the previous
 * cache so a payload carrying only one bucket doesn't drop the other.
 * Returns null when there is nothing worth caching.
 */
function buildCacheContents(liveRateLimits, liveContextSize, previous) {
  const rateLimits = {};

  for (const key of BUCKET_KEYS) {
    const live = liveRateLimits[key];
    if (live && typeof live === "object" && isFiniteNumber(live.used_percentage)) {
      rateLimits[key] = {
        used_percentage: live.used_percentage,
        resets_at: isFiniteNumber(live.resets_at) ? live.resets_at : null,
      };
      continue;
    }
    const prev = cachedBucket(previous, key);
    if (prev) {
      rateLimits[key] = {
        used_percentage: prev.used_percentage,
        resets_at: isFiniteNumber(prev.resets_at) ? prev.resets_at : null,
      };
    }
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
    const next = buildCacheContents(liveRateLimits, liveContextSize, previous);
    if (!next) return;
    if (sameCachePayload(next, previous)) return;

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
    return { pct: livePct, resetsAt: liveBucket.resets_at };
  }

  if (!cacheIsFresh(cache)) return { pct: null, resetsAt: null };

  const bucket = cachedBucket(cache, key);
  if (!bucket) return { pct: null, resetsAt: null };

  // A cached window whose reset time has passed has rolled over: no usage has
  // accrued since (nothing ran), so show 0% and drop the misleading countdown.
  const expired =
    !isFiniteNumber(bucket.resets_at) || bucket.resets_at <= Date.now() / 1000;
  if (expired) return { pct: 0, resetsAt: null };

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
