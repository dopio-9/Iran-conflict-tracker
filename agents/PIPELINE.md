# HORMUZ·LIVE — Update Pipeline

The tracker is updated by rewriting **`/data/data.json`** (~4k of JSON), never the
template. One update cycle:

```
     ┌─ 0a. LISTEN (Haiku lanes → Sonnet aggregator) ── fast-signal fan-out;
     │      emits pending/flash with convergence confidence (see LISTEN.md)
     ┌─ 0b. SCOUT (Haiku, off-cycle) ── blind-spot sweeps; nominates sources
     │      into data/candidates.json for review — never cites (see SCOUT.md)
┌─ 1. GATHER (Haiku 4.5) ──── runs the tiered searches, compresses ~55k of raw
│                             results into structured findings (see GATHER.md);
│                             appends LISTEN's fast block
├─ 2. REASON (Sonnet 4.6+) ── reads ONLY the compressed findings, writes the new
│                             data.json + pattern/ledger updates (see REASON.md)
├─ 3. VALIDATE ────────────── node scripts/validate.mjs   (blocks on any rule breach)
├─ 4. COMMIT + PUSH ───────── git commit && git push      (pre-commit re-validates)
└─ 5. DEPLOY ──────────────── Vercel auto-redeploys on push; phone reloads get
                              fresh JSON immediately (data/* is served no-cache)
```

The upstream layers (0a/0b) feed the verification discipline; they never bypass
it. Nothing auto-writes to WIRE, and a SCOUT nomination carries no citation
weight until approved into `sources.json`.

## Cadence

| Layer | Model | Frequency | Touches |
|---|---|---|---|
| Listen (fast signals) | Haiku lanes → Sonnet | per update, first | findings block only |
| Scout (source discovery) | Haiku sweeps → Fable review | after each grading; on any 24h+ dispute | `data/candidates.json` |
| Gather + Reason | Haiku → Sonnet | per update (1-3×/day in crisis) | `data/data.json` |
| Pattern revision | Fable / weekly | weekly, or on any state change | `data/patterns.json` |
| Forecast grading | Fable / weekly | at every scenario-set expiry (24-72h) | `data/scenarios.json` |
| Template / design | Fable | rarely | `site/index.html` |
| Source registry | Fable | when a source is added/re-tiered | `data/sources.json` |

## Non-negotiable rules (enforced by `scripts/validate.mjs`)

1. **Nothing gets `ver2` on one source. Ever.**
2. Never resolve conflicting sources by picking a winner — render the conflict.
3. Every WIRE item carries a `why` — the analyst's "so what", not a summary.
4. Scenario probabilities are explicit analytical judgments totalling 100%.
5. Reconcile conflicting numbers — report the most recent with timestamp.
6. Conditional boilerplate must actually be conditional.
7. UAE relevance is the lens on everything.
8. Graded forecasts require a `lesson`. Misses are kept forever.

## Bug history the pipeline exists to prevent (§5 of the seed)

- A straight apostrophe inside a single-quoted JS string once blanked the page.
  Content now lives in JSON, where `'` is inert — the template never holds copy.
- JS ternaries in CSS corrupt parsing; the validator greps for them.
- `node --check` runs on the template's script block on every validation.
- No `localStorage`/`sessionStorage`, ever (artifact compatibility).
