#!/usr/bin/env node
/**
 * discover — the find side of the replenishment loop (objective 6).
 *
 * Reads the registry's gaps and uses Perplexity (native-language source
 * discovery is its best use) to find replacements, then emits a CANDIDATES:[...]
 * block that candidates.mjs --apply turns into nominations. This is what stops
 * the source surface from fading out: as scoring flags channels dark, the lanes
 * they fed go sparse, and this refills them.
 *
 * Gaps, in priority order (capped at MAX_QUERIES to bound API cost):
 *   1. SPARSE LANE   — fewer than MIN_LIVE non-dark sources feed the lane
 *   2. DARK SOURCE   — an empty/unreachable channel needs a working handle/replacement
 *
 * Network: reaches api.perplexity.ai — CI only (needs PERPLEXITY_API_KEY), same
 * as the gather. The session then reads CANDIDATES: from the log and applies it.
 */
import { queryPerplexity, decompose } from "./perplexity.mjs";
import { readFileSync } from "node:fs";

const MIN_LIVE = 3;       // a lane with fewer live sources is sparse
const MAX_QUERIES = 6;    // cap Perplexity calls per discovery run

const reg = JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
const LANES = ["strikes_ops", "threats", "cyber_sabotage", "diplomacy", "leadership_internal", "maritime_incidents", "naval_military_movement", "air_traffic_airspace", "ports_advisories", "proxy_axis", "war_risk_economy", "uae_local", "israel_intel", "nuclear"];

// lane → (what to search for, native-language hint, likely theater)
const LANE_DESC = {
  cyber_sabotage: ["cyberattacks, sabotage, and drone-on-infrastructure incidents against Gulf energy/banking/ports (Iran, UAE, Saudi, Bahrain)", "English/Arabic", "gulf-uae"],
  nuclear: ["Iran's nuclear program, IAEA safeguards, enrichment and facility status", "English/Farsi", "tehran-internal"],
  proxy_axis: ["Iraqi militias (PMF/Kataib Hezbollah), Houthi/Ansarallah operations, and Hezbollah activity against US forces", "Arabic", "iraq-syria-yemen"],
  israel_intel: ["Israeli intelligence assessments and IDF activity regarding Iran and Hormuz", "Hebrew", "israel-lebanon"],
  maritime_incidents: ["Strait of Hormuz vessel incidents, seizures and tanker attacks", "English/Arabic", "hormuz-redsea"],
  naval_military_movement: ["US and Iranian naval/carrier/amphibious movements in the Gulf and Arabian Sea", "English", "hormuz-redsea"],
  air_traffic_airspace: ["Gulf airspace closures, NOTAMs, military flights and airline reroutes", "English", "gulf-uae"],
  strikes_ops: ["US and Iran strike waves, targets and casualties in the current conflict", "English/Farsi/Arabic", "tehran-internal"],
  threats: ["Iranian IRGC ultimatums, red-lines and retaliation warnings", "Farsi/Arabic", "tehran-internal"],
  diplomacy: ["Iran-US back-channels and Gulf mediation (Oman, Qatar, Egypt)", "English/Arabic", "cross-theater"],
  leadership_internal: ["Iranian internal power, Supreme Leader and IRGC command", "Farsi", "tehran-internal"],
  ports_advisories: ["UKMTO/MARAD advisories and Gulf port notices", "English", "hormuz-redsea"],
  war_risk_economy: ["war-risk insurance, Brent, and tanker rerouting around Hormuz", "English", "hormuz-redsea"],
  uae_local: ["UAE exposure, NCEMA/air-defence and resident-facing advisories", "English/Arabic", "gulf-uae"],
};

// live (non-dark) source count per lane
const liveByLane = Object.fromEntries(LANES.map((l) => [l, 0]));
for (const s of reg) if (!s.dark && Array.isArray(s.lanes)) for (const l of s.lanes) if (l in liveByLane) liveByLane[l]++;

const sparseLanes = LANES.filter((l) => liveByLane[l] < MIN_LIVE).sort((a, b) => liveByLane[a] - liveByLane[b]);
const darkSources = reg.filter((s) => s.dark);

