#!/usr/bin/env node
// Risk-based regression selection: from the files a change touches, pick the requirements at risk
// and the smallest test set that covers them. P1 journeys touched by a change always run end to end.
// Usage: node tools/risk-select.js [changed files...]   (default: git diff against HEAD~1)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const requirements = JSON.parse(fs.readFileSync(path.join(root, 'requirements.json'), 'utf8'));

// Which journeys each source area can affect. In a real org this map is generated from
// code ownership + coverage data and tuned with historical failure rates.
const IMPACT = [
  { match: /src\/pricing\.js|src\/data\.js/, journeys: ['pricing', 'inventory', 'checkout'] },
  { match: /src\/payment\.js/, journeys: ['checkout'] },
  { match: /src\/graphql\.js/, journeys: ['platform'] },
  { match: /src\/app\.js/, journeys: ['search', 'pricing', 'checkout', 'platform'] },
  { match: /public\//, journeys: ['experience', 'search', 'checkout'] },
  { match: /tests\/contract\//, journeys: ['platform'] }
];

let changed = process.argv.slice(2);
if (!changed.length) {
  try { changed = execSync('git diff --name-only HEAD~1', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { changed = []; }
}

const journeys = new Set();
for (const f of changed) IMPACT.filter((i) => i.match.test(f)).forEach((i) => i.journeys.forEach((j) => journeys.add(j)));
const atRisk = requirements.filter((r) => journeys.has(r.journey));
const runAll = !changed.length || changed.some((f) => /package(-lock)?\.json|playwright\.config|gate\.json/.test(f));
const p1AtRisk = atRisk.filter((r) => r.priority === 'P1');
const grep = atRisk.map((r) => r.id).join('|');

const plan = {
  changed, journeysAtRisk: [...journeys], requirementsAtRisk: atRisk.map((r) => `${r.id} (${r.priority})`),
  runAll,
  commands: runAll
    ? ['npx jest', 'npx playwright test']
    : atRisk.length
      ? [`npx jest -t "${grep}"`, p1AtRisk.length ? `npx playwright test --grep "${p1AtRisk.map((r) => r.id).join('|')}"` : '(no E2E needed: no P1 journey touched)']
      : ['npx jest tests/unit   # docs-only or unmapped change: fast checks only']
};

console.log(JSON.stringify(plan, null, 2));
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
fs.writeFileSync(path.join(root, 'results', 'selection.json'), JSON.stringify(plan, null, 2));
