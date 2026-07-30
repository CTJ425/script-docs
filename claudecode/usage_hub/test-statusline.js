#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const SCRIPT = path.join(__dirname, "statusline.js");
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "usage-hub-test-"));

// Default cache path for tests: a file that does not exist, so cache-unaware
// cases keep the plain "no data -> N/A" behaviour.
const NO_CACHE = path.join(TMP_DIR, "absent.json");

let cacheSeq = 0;
function freshCachePath() {
  cacheSeq++;
  return path.join(TMP_DIR, `cache-${cacheSeq}.json`);
}

function writeCacheFile(cachePath, contents) {
  fs.writeFileSync(cachePath, typeof contents === "string" ? contents : JSON.stringify(contents));
}

function run(stdin, cachePath) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: stdin === undefined ? "" : stdin,
    encoding: "utf8",
    timeout: 5000,
    env: Object.assign({}, process.env, {
      USAGE_HUB_CACHE: cachePath === undefined ? NO_CACHE : cachePath,
    }),
  });
  return result;
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function assertPureAscii(s, label) {
  const stripped = stripAnsi(s);
  for (const ch of stripped) {
    assert.ok(
      ch.codePointAt(0) < 128,
      `${label}: found non-ASCII char ${JSON.stringify(ch)} in ${JSON.stringify(stripped)}`
    );
  }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL: ${name}`);
    console.log(`   ${e.message}`);
  }
}

const nowSeconds = () => Math.round(Date.now() / 1000);

const validPayload = {
  model: { id: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
  rate_limits: {
    five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 },
    seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
  },
  context_window: { used_percentage: 78.0, context_window_size: 200000 },
};

test("exits 0 on valid payload", () => {
  const r = run(JSON.stringify(validPayload));
  assert.strictEqual(r.status, 0);
});

test("valid payload renders model, 5h, Wk, Ctx segments", () => {
  const r = run(JSON.stringify(validPayload));
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("Claude Sonnet 5"), `missing model in: ${out}`);
  assert.ok(out.includes("5h 45.0%"), `missing 5h pct in: ${out}`);
  assert.ok(out.includes("Wk 23.0%"), `missing weekly pct in: ${out}`);
  assert.ok(out.includes("Ctx 156K/200K"), `missing ctx tokens in: ${out}`);
});

test("no progress bar characters in output", () => {
  const r = run(JSON.stringify(validPayload));
  const out = stripAnsi(r.stdout);
  assert.ok(!out.includes("["), `found '[' in: ${out}`);
  assert.ok(!out.includes("]"), `found ']' in: ${out}`);
  assert.ok(!out.includes("="), `found '=' in: ${out}`);
});

test("valid payload keeps reset countdowns", () => {
  const r = run(JSON.stringify(validPayload));
  const out = stripAnsi(r.stdout);
  assert.ok(/5h 45\.0% \(2h\d\dm\)/.test(out), `missing 5h countdown in: ${out}`);
  assert.ok(/Wk 23\.0% \(3d0\dh\)/.test(out), `missing weekly countdown in: ${out}`);
});

test("valid payload output is pure ASCII (excluding ANSI codes)", () => {
  const r = run(JSON.stringify(validPayload));
  assertPureAscii(r.stdout, "valid payload");
});

test("empty stdin falls back gracefully, exit 0", () => {
  const r = run("");
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes("N/A"));
});

test("malformed JSON falls back gracefully, exit 0", () => {
  const r = run("{not valid json");
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes("N/A"));
});

test("non-object JSON (array) falls back gracefully", () => {
  const r = run("[1,2,3]");
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes("N/A"));
});

test("non-object JSON (string) falls back gracefully", () => {
  const r = run('"hello"');
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes("N/A"));
});

test("missing rate_limits with no cache renders N/A for both, exit 0", () => {
  const payload = { model: { display_name: "M" }, context_window: { used_percentage: 10, context_window_size: 200000 } };
  const r = run(JSON.stringify(payload), freshCachePath());
  assert.strictEqual(r.status, 0);
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h N/A"), `expected 5h N/A in: ${out}`);
  assert.ok(out.includes("Wk N/A"), `expected Wk N/A in: ${out}`);
});

test("missing context_window with no cache renders Ctx N/A, exit 0", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: nowSeconds() + 100 },
      seven_day: { used_percentage: 10, resets_at: nowSeconds() + 100 },
    },
  };
  const r = run(JSON.stringify(payload), freshCachePath());
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("Ctx N/A"));
});

test("missing model renders line without a leading model segment", () => {
  const payload = {
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: 0 },
      seven_day: { used_percentage: 10, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).startsWith("5h 10.0%"), `unexpected start: ${stripAnsi(r.stdout)}`);
});

test("context_window.used_percentage null (early session) treated as 0, not N/A", () => {
  const payload = {
    model: { display_name: "M" },
    context_window: { used_percentage: null, context_window_size: 200000 },
  };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("Ctx 0/200K"));
});

test("0% usage renders green", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 0, resets_at: 0 },
      seven_day: { used_percentage: 0, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.ok(r.stdout.includes(`5h ${"\x1b[1;32m"}0.0%`), `unexpected: ${JSON.stringify(r.stdout)}`);
});

test("100% usage renders red", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 100, resets_at: 0 },
      seven_day: { used_percentage: 100, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.ok(r.stdout.includes(`5h ${"\x1b[1;31m"}100.0%`), `unexpected: ${JSON.stringify(r.stdout)}`);
});

test("70% usage renders yellow", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 70, resets_at: 0 },
      seven_day: { used_percentage: 0, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.ok(r.stdout.includes(`5h ${"\x1b[1;33m"}70.0%`), `unexpected: ${JSON.stringify(r.stdout)}`);
});

test("negative percentage clamps to 0 instead of crashing", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: { five_hour: { used_percentage: -50, resets_at: 0 }, seven_day: { used_percentage: 0, resets_at: 0 } },
  };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("0.0%"));
});

test("percentage over 100 clamps to 100 instead of crashing", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: { five_hour: { used_percentage: 250, resets_at: 0 }, seven_day: { used_percentage: 0, resets_at: 0 } },
  };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("100.0%"));
});

test("NaN-ish percentage (string) with no cache renders N/A instead of crashing", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: { five_hour: { used_percentage: "not-a-number", resets_at: 0 }, seven_day: { used_percentage: 0, resets_at: 0 } },
  };
  const r = run(JSON.stringify(payload), freshCachePath());
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("5h N/A"), `unexpected: ${stripAnsi(r.stdout)}`);
});

test("long model name (40 chars) truncated to 20 chars", () => {
  const longName = "A".repeat(40);
  const payload = { model: { display_name: longName } };
  const r = run(JSON.stringify(payload));
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("A".repeat(20)), `expected 20 A's in: ${out}`);
  assert.ok(!out.includes("A".repeat(21)), `found 21+ A's in: ${out}`);
});

