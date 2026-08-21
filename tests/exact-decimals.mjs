#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Metric Precision Display Test
// ═══════════════════════════════════════════════════════════════
//
// Simulation metric values are exact decimals. One that needs more significant digits than an
// IEEE-754 double holds is kept as a preserved number (lossless-json's LosslessNumber) rather
// than rounded, and a preserved number is not a `number`: `toFixed()` does not exist on it, and
// a relational operator converts it first, which rounds and throws when the exponent is out of
// a double's range.
//
// This suite drives the built CLI against a stub HTTP server whose responses carry such
// literals, and asserts the rendered table and the JSON output reproduce every digit.
//
// Prerequisites:
//   pnpm build
//
// Usage:
//   node tests/exact-decimals.mjs
//
// No network, no API key, no engine — the stub listens on 127.0.0.1.
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const GREEN = '\x1b[0;32m';
const RED = '\x1b[0;31m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  ${GREEN}PASS${NC} ${name}`);
  } else {
    fail += 1;
    console.log(`  ${RED}FAIL${NC} ${name}`);
    if (detail) console.log(`       ${RED}→ ${detail}${NC}`);
  }
}

// ── Fixtures ───────────────────────────────────────────────────
// Written as text, not objects: an object literal would round these before they ever reach the
// wire, which is the very thing under test.

// A quotient with no terminating decimal expansion, at the precision the engine computes.
const AVG_BASELINE = '3.333333333333333333333333333333333';
const AVG_SIMULATED = '4.666666666666666666666666666666667';
const AVG_DELTA = '1.333333333333333333333333333333334';
const NEGATIVE_DELTA = '-1428571428.571428571428571428571429';
const RULE_METRIC = '12345678901234567890123456789012.5';
// Beyond a double's range entirely: converting this one throws rather than rounding.
const OVERFLOW_DELTA = '1e400';

const envelope = (data) => `{"result":"SUCCESS","data":${data},"meta":null,"errorCode":null,"message":null}`;

const detail = ({ delta, metricValueDelta, ruleMetric }) => envelope(`{
  "simulationId": "sim-precision",
  "policyGroupId": "grp-1",
  "policyGroupName": "Payouts",
  "targetVersionName": "v3",
  "baselineVersionName": "v2",
  "status": "COMPLETED",
  "progress": 100,
  "summary": {
    "totalRecords": 1200,
    "processedRecords": 1200,
    "errorRecords": 0,
    "matchedRecords": 814,
    "executionTimeMs": 4821,
    "matchRate": 67.8333
  },
  "metricSummary": {
    "targetVariable": "payout_amount",
    "aggregationType": "AVG",
    "baselineValue": ${AVG_BASELINE},
    "simulatedValue": ${AVG_SIMULATED},
    "delta": ${delta},
    "deltaPercentage": 40.0001
  },
  "policyImpact": {
    "policyVersionId": "ver-3",
    "comparison": {
      "baselineVersionId": "ver-2",
      "difference": {
        "matchedCountDelta": 37,
        "matchedRateDelta": 3.0833,
        "metricValueDelta": ${metricValueDelta}
      }
    }
  },
  "ruleStats": [
    { "ruleId": "r-1", "ruleName": "High tier bonus", "matchedCount": 814, "metricValue": ${ruleMetric} }
  ],
  "sampleErrors": [],
  "note": null,
  "createdAt": "2026-01-05T10:00:00Z",
  "completedAt": "2026-01-05T10:04:48Z"
}`);

const FIXTURES = {
  'long-decimals': detail({
    delta: AVG_DELTA,
    metricValueDelta: NEGATIVE_DELTA,
    ruleMetric: RULE_METRIC,
  }),
  'zero-delta': detail({ delta: '0', metricValueDelta: '0.0', ruleMetric: '0' }),
  overflow: detail({
    delta: OVERFLOW_DELTA,
    metricValueDelta: OVERFLOW_DELTA,
    ruleMetric: OVERFLOW_DELTA,
  }),
};

// ── Stub server ────────────────────────────────────────────────

const server = createServer((req, res) => {
  const id = decodeURIComponent((req.url ?? '').split('?')[0].split('/').pop() ?? '');
  const body = FIXTURES[id];
  if (!body) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"result":"ERROR","data":null,"errorCode":"NOT_FOUND","message":"no fixture"}');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/`;

// Async on purpose: the stub server runs in this process, so a blocking spawn would
// deadlock — the child's request could never be answered.
function run(id, format) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [CLI, '--format', format, '--api-key', 'test-key', '--base-url', baseUrl,
       'analytics', 'simulation', 'status', '--id', id],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// ── Tests ──────────────────────────────────────────────────────

if (!existsSync(CLI)) {
  console.error(`ERROR: ${CLI} not found — run "pnpm build" first.`);
  server.close();
  process.exit(1);
}

console.log(`\n  ${DIM}stub: ${baseUrl}${NC}\n`);

// 1. Table output keeps every digit of a value a double cannot hold.
{
  const r = await run('long-decimals', 'table');
  const out = r.stdout ?? '';
  check('table: exits 0', r.status === 0, `status ${r.status} — ${r.stderr?.trim()}`);
  check('table: baseline digits intact', out.includes(AVG_BASELINE), out);
  check('table: simulated digits intact', out.includes(AVG_SIMULATED), out);
  check('table: positive delta keeps its + and its digits', out.includes(`+${AVG_DELTA}`), out);
  check(
    'table: negative metric delta prints one sign, not "+-"',
    out.includes(`Metric Δ:   ${NEGATIVE_DELTA}`) && !out.includes('+-'),
    out,
  );
  check('table: rule metric digits intact', out.includes(RULE_METRIC), out);
  check(
    'table: no preserved number leaked as an object',
    !out.includes('[object Object]') && !out.includes('isLosslessNumber'),
    out,
  );
  // Ratios stay plain doubles and keep their fixed-decimal formatting.
  check('table: match rate still formatted to 1 decimal', out.includes('67.8%'), out);
  check('table: change still formatted to 1 decimal', out.includes('+40.0%'), out);
  check('table: rate delta still formatted to 1 decimal', out.includes('+3.1%'), out);
}

// 2. Zero gets no '+', exactly as a plain number would.
{
  const r = await run('zero-delta', 'table');
  const out = r.stdout ?? '';
  check('zero: exits 0', r.status === 0, `status ${r.status} — ${r.stderr?.trim()}`);
  check('zero: delta has no + prefix', /Delta: +0\b/.test(out), out);
  check('zero: metric delta has no + prefix', /Metric Δ: +0\b/.test(out), out);
}

// 3. A magnitude outside a double's range must render, not throw.
{
  const r = await run('overflow', 'table');
  const out = r.stdout ?? '';
  check('overflow: exits 0', r.status === 0, `status ${r.status} — ${r.stderr?.trim()}`);
  check('overflow: renders the literal with a + prefix', out.includes(`+${OVERFLOW_DELTA}`), out);
}

// 4. Default JSON output round-trips the literals unchanged.
{
  const r = await run('long-decimals', 'json');
  const out = r.stdout ?? '';
  check('json: exits 0', r.status === 0, `status ${r.status} — ${r.stderr?.trim()}`);
  check('json: digits survive the round trip', out.includes(AVG_BASELINE), out);
  check(
    'json: preserved numbers are written as number literals',
    !out.includes('isLosslessNumber'),
    out,
  );
}

server.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
