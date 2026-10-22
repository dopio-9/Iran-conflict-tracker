# HORMUZ·LIVE — operating brief

Personal Iran-conflict early-warning tracker for one UAE household. Two surfaces,
one page (`index.html`):
- **RAW** (top of page) — renders `collector/data/news-collector.json`, written by the GitHub collector.
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
3. **Verification after publication, never before** — `story-grading.mjs` grades at 24h.
4. **Regional and native-language sources first** — FA/AR/HE Telegram, regional
   press, GDELT's small outlets. Official sources are context, not the gate.
5. **Judged on output only** — items surfaced, lead time vs mainstream, later
   refuted. No self-graded status text, diagrams or green ticks on the page or in
   reports. Do not revive the LLM-mediated gather pipeline (retired; lessons below).

### Standing instructions (owner)

- When given a list of sources: add them, score them, elevate them to news
  sources, use them as primaries.
- Add and elevate news to signals. Always.
- Display order: flash first, then by date. Stale items are removed, or rolled
  into an active thread.
- **All times in GST (UTC+4).**
- Communication: brief, accurate, professional. Not verbose.
- **Claude Code has full access** to every branch and file in this repo (owner, 17 Oct 2026).
  Replaces the earlier "session writes only to the inbox" rule.
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

Layout (owner, 21 Oct 2026): `collector/scripts/` + `collector/data/` = active.
`inactive-scripts/` (Perplexity, source tools) removed 22 Oct 2026; recoverable from git history. Data files: `news-collector.json` (page data),
`to-translate.json` (held for English), `de-dupe.json` (already seen),
`source-retire.json` (last produced, 7-day rule), `tracker-list.json` (tracker memory),
`search-queries.json` (search rotation), `sources.json` (registry). Inbox branch files:
`collector/data/inbox/translations.json`, `exa-feed.json`.

| piece | role | where |
|---|---|---|
| `collector/scripts/collector.mjs` | collects every route, gates, holds non-English off-keyword items for translation, applies inbox English, clusters, retires 7-day-silent sources; writes `collector/data/news-collector.json` (+ de-dupe, to-translate, tracker-list, source-retire, sources) | GitHub Actions `collector.yml`, hourly + dispatched by the inbox session |
| `collector/scripts/web-social-feed.mjs` | shared collection (RSS, Telegram web, Google News, GDELT), topic filter (EN/FA/AR/HE; one strong actor term or two terms), fingerprints | used by collector.mjs |
| `collector/scripts/military-trackers.mjs` | adsb.lol / adsb.fi military aircraft in theatre, IODA outages, NGA nav warnings, MARAD advisories, FIRMS fires (key), Cloudflare Radar (key) | used by collector.mjs |
| `collector/scripts/story-clustering.mjs` | de-dupe into stories (word overlap, 12h burst); tag by keyword; lead time vs first mainstream + collection lag | used by collector.mjs |
| `collector/scripts/inbox.mjs` | contract between the Claude session and the collector: count-checked translation batches, verbatim search results, query rotation | the inbox session (`RUN-CYCLE.md`) |
| `collector/scripts/story-grading.mjs` | 24h grade: `echoed ×N` / `no-echo`. `refuted` is set only by hand and never overwritten | CI after each run |
| `collector/scripts/validate.mjs` | ship gate: registry, index.html, inline data, news-collector.json (stories may not author text) | before every commit (`&&`), and in CI |
| `collector/scripts/feed-parser.mjs` | feed parser used by web-social-feed.mjs; also reads sources by hand | used by web-social-feed.mjs |
| `collector/scripts/translate-check.mjs` | decides which lines need English (the session translates) | used by collector.mjs |

Every script has `--selftest`. Run them after any change.

**Inbox session.** A persistent Claude Code session fires hourly (Routine) and follows
`RUN-CYCLE.md`: translates pending lines, runs this hour's searches
(`collector/data/search-queries.json`), force-pushes `collector/data/inbox/` to branch `claude/inbox`, and
dispatches the collector. The collector reads that branch and never merges it.

## Safeguards — why the old failures should not recur

- The collector commits its own output; a failed push fails the run red.
- Zero reachable sources fails the run red.
- The page derives freshness from `news-collector.json` and shows **STALE** after 3h silence.
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

## Lessons kept from the retired agent pipeline (archive/ deleted 17 Oct 2026)

- **Search engines blend time.** AI/aggregator search (Perplexity, Exa) fuses months-old
  items into a present-tense "latest". Read every result's own publish date; a claim whose
  only dated instance is stale is RECIRCULATION, not news. (Observed: Perplexity, 17 Jul;
  Exa, 16 Oct — 122 of 145 results older than 12h.)
- **Independence.** Reports that quote, screenshot, translate or share one origin count as
  one source. Same-substrate echo is not confirmation.
- **Partition by language and medium, not topic.** FA Telegram → AR wires → EN press: the
  travel path of one event is the speed signal. Topic splits re-read the same wire copy.
- **Silence is a finding.** "UKMTO silent", "lane quiet" — record it, don't omit it.
- **Close a dispute with the source class that can settle it** (Oman strike → Omani
  official wires), not more copies of the same outlets.
- **Thin coverage, July audit:** Iraq–Syria–Yemen (4 sources), cyber (2), nuclear (3).
- **No commit-triggers-itself loops.** A CI job that commits into its own `paths:` trigger
  burned ~50 Perplexity calls once. Check `on:` triggers before a workflow writes files.
- **Branch deletion runs from GitHub's side.** This sandbox can't delete branches;
  `.github/workflows/prune-branches.yml` (manual, takes branch names) does it, and refuses
  `main`, `claude/inbox` and `claude/design-lab`.

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
- Branches (17 Oct): `main`, `claude/inbox` (session outbox), `claude/design-lab` (page
  design concepts, reference only). `claude/archive-old-branches`, the merged
  `claude/hormuz-tracker-nextgen-cbjlfy` and the `archive/` folder were deleted by owner
  decision; `archive/` remains in git history before commit "Remove archive/".

## Open work, in order

1. Owner: add free keys as repo secrets — `FIRMS_KEY`, `CF_RADAR_TOKEN` (wired);
   `AISSTREAM_KEY`, `FAA_NOTAM_KEY` (not yet wired).
2. Wire aisstream (bounded snapshot) and FAA NOTAM when their keys exist.
3. Source learning: per-topic gap counts; mine t.me links/forwards in collected posts for
   candidate channels; one feed-discovery attempt for each of the 92 unrouted sources, else retire.
4. Khamenei Telegram (verified handle only); X API if the owner supplies it.
5. Analysis from the feed: a scheduled session that reads `news-collector.json` and writes the
   inline analysis — it never runs its own searches.
6. STEP enrolment (`step.state.gov`) → embassy alerts by email, read via Gmail.

## Branch

Develop on a `claude/*` branch and merge to `main` to ship. `main` is production
and the only branch the collector's schedule runs from.