test("non-ASCII model name is stripped, output stays pure ASCII", () => {
  const payload = { model: { display_name: "Claude 中文 Model" } };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assertPureAscii(r.stdout, "non-ascii model name");
});

// --- cache behaviour ---------------------------------------------------------

test("valid payload writes the cache file with usage + context size", () => {
  const cachePath = freshCachePath();
  const r = run(JSON.stringify(validPayload), cachePath);
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(cachePath), "cache file was not created");

  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.strictEqual(cache.version, 1);
  assert.ok(Math.abs(cache.saved_at - nowSeconds()) < 10, `bad saved_at: ${cache.saved_at}`);
  assert.strictEqual(cache.rate_limits.five_hour.used_percentage, 45.0);
  assert.strictEqual(cache.rate_limits.five_hour.resets_at, validPayload.rate_limits.five_hour.resets_at);
  assert.strictEqual(cache.rate_limits.seven_day.used_percentage, 23.0);
  assert.strictEqual(cache.context_window_size, 200000);
});

test("cold start (no rate_limits) uses cached usage instead of N/A", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 60,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 },
      seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
    },
    context_window_size: 200000,
  });

  const payload = {
    model: { display_name: "Claude Sonnet 5" },
    context_window: { used_percentage: null, context_window_size: 200000 },
  };
  const r = run(JSON.stringify(payload), cachePath);
  assert.strictEqual(r.status, 0);
  const out = stripAnsi(r.stdout);
  assert.ok(!out.includes("N/A"), `expected no N/A in: ${out}`);
  assert.ok(/5h 45\.0% \(2h\d\dm\)/.test(out), `expected cached 5h in: ${out}`);
  assert.ok(/Wk 23\.0% \(3d0\dh\)/.test(out), `expected cached weekly in: ${out}`);
  assert.ok(out.includes("Ctx 0/200K"), `expected ctx in: ${out}`);
});

