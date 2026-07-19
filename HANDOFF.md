# HANDOFF — Iran Conflict Tracker (HORMUZ·LIVE)
### Continuation brief for a fresh session. Written 13 Jul 2026 (Day 136).
### Read this first, then `README.md`, then `agents/PIPELINE.md`.

---

## 0. What this project is
A live decision-support tracker for the 2026 US–Iran war and Strait of Hormuz crisis,
built for a **UAE resident**. Doctrine: **speed first, verify second, forecast third.**
Every claim carries a verification tier; every forecast is graded against reality on expiry.
**All times in GST (UTC+4), no DST — standing rule.**

---

## 1. Current repo state (verified at handoff)

| Branch | Contents | Status |
|---|---|---|
| `main` | Live tracker, **Day 136** data | **production — auto-deploys to Vercel** |
| `claude/design-lab-archive` | `design-lab/` only (8 concepts + film + MOTION.md) | pushed; **PR not yet opened** — user's call |
| `claude/hormuz-tracker-nextgen-cbjlfy` | both of the above (superseded) | stale — safe to delete |

- **Live URL:** `iran-conflict-tracker-nextgen-two.vercel.app` (Vercel project "sub-quadratic", team "Boom Town"). Every push to `main` auto-deploys.
- **Design-lab PR link (open when wanted):** `github.com/dopio-9/Iran-conflict-tracker/pull/new/claude/design-lab-archive`
- Merged PRs to date: #1 (next-gen build), #2 + #3 (Vercel 404 fixes). Day 136 reached main via cherry-pick, not PR.

---

## 2. Architecture (the thing to preserve)
Data/template split — updating = rewriting JSON, never the HTML.
```
index.html            static template (both themes), fetches /data/*.json. Rarely changes.
data/data.json        the daily payload (~26k). Rewritten every update.
data/sources.json     110-source tiered registry.
data/patterns.json    learned-pattern state machine (HYPOTHESIS→ACTIVE→STRESSED→CONFIRMED/BROKEN).
data/scenarios.json   forecast ledger — every scenario set graded HIT/MISS/PARTIAL on expiry; lessons kept.
scripts/validate.mjs  guardrail: schema + §3 rules + node --check on the template. Run before every commit.
.githooks/pre-commit  runs the validator (enable once: git config core.hooksPath .githooks).
agents/               pipeline prompts: GATHER.md (Haiku), REASON.md (Sonnet), PIPELINE.md (the loop).
design-lab/           exploration archive — NOT wired into the live build.
vercel.json           / served from repo root, /data/* no-cache.
```
Tabs: WIRE · NOW · VERIFY · NEXT · PATTERNS · CONTEXT · SOURCES.

**Non-negotiable rules (enforced by validate.mjs):** nothing gets `ver2` on one source; render conflicts, never pick a winner; every WIRE item needs a `why`; scenario probs total 100 and are labelled analytical judgment; reconcile conflicting numbers to the most-recent-with-timestamp; conditional boilerplate must be conditional; UAE lens on everything; graded forecasts need a `lesson`. Bug class to avoid: no straight apostrophe in single-quoted JS (content lives in JSON now), no JS ternary in CSS, no localStorage.

---

## 3. Where the story is (so the next update has continuity)
**Day 136 · 13 Jul 2026.** US Round 4 (CENTCOM: 140 targets, first-ever one-way attack **sea drones**; hit air-defence, coastal radar, missile/drone sites, small boats). Iran retaliated across the GCC (Bahrain/Kuwait/Jordan confirmed; **Qatar/Oman disputed**). **Muscat talks collapsed** with nothing agreed — Iran blames US pressure on Oman; Trump says talks continue but the June ceasefire is "scrapped." Strait status is now an open **US-"open" vs Iran-"not possible"** dispute; ground truth = ~6 transits/12h vs ~18–22/day. Brent ~$79 (+4%). Toll-free window expires 17 Aug (**T−35**).

**Live disputes (in VERIFY, awaiting closure):** (1) was Oman struck? (2) strait open or closed? (3) US sea-drone first-use. **Standing PENDING:** Israeli re-entry — signalled 11 Jul, still no T2 confirmation after 6 days (each day of non-entry slightly lowers the tail).
**Ledger open:** 12 Jul set (base case already failing), 13 Jul set (45/30/25 toward contested-stalemate). Grade the 12 Jul set at ~15 Jul.
**Pattern watch:** `escalate-negotiate-parallel` → STRESSED (tracks diverged 13 Jul); `uae-exemption` at day 6.

---

