// Shared loader: normalizes Jest and Playwright JSON into one list of test results.
const fs = require('fs');
const path = require('path');

const RESULTS = path.join(__dirname, '..', 'results');
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const reqTags = (title) => [...new Set((title.match(/REQ-[A-Z0-9]+-\d+/g) || []))];
const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');

function loadJest() {
  const j = readJson(path.join(RESULTS, 'jest.json'));
  if (!j) return [];
  const out = [];
  for (const file of j.testResults) {
    const layer = (file.name.match(/tests[\\/](unit|api|contract)[\\/]/) || [])[1] || 'unit';
    for (const a of file.assertionResults) {
      out.push({
        layer, project: 'node', file: path.relative(path.join(__dirname, '..'), file.name),
        title: a.fullName, reqs: reqTags(a.title), status: a.status === 'passed' ? 'passed' : a.status === 'pending' ? 'skipped' : 'failed',
        flaky: false, ms: a.duration || 0, error: stripAnsi((a.failureMessages || []).join('\n')).split('\n').slice(0, 6).join('\n')
      });
    }
  }
  return out;
}

function loadPlaywright() {
  const j = readJson(path.join(RESULTS, 'e2e.json'));
  if (!j) return [];
  const out = [];
  const walk = (suite, trail) => {
    for (const s of suite.suites || []) walk(s, s.title && !s.title.endsWith('.js') ? [...trail, s.title] : trail);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests) {
        const last = t.results[t.results.length - 1] || {};
        const status = t.status === 'skipped' ? 'skipped' : (t.status === 'expected' || t.status === 'flaky') ? 'passed' : 'failed';
        out.push({
          layer: 'e2e', project: t.projectName, file: 'tests/' + spec.file,
          title: [...trail, spec.title].join(' › '), reqs: reqTags(spec.title), status,
          flaky: t.status === 'flaky', ms: t.results.reduce((n, r) => n + (r.duration || 0), 0),
          error: stripAnsi((last.error && last.error.message) || '').split('\n').slice(0, 6).join('\n')
        });
      }
    }
  };
  walk(j, []);
  return out;
}

const loadAll = () => [...loadJest(), ...loadPlaywright()];

module.exports = { loadAll, RESULTS, readJson };
