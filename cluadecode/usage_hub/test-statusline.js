#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const SCRIPT = path.join(__dirname, "statusline.js");

function run(stdin) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: stdin === undefined ? "" : stdin,
    encoding: "utf8",
    timeout: 5000,
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

const validPayload = {
  model: { id: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
  rate_limits: {
    five_hour: { used_percentage: 45.0, resets_at: Date.now() / 1000 + 7800 },
    seven_day: { used_percentage: 23.0, resets_at: Date.now() / 1000 + 271200 },
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
  assert.ok(out.includes("5h ["), `missing 5h bar in: ${out}`);
  assert.ok(out.includes("45.0%"), `missing 5h pct in: ${out}`);
  assert.ok(out.includes("Wk ["), `missing weekly bar in: ${out}`);
  assert.ok(out.includes("23.0%"), `missing weekly pct in: ${out}`);
  assert.ok(out.includes("Ctx 156K/200K"), `missing ctx tokens in: ${out}`);
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

test("missing rate_limits renders N/A for both bars, exit 0", () => {
  const payload = { model: { display_name: "M" }, context_window: { used_percentage: 10, context_window_size: 200000 } };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  const out = stripAnsi(r.stdout);
  assert.ok(out.includes("5h [........] N/A"));
  assert.ok(out.includes("Wk [........] N/A"));
});

test("missing context_window renders Ctx N/A, exit 0", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 10, resets_at: Date.now() / 1000 + 100 },
      seven_day: { used_percentage: 10, resets_at: Date.now() / 1000 + 100 },
    },
  };
  const r = run(JSON.stringify(payload));
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
  assert.ok(stripAnsi(r.stdout).startsWith("5h ["));
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

test("0% usage renders green, empty bar", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 0, resets_at: 0 },
      seven_day: { used_percentage: 0, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.ok(r.stdout.includes(`5h ${"\x1b[1;32m"}[........]`));
});

test("100% usage renders red, full bar", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: {
      five_hour: { used_percentage: 100, resets_at: 0 },
      seven_day: { used_percentage: 100, resets_at: 0 },
    },
  };
  const r = run(JSON.stringify(payload));
  assert.ok(r.stdout.includes(`5h ${"\x1b[1;31m"}[========]`));
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

test("NaN-ish percentage (string) renders N/A instead of crashing", () => {
  const payload = {
    model: { display_name: "M" },
    rate_limits: { five_hour: { used_percentage: "not-a-number", resets_at: 0 }, seven_day: { used_percentage: 0, resets_at: 0 } },
  };
  const r = run(JSON.stringify(payload));
  assert.strictEqual(r.status, 0);
  assert.ok(stripAnsi(r.stdout).includes("5h [........] N/A"));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
