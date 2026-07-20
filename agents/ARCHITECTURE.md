# HORMUZ·LIVE — architecture (wire diagram + the layer model)

Legend:  ● built now   ◇ planned / not wired

## Four orthogonal layers (the fast-event miss lives in L1–L3, never L4)

- **L1 COVERAGE** = lanes + source registry — *are we watching the right places?*
- **L2 AGENTS**   = the workers that gather + reason — *do we query + tier + surface?*
- **L3 PIPE**     = how we reach a source — *freshness ceiling* (index lag vs real-time)
- **L4 TRIGGER**  = Routine or manual — *just the clock; manual bypasses it*

A manual run at T+2min surfaces a fast event **iff** L1 has the source, L2 renders
it at FLASH, and L3 can see it yet. Cadence (L4) is not the bottleneck.

## Wire diagram

```
                    HORMUZ·LIVE — ARCHITECTURE

L1 COVERAGE — what we watch
┌────────────────────────────────────────────────────────────┐
│ SOURCES  (● data/sources.json = 110-entry registry, lane-tagged)│
│  native   ● Tasnim Mehr Fars IRNA · AlMayadeen Almasirah     │
│  Hebrew   ● Mako Walla Ynet     Russian ● iz.ru              │
│  osint/soc● t.me/s mirrors · X accounts · analysts           │
│  tracking ● USNI/TWZ · MarineTraffic/AIS · FR24/ADS-B ·      │
│             UKMTO/MARAD/NOTAM · Lloyd's/Maersk               │
└────────────────────────────────────────────────────────────┘
              │
L3 PIPE — how we reach them (freshness ceiling)
   ┌───────────────┬────────────────┬───────────────────────┐
   │ ● WebSearch   │ ● Perplexity   │ ◇ X / Telegram API    │
   │  (in-session) │  (CI · adv.)   │   real-time — NOT wired│
   └───────────────┴────────────────┴───────────────────────┘
              │  date-stamped primaries (★ = novel layer)
              ▼
L1 LANES — 14 lanes ● , grouped into 5 THEATERS ● (agents/THEATERS.md)
   Tehran-internal[21] · Israel-Lebanon[20] · Hormuz/RedSea[15] ·
   Gulf-states/UAE[9] · Iraq-Syria-Yemen[4⚠]   + shared baseline cross-theater[41]
   topics (strikes threats military retaliations…) = TAGS, not lanes
              │
L2 AGENTS — who executes + reasons
   ● theater workers (Haiku ×5) → gather · extract · date-stamp · PARALLEL
              │                    (spec: THEATERS.md; runtime fan-out at update time)
   ● AGGREGATOR (Sonnet)       → merge · dedup · convergence ladder
              │
   ● TIERING (Opus, on escalation) → independence · adversary = DISPUTED
              │  candidate signals {claim,tier,region,sources,momentum,note}
              ▼
   ● SIGNALS LADDER   FLASH → PENDING → VER → VER²   · DISPUTED
     rung-1 shown lowest-confidence · promote/expire · no YouTube · dedup
              │  writes
              ▼
┌────────────────────────────────────────────────────────────┐
│ ● index.html — inline JSON data block = the update surface   │
│   hero (threat + UAE line + chips) │ SIGNALS │ depth folds:  │
│   verified · triggers · forecast/scenarios · ledger ·        │
│   patterns · practical · recall-rules                        │
└────────────────────────────────────────────────────────────┘
              │
L4 TRIGGER — when (just the clock)
   ● manual run        ◇ Routine cron 07:00 / 19:00 GST (Sonnet, Opus-esc)
              │
   PUBLISH ▼  git push → branch ● →(main ◇)→ Vercel deploy → phone
```

## Source intake (fixed procedure when a source is supplied)
1. **Classify** — theater (5 + cross), lane(s) from the 14-roster, medium (STATE/WIRE/OSINT/SOC/OFF count for convergence; TRACK/ANALYST/MARKET/META = specialist/context), language, tier (T1 / T2 / T1-ELEVATED / T1-UNRELIABLE / SPECIALIST / META).
2. **Register** — append to `data/sources.json`, one canonical schema:
   `{id, name, platform, language, domain, geography, role, tier, theater, lanes[], medium, hits, misses, notes}`.
   `validate.mjs` §2 rejects any source missing a valid theater / lane / medium — registered-but-orphaned can't ship.
3. **Wire** — name it in that lane's WEB seed + `gather-queries.json` PPLX query (**registered ≠ monitored until queried**).
4. **Score** — increment `hits`/`misses` as its signals promote/expire; weight rises/falls with its hit rate.

**Live coverage (post-alignment):** thinnest lanes = `cyber_sabotage` (2), `nuclear` (3); thinnest theater = `iraq-syria-yemen` (4). These are the priority targets for supplied sources.

## Honest floor
On a manual run, surfacing speed = as fresh as the reachable index (minutes–tens
of minutes). Removing that floor requires the ◇ X/Telegram API pipe (L3) — not a
lane, agent, or Routine change. The "tripwire" is a run-profile over the fastest
sources, **not** a substitute for real L1/L3 coverage.
