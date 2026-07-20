#!/usr/bin/env node
/**
 * candidates — the write side of the replenishment loop (objective 6).
 *
 * Two intake paths, one queue (data/candidates.json), same dedup + schema:
 *   --add '<json>'    a source YOU supply (a news snippet I classified) → one candidate
 *   --apply '<json>'  discovery output (discover.mjs CANDIDATES:[...]) → many candidates
 *   --list            show the current nomination queue
 *
 * A candidate carries NO citation weight until promoted into sources.json by
 * review (SCOUT doctrine). This script only nominates: it assigns an id, stamps
 * the date, and — critically — DEDUPS against both sources.json (already
 * monitored) and the existing queue, so replenishment never re-nominates what we
 * already have. Runs in-session (no network).
 *
 * Minimum fields for a valid nomination (validate.mjs §4b enforces):
 *   type, name, proposed_tier, fills, evidence   (id/nominated/status auto-filled)
 * type ∈ new-source | mirror | retier | replace-placeholder
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../data/sources.json", import.meta.url);
const CAND = new URL("../data/candidates.json", import.meta.url);
const sources = JSON.parse(readFileSync(SRC, "utf8"));
const cand = JSON.parse(readFileSync(CAND, "utf8"));

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const today = (() => { const d = new Date(); return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; })();

const srcNames = new Set(sources.map((s) => s.name.toLowerCase()));
const srcSites = new Set(sources.filter((s) => s.site).map((s) => s.site.toLowerCase()));
const queueNames = new Set(cand.queue.map((c) => c.name.toLowerCase()));

function nextId() {
  const n = cand.queue.reduce((m, c) => Math.max(m, parseInt((c.id || "").replace(/\D/g, "") || "0", 10)), 0);
  return `c-${String(n + 1).padStart(3, "0")}`;
}

function isDup(c) {
  const nm = (c.name || "").toLowerCase();
  const site = (c.site || "").toLowerCase();
  if (srcNames.has(nm) || queueNames.has(nm)) return `name "${c.name}" already registered/queued`;
  if (site && srcSites.has(site)) return `site "${c.site}" already in registry`;
  return null;
}

function normalize(c) {
  const req = ["type", "name", "proposed_tier", "fills", "evidence"];
  for (const k of req) if (!c[k]) throw new Error(`candidate missing "${k}": ${JSON.stringify(c).slice(0, 120)}`);
  return {
    id: nextId(),
    nominated: today,
    type: c.type,
    name: c.name,
    platform: c.platform || "Unknown",
    language: c.language || "Unknown",
    proposed_tier: c.proposed_tier,
    theater: c.theater || null,
    lane: c.lane || null,
    medium: c.medium || null,
    site: c.site || null,
    fills: c.fills,
    evidence: c.evidence,
    risks: c.risks || null,
    via: c.via || "manual-intake",
    status: "nominated",
    review: null,
  };
}

function addMany(list) {
  let added = 0, skipped = 0;
  for (const raw of list) {
    const dup = isDup(raw);
    if (dup) { console.log(`  skip — ${dup}`); skipped++; continue; }
    const c = normalize(raw);
    cand.queue.push(c);
    queueNames.add(c.name.toLowerCase());
    console.log(`  + ${c.id} ${c.name} [${c.type} · ${c.proposed_tier} · ${c.lane || "?"}/${c.theater || "?"}] via ${c.via}`);
    added++;
  }
  cand.meta.updated = today;
  writeFileSync(CAND, JSON.stringify(cand, null, 2) + "\n");
  console.log(`\nnominated ${added}, skipped ${skipped} dup → queue now ${cand.queue.length}`);
}

/* ── CLI ───────────────────────────────────────────────────────────── */
const [mode, payload] = [process.argv[2], process.argv[3]];
function parsePayload(p) {
  if (!p) throw new Error("no JSON payload");
  const raw = existsAsFile(p) ? readFileSync(p, "utf8") : p;
  const m = raw.match(/CANDIDATES:(\[[\s\S]*\])/) || raw.match(/(\[[\s\S]*\])/) || raw.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("no JSON array/object in payload");
  const v = JSON.parse(m[1]);
  return Array.isArray(v) ? v : [v];
}
function existsAsFile(p) { try { readFileSync(p); return true; } catch { return false; } }

if (mode === "--add") addMany(parsePayload(payload));
else if (mode === "--apply") addMany(parsePayload(payload));
else if (mode === "--list") {
  console.log(`queue: ${cand.queue.length} candidates (updated ${cand.meta.updated})`);
  for (const c of cand.queue) console.log(`  ${c.id} [${c.status}] ${c.name} — ${c.type}/${c.proposed_tier} — ${(c.fills || "").slice(0, 60)}`);
} else {
  console.error('usage: node scripts/candidates.mjs --add \'<json>\' | --apply \'<CANDIDATES json|path>\' | --list');
  process.exit(2);
}
