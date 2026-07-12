# HORMUZ·LIVE — Iran Conflict Tracker (next-gen build)

A live decision-support tracker for the 2026 US–Iran war and Strait of Hormuz
crisis, built for a UAE resident. **Speed first, verification second, forecast
third.** Not a news scrapbook — every item carries a verification tier and an
analyst's "so what", every forecast is graded against reality when it expires.

## Architecture — data/template split

```
site/index.html        static template (both themes) — fetches /data/*.json, rarely changes
data/data.json         the tracker payload — rewritten every update (~4k)
data/sources.json      110-source registry with tiers (T2 / T1 / T1-ELEVATED / T1-UNRELIABLE / SPECIALIST / META)
data/patterns.json     learned-pattern state machine (HYPOTHESIS → ACTIVE → STRESSED → CONFIRMED / BROKEN)
data/scenarios.json    forecast ledger — every scenario set graded HIT/MISS on expiry, lessons kept forever
scripts/validate.mjs   pipeline guardrail — schema + intelligence-rule checks + node --check on the template
agents/                update-pipeline prompts (GATHER → REASON) and the pipeline spec
.githooks/pre-commit   runs the validator; enable with:  git config core.hooksPath .githooks
vercel.json            static hosting config (/ → /site/, /data/* served no-cache)
```

Updating the tracker = rewriting `data/data.json` and pushing. The template is
never touched in the daily loop, which retires the "regenerate 43k of HTML per
update" cost and the apostrophe-kills-the-page bug class with it.

## Tabs

| Tab | Purpose |
|---|---|
| WIRE | Speed-first feed — tier-tagged, filterable, every item has a `why` |
| NOW | At-a-glance state — channel chart (Dark Water) / needle dials (Pressure), corridor status, gauges |
| VERIFY | Contested claims decomposed into confirmed / disputed / unverified / partial with source trails |
| NEXT | Probability-weighted scenarios, market read, UAE lens, ordered triggers |
| PATTERNS | The learned-pattern state machine + the graded forecast ledger — the tracker's memory |
| CONTEXT | Escalation trace of the whole war, history, timeline |
| SOURCES | The 110-source registry rendered by tier — the verification machine, visible |

## Run locally

```sh
npm run validate          # guardrail — must pass before any commit
npm run serve             # http://localhost:8080/site/
npm run hooks             # enable the pre-commit validator (once per clone)
```

Zero runtime dependencies. The only external asset is Google Fonts.

## Deploy

Import the repo into Vercel once; every push then auto-deploys. `/` rewrites to
the tracker; `/data/*.json` is served `no-cache` so a push is live on the phone
at next reload.

## Update pipeline

See `agents/PIPELINE.md` — Haiku gathers and compresses the tiered searches,
Sonnet reasons over the compressed findings and rewrites `data.json`, the
validator gates the commit, Vercel ships it.
