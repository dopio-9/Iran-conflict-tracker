# GATHER re-run — 13 JUL 2026 (Day 136) · improved protocol, web-search substrate

Controlled A/B for roadmap step 3. Run executed 17 JUL 2026 against the 13 Jul
story, using the upgraded GATHER protocol (dispute-targeted fan-out, decomposition
rule) plus LISTEN lane sweeps (web-search-only v1). Compare against `data/data.json`
as of Day 136 on `main` (12:00 GST cut) — see `DELTA.md` alongside this file.

**Fairness note:** each finding carries `knowable-by-cut:` — whether the material
was plausibly available by the original update's 12:00 GST cut, or only later on
13 Jul (which a multi-cycle LISTEN cadence would still have caught same-day).

---

FINDING 1
claim:      Oman WAS struck — ONA (official source) confirms Duqm port targeted by two drones; one hit a mobile workers' housing unit injuring a foreign worker; debris from the second fell near fuel storage tanks. Oman FM condemned the attack and called for an immediate halt to attacks on sites across the region.
when:       strikes ~05:30 GST 13 JUL; ONA/FM statements same day
geo:        OMAN
sources:    ONA (official, via Anadolu/Argus republication) [T2] · Oman MFA fm.gov.om [T2] · IRGC statement [T1] · Al Jazeera [T2]
tier-call:  ver2
conflicts:  IRGC claims it destroyed "FPS long-range aerial radar and the vessel detection radar" plus carrier logistics/refuelling platforms at Duqm; ONA describes two drones, minor damage, one injury. Claimed effect vs confirmed effect diverge — render both.
numbers:    2 drones (ONA) · 1 injured (foreign worker) · 0 damage to fuel storage (debris only)
knowable-by-cut: YES (ONA statement was out the same morning; the original gather never reached Omani official channels)

FINDING 2
claim:      Qatar WAS struck — Qatar Ministry of Interior reports three people injured (including one child) by falling shrapnel; IRGC claims ballistic-missile strikes on Al Udeid destroyed a fighter-jet maintenance centre and a command-and-control facility.
when:       ~05:30 GST 13 JUL; MoI statement same morning
geo:        GCC
sources:    Qatar MoI (official) [T2] · IRGC [T1] · Al Jazeera [T2] · CNBC [T2]
tier-call:  ver2
conflicts:  IRGC claims facilities "destroyed"; Qatar reports shrapnel injuries only, no BDA released. Claimed vs confirmed effect diverge.
numbers:    3 injured incl. 1 child (Qatar MoI, 13 Jul)
knowable-by-cut: YES — with Findings 1-2, the retaliation list resolves to all five states: Bahrain, Kuwait, Jordan, Qatar, Oman.

FINDING 3
claim:      Iranian cruise missiles hit two tankers — al-Bahiya and Mombasa — in OMANI territorial waters, per the UAE; one Indian crew member killed aboard Mombasa, six Indian and two Ukrainian crew injured; both vessels damaged and caught fire. IRGC says it "struck and disabled two rogue supertankers" that had switched off navigation systems, ignored warnings, and attempted a "mined route."
when:       13 JUL (reported through the day GST)
geo:        HORMUZ
sources:    UAE statement (per US News/CNN) [T2] · IRGC statement [T1] · CNN live blog [T2]
tier-call:  ver2
conflicts:  Attribution/framing — UAE: Iranian missiles on its tankers in Omani waters; IRGC: enforcement action against "rogue" vessels on a "mined route" (does not name the ships or flags). Do not resolve.
numbers:    2 tankers · 1 killed (Indian national) · 8 injured (6 IN, 2 UA) · first fatality of this cycle
knowable-by-cut: PARTIAL — event was 13 Jul; first sightings likely near/after the 12:00 GST cut. A second daily cycle would have carried it same-day. NOTE: this is also the first Iranian public claim that transit routes are MINED.

FINDING 4
claim:      Sea-drone first use independently corroborated — three Saronic Corsair one-way-attack USVs struck a submarine and ship-maintenance facility at Bandar Abbas naval base; CENTCOM confirmed on X and USNI published strike video.
when:       strikes 12-13 JUL; CENTCOM X post + USNI video 13 JUL (US time, evening GST)
geo:        IR
sources:    CENTCOM (X) [T2] · USNI News (video) [T2] · Naval News / Breaking Defense / Military Times [SPECIALIST-class trade press]
tier-call:  ver2
conflicts:  none on the first-use claim; target-count framing still varies ("dozens" vs 140)
numbers:    3 USVs · Corsair: 24 ft, >1,000 nm range, 1,000 lb payload, 35 kt
knowable-by-cut: NO (landed hours after the cut) — closes the "awaiting OSINT corroboration" row in VERIFY same-day on a second cycle.

