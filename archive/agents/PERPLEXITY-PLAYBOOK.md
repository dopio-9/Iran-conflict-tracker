# PERPLEXITY PLAYBOOK — the recall lane, to maximum effect

**This file + `agents/gather-queries.json` ARE the durable capability.** A fresh
session inherits the gathering depth by reading this and running the lane — it
does not need to re-derive the method. Perplexity is the **recall engine that
reaches the layer web search can't**: native-language substrate, OSINT/social,
and hard tracking feeds. It is a **lead-finder, never a verifier**.

## The method (six levers, in order of power)

1. **Query in the native language.** Farsi / Arabic / Hebrew / Russian reach the
   substrate directly (Tasnim, Mehr, Fars, IRGC Telegram, Al Mayadeen, Almasirah,
   Mako, Walla, iz.ru). This is the biggest single lever — an English keyword
   search never surfaces these.
2. **Name the source or mirror in the query** — `t.me`, `tgstat`, `telemetr`,
   `nitter`, specific outlets, and tracking sites (below). Pulls the fast layer.
3. **Domain-steer.** Blacklist the mainstream with `-domain` (the client caps at
   3, so it also post-filters YouTube). Whitelist known trackers when you want
   *only* them.
4. **Freshness + decomposition.** `recency=day`, then decompose to primaries,
   **date-stamp each one**, flag anything older than the claim window as
   `STALE PRIMARY` / recirculation. `recencyDays=1`.
5. **Hygiene.** Drop YouTube. **Dedup** across queries. **★-flag non-mainstream**
   primaries so the novel layer stands out in the log.
6. **Matrix, not a list.** Queries are organized as **angle × language ×
   source-type**. Breadth comes from the angles; depth comes from the languages
   and named sources. That combination is what beats repetition.

## Tiering discipline (unchanged doctrine)

Recall proposes → primaries extracted & dated → each lights one medium slot →
**tier earned from independent mediums only** → `LEAD·RECALL` chip stays as
provenance. Adversary-origin clusters (e.g. Israeli/Saudi-sourced Iran-internal
claims) are **converging at most, never confirmed** — render as DISPUTED.

## Source registry (name these in queries)

**Native substrate**
- Farsi: tasnimnews, mehrnews, farsnews, irna, khabaronline, tabnak, fararu,
  mashreghnews, iscanews; diaspora: iranintl, VOA Farsi, BBC Persian, iranglobal,
  Radio Farda, asianewsiran.
- Arabic: aljazeera.net, alarabiya, almanartv (Hezbollah), almasirah (Houthi),
  alalam (IRGC), almayadeen, alaraby, masrawy, youm7, elwatannews, elbalad.
- Hebrew: mako, walla, ynet, timesofisrael (liveblogs), israelhayom.
- Russian: iz.ru, ria, br.az (regional).

**OSINT / social**
- Telegram web mirrors: `t.me/s/<channel>` (e.g. iriran_military, Irna_en),
  tgstat, telemetr. X mirrors: nitter instances.
- Accounts by name: OSINTdefender, TankerTrackers, IntelSky, Aircraft Spots.
- Instagram / Facebook posts (kept — often carry primary photos/claims).

**HARD TRACKING (the new lane — always tie "in relation" to the conflict)**
- *Naval / military movement:* USNI Fleet & Marine Tracker, TWZ "Where Are The
  Carriers", gCaptain, Naval News, Windward, PortWatch (IMF).
- *AIS / maritime:* MarineTraffic, VesselFinder, TankerTrackers, straits.live,
  pgsa.io, Lloyd's List.
- *Air traffic / airspace:* Flightradar24, ADS-B Exchange, OPSGROUP,
  safeairspace.net, NOTAM / airspace-closure notices.
- *Port / advisory authorities:* UKMTO, MARAD/MSCI, JMIC, IMO, and port notices
  for Fujairah, Jebel Ali, Kharg, Bandar Abbas.
- *War-risk / insurance:* Lloyd's List, TradeWinds, Maersk/carrier surcharges,
  war-risk premium notices.

Trackers are **corroboration and movement detection**, not headlines: a carrier
reposition, a NOTAM closure, an AIS U-turn, a war-risk surcharge — each read *in
relation* to the strike tempo and threat state is itself a signal.

## How to run (the loop, any session)

1. Edit `agents/gather-queries.json` (categorized matrix — keep the lanes).
2. `git push` → the `perplexity-gather` workflow runs it live in CI (the sandbox
   can't reach `api.perplexity.ai`; CI can).
3. Read the run log via the GitHub Actions tools. **★ items are the novel layer.**
4. Date-stamp, dedup, tier; fold the survivors into `index.html` `signals[]`.

Model tier: Haiku-class recall. Never let it set a tier or reach WIRE directly.
