# HORMUZ·LIVE — handoff brief for a fresh build attempt

Repo: `Iran-conflict-tracker`, branch `claude/signals-live-layer` (14+ commits
ahead of `main` — main is stale at Day 149, branch is at Day 154, not yet
merged). Read `CLAUDE.md` in the repo root first; this brief supplements it,
doesn't replace it.

## 1. What this is

A personal Iran-conflict early-warning tracker for one UAE household.
Live surface is `index.html` — a single self-contained file with an inline
`<script id="data" type="application/json">` block. Everything on the page
renders from that JSON. No frontend framework, no build step, no runtime
dependencies (`package.json` has zero).

## 2. Owner's goal — verbatim, not paraphrased

1. Tell one UAE household, **earlier and more honestly than the news would**,
   using broader and more intelligent search and sourcing — social, web,
   expert, military, naval.
2. **Use the sources. Make them work. Find more. Do not prune and filter them
   out.**

Signals are the goal: intelligent, broad, analytical. If you find yourself
recommending "drop the weak sources to simplify," that instinct has already
been flagged once by the owner as hiding weakness rather than fixing it.
Don't repeat it.

## 3. Architecture — two-speed, and why

**FAST LANE** (`scripts/flash.mjs`) — one source is enough. No corroboration
gate. A claim only one source is making is not noise to filter; it's the
product. Gates on exactly two things: RECENT (inside a time window) and NOVEL
(fingerprint unseen in `data/claims.json`). Never ranks by source tier — a T3
regional Telegram channel beating Reuters by four hours is the event this lane
exists to catch.

**SLOW LANE** — the next day, grade what the fast lane published: confirmed,
refuted, or unresolved. `scripts/resolve.mjs` does not exist yet. Until it
does, the fast lane publishes claims with no automated mechanism to grade
them — that's the current integrity debt, done by hand once so far.

**Why this shape:** the owner explicitly rejected a corroboration-first design.
Quote: *"one or two scattered sources, claiming something, is what we are
looking for. The instant report. That lasts only 24 hrs, but is the first to
know... Corroboration is for after 24 hrs."*

## 4. All sources — current registry state

`data/sources.json`, 201 entries. Route = which reader engine is wired to it.

| route | producing / wired | notes |
|---|---|---|
| `rss` | 19/24 | best-performing route by far |
| `telegram-web` | 8/32 | t.me/s public view, no auth |
| `x-mirror` | 5/18 | nitter mirrors, mostly dead |
| `html` | 5/27 | **known bug, see §6** |
| `json` | 3/8 | free APIs: OpenSky, adsb.lol, GDELT (unverified — never fetched) |
| **no reader (`NONE`)** | 0/92 | never attempted, not "failed" |

`35` sources flagged dark (3+ consecutive misses), `15` retired (5 consecutive
misses — legitimately, all deplatformed axis Telegram channels with a working
reader that genuinely stopped answering).

Full list is in `data/sources.json` — read it directly rather than trusting a
paraphrase, one field per source: `feed.kind`, `feed.url`, `hits`, `misses`,
`lanes[]`, `tier`, `medium`. `lanes` currently weakest: `nuclear` 0/4,
`cyber_sabotage` 1/5, `diplomacy` 2/23, `uae_local` 1/8.

## 5. Pre-checks — run BEFORE writing or changing any reader code

