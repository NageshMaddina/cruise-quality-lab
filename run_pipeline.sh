#!/usr/bin/env bash
# Runs the same stages as CI, locally:
#   fast checks (unit, API, contract) -> E2E journeys (desktop + mobile, a11y) -> AI triage -> release gate
# Usage:
#   ./run_pipeline.sh                          # clean build      -> SHIP
#   DEMO_BUG=promo_stack ./run_pipeline.sh     # promo applied twice -> BLOCK
#   DEMO_BUG=no_taxes ./run_pipeline.sh        # taxes dropped       -> BLOCK
#   DEMO_BUG=payment_down ./run_pipeline.sh    # payment gateway down -> BLOCK
set -u
cd "$(dirname "$0")"
rm -rf results && mkdir -p results

echo "== Stage 1: fast checks (unit, API, contract) =="
npx jest --json --outputFile=results/jest.json 2>&1 | grep -E "Tests:|✕|FAIL" || true

echo "== Stage 2: E2E guest journeys (desktop + mobile, accessibility) =="
npx playwright test > results/e2e.log 2>&1
grep -E "passed|failed|flaky" results/e2e.log | tail -3

echo "== Stage 3: AI-assisted failure triage =="
node tools/triage.js

echo "== Stage 4: release gate =="
node tools/gate.js
status=$?
echo "Open results/dashboard.html for the full report."
exit $status
