#!/usr/bin/env node
// Release quality gate: turns raw test results into a business decision (SHIP / BLOCK)
// based on requirement priority, coverage, pass rate and flakiness. Writes results/dashboard.html.
const fs = require('fs');
const path = require('path');
const { loadAll, RESULTS, readJson } = require('./results');

const root = path.join(__dirname, '..');
const policy = readJson(path.join(root, 'gate.json'));
const requirements = readJson(path.join(root, 'requirements.json'));
const today = new Date().toISOString().slice(0, 10);
const exceptions = (readJson(path.join(root, 'exceptions.json')) || []).filter((e) => e.expires >= today);
const triage = readJson(path.join(RESULTS, 'triage.json')) || { clusters: [] };
const tests = loadAll();

if (!tests.length) { console.error('No test results found in results/. Run the test suites first.'); process.exit(2); }

const counted = tests.filter((t) => t.status !== 'skipped');
const passed = counted.filter((t) => t.status === 'passed').length;
const passRate = Math.round((passed / counted.length) * 1000) / 10;
const flaky = tests.filter((t) => t.flaky);
const e2eMinutes = tests.filter((t) => t.layer === 'e2e').reduce((n, t) => n + t.ms, 0) / 60000;

const reqRows = requirements.map((r) => {
  const mine = counted.filter((t) => t.reqs.includes(r.id));
  const failing = mine.filter((t) => t.status === 'failed');
  const waived = r.priority !== 'P1' && exceptions.find((e) => e.requirement === r.id);
  const status = !mine.length ? 'UNTESTED' : failing.length ? (waived ? 'WAIVED' : 'FAILING') : 'PASSING';
  return { ...r, tests: mine.length, failing: failing.length, layers: [...new Set(mine.map((t) => t.layer))], status, waiver: waived || null };
});

const reasons = [];
const p1Failing = reqRows.filter((r) => r.priority === 'P1' && r.status === 'FAILING');
const p1Untested = reqRows.filter((r) => r.priority === 'P1' && r.status === 'UNTESTED');
const p2Failing = reqRows.filter((r) => r.priority !== 'P1' && r.status === 'FAILING');
if (policy.blockOnP1Failure && p1Failing.length) reasons.push(`P1 guest journey failing: ${p1Failing.map((r) => `${r.id} (${r.title})`).join('; ')}`);
if (policy.requireP1Coverage && p1Untested.length) reasons.push(`P1 requirement with no test: ${p1Untested.map((r) => r.id).join(', ')}`);
if (p2Failing.length) reasons.push(`P2 requirement failing without an approved exception: ${p2Failing.map((r) => r.id).join(', ')}`);
if (passRate < policy.minOverallPassRate) reasons.push(`Pass rate ${passRate}% is below ${policy.minOverallPassRate}%`);
if (flaky.length > policy.maxFlakyTests) reasons.push(`${flaky.length} flaky tests exceed the limit of ${policy.maxFlakyTests}`);
if (e2eMinutes > policy.maxE2eMinutes) reasons.push(`E2E suite took ${e2eMinutes.toFixed(1)} min, budget is ${policy.maxE2eMinutes}`);

