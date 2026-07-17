# DELTA — improved gather vs Day 136 `data.json` on main (13 JUL 2026)

Controlled A/B, roadmap step 3. Prediction was: *disputes close + speed-tier
items appear; same story, better inputs.* Result: **both of the closeable VERIFY
disputes close, the third decomposes, and the gather missed a headline-class
event entirely** — the first fatality of the cycle, on UAE-flagged tankers, on
a tracker whose lens is UAE.

## 1. VERIFY disputes — 2 close, 1 transforms

| Dispute (Day 136 state) | Improved-gather outcome | What closed it |
|---|---|---|
| **Was Oman struck?** — `disputed`, "awaiting Gulf-state confirmation" | **CLOSES → confirmed.** ONA (official source): Duqm port hit by two drones, 1 worker injured, debris near fuel storage. Oman MFA condemned. | Exactly the source class the VERIFY card named (Gulf official wire) — the registry simply had no Omani channel. Knowable by the 12:00 GST cut. |
| Qatar struck? (half of the same card) | **CLOSES → confirmed.** Qatar MoI: 3 injured incl. a child at/near Al Udeid. Retaliation list resolves to all five states. | Gulf official source, same morning. |
| **Sea-drone first use** — confirmed claim, `unverified` effect ("awaiting OSINT corroboration") | **CLOSES → confirmed.** USNI published strike video; platform (3× Saronic Corsair) and target (Bandar Abbas sub/ship-maintenance facility) named across defense trade press. | Landed hours after the cut — a second daily cycle closes it same-day. |
| **Strait open or closed?** — rendered as US-"open" vs Iran-"not possible", ground truth "6 transits/12h ≈ −70%" | **TRANSFORMS.** The 6 was Kpler's count of AIS-dark commodity carriers; 14 total ships crossed (−60% w/w); DOE says 8.5M bbl moved under US escort. And the frame moved: Trump declared the US "GUARDIAN OF THE HORMUZ STRAIT," proposed a **20% toll**, reinstated a naval blockade. | Decomposition rule: the single "6 in 12h" number was one methodology presented as ground truth. The honest render is three numbers with three denominators — and "transitable under threat" is becoming "transitable under paid US escort." |

## 2. Missed headline: UAE tankers hit, first fatality of the cycle

Absent from Day 136 data entirely: Iranian cruise missiles hit tankers
**al-Bahiya** and **Mombasa** in Omani territorial waters (per the UAE) —
**one Indian crew member killed**, 8 injured, both ships afire. IRGC framing:
"rogue supertankers" on a **"mined route."**

Why this is the biggest single delta:
- **Trigger 04 fired the same day it was published** ("first death of this cycle
  would harden every Western position") — and the tracker didn't see it.
- **`uae-exemption` pattern (HYPOTHESIS) needs a split definition**: UAE
  *territory* remains unstruck (the hypothesis held), but UAE *assets* are now
  being hit and UAE-linked crew killed. The exemption, if it exists, is
  narrower than the pattern text assumes.
- **First public Iranian mining claim** — a war-risk-insurance regime-changer
  if UKMTO/BIMCO corroborate; filed as FAST 1 with promote/expire criteria.
- `uae_means` — the section that answers "what does today mean for a UAE
  resident" — described a steady picture while UAE tankers were burning.

## 3. Other material deltas

- **Israel PENDING sharpens.** Old falsifier: "watch for T2 confirmation."
  New: two named trip-wires from a senior Israeli official — direct Iranian
  attack on Israel, or a US request — plus active IDF-US scenario coordination.
  Knowable by the cut (ToI, 12 Jul). The tail-scenario weighting gets a real
  hinge instead of a vigil.
- **The 20% toll collides with the tracker's own countdown clock** (toll-free
  window, T−35). The deadline artifact needs a conditional: whose toll regime
  is that expiry even about now?
- **Retaliation detail upgraded** from "some reporting adds Qatar and Oman" to
  per-site claims with claimed-vs-confirmed effect splits (Duqm radar/logistics;
  Al Udeid jet-maintenance/C2) — WIRE-quality granularity.
- **Khamenei TG silent on the day** of Round 4 + talks collapse — the improved
  gather records the silence; the original cycle didn't sample the lane.
- **ISW/Critical Threats same-day special report existed** and went unused
  (registry has ISW; the cycle never reached the SPECIALIST fill step).

## 4. Timing honesty (the A/B's own conflict, rendered)

Of the eight findings: **4 were knowable by the original 12:00 GST cut**
(Oman close, Qatar close, Israel trip-wires, Brent context) — pure reach
failures, fixed by protocol. **4 landed later on 13 Jul** (USV corroboration,
guardian/toll/blockade, UAE tankers in part, transit decomposition in part) —
cadence failures: invisible to a once-daily cycle, caught same-day by the
LISTEN fan-out at 2-3 cycles/day. The split is the argument for both halves of
the build: protocol fixes reach, lanes fix cadence.

## 5. Scout harvest (filed in `data/candidates.json`)

The run exposed a structural registry gap: **Gulf official wires beyond
QNA/WAM are missing** — ONA (which closed the Oman dispute) wasn't reachable
as a registry source, nor BNA/KUNA. Nine nominations filed: ONA, Oman MFA,
BNA, KUNA, Naval News, Argus Media, Insurance Journal, hormuzmonitor.com,
FDD Overnight Brief. None are citable until tiered (SCOUT rule).

## Verdict

Same story — Round 4, GCC retaliation, talks collapse, disputed strait — but:
2 disputes closed (one before the same cut the original ran on), 1 dispute
decomposed into honest numbers, 1 missed fatality-headline recovered, 1 new
fast-signal class (mining claim) with a lifecycle attached, and 9 source
nominations. The gathering layer was the bottleneck; the improved gather is
measurably wider on the same day's story.