FINDING 5
claim:      Trump declares the US "THE GUARDIAN OF THE HORMUZ STRAIT," proposes a 20% toll on all cargo transiting, and reinstates a naval blockade of the strait; DOE says 8.5M barrels of oil transited Sunday with US military assistance — "oil flows continue, with or without the Iranians."
when:       13 JUL (US time, evening GST)
geo:        US / HORMUZ
sources:    Trump statement [T2-official] · DOE spokesperson [T2] · CNBC · Al Jazeera · Time [T2]
tier-call:  ver2
conflicts:  none on the statements themselves; the 20% toll directly collides with the MOU's toll-free window (expires 17 AUG, T−35) — flag for REASON.
numbers:    20% proposed toll · 8.5M bbl transited Sunday (DOE) · claim of >100M bbl / 200 ships escorted to date (Trump, ABC — treat as unverified)
knowable-by-cut: NO — same-day catch on a later cycle. Reframes the strait dispute: from open/closed adjectives to contested PAID GUARDIANSHIP.

FINDING 6
claim:      Transit-count decomposition — the "6 transits" figure is one methodology among several: Kpler preliminary counted 6 commodity carriers Sunday, ALL transiting with AIS transponders OFF; total-ship counts give 14 Sunday (vs 37 same day prior week, ≈−60%); DOE claims 8.5M bbl of oil moved with escort. AIS-based counts now materially undercount physical flow.
when:       Sunday 12 JUL data, published 13 JUL
geo:        HORMUZ / MARKETS
sources:    Kpler (via Bloomberg/Insurance Journal) [SPECIALIST] · The National [T2] · US News [T2] · DOE [T2]
tier-call:  ver (methodological conflict — render all three numbers with provenance)
conflicts:  6 (Kpler, tankers, AIS-dark) vs 14 (all ships) vs 8.5M bbl (DOE, escorted). Not contradictory once decomposed — different denominators — but no single "ground truth" number exists.
numbers:    6 tankers (Kpler, prelim) · 14 ships total · −60% w/w · 8.5M bbl (DOE) · two-month low
knowable-by-cut: PARTIAL (trade-press pieces landed through 13 Jul)

FINDING 7
claim:      Israel re-entry conditions now DEFINED — senior Israeli security official: Israel rejoins only on (a) a direct Iranian attack on Israel or (b) an explicit US request; IDF is coordinating scenarios with the US military, including one where the US intensifies and Israel joins.
when:       12-13 JUL
geo:        IL
sources:    Times of Israel daily briefing [T2] · Jerusalem Post live [T2] · senior Israeli security official (named-role, unnamed)
tier-call:  ver
conflicts:  none — but note this remains official-sourced signalling; no T2 force-movement confirmation exists.
numbers:    6 consecutive days of US-Iran exchanges without Israeli entry
knowable-by-cut: YES — the ToI briefing was out 12 Jul. Sharpens the PENDING item's falsifiers from "watch for T2 confirmation" to two named trip-wires.

FINDING 8
claim:      Brent approached $80 (from $71.99 the prior week; April war-peak was $126) — consistent with the tracker's ~$79, adds the baseline context.
when:       13 JUL
geo:        MARKETS
sources:    CNBC · Time · The National [T2]
tier-call:  ver2
conflicts:  none
numbers:    ~$79-80 (13 Jul) · $71.99 (prior week) · $126 (April peak)
knowable-by-cut: YES

---

## FAST block (LISTEN v1, retrospective)

FAST 1
claim:       Iran asserts Hormuz transit routes are MINED ("mined route", IRGC tanker statement)
first-seen:  13 JUL · LANE EN · IRGC statement via wire copy
ladder:      rung 2 → pending-med (single origin, multi-outlet echo)
sightings:   IRGC statement (FA lane origin); CNN/US News carriage (EN lane, not independent)
ttl:         14 JUL 12:00 GST
lifecycle:   open at emit — mining claim unconfirmed by UKMTO/BIMCO at time of run; if UKMTO issues a mine advisory it promotes; if transits continue unhindered on the claimed route it expires. EITHER outcome is load-bearing for war-risk premiums.

FAST 2
claim:       US to charge 20% toll on Hormuz cargo ("GUARDIAN OF THE HORMUZ STRAIT")
first-seen:  13 JUL · LANE EN · Trump statement (single origin)
ladder:      rung 1 → pending-low at first sighting; promoted same day (DOE/CENTCOM follow-through = T2 lands)
sightings:   Trump post (origin) → CNBC/AJ/Time carriage → DOE spokesperson corroboration (independent T2)
ttl:         n/a — promoted
lifecycle:   PROMOTED → handed to GATHER (Finding 5)

LANES QUIET: FA lane on leadership — no Mojtaba Khamenei statement surfaced for
13 JUL specifically (last statements found are earlier: MOU red-lines framing,
"new management of the strait will bring calm"). Khamenei TG silence on the day
of Round 4 + talks collapse is itself a finding for REASON.

T2 SILENT ON: UKMTO advisory naming al-Bahiya/Mombasa (not surfaced in-run);
UAE MOD/WAM direct copy (UAE attribution reached us via US News/CNN carriage —
registry lacks the Gulf official wires beyond QNA/WAM, see candidates queue);
CENTCOM on the UAE-tanker incident.

SPECIALIST note: ISW/Critical Threats published an "Iran Update Special Report"
dated 13 JUL — same-day assessment layer was available and unused in the
original cycle.
