#!/usr/bin/env node
/**
 * promote — auto-promotion of nominated candidates into the live registry.
 *
 * POLICY (set by the operator, 20 Jul): NO manual review gate. Every nominated
 * candidate is promoted straight into data/sources.json; the SCORING loop is the
 * review — sources earn their place by hit-rate and are dark-pruned when they go
 * silent. This replaces the old SCOUT "human approves" doctrine.
 *
 * Promotion normalizes each candidate into the registry schema and guarantees
 * validity (theater / lanes / medium / hits / misses), inferring fields for older
 * nominations that predate them. Runs in-session (no network).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../data/sources.json", import.meta.url);
const CAND = new URL("../data/candidates.json", import.meta.url);
const sources = JSON.parse(readFileSync(SRC, "utf8"));
const cand = JSON.parse(readFileSync(CAND, "utf8"));

const VALID_MEDIA = new Set(["STATE", "WIRE", "OSINT", "SOC", "OFF", "TRACK", "ANALYST", "MARKET", "META"]);
// older nominations (c-001..c-010) predate theater/lanes/medium — supply them
const OVERRIDE = {
  "c-001": ["cross-theater", ["diplomacy"], "WIRE", "Oman/Gulf"],
  "c-002": ["cross-theater", ["diplomacy"], "OFF", "Oman"],
  "c-003": ["gulf-uae", ["strikes_ops", "uae_local"], "OFF", "Bahrain"],
  "c-004": ["gulf-uae", ["strikes_ops", "uae_local"], "OFF", "Kuwait"],
  "c-005": ["cross-theater", ["naval_military_movement"], "ANALYST", "Global"],
  "c-006": ["hormuz-redsea", ["war_risk_economy"], "ANALYST", "Global"],
  "c-007": ["hormuz-redsea", ["war_risk_economy"], "ANALYST", "Global"],
  "c-008": ["hormuz-redsea", ["ports_advisories", "maritime_incidents"], "TRACK", "Hormuz"],
  "c-009": ["cross-theater", ["strikes_ops"], "META", "Global"],
  "c-010": ["cross-theater", ["air_traffic_airspace"], "ANALYST", "Global"],
};
const GEO = { "tehran-internal": "Iran", "israel-lebanon": "Israel/Axis", "iraq-syria-yemen": "Axis", "hormuz-redsea": "Gulf", "gulf-uae": "Gulf/UAE", "cross-theater": "Global" };
const BEAT = { STATE: "State media", WIRE: "News", OSINT: "OSINT", SOC: "Social", OFF: "Official", TRACK: "Tracking", ANALYST: "Analysis", MARKET: "Market", META: "Dashboard" };
const ROLE = { OSINT: "early", SOC: "early", OFF: "confirmation", WIRE: "confirmation", STATE: "corroboration", META: "aggregation", ANALYST: "context", TRACK: "early", MARKET: "context" };

const normMedium = (c) => {
  if (VALID_MEDIA.has(c.medium)) return c.medium;
  if (c.proposed_tier === "META") return "META";           // dashboards
  if (c.medium === "web") return "WIRE";                    // discovery web sources = news sites
  return "ANALYST";
};

let nextId = sources.reduce((m, s) => Math.max(m, s.id || 0), 0);
let promoted = 0;
const done = [];

for (const c of cand.queue) {
  if (c.status !== "nominated") continue;
  const ov = OVERRIDE[c.id];
  const theater = ov ? ov[0] : (c.theater || "cross-theater");
  const lanes = ov ? ov[1] : (Array.isArray(c.lanes) ? c.lanes : c.lane ? [c.lane] : ["strikes_ops"]);
  const medium = ov ? ov[2] : normMedium(c);
  const geography = ov ? ov[3] : (GEO[theater] || "Global");
  const note = [c.fills, c.evidence, c.risks ? `RISK: ${c.risks}` : null].filter(Boolean).join(" · ");
  const src = {
    id: ++nextId,
    name: c.name,
    platform: c.platform || "Web",
    language: c.language || "Unknown",
    domain: BEAT[medium] || "News",
    geography,
    role: ROLE[medium] || "early",
    tier: c.proposed_tier,
    theater,
    lanes,
    medium,
    hits: 0,
    misses: 0,
    notes: note,
  };
  if (c.site) src.site = c.site;
  sources.push(src);
  c.status = "approved";
  c.review = `auto-promoted → registry #${src.id} (no-manual-review policy); scoring will review by hit-rate`;
  promoted++;
  done.push(`#${src.id} ${src.name} [${tier(src)}]`);
}
function tier(s) { return `${s.tier}·${s.medium}·${(s.lanes || []).join(",")}/${s.theater}`; }

if (!promoted) { console.log("no nominated candidates to promote"); process.exit(0); }

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const d = new Date();
cand.meta.updated = `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

writeFileSync(SRC, "[\n" + sources.map((o) => "  " + JSON.stringify(o)).join(",\n") + "\n]\n");
writeFileSync(CAND, JSON.stringify(cand, null, 2) + "\n");
console.log(`promoted ${promoted} → registry now ${sources.length} sources`);
for (const line of done) console.log("  " + line);
