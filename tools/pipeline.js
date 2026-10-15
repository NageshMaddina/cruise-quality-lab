#!/usr/bin/env node
// Cross-platform pipeline runner (Windows, macOS, Linux). Same stages as run_pipeline.sh:
//   fast checks -> E2E journeys -> AI triage -> release gate
// Usage: npm run demo                      (clean build -> SHIP)
//        npm run demo -- promo_stack       (inject a defect -> BLOCK)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bug = process.argv[2] || process.env.DEMO_BUG || '';
const env = { ...process.env, DEMO_BUG: bug };
const results = path.join(root, 'results');
fs.rmSync(results, { recursive: true, force: true });
fs.mkdirSync(results, { recursive: true });

const run = (label, cmd, args, quiet) => {
  console.log(`\n== ${label} ==`);
  const r = spawnSync(cmd, args, { cwd: root, env, shell: process.platform === 'win32', encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  if (quiet) {
    const out = (r.stdout || '') + (r.stderr || '');
    out.split('\n').filter((l) => quiet.test(l)).slice(-6).forEach((l) => console.log(l));
  }
  return r.status;
};

if (bug) console.log(`Injected defect: ${bug}`);
run('Stage 1: fast checks (unit, API, contract)', 'npx', ['jest', '--json', '--outputFile=results/jest.json'], /Tests:|✕/);
run('Stage 2: E2E guest journeys (desktop + mobile, accessibility)', 'npx', ['playwright', 'test'], /\d+ (passed|failed|flaky)/);
run('Stage 3: AI-assisted failure triage', 'node', ['tools/triage.js']);
const status = run('Stage 4: release gate', 'node', ['tools/gate.js']);
console.log('\nOpen results/dashboard.html for the full report.');
process.exit(status);
