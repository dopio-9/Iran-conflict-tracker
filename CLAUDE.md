# HORMUZ·LIVE — operating brief

Personal Iran-conflict early-warning tracker for one UAE household.
Live surface is `index.html`: a single self-contained file with an inline
`<script id="data" type="application/json">` block. Everything renders from it.

## Goal — stated by the owner, not paraphrased

1. Tell one UAE household, **earlier and more honestly than the news would**,
   using broader and more intelligent search and sourcing — social, web, expert,
   military, naval.
2. **Use the sources. Make them work. Find more. Do not prune and filter them out.**

Signals are the goal: intelligent, broad, analytical.

### Standing instructions

- When given a list of sources: add them, score them, elevate them to news
  sources, use them as primaries via X / web search / Perplexity.
- Add and elevate news to signals. Always.
- Display order: flash first, then by date. Stale items are removed, or rolled
  into an active thread.
- Communication: brief, accurate, professional. Not verbose.
- The day counter is OURS, anchored to our own start date. External sites
  disagreeing about it is not a signal and never reaches the page.

## Two-speed architecture

**FAST LANE** (`scripts/flash.mjs`) — one source is enough. No corroboration
gate. A claim only one source is making is not noise to filter out; it is the
product. Gates on exactly two things: RECENT (inside the window) and NOVEL
(fingerprint unseen in `data/claims.json`). Never ranks by source tier — a T3
regional channel beating Reuters by four hours is the event this lane exists for.

**SLOW LANE** — the next day, grade what the fast lane published: confirmed,
refuted, or unresolved. Refuted claims get a visible ledger line. This is what
makes publishing speculation honest. **`scripts/resolve.mjs` DOES NOT EXIST YET.**
Until it does, the fast lane is writing cheques the repo cannot cash.

## Engines

| script | role |
|---|---|
| `probe.mjs` | reachability / declared feeds / `--comprehend` / `--connect` / `--dump`. No key, no spend. |
| `read.mjs` | single reader, routes `--rss` `--html` `--json`. `parseFeed` and `classify` are shared. |
| `flash.mjs` | fast lane. rss + telegram-web only (dated, realtime). |
| `telegram.mjs` | t.me/s reader + scoreboard |
| `perplexity.mjs` | recall lane. **Still discards synthesis — the known root cause of headline-only "analysis".** |
| `apply-score.mjs` | consumes any engine's `SCOREBOARD:{...}` |
| `validate.mjs` | ship gate. Run it before every commit, chained with `&&`. |

## Where you are running — CHECK THIS FIRST

