# THEATERS — the sub-agent fan-out that runs the lanes

The flat 14-lane sweep collapses into a **2-level hierarchy**: 5 parallel theater
workers gather + extract, one aggregator merges, Opus tiers on escalation. This is
**#2** built. Partition is by **theater (geography), never topic** — two sources in
one theater confirming each other is real convergence; the same claim echoing across
topics is fake. Source counts below are live from `data/sources.json` (lane-tagged).

```
        5 THEATER WORKERS  (Haiku · gather → extract → date-stamp · PARALLEL)
   ┌───────────────┬───────────────┬───────────────┬──────────────┬────────────┐
   │ tehran-       │ israel-       │ iraq-syria-   │ hormuz-      │ gulf-uae   │
   │ internal      │ lebanon       │ yemen         │ redsea       │            │
   └───────────────┴───────────────┴───────────────┴──────────────┴────────────┘
        │ each worker = its native lanes + pulls the SHARED baseline for a 2nd medium
        ▼
   SHARED BASELINE  ● cross-theater [41]  — wires · CENTCOM · global trackers · meta
        │  (never a worker; the independent-corroboration layer every worker queries)
        ▼
   AGGREGATOR  (Sonnet) — merge · dedup by claim · convergence ladder · candidate signals
        ▼
   TIERING  (Opus, on escalation) — independence check · adversary-origin = DISPUTED
        ▼
   SIGNALS LADDER → index.html signals[]
```

## The 5 workers (theater · native lanes · sources · model)

### 1 · TEHRAN-INTERNAL — Haiku — [21 sources]
- **Lanes:** `leadership_internal` (10) · `strikes_ops`/Iran-side (10) · `threats` (6) · `nuclear` (3) · `diplomacy`/Iran-US-track (3)
- **Media:** SOC 6 · STATE 5 · OFF 3 · ANALYST 3 · OSINT 2 · META 2
- **Watch:** Khamenei/IRGC intent, internal power, Iranian strike claims + threats, the nuclear file.
- **Key sources:** Khamenei Telegram (T1-ELEVATED), Fars/Tasnim/Mehr (STATE), IRGC-adjacent Telegram (SOC), IAEA is pulled from the shared baseline for nuclear.

### 2 · ISRAEL-LEBANON — Haiku — [20 sources]
- **Lanes:** `proxy_axis`/Hezbollah+Palestinian (13) · `israel_intel` (6) · `strikes_ops`/Israel-exchanges (5) · `air_traffic_airspace`/Israel (2)
- **Media:** SOC 15 · OSINT 3 · ANALYST 1 · OFF 1
- **Watch:** IDF-Hezbollah exchanges, Israeli entry trip-wires, axis mobilization. Heavy SOC → **tier DISPUTED until baseline corroborates.**
- **Key sources:** Tzeva Adom (alert), IDF Spox (OFF), Mannie Fabian / IDF Radar (OSINT), axis Telegram (SOC).

### 3 · IRAQ-SYRIA-YEMEN — Haiku — [4 sources] ⚠ THIN
- **Lanes:** `proxy_axis`/militias+Houthis (4) · `maritime_incidents`/Red-Sea (2)
- **Media:** SOC 2 · ANALYST 1 · OFF 1
- **Watch:** Iraqi PMF / Hezbollah-Iraq / Houthi ops on US forces + Bab el-Mandeb.
- **⚠ Coverage hole — #1 intake priority.** Only 4 sources; leans on ISW (ANALYST) + Houthis-official (OFF) + Ansarallah/axis Telegram (SOC). Supplied proxy-axis sources land here first.

