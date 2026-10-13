# ROUTINE — autonomous twice-daily tracker update

Everything this Routine *runs* is already built, committed, and live. The only
step that could not be completed from the build session is creating the schedule
trigger itself — it sits behind an approval that surface could not clear. Create
it from **Claude Chat or a Claude Code session** (Routines are managed there),
using the schedule + prompt below verbatim. Nothing else needs to change.

## Schedule
- **Cron:** `0 3,15 * * *` (UTC) = **07:00 & 19:00 GST**, every day
- **Mode:** fresh session per fire (`create_new_session_on_fire: true`)
- **Notifications:** push + email (summary each run)
- **Publish target:** production (fast-forward `main` → Vercel `iran-conflict-tracker-nextgen`)
- **Gate:** none manual. `validate.mjs` runs as the session's own self-heal check only.
- **Model note:** runs on the account default; pin Sonnet (Opus-on-escalation) via the
  Routine's model setting if desired — not set here to avoid an unintended model change.

## The prompt (paste verbatim)

```
AUTONOMOUS TRACKER UPDATE — HORMUZ·LIVE. You are a fresh session in the
dopio-9/Iran-conflict-tracker repo. Run ONE full tracker update end-to-end and
AUTO-PUBLISH to production. Follow the institutionalized method already committed
in the repo; do NOT redesign anything. There is NO human review and NO manual
gate — you run fully autonomously and always publish a clean build. Doctrine:
speed first, verify second, forecast third. Signals is the product; the FULL FEED
must show everything gathered.

1. ORIENT. Read agents/LANES.md, agents/THEATERS.md, agents/ARCHITECTURE.md,
   agents/PERPLEXITY-PLAYBOOK.md, and scripts/{telegram,perplexity,discover,
   promote,apply-score,validate}.mjs. Work on branch claude/signals-live-layer
   (fetch/checkout; create from origin/main if missing).

2. GATHER — three engines:
   - WEB: WebSearch across all 14 lanes / 6 theaters for the last ~24h (strikes,
     maritime/Hormuz, naval movement, air/airspace, war-risk/oil, diplomacy,
     leadership-internal, threats, proxy/Houthi/Hezbollah, nuclear, UAE-local,
     cyber). Breadth + English corroboration.
   - PPLX + DISCOVERY: trigger "perplexity-gather" via Actions workflow_dispatch,
     poll get_job_logs until complete; fold the date-stamped primaries and copy
     the CANDIDATES:[...] line.
   - DIRECT + SCORE: trigger "social-fetch", read the Telegram gather and copy
     the SCOREBOARD:{...} line.

3. LEARN + REFILL (auto-promote policy, no manual gate):
   - node scripts/apply-score.mjs '<SCOREBOARD json>'
   - node scripts/candidates.mjs --apply '<CANDIDATES json>' then
     node scripts/promote.mjs

4. AGGREGATE + WRITE. Dedup across engines; tier by INDEPENDENT mediums only
   (adversary-origin = DISPUTED, never confirmed; date-stamp every item; catch
   recirculation via cross-engine dates). Edit ONLY the inline <script id="data">
   JSON block in index.html — keep the Fable design/CSS/JS untouched. Bump
   meta.day/updated/phase; refresh threat (uae_line + action), strait, deadlines;
   rewrite signals[] (curated ~8, richest + most decision-relevant, all tiers,
   spanning theaters); rewrite feed[] = the FULL deduped gather, UNCAPPED (every
   item; tier is a label, not a gate — show DISPUTED/PENDING/FLASH, never drop);
   update verified[], triggers[]; scenarios[] (probs MUST sum to 100); GRADE the
   ledger[] (each prior call RIGHT/WRONG/PARTIAL/OPEN with the lesson); refresh
   patterns[]; update trace (day count); refresh practical[].

5. SELF-HEAL + PUBLISH (automated, not a human gate). Run node scripts/validate.mjs
   as your own self-check. If it flags anything, FIX the data and re-run until
   clean — never ship structurally broken (invalid JSON / JS error / scenarios
   not summing to 100 / disputed without conflict-or-note). Then write
   data/last-run.json {ts, lanes_covered[], theaters_covered[], items}; commit to
   claude/signals-live-layer; push; and PUBLISH to production by fast-forwarding
   main: git push origin claude/signals-live-layer:main. ALWAYS publish a clean
   build every run. Commit trailer required:
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

6. REPORT concise: day number, # signals, # feed items, lanes/theaters covered,
   sources promoted + retired this run, scenario weights, the single most
   important new signal, and production publish status (main SHA).
```

## What the Routine depends on (all built + live)
- `scripts/telegram.mjs` (DIRECT + `--score`), `scripts/perplexity.mjs` (source-driven gather),
  `scripts/discover.mjs` (replenishment), `scripts/candidates.mjs` + `scripts/promote.mjs`
  (auto-promote), `scripts/apply-score.mjs` (score + dark + auto-retire), `scripts/validate.mjs`.
- Workflows: `.github/workflows/{perplexity-gather,social-fetch}.yml` (dispatchable).
- Secrets: `PERPLEXITY_API_KEY` (set). No Anthropic API key needed — the Routine runs on the subscription.
- Production: `main` is git-linked to Vercel `iran-conflict-tracker-nextgen`; a FF push to `main` publishes.
