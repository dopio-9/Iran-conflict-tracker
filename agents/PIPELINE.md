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

## Cadence & model assignment (function-level rule)

Each function is pinned to a model. The rule: **cheapest model that can do the
job; the heaviest reasoning gets Opus, not Fable.** Fable is retained only for
what it is uniquely good at — authoring visual/motion grammars and concepts —
not for analytical weighting.

| Layer | Model | Why this tier | Frequency | Touches |
|---|---|---|---|---|
| Listen — lane listeners | **Haiku** | raw sighting capture, no judgment | per update, first | findings block |
| Listen — aggregator | **Sonnet** | convergence/independence judgment | per update | findings block |
| Scout — sweeps | **Haiku** | search & dedupe | after each grading; on any 24h+ dispute | `data/candidates.json` |
| Scout — tiering review | **Opus** | source-trust judgment is load-bearing | on review | `data/candidates.json` |
| Gather | **Haiku** | search + compress, no analysis | per update (1-3×/day) | findings block |
| Reason — daily `data.json` | **Sonnet** | routine authoring against rules | per update | `data/data.json` |
| Reason — high-stakes cycle | **Opus** | when a dispute closes a war-tail, a pattern breaks, or weighting swings ≥15pts | as needed | `data/data.json` |
| Forecast grading | **Opus** | the big reasoning — HIT/MISS calls + lessons compound forward | at every set expiry | `data/scenarios.json` |
| Pattern revision | **Opus** | state changes are the model of the war; wrong = load-bearing error | weekly / on state change | `data/patterns.json` |
| Template / design / motion | **Fable** | concept + grammar authoring, Fable's niche | rarely | `index.html`, `design-lab/` |
| Source registry edits | **Opus** | tiering is a trust judgment | on add/re-tier | `data/sources.json` |

**Escalation rule:** REASON runs on Sonnet by default and escalates the whole
cycle to Opus when any of the high-stakes triggers fire (tail-closing dispute,
pattern break, ≥15-point scenario swing). The daily loop must never run inline
on one model — that is a testing shortcut, not production.

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