### 4 · HORMUZ-REDSEA — Haiku — [15 sources] + owns `naval_military_movement`
- **Lanes:** `maritime_incidents` (10) · `war_risk_economy` (9) · `ports_advisories` (6) · **`naval_military_movement`** (global lane, assigned here — Gulf/Arabian-Sea carrier posture)
- **Media:** TRACK 6 · ANALYST 5 · OSINT 2 · OFF 2
- **Watch:** Hormuz vessel incidents, transit counts, war-risk premiums, carrier/amphib moves.
- **Key sources:** UKMTO (OFF), IMF PortWatch / straits.live (TRACK), TankerTrackers (OSINT), Lloyd's JWC / Kpler / Ambrey (ANALYST); USNI + carrier trackers pulled from baseline.

### 5 · GULF-UAE — Haiku — [9 sources] + owns `cyber_sabotage`
- **Lanes:** `uae_local` (6) · `air_traffic_airspace`/Gulf (4) · `diplomacy`/Gulf-mediation (1) · **`cyber_sabotage`** (global lane, assigned here — Gulf infra is the target set)
- **Media:** OFF 3 · WIRE 3 · TRACK 2 · ANALYST 1
- **Watch:** UAE exposure, NCEMA/air-defence, Gulf airspace + reroutes, Qatar/Oman channels, cyber-on-infra. **This is the resident-facing worker.**
- **Key sources:** UAE MOD / WAM / DLD (OFF), The National / Gulf News / Khaleej Times (WIRE), FR24 / Cirium (TRACK/ANALYST).

## Shared baseline — cross-theater [41 sources] (NOT a worker)
Wires (Reuters/AP/BBC/Al-Jazeera 12), meta dashboards (9), officials (CENTCOM/MFAs 6),
global trackers (ADS-B/FlightAware 5), OSINT bridges (OSINTdefender 4), Polymarket (MARKET 1).
Every worker queries this pool for an **independent second medium** — a SOC signal in a
theater worker + a WIRE hit from the baseline = *converging*, not single-origin. This layer
is why the convergence ladder can ever leave rung 1. It also holds the two globally-scoped
lanes' baseline sources (naval trackers, cyber/meta) that the owning workers reach into.

## Fan-out run sequence (what a manual run or the Routine executes)
1. **Fan out** — the 5 workers run in parallel. Each runs *its* lanes' queries (WEB seed +
   `gather-queries.json` PPLX) over *its* theater sources + the shared baseline. Haiku:
   extract claim + source + date only — **no tiering at the worker.**
2. **Return** the standard shape (below) up to the aggregator.
3. **Aggregate** (Sonnet) — merge all 5 streams, dedup by claim, run the convergence ladder
   (count *independent mediums* per claim across worker + baseline).
4. **Tier** (Opus, only on escalation) — independence audit; adversary-origin cluster = DISPUTED;
   nothing tops out on one medium.
5. **Write** `index.html` signals[]; **improve one worker/lane per turn** (LANES.md loop).

## Worker → aggregator handoff (same shape every worker, every run)
```
{ worker: "<theater>", lane: "<lane>", claim,
  sources:[{name, medium, lang, date}], momentum, via_recall, note }
```
The aggregator — not the worker — assigns `tier` and `rung`. A **silent worker is a finding**
(theater went dark), not a gap; it still returns `{worker, claim:null}` so the gap is visible.

## Model discipline
- **Workers = Haiku.** Extraction + date-stamping is cheap, parallel, and bounded — no judgment.
- **Aggregator = Sonnet.** Merge/dedup/convergence needs reasoning but not high-stakes tiering.
- **Tiering = Opus, on escalation only.** Independence + adversary-origin calls are where a wrong
  tier misinforms a UAE resident — worth the cost, but only when something is escalating.
- (Cost note: the autonomous Routine runs Sonnet-aggregate by default, Opus only on escalation.
  OpenRouter/multi-provider stays OFF this path — on-demand only.)

## Improvement log (append one line per turn)
- (build) 5 theater workers defined over the aligned registry; cross-theater = shared baseline;
  naval_military_movement→hormuz, cyber_sabotage→gulf. iraq-syria-yemen flagged THIN (4) = #1 intake target.