**5.1 — Reachability, not assumption.** The single most repeated mistake in
this project's history is declaring a source "blocked" from one failed
request. Test first:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 https://<target>
```

Run this from whatever environment will actually run the fetch (local
laptop / CI runner / sandbox) — reachability is environment-dependent. A
sandbox with a proxy allowlist will 403/000 on nearly everything; that is not
evidence the source itself is dead.

**5.2 — Exhaust routes before calling anything blocked.** Order: direct
homepage → declared feed (`<link rel="alternate">`) → known alternate domain
→ beat substitute (a different outlet covering the same beat) → republisher
(e.g. CENTCOM's `.mil` 403s, DVIDS republishes the identical releases). Only
after all four fail is "blocked" an honest word.

**5.3 — Read declared feeds, never guess them.** Don't try `/feed`, `/rss`,
`/rss.xml` blind. Fetch the homepage, search its HTML for
`<link rel="alternate" type="application/rss+xml">` or `atom+xml`, and use
exactly what the site declares. `scripts/probe.mjs` already does this — reuse
it, don't reimplement.

**5.4 — `probe.mjs` before any gather.** It answers reachability + declared
feed + response shape for a batch of URLs with zero cost (no API key touched,
no Perplexity spend). Never skip straight to building a reader for an
unprobed source.

**5.5 — Check for the split this repo depends on.** FETCH happens wherever
egress is open (CI runner, or local machine on a residential IP); APPLY
(writing scores back into `data/sources.json`) happens in the development
session. Applying inside CI causes a commit → re-trigger → re-fetch loop —
this has already burned ~50 Perplexity calls in one incident. Check
`.github/workflows/*.yml` `paths:` triggers before changing what a workflow
watches.

## 6. Known failures — do not rediscover these, they're already diagnosed

- **`html` route bug (5/27):** all 27 `html`-routed sources point at a **bare
  homepage**. The reader extracts `datePublished` from JSON-LD or `<time
  datetime>` — both of which exist on *article* pages, essentially never on
  landing pages. This is one design defect being misread as "27 sources
  mostly don't work." Fix is a route change (move declared-feed sources to
  `rss`), not a parser rewrite.
- **Future-dated items are not freshness.** One feed (`entekhab.ir`, Persian
  calendar) scored `freshestMin: -8198` (5.7 days in the future) before a
  guard was added. A negative age never expires and would permanently occupy
  the top of any "freshest first" sort. `read.mjs classify()` now discards
  items dated >90min ahead — keep that guard if you touch `classify()`.
- **`age`/`live` fields are banned, on purpose.** Time must be derived from
  `last_seen` at render time, never authored/hardcoded. A prior version had a
  hardcoded `~fresh` string that left 6-day-old cards pulsing "live."
  `scripts/validate.mjs` enforces this — don't weaken that check.
- **Datacenter-ASN WAF blocks are real and uniform**, not a parsing bug:
  Reuters, IAEA, UKMTO, IDF, MarineTraffic, FlightRadar24, Al Arabiya, Times
  of Israel, AP, CBS, all `.gov` — blocked from both the cloud sandbox and
  GitHub-hosted CI runners alike. A residential IP (local laptop) reaches most
  of these directly. Don't spend time trying to fix this with retries or
  different user agents.
- **Do not spoof user agents or route around an operator's access control.**
  This has been stated explicitly by the owner as a hard line, not a
  suggestion.
- **Applying only a "flattering" scoreboard while ignoring others** has
  previously hidden six live sources for days. If a run emits multiple
  engines' scoreboards, apply all of them.
- **"Structure is not function."** JSON parsing cleanly and CI exiting 0
  proves nothing about whether a source actually produced content. Always
  check the hit/miss scoreboard, not just that the script ran.
- **Signals decay on a schedule; sources are never pruned for being
  quiet.** These are different rules, deliberately — don't unify them.

## 7. Stop-and-confirm points — do not proceed past these without checking in

1. **Before deleting or "retiring" any source** that hasn't reached the
   documented auto-retire threshold (5 consecutive misses on a *working*
   reader). A source with `NONE` for `feed.kind` has never been attempted —
   that's a wiring gap, not a dead source, and must not be pruned.
2. **Before adding any credential-gated or paid API** (X API, FlightRadar24,
   etc.) — the owner makes that call, and has already declined FlightRadar24
   paid in favor of the free `adsb.lol/v2/mil` military feed.
3. **Before changing what counts as "blocked"** for any source in §6's list —
   these were each individually diagnosed after failure on the *first*
   attempt was earlier (wrongly) reported as final.
4. **Before merging to `main`** — main is currently 5 days stale relative to
   the working branch; confirm this is intentional before overwriting it, and
   confirm which branch Vercel treats as production before assuming a merge
   publishes.
5. **Before disabling or rewriting `scripts/validate.mjs` checks** — every
   check in it exists because of a specific incident (see §6). Treat a
   failing validator as a bug it caught, not an obstacle to route around.
6. **If a source list or set of URLs is handed to you by the owner** — the
   standing instruction is to add them, score them, and use them as primaries;
   this is not optional or subject to first "vetting for quality."

## 8. What NOT to do

- Don't declare victory on "CI exited 0" or "JSON is valid." Read the actual
  hit/miss numbers.
- Don't build a new reader engine per source type. The existing pattern is
  one engine (`read.mjs`) with pluggable routes (`--rss`, `--html`, `--json`);
  extend that rather than forking a parallel script.
- Don't assume the sandbox and the eventual runtime have the same network
  access. Test both, separately, every time.
