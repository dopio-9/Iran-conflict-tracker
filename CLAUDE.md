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

**Split: FETCH in CI, APPLY in session.** The sandbox proxy allows only
npm/pypi/crates/go/github/anthropic — every news, AIS and advisory host is
blocked here. CI has open egress. Applying in CI causes commit→re-fire loops
(one burned ~50 Perplexity calls per registry edit).

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

## State (last verified 1 Aug 2026)

- Registry `data/sources.json`: 193 sources, 40 producing, 89 never read
  (no reader, h0/m0), 35 dark, 15 retired (all legitimately — telegram-web
  readers, 5 real misses each, likely deplatformed axis channels).
- Routes: telegram-web 32 · html 27 (weakest, 5/27) · x-mirror 18 (5/18) ·
  rss 24 (best, 20/24) · json 3 (3/3).
- Dark lanes: `nuclear` 0/4, `cyber_sabotage` 1/5, `diplomacy` 2/23,
  `uae_local` 1/8 — mostly unwired, not sourceless.
- `index.html` at Day 150 (28 Jul) — **stale**.
- Blocked by datacenter-ASN WAFs from both sandbox AND CI: Reuters, IAEA,
  UKMTO, IDF, MarineTraffic, FlightRadar24, Al Arabiya, Times of Israel,
  AP, CBS, all `.gov`.

## Open work, in order

1. **Tailscale exit node in CI** for the datacenter-blocked set. Owner is
   supplying `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` (tag:ci) + exit-node host.
   Tunnel UP for `.gov` and blocked wires, DOWN for everything else — a UAE exit
   IP would likely lose Ynet / Haaretz / Israel Hayom, currently top performers.
   Control D DNS does not help: the block is source IP/ASN, not resolution.
2. **STEP enrolment** (`step.state.gov`) → embassy alerts arrive by email →
   read verbatim via the Gmail connector. Beats scraping; primary text, pushed.
3. **`resolve.mjs`** — the 24h grading pass. Highest integrity debt.
4. **Cron the fast lane.** It runs on push only, so it stops when nobody commits.
5. **Lane-relevance filter in `flash.mjs`.** Last run: 110 novel items, ~20
   relevant; the rest was recipes, telehealth, provincial newspaper front pages.
6. Connect the 89 unread. Wire `straits.live` CSVs (`/data/transits.csv`,
   `hormuz-index.csv`, `status.csv`, `oil.csv`) and Windward — both SERVER-rendered.
7. Stop `perplexity.mjs` discarding synthesis; point it at specific targets.
8. X API when the owner supplies it — the single biggest fast-lane unlock.
   FlightRadar24 paid is NOT worth it; `adsb.lol/v2/mil` is free and working.

## Branch

Develop and push to `claude/signals-live-layer`.
