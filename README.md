# Cruise Quality Lab

A working demo of an **automation-first, AI-assisted quality engineering pipeline** for a
cruise-booking ecommerce journey: search → pricing and promotions → cabin inventory →
checkout and payment → confirmation, on web and mobile, over REST and GraphQL.

It shows how I'd protect revenue-critical guest journeys with a layered test architecture,
requirement traceability, AI test generation and triage under human review, and a CI release
gate that makes a clear **SHIP / BLOCK** call in business terms.

> Demo only: a fictional brand ("Seaward Voyages"), fictional sailings and a mock payment
> gateway with test card numbers. Not affiliated with any cruise line.

## Run it in 2 minutes

```bash
npm ci
npx playwright install chromium        # first time only
npm start                              # booking site at http://localhost:3000

npm run demo                                   # clean build → RELEASE GATE: SHIP (Windows/macOS/Linux)
npm run demo -- promo_stack                    # inject a defect → BLOCK
./run_pipeline.sh                              # same pipeline in bash
DEMO_BUG=promo_stack ./run_pipeline.sh         # promo applied twice → BLOCK
DEMO_BUG=no_taxes ./run_pipeline.sh            # taxes dropped       → BLOCK
DEMO_BUG=payment_down ./run_pipeline.sh        # gateway outage      → BLOCK
open results/dashboard.html                    # decision, KPIs, triage, traceability
```

Optional: `export ANTHROPIC_API_KEY=...` switches test generation and failure triage from
offline rules to Claude (`AI_MODEL` picks the model). Everything runs without a key.

## Architecture

| Layer | Tool | What it protects | Runs |
| --- | --- | --- | --- |
| Unit | Jest | Pricing, cabin multipliers, promo rules, input limits | every PR, < 1 s |
| API | Jest + Supertest | Search, quote, booking, payment outcomes (approve / decline / outage) | every PR |
| Contract | Ajv JSON Schema + GraphQL | Response shapes web and mobile depend on; no full card numbers; GraphQL = REST parity | every PR |
| E2E | Playwright (page objects) | P1 guest journeys on desktop Chrome and a Pixel 7 mobile profile | before deploy |
| Accessibility | axe-core in Playwright | No serious/critical WCAG 2 A/AA issues on search and cabin pages | before deploy |
| Mobile native (reference) | Detox, Appium + BrowserStack | Same journeys and testIDs for a React Native app — see `mobile/` | design only |

Most checks sit in the fast layers; only a handful of revenue-critical journeys run end to end.

## Quality engineering features

| Feature | File | What it does |
| --- | --- | --- |
| Requirement traceability | `requirements.json` | 14 requirements with journey and priority (P1/P2); tests carry `[REQ-…]` tags |
| Release gate | `gate.json`, `tools/gate.js` | Blocks on any failing or untested P1 journey, P2 failure without exception, pass rate < 98%, flaky > 2, E2E budget |
| Exceptions | `exceptions.json` | P2 items may ship failing only with owner, reason and expiry; P1 can never be waived |
| Dashboard | `results/dashboard.html` | Decision, business KPIs, AI triage, traceability, test pyramid |
| AI test generation | `tools/ai-testgen.js` | Claude drafts cases from acceptance criteria; each is schema-checked, de-duplicated and executed before landing in a human review queue (`ai-generated/`) |
| AI failure triage | `tools/triage.js` | Clusters failures by signature, maps to a component, Claude proposes root cause + next step |
| Risk-based selection | `tools/risk-select.js` | From changed files → journeys at risk → the smallest test set; P1 journeys touched always run E2E |
| CI | `.github/workflows/quality-gate.yml` | Fast checks ∥ E2E → triage → gate; dashboard uploaded as an artifact; a BLOCK fails the build |

```bash
node tools/risk-select.js src/payment.js       # → only checkout requirements, PAY E2E
node tools/ai-testgen.js REQ-PROMO-02          # → candidates + verdicts for review
```

## Injected defects

| `DEMO_BUG` | Defect | Caught by |
| --- | --- | --- |
| `promo_stack` | Percent and flat promos applied twice | unit + E2E price check → REQ-PROMO-01, REQ-PAY-01, REQ-MOB-01 |
| `no_taxes` | Taxes dropped from the quote | unit → REQ-PRICE-01, REQ-PROMO-01 |
| `payment_down` | Payment gateway unavailable | API + contract + E2E → REQ-PAY-01/02, REQ-API-01, REQ-MOB-01 |

## API

`GET /api/cruises?destination=&maxPrice=` · `GET /api/cruises/:id` · `POST /api/quote` ·
`POST /api/bookings` · `GET /api/bookings/:id` · `POST /graphql` (`cruises`, `cruise`, `quote`)

Test cards: `4242 4242 4242 4242` approves · `4000 0000 0000 0002` declines · `4000 0000 0000 9995` gateway timeout.
