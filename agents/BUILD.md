# BUILD — next phase spec (live signals · Perplexity · trigger)

Branch: `claude/signals-live-layer` (off the gather-layer branch). Build order
below. Keep it lean — the user's standing constraint: **surface live
uncorroborated news; do NOT build a debunk-museum of dead rumors; don't waste
space or tokens.**

## A. SIGNALS lane (build first — unblocked)

Purpose: surface fast, uncorroborated news *live*, wearing its uncertainty.
WIRE stays verified-only; SIGNALS is the separate, labeled quarantine lane.
Separation + labeling is the discipline — not suppression.

- **IA decision: a strip, not an 8th tab.** Render a compact "LIVE SIGNALS —
  UNVERIFIED" panel at the top of the WIRE/NOW view, visually distinct (dimmer,
  pulsing mark). Adding a tab worsens the clutter problem (see D).
- **Lean lifecycle (per user):** show `open` / `converging` / `contradicted`
  only. On expiry, **drop it** — no lingering tombstones. Optional one-line
  archive counter, not a visible graveyard. Cap the panel at ~5 live items.
- `data/data.json` gains `signals[]`:
  ```
  { "id", "claim", "seen", "src", "lane", "rung": 1|2|3|"3★",
    "state": "open|converging|contradicted", "ttl", "note" }
  ```
- `index.html`: render the strip; `signals` styling never reuses WIRE's tier
  badges (no laundering).
- `scripts/validate.mjs`: each signal needs rung + state(enum) + ttl; a signal
  may **never** carry `ver2`/`ver`; cap `note` length; enforce ≤6 entries.
- `agents/LISTEN.md`: change rung-1 from "logged, not shown" → "shown, lowest
  confidence"; expiry = quiet drop; promotion (T2 lands) = graduate to WIRE.
- **Seed entries (real, today):** (1) Bab el-Mandeb Houthi conditional order —
  `open`, rung 2, trigger met; (2) UAE evacuation warning — `contradicted`,
  rung 1-2, one-line note "recirc of 14 Mar ports warning; NCEMA stable" then
  let it drop on TTL. Do NOT expand the evacuation debunk on the page.

## STATUS (compression point, 19 Jul)
Branch `claude/signals-live-layer`. DONE: SIGNALS lane (§A) — built, rendered,
validated, pushed. `scripts/perplexity.mjs` — built but **UNVERIFIED against
live API** (sandbox blocks api.perplexity.ai AND the docs sites). Gate =
`.github/workflows/perplexity-smoke.yml`: user adds `PERPLEXITY_API_KEY` secret,
runs it, must be green before Perplexity counts as working. Key was pasted in
chat — rotate it. NOT DONE: §C runner (needs `ANTHROPIC_API_KEY` secret), §D IA
declutter. Do NOT claim Perplexity works until the smoke workflow passes.

## B. Perplexity integration (needs API key from user)

Seat: **Haiku-tier GATHER recall booster + SCOUT source-finder. Never a
verifier; never pipes to WIRE or the LISTEN ladder.** (Rationale + the live
failure case are in GATHER.md's decomposition rule.)

- Add a small `scripts/perplexity.mjs` client: query → return citations only.
- Wrap output through the **mandatory decomposition + date-stamp** step: extract
  each primary, read its publish date, tier independently, discard the
  synthesis narrative. Stale-only claim = RECIRCULATION, tier as such.
- Key: `PERPLEXITY_API_KEY` (env / Actions secret). **Ask the user for it.**
- Use it in the runner (C) as an optional gather lane, gated by a
  `USE_PERPLEXITY` flag so the free web-search path still works without it.

## C. Trigger + runner (decouples updates from the chat)

Goal (user Q4): trigger an update from a **plain Claude chat** (or the page, or
a schedule) — *not* only from a Claude Code session.

Insight: put the RUN in **GitHub Actions**, not the chat. Then the chat only
*fires* it.

- `.github/workflows/update.yml`: `workflow_dispatch` + nightly `cron`. Runs the
  runner, commits `data/data.json`, pushes → Vercel auto-redeploys.
- `scripts/run-update.mjs`: the executable pipeline — turns the agent prompts
  (LISTEN→GATHER→REASON, model tiers per PIPELINE.md) into real model calls,
  runs `validate.mjs`, writes the data files. This is the piece that makes the
  markdown prompts runnable.
- Secrets: `ANTHROPIC_API_KEY`, optional `PERPLEXITY_API_KEY`.
- **Fire from anywhere:** any Claude surface with the GitHub connector can call
  `actions_run_trigger` (workflow_dispatch) — so a claude.ai chat works, no
  Claude Code session required. Page button = a later serverless→dispatch shim
  (gate it; a public button spends tokens).

## D. Redesign / clutter (sequence, don't rush Fable)

Assessment: the tracker has 7 tabs + ~10 data surfaces; on mobile that is real
clutter, and SIGNALS-as-a-tab would worsen it (hence the strip in A). The
problem is **information architecture (what shows first), not aesthetics.**

Sequence:
1. Ship SIGNALS lean (A).
2. **Opus-led IA pass** — collapse surfaces into a hierarchy: hero (threat
   level + UAE line + live signals + strait) → depth-on-demand. Editorial
   judgment, no Fable needed.
3. **Then** — only if execution fidelity still lags — **one Fable pass** to
   author the new visual/motion grammar (design-lab is the start). Fable's
   niche is authoring the grammar once; running it over a cluttered IA just
   makes prettier clutter, so IA first.

Answer to "do you need Fable for this?": **not for A or B; not yet for D.**
Fable earns its seat only at D-step-3, after the IA is settled.

## Model tiers (recap, enforced in PIPELINE.md)
Haiku: gather, listen-lanes, scout-sweeps, Perplexity client.
Sonnet: reason (daily), listen-aggregator.
Opus: grading, pattern revision, tiering, high-stakes reason cycles, the IA pass.
Fable: visual/motion grammar only (D-step-3).
