# LANES — the narrow gather agents that feed Signals

Broad, fast news gathering is done by a **fixed roster of narrow lane-agents**.
Each lane owns ONE category, runs BOTH engines, and emits candidate signals in
one standard shape. **The roster is stable. We improve lanes one at a time, each
turn — we do not rebuild it.**

## Two engines, every lane
- **WEB** — in-session WebSearch. Fast, English, breadth. Run the lane's seed.
- **PPLX** — `agents/gather-queries.json` → `perplexity-gather` CI. Native-language,
  OSINT/social, tracking feeds, date-stamped. `★` in the log = novel (non-mainstream).
  Method + source registry: `agents/PERPLEXITY-PLAYBOOK.md`.

## Source registry (which real sources back each lane)
`data/sources.json` — 110 entries, each tagged `theater` + `lanes[]` + `medium` + `hits/misses`.
A lane's sources = filter the registry by that lane id. Intake procedure (classify → register →
wire → score) + schema live in `agents/ARCHITECTURE.md`; `validate.mjs` §2 enforces the tags.
When you add a source I supply: register it, wire it into this lane's seed + the PPLX query, score it.

## Standard output (what every lane returns, same shape every run)
`{ claim, tier: flash|pending|ver|ver2|disputed, region,
   sources:[{name,medium,lang,date}], momentum, via_recall, note }`

## Roster (11 lanes)
| Lane | Narrow scope | WEB seed | PPLX key |
|---|---|---|---|
| strikes_ops | US & Iran strike waves, targets, casualties | "US Iran strikes latest targets casualties today" | strikes_ops |
| threats | ultimatums, red lines, retaliation warnings | "Iran IRGC ultimatum threat red line US UAE today" | threats |
| cyber_sabotage | cyberattacks, sabotage, drone-on-infra | "Iran cyberattack sabotage Gulf UAE Saudi infrastructure today" | cyber_sabotage |
| diplomacy | back-channels, mediation, ceasefire drafts | "Iran US mediation Oman Qatar Egypt Russia China ceasefire today" | diplomacy |
| leadership_internal | Supreme Leader, IRGC command, internal power | "Iran leadership IRGC commanders internal power struggle today" | leadership_internal |
| maritime_incidents | Hormuz vessel incidents, seizures, disablements | "Strait of Hormuz vessel incident seizure IRGC navy today" | maritime_incidents |
| naval_military_movement | carrier/amphib/IRGC-navy moves | "USNI TWZ carrier strike group movement Gulf Oman today" | naval_military_movement |
| air_traffic_airspace | mil-air, NOTAM/airspace, airline reroutes | "NOTAM airspace closure Gulf Iran Flightradar reroute today" | air_traffic_airspace |
| ports_advisories | UKMTO/MARAD, AIS, port notices | "UKMTO MARAD advisory Hormuz Fujairah Jebel Ali AIS today" | ports_advisories |
| proxy_axis | Houthis, Iraqi militias, Hezbollah ops | "Houthi Iraqi militia Hezbollah attack US forces region today" | proxy_axis |
| war_risk_economy | Brent, war-risk insurance, surcharges, transits | "Brent oil war risk insurance Hormuz tanker rerouting today" | war_risk_economy |
| uae_local | UAE exposure, NCEMA/air-defence, resident-facing | "UAE Fujairah Jebel Ali Dubai NCEMA advisory residents today" | uae_local |
| israel_intel | Israeli entry trip-wires, intel assessments | "Israel Iran intel assessment involvement Hormuz today" | israel_intel |

(`nuclear` runs as an on-demand lane off `gather-queries.json` when a nuclear item is live.)

## Fan-out (how the lanes actually run)
The 14 lanes execute inside **5 theater workers** — `agents/THEATERS.md`. Each worker
owns its theater's lanes + the aligned registry's sources, runs BOTH engines in parallel,
and hands claims to the Sonnet aggregator; Opus tiers on escalation. Run the fan-out, not
14 flat sweeps. The per-turn loop below is what each worker + the aggregator do.

## Per-turn loop (do this — do not rebuild)
1. **Run** the WEB seeds (breadth) + trigger the PPLX gather (depth). Both, every turn.
2. **Merge** → candidate signals; dedup by claim; date-stamp each source; tier from
   **independent mediums only**.
3. **Update** `index.html` `signals[]`: add new, promote (T2 lands), expire (TTL/contradicted).
   Keep it lean — the strip surfaces what is LIVE, no debunk-museum.
4. **Improve exactly one lane** (tighten a query, add a source, cut a dud) and note it
   below. One notch per turn.

## Reliability contract
- Same output shape every run; a silent lane is a finding, not a gap.
- Adversary-origin cluster (e.g. Israeli/Saudi on Iran-internal) = **DISPUTED**, never confirmed.
- No YouTube · dedup · `★` novel first · a lane never sets ver2 on one origin.

## Lane improvement log (append one line per turn)
- (start) roster established; PPLX matrix has 10/11 lanes; `strikes_ops` PPLX key still to add.
- closed topic gap: added `strikes_ops`, `threats`, `cyber_sabotage` PPLX lanes → 14 lanes, full coverage of troops/naval/air/military/trade/strikes/retaliations/geopolitics/government/threats/escalation/cyber.
- aligned `data/sources.json`: tagged all 110 sources with `theater` + `lanes[]` + `medium` + `hits/misses`; registry now queryable per-lane; `validate.mjs` §2 enforces the tags. Coverage report flags holes: `cyber_sabotage` (2), `nuclear` (3), theater `iraq-syria-yemen` (4) → intake priority.