const decision = reasons.length ? 'BLOCK' : 'SHIP';
const layers = ['unit', 'api', 'contract', 'e2e'].map((l) => {
  const ts = counted.filter((t) => t.layer === l);
  return { layer: l, total: ts.length, passed: ts.filter((t) => t.status === 'passed').length, seconds: ts.reduce((n, t) => n + t.ms, 0) / 1000 };
});
const p1 = reqRows.filter((r) => r.priority === 'P1');
const summary = {
  decision, reasons, generatedAt: new Date().toISOString(), demoBug: process.env.DEMO_BUG || null,
  kpis: {
    passRate, tests: counted.length, flaky: flaky.length,
    p1JourneysPassing: `${p1.filter((r) => r.status === 'PASSING').length}/${p1.length}`,
    requirementCoverage: `${reqRows.filter((r) => r.status !== 'UNTESTED').length}/${reqRows.length}`,
    e2eMinutes: Math.round(e2eMinutes * 100) / 100
  },
  layers, requirements: reqRows
};
fs.writeFileSync(path.join(RESULTS, 'gate.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(RESULTS, 'dashboard.html'), render(summary, triage, tests));

console.log(`\nRELEASE GATE: ${decision}`);
console.log(`  pass rate ${passRate}% · P1 journeys ${summary.kpis.p1JourneysPassing} · coverage ${summary.kpis.requirementCoverage} · flaky ${flaky.length}`);
reasons.forEach((r) => console.log('  - ' + r));
console.log('  dashboard: results/dashboard.html');
process.exit(decision === 'SHIP' ? 0 : 1);

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

function render(s, tri, all) {
  const ok = s.decision === 'SHIP';
  const badge = (st) => `<span class="pill ${st.toLowerCase()}">${st}</span>`;
  const kpi = (label, value, sub = '') => `<div class="kpi"><div class="kv">${esc(value)}</div><div class="kl">${esc(label)}</div>${sub ? `<div class="ks">${esc(sub)}</div>` : ''}</div>`;
  const reqTable = s.requirements.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.journey)}</td><td>${r.priority}</td><td>${r.layers.join(', ') || '—'}</td><td class="num">${r.tests}</td><td>${badge(r.status)}</td></tr>`).join('');
  const layerBars = s.layers.map((l) => `<tr><td>${l.layer}</td><td class="num">${l.passed}/${l.total}</td><td class="num">${l.seconds.toFixed(1)}s</td><td><div class="bar"><span style="width:${l.total ? (l.passed / l.total) * 100 : 0}%"></span></div></td></tr>`).join('');
  const clusters = tri.clusters.length ? tri.clusters.map((c) => `<div class="cluster"><div><strong>${esc(c.component)}</strong> · ${c.count} failing test(s) · ${esc(c.reqs.join(', '))}</div><div class="hyp">${esc(c.hypothesis)}${c.nextStep ? `<br><em>Next:</em> ${esc(c.nextStep)}` : ''}</div><div class="src">${esc(c.source)}${c.confidence ? ' · confidence ' + esc(c.confidence) : ''}</div><details><summary>Tests and error</summary><ul>${c.tests.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><pre>${esc(c.sample)}</pre></details></div>`).join('') : '<p class="muted">No failures to triage.</p>';
  const failing = all.filter((t) => t.status === 'failed');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Release Quality Gate</title>
<style>
:root{--bg:#f7f6f2;--card:#fff;--ink:#1d1d1f;--mut:#5f6368;--line:#e4e2dc;--good:#1b7f4a;--bad:#b3261e;--warn:#9a6700;--accent:#13627c}
@media (prefers-color-scheme:dark){:root{--bg:#141517;--card:#1d1f22;--ink:#ececec;--mut:#a0a4a8;--line:#2e3135;--good:#4cc38a;--bad:#f2867d;--warn:#e3b341;--accent:#5fb3cf}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:28px 0 10px}
.hero{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-left:6px solid ${ok ? 'var(--good)' : 'var(--bad)'};border-radius:12px;padding:18px 20px}
.decision{font-size:34px;font-weight:800;color:${ok ? 'var(--good)' : 'var(--bad)'};letter-spacing:.5px}
.muted{color:var(--mut)}.reasons{margin:8px 0 0;padding-left:18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kv{font-size:24px;font-weight:700}.kl{color:var(--mut);font-size:13px}.ks{font-size:12px;color:var(--mut)}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px}.passing{color:var(--good);background:color-mix(in srgb,var(--good) 14%,transparent)}.failing{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}.untested,.waived{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}
.bar{height:8px;background:var(--line);border-radius:4px;min-width:120px}.bar span{display:block;height:100%;background:var(--accent);border-radius:4px}
.cluster{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px}.hyp{margin:6px 0}.src{font-size:12px;color:var(--mut)}pre{white-space:pre-wrap;font-size:12px;background:var(--bg);padding:8px;border-radius:6px}
footer{margin-top:28px;font-size:12px;color:var(--mut)}
</style></head><body><main>
<div class="hero"><div><h1>Release Quality Gate · Cruise booking</h1><div class="muted">${esc(s.generatedAt)}${s.demoBug ? ' · injected defect: <code>' + esc(s.demoBug) + '</code>' : ''}</div>
${s.reasons.length ? `<ul class="reasons">${s.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:8px 0 0">All P1 guest journeys pass; every requirement is covered.</p>'}</div>
<div class="decision">${s.decision}</div></div>
<div class="kpis">${kpi('P1 guest journeys passing', s.kpis.p1JourneysPassing)}${kpi('Pass rate', s.kpis.passRate + '%', s.kpis.tests + ' tests')}${kpi('Requirement coverage', s.kpis.requirementCoverage)}${kpi('Flaky tests', s.kpis.flaky)}${kpi('E2E run time', s.kpis.e2eMinutes + ' min')}${kpi('Failing tests', failing.length)}</div>
<h2>AI-assisted failure triage</h2>${clusters}
<h2>Requirement traceability</h2><div class="wrap"><table><thead><tr><th>ID</th><th>Requirement</th><th>Journey</th><th>Priority</th><th>Layers</th><th class="num">Tests</th><th>Status</th></tr></thead><tbody>${reqTable}</tbody></table></div>
<h2>Test pyramid</h2><div class="wrap"><table><thead><tr><th>Layer</th><th class="num">Passed</th><th class="num">Time</th><th>Pass share</th></tr></thead><tbody>${layerBars}</tbody></table></div>
<footer>Policy: gate.json · Exceptions: exceptions.json · Demo app with fictional data; not affiliated with any cruise line.</footer>
</main></body></html>`;
}
