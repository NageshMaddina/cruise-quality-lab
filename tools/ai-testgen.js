#!/usr/bin/env node
// AI test generation with guardrails.
//  1. Claude drafts candidate API test cases from a requirement's acceptance criteria
//     (offline: rule-based boundary cases, so the demo runs without a key).
//  2. Every candidate is VALIDATED automatically: schema check, duplicate check, then executed
//     against the running service.
//  3. Results land in ai-generated/ as a review queue. Nothing is merged into the suite
//     without a human approving it — AI proposes, engineers decide.
// Usage: node tools/ai-testgen.js [REQ-ID ...]   (default: REQ-PRICE-01 REQ-PROMO-02)
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');
const ai = require('./ai');

const root = path.join(__dirname, '..');
const requirements = JSON.parse(fs.readFileSync(path.join(root, 'requirements.json'), 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['REQ-PRICE-01', 'REQ-PROMO-02'];

const API_DOC = `POST /api/quote {cruiseId, cabinType: interior|oceanview|balcony|suite, guests: 1-4 integer, promoCode?}
 -> 200 {fare, discount, taxes, portFees, total, ...} | 400 {error:{code,message}} | 404 unknown cruise | 409 SOLD_OUT
Cruises: CQL-101 Caribbean baseFare 899 (all cabins), CQL-102 baseFare 1299 (no suites), CQL-201 Alaska 1099.
Cabin multipliers: interior 1.0, oceanview 1.25, balcony 1.6, suite 2.75. Tax 12% of (fare - discount). Port fee $135/guest.
Promos: SAIL10 10% off fare; WAVE200 $200 off, min 2 guests; FALL25 expired.`;

const isCandidate = (c) => c && typeof c.title === 'string' && c.request && c.request.method && c.request.path &&
  c.expect && Number.isInteger(c.expect.status);

function offlineCandidates(req) {
  // Rule-based fallback: boundary and equivalence-class cases for the pricing service.
  const q = (title, body, status, fields) => ({ title, request: { method: 'POST', path: '/api/quote', body }, expect: { status, fields } });
  const fare = (mult, g, base = 899) => Math.round(base * mult * g * 100) / 100;
  if (req.id === 'REQ-PROMO-02') return [
    q('WAVE200 with 2 guests takes $200 off', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 2, promoCode: 'WAVE200' }, 200, { discount: 200 }),
    q('WAVE200 with 4 guests still takes exactly $200', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 4, promoCode: 'WAVE200' }, 200, { discount: 200 }),
    q('WAVE200 with 1 guest is rejected', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 1, promoCode: 'WAVE200' }, 400, {}),
    q('Lower-case wave200 is accepted', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 2, promoCode: 'wave200' }, 200, { discount: 200 }),
    q('WAVE200 with 2 guests (duplicate)', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 2, promoCode: 'WAVE200' }, 200, { discount: 200 })
  ];
  return [
    q('Minimum guests: 1 guest interior', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 1 }, 200, { fare: fare(1, 1), total: fare(1, 1) * 1.12 + 135 }),
    q('Maximum guests: 4 guests suite', { cruiseId: 'CQL-101', cabinType: 'suite', guests: 4 }, 200, { fare: fare(2.75, 4) }),
    q('Above maximum: 5 guests rejected', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 5 }, 400, {}),
    q('Zero guests rejected', { cruiseId: 'CQL-101', cabinType: 'interior', guests: 0 }, 400, {}),
    q('Unknown cabin type rejected', { cruiseId: 'CQL-101', cabinType: 'penthouse', guests: 2 }, 400, {}),
    q('Unknown cruise returns 404', { cruiseId: 'CQL-999', cabinType: 'interior', guests: 2 }, 404, {}),
    q('Oceanview 3 guests on Alaska sailing', { cruiseId: 'CQL-201', cabinType: 'oceanview', guests: 3 }, 200, { fare: fare(1.25, 3, 1099) })
  ];
}

async function generate(req) {
  if (!ai.enabled()) return { source: 'offline rules', cases: offlineCandidates(req) };
  const cases = await ai.askJson(
    'You are a senior SDET writing API test cases for a cruise booking pricing service. Reply with a JSON array only.',
    `Requirement ${req.id} (${req.priority}): ${req.title}\nAcceptance criteria: ${req.acceptance}\n\nAPI:\n${API_DOC}\n\n` +
    'Write 6-8 test cases covering happy path, boundaries and negative cases. Each item: ' +
    '{"title": string, "request": {"method": "POST", "path": "/api/quote", "body": {...}}, "expect": {"status": number, "fields": {<response field>: <exact expected number>}}}. ' +
    'Only include fields you can compute exactly from the rules above, rounded to 2 decimals.', 3000);
  return { source: `Claude (${ai.MODEL})`, cases };
}

async function validate(cases) {
  const app = createApp();
  const seen = new Set();
  const out = [];
  for (const c of cases) {
    if (!isCandidate(c)) { out.push({ ...c, verdict: 'REJECTED', why: 'does not match the test-case schema' }); continue; }
    const key = JSON.stringify([c.request.method, c.request.path, c.request.body]);
    if (seen.has(key)) { out.push({ ...c, verdict: 'DUPLICATE', why: 'same request as an earlier case' }); continue; }
    seen.add(key);
    const res = await request(app)[c.request.method.toLowerCase()](c.request.path).send(c.request.body || {});
    const mismatches = [];
    if (res.status !== c.expect.status) mismatches.push(`status ${res.status} != expected ${c.expect.status}`);
    for (const [k, v] of Object.entries(c.expect.fields || {})) {
      if (typeof v === 'number' ? Math.abs(Number(res.body[k]) - v) > 0.011 : res.body[k] !== v) mismatches.push(`${k} ${res.body[k]} != expected ${v}`);
    }
    out.push({ ...c, verdict: mismatches.length ? 'NEEDS REVIEW' : 'READY FOR REVIEW', why: mismatches.join('; ') || 'passes against the service' });
  }
  return out;
}

(async () => {
  fs.mkdirSync(path.join(root, 'ai-generated'), { recursive: true });
  for (const id of ids) {
    const req = requirements.find((r) => r.id === id);
    if (!req) { console.error(`Unknown requirement ${id}`); continue; }
    let gen;
    try { gen = await generate(req); } catch (e) { console.warn('AI unavailable, using rules:', e.message); gen = { source: 'offline rules', cases: offlineCandidates(req) }; }
    const results = await validate(gen.cases);
    const tally = results.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
    fs.writeFileSync(path.join(root, 'ai-generated', `${id}.candidates.json`), JSON.stringify({ requirement: req, generatedBy: gen.source, generatedAt: new Date().toISOString(), status: 'PENDING HUMAN REVIEW', tally, cases: results }, null, 2));
    console.log(`\n${id} — ${req.title}  [generated by ${gen.source}]`);
    results.forEach((r) => console.log(`  ${r.verdict.padEnd(16)} ${r.title}${r.verdict === 'READY FOR REVIEW' ? '' : '  → ' + r.why}`));
    console.log(`  summary: ${Object.entries(tally).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}  → ai-generated/${id}.candidates.json`);
  }
})();
