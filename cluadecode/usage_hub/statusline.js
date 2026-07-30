#!/usr/bin/env node
"use strict";

/**
 * Claude Code Usage HUD statusline.
 * Reads the statusLine hook JSON payload from stdin and prints one ASCII line:
 *   <model> | 5h [bar] pct% (reset) | Wk [bar] pct% (reset) | Ctx used/max
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
 * Any field that is missing/malformed renders as "N/A" for that segment only.
 * Any top-level failure (bad JSON, non-object, empty stdin) prints a static
 * fallback line and exits 0 -- this must never throw or hang Claude Code.
 */

const COLOR_RESET = "\x1b[0m";
const COLOR_GREEN = "\x1b[1;32m";
const COLOR_YELLOW = "\x1b[1;33m";
const COLOR_RED = "\x1b[1;31m";
const COLOR_DIM = "\x1b[2m";
const COLOR_CYAN = "\x1b[1;36m";

const BAR_LENGTH = 8;
const FALLBACK_LINE =
  `${COLOR_DIM}5h [........] N/A | Wk [........] N/A | Ctx N/A${COLOR_RESET}`;

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

function makeBar(pct) {
  const filled = Math.max(0, Math.min(BAR_LENGTH, Math.round((pct / 100) * BAR_LENGTH)));
  return "[" + "=".repeat(filled) + ".".repeat(BAR_LENGTH - filled) + "]";
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

function renderRateLimitSegment(label, bucket) {
  const pct = bucket ? clampPercent(bucket.used_percentage) : null;

  if (pct === null) {
    return `${label} ${COLOR_DIM}[........] N/A${COLOR_RESET}`;
  }

  const bar = makeBar(pct);
  const color = colorFor(pct);
  const countdown = formatCountdown(bucket.resets_at);
  const resetPart = countdown ? ` ${COLOR_DIM}(${countdown})${COLOR_RESET}` : "";

  return `${label} ${color}${bar} ${pct.toFixed(1)}%${COLOR_RESET}${resetPart}`;
}

function formatTokenCount(n) {
  if (!isFiniteNumber(n)) return null;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

function renderContextSegment(contextWindow) {
  if (!contextWindow || typeof contextWindow !== "object") {
    return `Ctx ${COLOR_DIM}N/A${COLOR_RESET}`;
  }

  const max = isFiniteNumber(contextWindow.context_window_size)
    ? contextWindow.context_window_size
    : null;

  if (max === null) {
    return `Ctx ${COLOR_DIM}N/A${COLOR_RESET}`;
  }

  // used_percentage may be null early in a session (no usage yet) -> treat as 0.
  const pct = isFiniteNumber(contextWindow.used_percentage)
    ? clampPercent(contextWindow.used_percentage)
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

function renderStatusLine(data) {
  const parts = [];

  const modelPart = renderModelSegment(data);
  if (modelPart) parts.push(modelPart);

  const rateLimits = data.rate_limits && typeof data.rate_limits === "object"
    ? data.rate_limits
    : {};

  parts.push(renderRateLimitSegment("5h", rateLimits.five_hour));
  parts.push(renderRateLimitSegment("Wk", rateLimits.seven_day));
  parts.push(renderContextSegment(data.context_window));

  return sanitizeAscii(parts.join(` ${COLOR_DIM}|${COLOR_RESET} `));
}

function main() {
  let raw = "";
  try {
    raw = require("fs").readFileSync(0, "utf8");
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

  try {
    console.log(renderStatusLine(data));
  } catch (e) {
    console.log(FALLBACK_LINE);
  }
}

main();