## 4. The roadmap (user's chosen sequence)
1. ✅ **Prove the pipeline** — done on Day 136. Verdict: **reasoning layer strong, gathering layer is the bottleneck** (no T1/Telegram/OSINT feed; primary sources paywalled; disputes couldn't close for lack of reach).
2. ⏭ **Wire in Perplexity and/or agents** to attack the gathering bottleneck (design below).
3. ⏭ **Re-run 13 Jul** with the new inputs — controlled A/B: the delta should show as disputes that close + speed-tier items appearing. Same story, better inputs.
4. ⏭ **Then** tackle visual design (design-lab is the starting point).

---

## 5. Agent / speed design — DECIDED, not yet built
Governing principle: **additions feed the verification discipline, they never bypass it.** Discovery/gather sits upstream of the tier logic; nothing auto-writes to WIRE.

- **Source-discovery = a candidates queue, not new citations.** Reframe "find new sources" into: (a) **blind-spot topic scan** (highest ROI — catches the miss-class the ledger already logged: Iran closing its *own* strait), (b) **registry decay audit** (placeholder Telegram IDs 109–110), (c) **candidate nomination** for human/Fable tiering. Build first artifact: `agents/SCOUT.md` + `data/candidates.json` + a review tab.
- **Speed / fast-signal = a lane-partitioned listener fan-out** (Haiku listeners per language/substrate → one Sonnet aggregator), NOT a swarm. Emits `pending`/`flash` with a **convergence confidence ladder** (1 source=pending low; N independent early sources converging=flash; Khamenei TG weighted alone; contradiction=disputed). Every fast item gets a **lifecycle**: promote (T2 lands) / contradict / **expire** (logged, like the forecast ledger) — this is what stops it becoming a rumor mill.
- **Perplexity = a stronger GATHER engine, with a hard ceiling.** Better recall/freshness/citations — but it is a **T1 gatherer, not a verifier**, and its instinct to *blend* sources violates the render-the-conflict rule, so its output must be **decomposed back to primary sources before tiering**. Never pipe Perplexity synthesis straight to WIRE. Adds an external dependency + cost.
- **Substrate fork (user decision pending):** start **web-search-only** (free, works today, laggy) vs invest in **Telegram/X API access** (fastest; cost + ToS + setup). Recommendation: build the full architecture on web-search first, swap in faster pipes later — architecture doesn't change.

---

## 6. Visual / motion work — PARKED in `design-lab/` (tracker design frozen for now)
8 static concepts (admiralty chart, broadsheet extra, ops-wall, seismic-ledger, redacted-file, thermogram, illuminated-manuscript, orbital-nocturne) + **the daily title-sequence film** (`film-day135.html`) and its **`MOTION.md` grammar** (the reusable spec — read it first to resume video work). User's read: "quality of visual elements needs upscaling" — next visual pass should push execution fidelity, not invent new concepts. **Model-use lesson learned:** Fable's leverage is authoring *concepts + grammars* once; Opus runs them daily.

---

## 7. Gotchas for the next session
- **GitHub connector needs re-auth** to create/merge PRs via MCP (reconnect in claude.ai connector settings). Git push works regardless via the proxy remote.
- **This sandbox blocks `*.vercel.app` outbound** (org egress policy) — you cannot fetch the live URL to verify it. Use screenshots from the user or the Vercel dashboard.
- **Vercel** auto-deploys `main` only; branch previews appear in the dashboard's Deployments tab.
- **Model hierarchy** (cost): Haiku gathers, Sonnet reasons, Fable for weekly/structural/design. Don't run the whole daily loop on one expensive model (this session did, inline — fine for testing, not for production).
- **Playwright/ffmpeg** are available (`/opt/pw-browsers/`) for render checks and video capture; ffmpeg here encodes **VP8/webm only** (no libx264).
- Run `node scripts/validate.mjs` before every commit — it is the guardrail for the whole rule set.

---

## 8. First prompt for the fresh session
> Read HANDOFF.md, then agents/PIPELINE.md and agents/GATHER.md/REASON.md. We're at step 2 of the roadmap: wiring the gathering layer. Start web-search-only. Build `agents/SCOUT.md` (blind-spot scout → candidates queue) and the fast-signal listener design, then re-run the 13 Jul update through the improved gather and show me the delta vs the current Day 136 data on main.

---

## 9. STATE as of Day 140 build (17 Jul 2026) — READ agents/BUILD.md next
Gathering layer done: `agents/SCOUT.md` + `LISTEN.md` + `candidates.json` (10
noms) built; GATHER/REASON/PIPELINE wired with **function-level model tiers**
(Haiku gather · Sonnet reason · **Opus grading/patterns/tiering/high-stakes** ·
Fable visual-only). 13 Jul A/B in `agents/runs/2026-07-13-rerun/`. Day-140 data
live on branch (blockade, infra war, Kuwait plant, Bab el-Mandeb order). Ledger
graded 12+13 Jul; new pattern `infrastructure-reciprocity`.

**Now on branch `claude/signals-live-layer`.** Next build is fully specced in
**`agents/BUILD.md`**: (A) SIGNALS lean lane — a strip not a tab, surface live
unverified news, no debunk-museum; (B) Perplexity as Haiku-tier gather booster
behind decomposition+date-stamp — **needs `PERPLEXITY_API_KEY` from user**;
(C) Actions runner (`run-update.mjs` + `update.yml`) so updates fire from a
plain Claude chat / page / cron, not only Claude Code — **needs
`ANTHROPIC_API_KEY` secret**; (D) redesign sequencing — IA declutter (Opus)
before any Fable visual pass. Live doctrine proof this session: Perplexity
temporally-blended a 14 Mar UAE-ports warning into a false "elevated tonight"
(captured in GATHER.md).
