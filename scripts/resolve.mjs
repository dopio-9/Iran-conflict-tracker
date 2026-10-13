#!/usr/bin/env node
/**
 * resolve — the SLOW lane's first pass: grade what the raw lane published, 24h on.
 *
 * Publishing single-source claims is only honest if they are graded afterwards.
 * This pass is deliberately mechanical and makes no truth judgement it cannot
 * back with data:
 *   ECHOED ×N  — N other, distinct sources carried a matching claim within 24h
 *   NO ECHO    — nobody else carried it within 24h (not "false" — just alone)
 * REFUTED is a human/analyst call and is never set here; a refuted item is
 * marked by hand (res.status = "refuted", res.note) and stays visible.
 *
 * Matching runs on the English line (translated where needed), so a Farsi
 * Telegram post can be echoed by an Arabic outlet or a Western wire.
 * No network. Runs in CI after each collection, or locally at any time.
 *
 * Usage:  node scripts/resolve.mjs [--hours 24]   |   node scripts/resolve.mjs --selftest
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FEED = new URL("../data/feed.json", import.meta.url);
const STOP = new Set(("the a an of in on at to for and or is are was were be by with from as that this it its has have had " +
  "says say said after over amid new report reports reported near into about than more will would could also").split(" "));

export function keys(line) {
  return new Set(String(line || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w)));
}

/** Overlap coefficient — robust when one headline is much shorter than the other. */
export function similar(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

export function resolve(items, { now = Date.now(), afterH = 24, threshold = 0.5, minShared = 3 } = {}) {
  const k = items.map(it => keys(it.line));
  let graded = 0;
  items.forEach((it, i) => {
    if (it.res?.status === "refuted") return;                 // human verdicts are never overwritten
    const t = Date.parse(it.ts);
    if (now - t < afterH * 3600e3 || it.res?.at) return;       // too young, or already graded
    const echoes = new Set();
    items.forEach((o, j) => {
      if (j === i || o.src === it.src) return;
      const dt = Date.parse(o.ts) - t;
      if (dt < -6 * 3600e3 || dt > afterH * 3600e3) return;   // echo window: 6h before → 24h after
      let shared = 0; for (const w of k[i]) if (k[j].has(w)) shared++;
      if (shared >= minShared && similar(k[i], k[j]) >= threshold) echoes.add(o.src);
    });
    it.res = echoes.size
      ? { status: "echoed", n: echoes.size, by: [...echoes].slice(0, 5), at: new Date(now).toISOString() }
      : { status: "no-echo", at: new Date(now).toISOString() };
    graded++;
  });
  return graded;
}

function run({ afterH = 24 } = {}) {
  if (!existsSync(FEED)) { console.log("resolve: no data/feed.json yet — nothing to grade"); return; }
  const feed = JSON.parse(readFileSync(FEED, "utf8"));
  const n = resolve(feed.items || [], { afterH });
  const tally = { echoed: 0, "no-echo": 0, refuted: 0, pending: 0 };
  for (const it of feed.items || []) tally[it.res?.status || "pending"]++;
  feed.meta = { ...(feed.meta || {}), resolved: { ts: new Date().toISOString(), graded_now: n, ...tally } };
  writeFileSync(FEED, JSON.stringify(feed, null, 1) + "\n");
  console.log(`resolve — graded ${n} now · echoed ${tally.echoed} · no-echo ${tally["no-echo"]} · refuted ${tally.refuted} · pending ${tally.pending}`);
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  const now = Date.parse("2026-10-14T12:00:00Z"), h = 3600e3;
  const items = [
    { id: "a", ts: new Date(now - 30 * h).toISOString(), src: "Sepah TG", line: "Missile strike hits fuel depot outside Bandar Abbas port" },
    { id: "b", ts: new Date(now - 26 * h).toISOString(), src: "Al Mayadeen", line: "Fuel depot near Bandar Abbas port hit by missile strike" },
    { id: "c", ts: new Date(now - 25 * h).toISOString(), src: "Ynet", line: "Reports: missile strike on Bandar Abbas fuel depot" },
    { id: "d", ts: new Date(now - 29 * h).toISOString(), src: "Lone channel", line: "Houthi commander reported killed in Sanaa raid" },
    { id: "e", ts: new Date(now - 2 * h).toISOString(), src: "Fresh", line: "Tanker diverted off Fujairah" },
    { id: "f", ts: new Date(now - 40 * h).toISOString(), src: "X", line: "Claimed downing of drone", res: { status: "refuted", note: "CENTCOM footage" } },
  ];
  resolve(items, { now });
  ok("claim carried by two other sources → echoed ×2", items[0].res.status === "echoed" && items[0].res.n === 2);
  ok("lone claim → no-echo, not refuted", items[3].res.status === "no-echo");
  ok("item younger than 24h is left pending", !items[4].res);
  ok("human 'refuted' verdict is never overwritten", items[5].res.status === "refuted" && items[5].res.note);
  ok("same source repeating itself is not an echo", (() => { const x = [
    { id: "p", ts: new Date(now - 30 * h).toISOString(), src: "S", line: "Drone attack reported Kharg terminal oil loading" },
    { id: "q", ts: new Date(now - 29 * h).toISOString(), src: "S", line: "Drone attack reported Kharg terminal oil loading" }];
    resolve(x, { now }); return x[0].res.status === "no-echo"; })());
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) selftest();
  else { const i = argv.indexOf("--hours"); run({ afterH: i >= 0 ? Number(argv[i + 1]) || 24 : 24 }); }
}
