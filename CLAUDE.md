# HORMUZ·LIVE — operating brief

Personal Iran-conflict early-warning tracker for one UAE household. Two surfaces,
one page (`index.html`):
- **RAW** (top of page) — renders `data/feed.json`, written by the GitHub collector.
- **Analysis** (below) — renders the inline `<script id="data" type="application/json">`
  block in `index.html`, still updated by hand in a session.

## Goal — stated by the owner, not paraphrased

1. Tell one UAE household, **earlier and more honestly than the news would**,
   using broader and more intelligent search and sourcing — social, web, expert,
   military, naval.
2. **Use the sources. Make them work. Find more. Do not prune and filter them out.**

Signals are the goal: intelligent, broad, analytical.

## Direction — owner decisions, 13 Oct 2026 (binding)

Months of builds searched wide and surfaced narrow, mainstream, late results:
models summarised toward consensus, verification gates parked fast claims, and
the fast lane printed to CI logs that nothing saved. So:

1. **A raw, fast, broad signal feed with analysis on top — not a verified news
   product.** Speed and breadth outrank confirmation. Every item shows its source,
   its GST time, and how thin it is.
2. **No model between source and page in the fast lane.** Scripts collect verbatim.
   The only gates are RECENT, NOVEL and TOPIC (keywords — never credibility).
   Translation is the only model step and may not drop, merge, shorten or reword.
3. **Verification after publication, never before** — `resolve.mjs` grades at 24h.
4. **Regional and native-language sources first** — FA/AR/HE Telegram, regional
   press, GDELT's small outlets. Official sources are context, not the gate.
5. **Judged on output only** — items surfaced, lead time vs mainstream, later
   refuted. No self-graded status text, diagrams or green ticks on the page or in
   reports. Do not revive the LLM-mediated gather pipeline in `archive/`.

### Standing instructions (owner)

- When given a list of sources: add them, score them, elevate them to news
  sources, use them as primaries.
- Add and elevate news to signals. Always.
- Display order: flash first, then by date. Stale items are removed, or rolled
  into an active thread.
- **All times in GST (UTC+4).**
- Communication: brief, accurate, professional. Not verbose.
- The day counter is OURS, anchored to our own start date (war began 28 Feb 2026).
  External sites disagreeing about it is not a signal and never reaches the page.

## How it runs

| piece | role | where |
|---|---|---|
| `scripts/feed.mjs` | collects every realtime route (Telegram web, RSS, Google News FA/AR/HE/EN, GDELT), gates, translates, writes `data/feed.json` + `data/claims.json`, counts every drop | GitHub Actions — `.github/workflows/social-fetch.yml` |
| `scripts/translate.mjs` | translation only; reply must match the input count or originals are kept | inside feed.mjs |
| `scripts/resolve.mjs` | 24h grade: `echoed ×N` / `no-echo`. `refuted` is set only by hand and never overwritten | CI after each run, or locally (no network) |
| `scripts/flash.mjs` | shared collection, topic filter (EN/FA/AR/HE), fingerprints; also a stdout mode | used by feed.mjs |
| `scripts/validate.mjs` | ship gate: registry, index.html, inline data, feed.json | before every commit (`&&`), and in CI |
| `probe` `read` `telegram` `perplexity` `x-gather` `discover` `candidates` `promote` `apply-score` | source-health and registry tools, run by hand | manual workflows `probe.yml`, `perplexity-gather.yml` |

Every script has `--selftest`. Run them after any change.

## Experiment in progress — 13 to 15 Oct 2026

The collector runs every 2h (GitHub may delay schedules) until **14 Oct 06:00 GST**,
then grades only until **15 Oct 06:00 GST**, then exits on every run by itself
(`EXPERIMENT_END` in `social-fetch.yml`). The owner judges on output, then decides
to keep, change or stop it. Do not extend or make it permanent without that call.

## Safeguards — why the old failures should not recur

- The collector commits its own output; a failed push fails the run red.
- Zero reachable sources fails the run red.
- The page derives freshness from `feed.json` and shows **STALE** after 4h silence.
- Every drop is counted in `meta.last_run` (fetched → outside window · already seen
  · off-topic → kept) and per source in `meta.sources`. Read those, not exit codes.
- No authored status text on the page ("LIVE + VERIFIED" panels were removed).

## Where you are running — check first

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 https://gcaptain.com
```
- **200 (laptop, residential IP)** — fetch directly; run the scripts in session.
- **000/403 (cloud sandbox)** — news, Telegram, AIS, Google News and GDELT are all
  blocked. Collection must run in CI. This sandbox also cannot delete branches,
  push tags or write through the GitHub API — only push branches.

Caveat for both: a UAE residential IP is differently filtered, not strictly better
(Etisalat/du degrade some Israeli outlets). Verify against CI before scoring a
source dark.

## Hard-won rules

- **Structure is not function.** JSON parsing and CI exiting 0 prove nothing about
  whether a source produced. Read the counts.
- **Never declare a source blocked after one URL.** Exhaust direct alternate → beat
  substitute → republisher (CENTCOM was recovered via DVIDS).
- **Never guess feed URLs or channel handles.** Read `<link rel="alternate">`; verify handles.
- **Apply every scoreboard, not the flattering one.**
- **Time is derived, never authored.** `last_seen`/timestamps only; `age`/`live` are
  banned and the validator enforces it.
- **Future dates are not freshness.** Items >90m ahead are dropped.
- **Topic filter counts distinct matched keywords, not patterns** — counting patterns
  silently zeroed out Farsi/Arabic/Hebrew headlines.
- **Signals decay. Sources do not get pruned.**
- **Bounded waits only.** Never an unbounded polling loop.
- Do not spoof user agents or route around an operator's access control.

## Repo state (verified 13 Oct 2026)

- `main` is production. Vercel project `iran-conflict-tracker-nextgen` deploys every
  push to `main`.
- Repo is public, so Actions minutes are free, and Actions do fire on schedule
  (156 runs 13 Sep–12 Oct). The 2 Aug note that Actions had stopped is obsolete.
- The analysis section was last updated Day 196 (12 Sep).
- Registry: 209 sources, 44 realtime routes wired, 92 with no route yet.
- Khamenei Telegram — rated the only reliable IRGC-intent signal — is still unwired;
  it needs the verified channel handle, not a guess.
- Old branches: preserved in `claude/archive-old-branches` (one commit whose parents
  are the old tips; restore with `git branch <name> <sha>`).
- `archive/` holds retired docs (agent pipeline, HANDOFF) and frozen data
  (`data.json`, `patterns.json`, `scenarios.json`, `last-run.json`, Days 140–149). Not live.

## Open work, in order

1. Owner judges the experiment.
2. If kept: remove the window, add a lead-time measure (first_seen vs first mainstream sighting).
3. Wire the 92 unrouted sources and the Khamenei channel; X API when the owner supplies it.
4. Analysis from the feed: a scheduled session that reads `feed.json` and writes the
   inline analysis — it never runs its own searches.
5. STEP enrolment (`step.state.gov`) → embassy alerts by email, read via Gmail.

## Branch

Develop on a `claude/*` branch and merge to `main` to ship. `main` is production
and the only branch the collector's schedule runs from.
