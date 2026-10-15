#!/usr/bin/env node
// AI-assisted failure triage: cluster failures by signature, map them to a likely component,
// and (when an API key is set) ask Claude for a root-cause hypothesis per cluster.
// Output: results/triage.json, read by the gate dashboard.
const fs = require('fs');
const path = require('path');
const { loadAll, RESULTS } = require('./results');
const ai = require('./ai');

const COMPONENTS = [
  { name: 'pricing / promotions', match: /discount|promo|fare|total|taxes|quote|price/i },
  { name: 'payment gateway', match: /payment|charged|declined|card|gateway|402|503/i },
  { name: 'inventory', match: /sold.?out|capacity|cabin/i },
  { name: 'API contract', match: /contract violation|schema|graphql/i },
  { name: 'accessibility', match: /axe|wcag|serious/i },
  { name: 'search', match: /destination|search|results/i }
];

const signature = (err) => (err.split('\n').find((l) => l.trim()) || 'unknown')
  .replace(/\d+(\.\d+)?/g, 'N').replace(/"[^"]*"/g, '"…"').trim().slice(0, 140);

async function main() {
  const failures = loadAll().filter((t) => t.status === 'failed');
  const clusters = {};
  for (const f of failures) {
    const key = signature(f.error);
    (clusters[key] ||= { signature: key, tests: [], reqs: new Set(), layers: new Set() });
    clusters[key].tests.push(`${f.layer}${f.project !== 'node' ? ' (' + f.project + ')' : ''}: ${f.title}`);
    f.reqs.forEach((r) => clusters[key].reqs.add(r));
    clusters[key].layers.add(f.layer);
    clusters[key].sample = clusters[key].sample || f.error;
  }

  const list = Object.values(clusters).map((c) => {
    const text = c.sample + ' ' + c.tests.join(' ');
    const comp = COMPONENTS.find((x) => x.match.test(text));
    return {
      signature: c.signature, count: c.tests.length, reqs: [...c.reqs], layers: [...c.layers], tests: c.tests,
      component: comp ? comp.name : 'unclassified', sample: c.sample,
      hypothesis: `Failures share one signature across ${[...c.layers].join(', ')} layers; start in ${comp ? comp.name : 'the service logs'}.`,
      source: 'rules'
    };
  }).sort((a, b) => b.count - a.count);

  if (list.length && ai.enabled()) {
    try {
      const code = ['src/pricing.js', 'src/payment.js'].map((f) => `// ${f}\n` + fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n\n');
      const answer = await ai.askJson(
        'You are a senior QA engineer triaging CI failures for a cruise booking service. Be specific and brief. Reply with JSON only.',
        `Failure clusters:\n${JSON.stringify(list.map(({ signature, count, reqs, layers, sample }) => ({ signature, count, reqs, layers, sample })), null, 2)}\n\nRelevant source:\n${code}\n\n` +
        'Return a JSON array, one object per cluster in the same order: {"hypothesis": "<likely root cause in one sentence, naming the function>", "confidence": "high|medium|low", "nextStep": "<one action>"}'
      );
      answer.forEach((a, i) => { if (list[i]) Object.assign(list[i], { hypothesis: a.hypothesis, confidence: a.confidence, nextStep: a.nextStep, source: `Claude (${ai.MODEL})` }); });
    } catch (e) { console.warn('AI triage unavailable, using rules:', e.message); }
  }

  fs.mkdirSync(RESULTS, { recursive: true });
  fs.writeFileSync(path.join(RESULTS, 'triage.json'), JSON.stringify({ failures: failures.length, clusters: list }, null, 2));
  console.log(`Triage: ${failures.length} failing test(s) in ${list.length} cluster(s)`);
  list.forEach((c, i) => console.log(`  ${i + 1}. [${c.component}] x${c.count} ${c.reqs.join(', ')}\n     ${c.hypothesis}`));
}

main();