The fetch strategy is not fixed; it depends on the environment. Test, do not assume:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 https://gcaptain.com
```

**LOCAL (laptop, residential IP) — 200.** Fetch directly. `WebFetch`, `curl` and
every script reach news, AIS and `.gov` hosts, so run `probe.mjs`, `read.mjs` and
`flash.mjs` in the session and skip CI entirely. No round-trip, no waiting on
Actions, no log-scraping to read a scoreboard.

**CLOUD SANDBOX — 000/403.** The proxy allows only
npm/pypi/crates/go/github/anthropic; every news, AIS and advisory host is blocked.
Then, and only then: **FETCH in CI, APPLY in session.** Applying in CI causes
commit→re-fire loops (one burned ~50 Perplexity calls per registry edit).

Caveat that survives both: a UAE residential IP is not strictly better, only
differently filtered. Etisalat/du degrade some Israeli outlets, and Ynet, Haaretz
and Israel Hayom are top performers via GitHub's runners. If one of those starts
missing locally, that is the ISP, not the reader — verify against CI before
scoring it dark.

### Local setup

Node 22+, no dependencies at all. `git clone`, then:
```bash
export PERPLEXITY_API_KEY=...   # the only secret; it is a GitHub secret in CI
npm run hooks                   # points core.hooksPath at .githooks
node scripts/validate.mjs       # ship gate, must pass before every commit
```

## Hard-won rules

- **Structure is not function.** Validating that JSON parses and CI exits 0
  proves nothing about whether a source produced. Read the scoreboard.
- **Never declare a source blocked after one URL.** Exhaust: direct alternate →
  beat substitute → republisher. CENTCOM was recovered via DVIDS this way.
- **Never guess feed URLs.** Read `<link rel="alternate">`. Sites declare them.
- **Apply every scoreboard, not the flattering one.** Applying X while leaving
  Telegram unapplied hid six live sources for days.
- **Time is derived, never authored.** `last_seen` only; `age`/`live` are banned
  and the validator enforces it. Hardcoded `~fresh` once left 6-day-old cards
  pulsing "live".
- **Future dates are not freshness.** `classify()` drops items >90m ahead;
  entekhab.ir scored −8198 minutes and would have owned the top slot forever.
- **Signals decay. Sources do not get pruned.** Different rules, deliberately.
- **Bounded waits only.** An unbounded `until curl ... | grep` loop ran 46
  minutes after the API changed its error text.
- Do not spoof user agents or route around an operator's access control.

## State (last verified 2 Aug 2026)

- **`main` is current — Day 154, merged from `claude/signals-live-layer` in PR #4.**
  Develop on `claude/signals-live-layer` and merge to `main` when ready to ship;
  the fast-lane cron only fires from the default branch, so undelivered branch
  work does not run on schedule.
- Registry `data/sources.json`: 201 sources, 40 producing, 92 never read
  (no reader, h0/m0), 35 dark, 15 retired (all legitimately — telegram-web
  readers, 5 real misses each, likely deplatformed axis channels).
- Routes: telegram-web 8/32 · html 5/27 (**known bug** — all 27 point at a bare
  homepage; the reader needs `datePublished`/`<time>`, which live on article
  pages, not landing pages — fix is a route change, not a parser rewrite) ·
  x-mirror 5/18 (nitter mostly dead) · rss 19/24 (best route) · json 3/8
  (OpenSky + adsb.lol confirmed; GDELT + 2 dashboards added, unverified — never
  fetched, `--discover`/`--feedhunt` staged and waiting on CI).
- Dark lanes: `nuclear` 0/4, `cyber_sabotage` 1/5, `diplomacy` 2/23,
  `uae_local` 1/8 — mostly unwired, not sourceless. GDELT queries registered
  against all four, unverified.
- Blocked by datacenter-ASN WAFs from both sandbox AND CI: Reuters, IAEA,
  UKMTO, IDF, MarineTraffic, FlightRadar24, Al Arabiya, Times of Israel,
  AP, CBS, all `.gov`. **Decided fix: run from a local laptop (residential IP)
  instead of tunnelling — see "Where you are running" above. Tailscale/VPN
  ruled out: the cloud sandbox cannot reach the Tailscale control plane at all
  (tested, 000 on every endpoint), so a tunnel only ever helps from inside a
  CI runner, and CI has been unreliable — see next point.**
- **GitHub Actions stopped firing entirely as of 1 Aug** — pushes to valid
  trigger paths across two workflows produced zero runs while both report
  `active`. Not diagnosed from inside the repo (likely Actions minutes/billing
  on the private repo — check Settings → Billing → Usage, and Settings →
  Actions → General). This is why the move to a local laptop session matters:
  it removes the CI dependency for fetching entirely.
- **First completed fast→slow grading cycle**: `s-hormuz-talks` published as a
  FLASH on 28 Jul on one day's evidence (Bloomberg + Farsi domestic press),
  stated falsifier "strikes resume, or talks denied within 24h." Four days
  later Trump confirmed the track and cancelled a planned strike — graded
  CONFIRMED and promoted by hand. `resolve.mjs` still does not exist to do this
  automatically; done manually twice so far (also `s-houthi-toll-denial`,
  graded UNRESOLVED after 11 days silent).
- **Lane-relevance filter shipped** in `flash.mjs` (`isRelevant()`). First live
  run: 110 novel items, ~20 relevant, rest was recipes/telehealth/grape
  farming. Gate counts DISTINCT MATCHED KEYWORDS across EN/FA/AR/HE, not
  matched patterns — counting patterns silently zeroed out non-Latin scripts
  (all Farsi terms live in one regex, so a real Farsi war headline could never
  score above 1). If you touch this function, keep counting keywords, not
  patterns, or you will reintroduce that exact bug.
- `flash.mjs` cron added (`*/30 * * * *` in `social-fetch.yml`) but had not yet
  taken effect pre-merge — GitHub only runs `schedule:` from the default
  branch. Confirm post-merge that it is actually firing on schedule, not just
  that the YAML is valid.
- `HANDOFF.md` exists alongside this file — a build-attempt brief for a fresh
  session/tool (e.g. Cowork) with no context, covering pre-checks and
  stop-and-confirm points. Keep both in sync when either changes materially.

## Open work, in order

1. **Confirm the laptop session is actually being used for fetching** (owner
   is moving Claude Code to a local machine specifically to get a residential
   IP and route around both the WAF blocks and the CI outage). Verify with the
   reachability test above before assuming either sandbox or CI is still doing
   the work.
2. **Diagnose/fix the GitHub Actions outage** if the fast lane is meant to run
   on CI at all going forward — check Actions minutes/billing first.
3. **STEP enrolment** (`step.state.gov`) → embassy alerts arrive by email →
   read verbatim via the Gmail connector. Beats scraping; primary text, pushed.
4. **`resolve.mjs`** — the 24h grading pass, still manual. Highest integrity debt.
5. **Fix the `html` route** — move the 27 homepage-pointed sources to `rss`
   wherever they declare a feed (`--feedhunt` batch is staged in `probe.mjs`,
   blocked on CI/local fetch being available).
6. Connect the 92 unread. Wire `straits.live` CSVs (`/data/transits.csv`,
   `hormuz-index.csv`, `status.csv`, `oil.csv`) and Windward — both SERVER-rendered.
7. Stop `perplexity.mjs` discarding synthesis; point it at specific targets.
8. X API when the owner supplies it — the single biggest fast-lane unlock.
   FlightRadar24 paid is NOT worth it; `adsb.lol/v2/mil` is free and working.

## Branch

Develop on `claude/signals-live-layer`, merge to `main` to ship — `main` is
production and the only branch the fast-lane cron runs from.
