# HORMUZ·LIVE — operating brief

Personal Iran-conflict early-warning tracker for one UAE household. Two surfaces,
one page (`index.html`):
- **RAW** (top of page) — renders `data/feed.json`, written by the GitHub collector.
  STORIES (mechanical de-dupe, earliest source's own line) on top, trackers strip,
  every raw item under a show button.
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

### Owner decisions, 14–16 Oct 2026 (binding)

- Experiment judged: **keep**. Collection is permanent and hourly.
- Translation and search use **Claude on the owner's plan** (scheduled session), not a
  paid API. Revisit an API only if cost/benefit becomes clear.
- **Claude search is an extra feed route**, never a replacement for the raw lane.
- **Dead sources are retired after 7 days of no output** (replaces "sources are never
  pruned"). Retired = not polled; the registry entry stays, with date and reason.
- Free trackers wired (aircraft, nav warnings, MARAD, internet outages); key-gated ones
  (FIRMS, Cloudflare Radar) switch on when the owner adds the secret.
- Home-computer runner: not now; add later only if datacenter blocking makes it necessary.

## How it runs

| piece | role | where |
|---|---|---|
| `scripts/feed.mjs` | collects every route, gates, holds non-English off-keyword items for translation, applies inbox English, clusters, retires 7-day-silent sources; writes `data/feed.json` (+ claims, hold, track, health, sources) | GitHub Actions `social-fetch.yml`, hourly + dispatched by the inbox session |
| `scripts/flash.mjs` | shared collection (RSS, Telegram web, Google News, GDELT), topic filter (EN/FA/AR/HE; one strong actor term or two terms), fingerprints | used by feed.mjs |
| `scripts/trackers.mjs` | adsb.lol / adsb.fi military aircraft in theatre, IODA outages, NGA nav warnings, MARAD advisories, FIRMS fires (key), Cloudflare Radar (key) | used by feed.mjs |
| `scripts/cluster.mjs` | de-dupe into stories (word overlap, 12h burst); tag by keyword; lead time vs first mainstream + collection lag | used by feed.mjs |
| `scripts/inbox.mjs` | contract between the Claude session and the collector: count-checked translation batches, verbatim search results, query rotation | the inbox session (`INBOX.md`) |
| `scripts/resolve.mjs` | 24h grade: `echoed ×N` / `no-echo`. `refuted` is set only by hand and never overwritten | CI after each run |
| `scripts/validate.mjs` | ship gate: registry, index.html, inline data, feed.json (stories may not author text) | before every commit (`&&`), and in CI |
| `probe` `read` `telegram` `perplexity` `x-gather` `discover` `candidates` `promote` `apply-score` | source-health and registry tools, run by hand | manual workflows |

Every script has `--selftest`. Run them after any change.

**Inbox session.** A persistent Claude Code session fires hourly (Routine) and follows
`INBOX.md`: translates pending lines, runs this hour's searches
(`data/search-queries.json`), force-pushes `data/inbox/` to branch `claude/inbox`, and
dispatches the collector. The collector reads that branch and never merges it.

## Safeguards — why the old failures should not recur

- The collector commits its own output; a failed push fails the run red.
- Zero reachable sources fails the run red.
- The page derives freshness from `feed.json` and shows **STALE** after 3h silence.
- Every drop is counted in `meta.last_run` (fetched → outside window · already seen
  · off-topic · held → kept; translate applied/released/dropped/expired) and per source
  in `meta.sources`. Lead time is in `meta.lead`. Read those, not exit codes.
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
- **Signals decay. Sources are retired only by the 7-day rule, never by judgement.**
- **Bounded waits only.** Never an unbounded polling loop.
- Do not spoof user agents or route around an operator's access control.

## Repo state (verified 16 Oct 2026)

- `main` is production. Vercel project `iran-conflict-tracker-nextgen` deploys every
  push to `main`.
- Repo is public, so Actions minutes are free. GitHub's schedule is unreliable: the
  experiment's 2h cron fired 3 times in 24h. Hence hourly cron + dispatch by the inbox session.
- Experiment result (13–14 Oct): 4 runs, 545 items, all saved; translation 0 (Perplexity
  credits out); GDELT 0; regional Telegram first on the Aramco HQ strike and the 2nd ship
  hit, but 5–8h between runs meant the page showed them after Reuters/Bloomberg.
- The analysis section was last updated Day 196 (12 Sep).
- Registry: 215 sources (16 Oct): 44 realtime routes, 7 tracker routes, 92 with no route yet.
- Khamenei Telegram — rated the only reliable IRGC-intent signal — is still unwired;
  it needs the verified channel handle, not a guess.
- Old branches: preserved in `claude/archive-old-branches` (one commit whose parents
  are the old tips; restore with `git branch <name> <sha>`).
- `archive/` holds retired docs (agent pipeline, HANDOFF) and frozen data
  (`data.json`, `patterns.json`, `scenarios.json`, `last-run.json`, Days 140–149). Not live.

## Open work, in order

1. Owner: add free keys as repo secrets — `FIRMS_KEY`, `CF_RADAR_TOKEN` (wired);
   `AISSTREAM_KEY`, `FAA_NOTAM_KEY` (not yet wired).
2. Wire aisstream (bounded snapshot) and FAA NOTAM when their keys exist.
3. Source learning: per-topic gap counts; mine t.me links/forwards in collected posts for
   candidate channels; one feed-discovery attempt for each of the 92 unrouted sources, else retire.
4. Khamenei Telegram (verified handle only); X API if the owner supplies it.
5. Analysis from the feed: a scheduled session that reads `feed.json` and writes the
   inline analysis — it never runs its own searches.
6. STEP enrolment (`step.state.gov`) → embassy alerts by email, read via Gmail.

## Branch

Develop on a `claude/*` branch and merge to `main` to ship. `main` is production
and the only branch the collector's schedule runs from.