test("live payload values win over cached values", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 60,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 },
      seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
    },
    context_window_size: 200000,
  });

  const r = run(
    JSON.stringify({
      model: { display_name: "M" },
      rate_limits: {
        five_hour: { used_percentage: 88.0, resets_at: nowSeconds() + 600 },
        seven_day: { used_percentage: 91.0, resets_at: nowSeconds() + 600 },
      },
      context_window: { used_percentage: 10, context_window_size: 200000 },
    }),
    cachePath
  );
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h 88.0%"), `expected live 5h in: ${out}`);
  assert.ok(out.includes("Wk 91.0%"), `expected live weekly in: ${out}`);
  assert.ok(!out.includes("45.0%"), `cached value leaked into: ${out}`);
});

test("expired cached window renders 0.0% with no countdown", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 86400,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() - 3600 },
      seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
    },
    context_window_size: 200000,
  });

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h 0.0%"), `expected 5h 0.0% in: ${out}`);
  assert.ok(!/5h 0\.0% \(/.test(out), `expected no 5h countdown in: ${out}`);
  assert.ok(out.includes("Wk 23.0% (3d03h)"), `weekly should still show in: ${out}`);
});

test("cache written back-to-back (saved_at rounded into the future) is still used", () => {
  const cachePath = freshCachePath();
  // First run writes the cache; the second runs milliseconds later, when the
  // rounded saved_at can be slightly ahead of the reader's clock.
  const first = run(JSON.stringify(validPayload), cachePath);
  assert.strictEqual(first.status, 0);

  const second = run(
    JSON.stringify({ model: { display_name: "Claude Sonnet 5" } }),
    cachePath
  );
  const out = stripAnsi(second.stdout);
  assert.ok(out.includes("5h 45.0%"), `expected cached 5h in: ${out}`);
  assert.ok(out.includes("Ctx 156K/200K") || out.includes("Ctx 0/200K"), `expected ctx in: ${out}`);
});

test("cache far in the future (bad clock) is ignored -> N/A", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() + 86400,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 90000 },
    },
    context_window_size: 200000,
  });

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  assert.ok(stripAnsi(r.stdout).includes("5h N/A"), `unexpected: ${stripAnsi(r.stdout)}`);
});

test("cache older than 7 days is ignored -> N/A", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 8 * 86400,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 },
      seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
    },
    context_window_size: 200000,
  });

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h N/A"), `expected 5h N/A in: ${out}`);
  assert.ok(out.includes("Wk N/A"), `expected Wk N/A in: ${out}`);
  assert.ok(out.includes("Ctx N/A"), `expected Ctx N/A in: ${out}`);
});

test("corrupt cache file is ignored, exit 0", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, "{not json at all");

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("5h N/A"));
});

test("cache with unknown version is ignored", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 999,
    saved_at: nowSeconds(),
    rate_limits: { five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 } },
  });

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  assert.ok(stripAnsi(r.stdout).includes("5h N/A"));
});