// build the gap work-list, sparse lanes first, then dark sources, capped
const gaps = [];
for (const l of sparseLanes) gaps.push({ kind: "lane", lane: l });
for (const s of darkSources) gaps.push({ kind: "dark", source: s });
const work = gaps.slice(0, MAX_QUERIES);

const nameFromUrl = (u) => {
  const m = (u || "").match(/^https?:\/\/([^/]+)(\/s\/([^/?#]+)|\/([^/?#]+))?/i);
  if (!m) return { name: u, site: null, medium: "web" };
  const host = m[1].replace(/^www\./, "");
  if (/t\.me/.test(host)) return { name: `@${m[3] || m[4] || host}`, site: null, medium: "SOC" };
  if (/x\.com|twitter\.com|nitter/.test(host)) return { name: `@${m[4] || host}`, site: null, medium: "SOC" };
  return { name: host, site: host, medium: "web" };
};

async function discover() {
  console.log(`discovery — ${sparseLanes.length} sparse lanes, ${darkSources.length} dark sources; running ${work.length}/${gaps.length} gaps (cap ${MAX_QUERIES})`);
  console.log(`sparse: ${sparseLanes.map((l) => `${l}(${liveByLane[l]})`).join(", ") || "none"}\n`);
  const out = [];
  const seen = new Set();
  for (const g of work) {
    let query, lane, theater, fills, type;
    if (g.kind === "lane") {
      const [desc, lang, th] = LANE_DESC[g.lane] || [g.lane, "English", "cross-theater"];
      lane = g.lane; theater = th; type = "new-source";
      fills = `discovery: sparse lane ${g.lane} (${liveByLane[g.lane]} live sources)`;
      query = `List currently ACTIVE sources reporting on ${desc}. For each give the outlet or channel NAME and its URL or Telegram/X handle. Prefer primary, local-language (${lang}) and OSINT sources over Western wire aggregators. Only sources posting in the last few days.`;
    } else {
      const s = g.source;
      lane = (s.lanes || [])[0] || null; theater = s.theater || null; type = "replace-placeholder";
      fills = `discovery: replace dark source #${s.id} ${s.name} (${s.dark?.reason})`;
      query = `The ${s.platform} source "${s.name}" (${s.notes || s.domain}) appears inactive or unreachable. Give its CURRENT active public handle/URL if it moved, and 2-3 active replacement sources covering the same beat (${s.language}). Name + URL/handle each.`;
    }
    try {
      const r = await queryPerplexity(query, { recency: "day", maxTokens: 500 });
      const d = decompose(r, { query, recencyDays: 4 });
      let n = 0;
      for (const p of d.primaries) {
        if (!p.url || seen.has(p.url)) continue;
        seen.add(p.url);
        const { name, site, medium } = nameFromUrl(p.url);
        if (reg.some((s) => (s.site && site && s.site.toLowerCase() === site.toLowerCase()) || s.name.toLowerCase() === name.toLowerCase())) continue;
        out.push({
          type, name, site, lane, theater, medium,
          platform: medium === "SOC" ? "Telegram/X" : "Web",
          language: (LANE_DESC[lane]?.[1]) || "Unknown",
          proposed_tier: medium === "SOC" ? "T1" : "SPECIALIST",
          fills,
          evidence: `${(p.title || "").slice(0, 80)} — ${p.url}${p.date ? ` (${p.date})` : ""}`,
          via: "discovery",
        });
        if (++n >= 3) break; // top 3 per gap
      }
      console.log(`▸ ${g.kind === "lane" ? "lane " + g.lane : "dark #" + g.source.id + " " + g.source.name} → ${n} candidate(s)`);
    } catch (e) {
      console.log(`▸ ${g.kind === "lane" ? g.lane : g.source.name} — ERROR: ${String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")}`);
    }
  }
  console.log(`\nCANDIDATES:${JSON.stringify(out)}`);
  console.log(`\ndiscovered ${out.length} candidate source(s) across ${work.length} gaps — apply with: node scripts/candidates.mjs --apply '<paste CANDIDATES line>'`);
}

discover().catch((e) => { console.error(String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")); process.exit(1); });
