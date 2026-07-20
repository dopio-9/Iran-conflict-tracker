#!/usr/bin/env node
/**
 * apply-score — the write half of the scoring loop (objective 1).
 *
 * Reads a SCOREBOARD emitted by an engine (telegram.mjs --score, later
 * perplexity.mjs) and writes the outcome back into data/sources.json so the
 * registry LEARNS across runs: hits/misses accumulate, dark sources self-flag,
 * and the replenishment loop (objective 6) reads those flags to know what to
 * replace. This is the wiring that converts "collects well once" into "improves
 * every run" — the thing that was inert (all hits/misses = 0) until now.
 *
 * Input: a JSON scoreboard, given as a file path, or piped on stdin, or as the
 * raw `SCOREBOARD:{...}` line copied from a CI log (the prefix is stripped).
 *   { ts, engine, channels:[{id, outcome:hit|miss, reason, freshestMin, postCount}] }
 *
 * Runs in-session (no network) — the fetch happened in CI; this only writes.
 * The autonomous Routine later runs fetch+apply in one context.
 *
 * Dark policy (objective 4 triage):
 *   reason "empty" (0 posts, HTTP 200) → dark{reason:"empty"} — private channel or
 *      wrong handle; the replenishment loop must fix-or-replace it.
 *   reason "stale" (posts, but all older than TTL) → lowTempo:true, NOT dark —
 *      a real but slow channel; keep, just weight down.
 *   reason "error"/"miss" x3 consecutive → dark{reason:"unreachable"}.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DARK_AFTER = 3; // consecutive non-empty misses before flagging unreachable-dark

function readScoreboard(arg) {
  let raw;
  if (arg && existsSync(arg)) raw = readFileSync(arg, "utf8");
  else if (arg) raw = arg;
  else raw = readFileSync(0, "utf8"); // stdin
  const m = raw.match(/SCOREBOARD:(\{[\s\S]*\})\s*$/m) || raw.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("no SCOREBOARD JSON found in input");
  return JSON.parse(m[1]);
}

const path = new URL("../data/sources.json", import.meta.url);
const reg = JSON.parse(readFileSync(path, "utf8"));
const byId = new Map(reg.map((s) => [s.id, s]));

const board = readScoreboard(process.argv[2]);
let applied = 0;
const nowDark = [];
for (const c of board.channels) {
  const s = byId.get(c.id);
  if (!s) continue;
  s.lastScored = board.ts;
  if (c.outcome === "hit") {
    s.hits = (s.hits || 0) + 1;
    s.consecutiveMisses = 0;
    s.lastFreshMin = c.freshestMin;
    delete s.dark; delete s.lowTempo;
  } else {
    s.misses = (s.misses || 0) + 1;
    s.consecutiveMisses = (s.consecutiveMisses || 0) + 1;
    if (c.reason === "empty") { s.dark = { reason: "empty", since: board.ts }; nowDark.push(`#${s.id} ${s.name} (empty)`); }
    else if (c.reason === "stale") { s.lowTempo = true; delete s.dark; }
    else if (s.consecutiveMisses >= DARK_AFTER) { s.dark = { reason: "unreachable", since: board.ts }; nowDark.push(`#${s.id} ${s.name} (unreachable)`); }
  }
  applied++;
}

const body = reg.map((o) => "  " + JSON.stringify(o)).join(",\n");
writeFileSync(path, "[\n" + body + "\n]\n");

const totHit = reg.reduce((a, s) => a + (s.hits || 0), 0);
const totMiss = reg.reduce((a, s) => a + (s.misses || 0), 0);
const darkNow = reg.filter((s) => s.dark).length;
console.log(`applied ${applied} outcomes from ${board.engine} @ ${board.ts}`);
console.log(`registry totals — hits:${totHit} misses:${totMiss} · dark sources:${darkNow}`);
if (nowDark.length) console.log(`flagged dark this run: ${nowDark.join(", ")}`);
console.log(`→ replenishment loop (objective 6) should fix-or-replace the ${darkNow} dark source(s)`);