test("unwritable cache path still renders and exits 0", () => {
  // ENOTDIR: /dev/null is not a directory, so both read and write fail.
  const r = run(JSON.stringify(validPayload), "/dev/null/cache.json");
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stderr, "");
  assert.ok(stripAnsi(r.stdout).includes("5h 45.0%"));
});

test("payload with only five_hour keeps the cached seven_day bucket", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 60,
    rate_limits: {
      five_hour: { used_percentage: 45.0, resets_at: nowSeconds() + 7800 },
      seven_day: { used_percentage: 23.0, resets_at: nowSeconds() + 271200 },
    },
    context_window_size: 200000,
  });

  const r = run(
    JSON.stringify({
      model: { display_name: "M" },
      rate_limits: { five_hour: { used_percentage: 60.0, resets_at: nowSeconds() + 3600 } },
    }),
    cachePath
  );
  assert.strictEqual(r.status, 0);

  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.strictEqual(cache.rate_limits.five_hour.used_percentage, 60.0);
  assert.strictEqual(cache.rate_limits.seven_day.used_percentage, 23.0);
  assert.strictEqual(cache.context_window_size, 200000);

  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h 60.0%"), `expected live 5h in: ${out}`);
  assert.ok(out.includes("Wk 23.0%"), `expected cached weekly in: ${out}`);
});

test("unchanged payload does not rewrite the cache file", () => {
  const cachePath = freshCachePath();
  const first = run(JSON.stringify(validPayload), cachePath);
  assert.strictEqual(first.status, 0);
  const firstStat = fs.statSync(cachePath);

  const second = run(JSON.stringify(validPayload), cachePath);
  assert.strictEqual(second.status, 0);
  const secondStat = fs.statSync(cachePath);

  assert.strictEqual(
    firstStat.mtimeMs,
    secondStat.mtimeMs,
    "cache file was rewritten despite identical usage values"
  );
});

test("cache dir is created when missing", () => {
  const nested = path.join(TMP_DIR, `nested-${Date.now()}`, "deep", "cache.json");
  const r = run(JSON.stringify(validPayload), nested);
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(nested), "nested cache file was not created");
});

test("an expired cache is never re-stamped as fresh by a later write", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 10 * 86400,
    rate_limits: {
      five_hour: { used_percentage: 85.0, resets_at: nowSeconds() + 3600 },
    },
    context_window_size: 200000,
  });

  // No live rate_limits, but a different context size -> the cache does get
  // rewritten. It must not carry the >7-day-old bucket into the new file.
  const payload = JSON.stringify({
    model: { display_name: "M" },
    context_window: { used_percentage: 10, context_window_size: 300000 },
  });

  const first = run(payload, cachePath);
  assert.ok(stripAnsi(first.stdout).includes("5h N/A"), `expected 5h N/A in: ${stripAnsi(first.stdout)}`);

  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.ok(
    !cache.rate_limits || !cache.rate_limits.five_hour,
    `expired bucket was laundered into a fresh cache: ${JSON.stringify(cache)}`
  );

  const second = run(payload, cachePath);
  assert.ok(
    stripAnsi(second.stdout).includes("5h N/A"),
    `expired usage resurfaced on the next render: ${stripAnsi(second.stdout)}`
  );
});

test("cached bucket without resets_at shows the usage, not a green 0.0%", () => {
  const cachePath = freshCachePath();
  writeCacheFile(cachePath, {
    version: 1,
    saved_at: nowSeconds() - 60,
    rate_limits: {
      five_hour: { used_percentage: 85.0, resets_at: null },
    },
    context_window_size: 200000,
  });

  const r = run(JSON.stringify({ model: { display_name: "M" } }), cachePath);
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h 85.0%"), `expected cached 5h 85.0% in: ${out}`);
  assert.ok(!out.includes("5h 0.0%"), `unknown reset time rendered as 0.0% in: ${out}`);
  assert.ok(!/5h 85\.0% \(/.test(out), `expected no countdown without resets_at in: ${out}`);
});

fs.rmSync(TMP_DIR, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
