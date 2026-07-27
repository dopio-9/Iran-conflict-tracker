#!/usr/bin/env node
/**
 * HORMUZ·LIVE pipeline guardrail.
 * Encodes the hard-won bug history (§5 of the build seed) and the
 * intelligence rules (§3) as executable checks. Runs standalone and
 * as the pre-commit hook. Exit 0 = ship, exit 1 = do not ship.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

function loadJSON(rel) {
  let raw;
  try {
    raw = readFileSync(join(root, rel), "utf8");
  } catch {
    return null; // missing file is not a failure — the live surface is index.html (obj 5)
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${rel}: invalid JSON — ${e.message}`);
    return null;
  }
}

/* ── 1. data.json schema ─────────────────────────────────────── */
const data = loadJSON("data/data.json");
if (data) {
  for (const k of ["meta", "wire", "status", "gauges", "dials", "strait", "verify", "market", "scenarios", "uae_means", "triggers", "hist", "mini", "trace"])
    if (!(k in data)) fail(`data.json: missing top-level key "${k}"`);

  const m = data.meta ?? {};
  for (const k of ["day", "date", "updated", "subline", "banner"])
    if (!(k in m)) fail(`data.json meta: missing "${k}"`);
  if (m.banner && !["ok", "warn", "alarm"].includes(m.banner.level))
    fail(`data.json meta.banner.level must be ok|warn|alarm, got "${m.banner?.level}"`);

  const tiers = ["flash", "ver2", "ver", "pending", "disputed"];
  (data.wire ?? []).forEach((w, i) => {
    for (const k of ["t", "d", "geo", "tier", "src", "title", "full", "why"])
      if (!w[k]) fail(`wire[${i}]: missing/empty "${k}" — every WIRE item needs a why (Rule 3)`);
    if (!tiers.includes(w.tier)) fail(`wire[${i}]: unknown tier "${w.tier}"`);
    // Rule 1: nothing gets ver2 on one source. Heuristic: multi-source strings carry a separator.
    if (w.tier === "ver2" && !/[·,+]| and /.test(w.src ?? ""))
      fail(`wire[${i}]: tier ver2 but src "${w.src}" names a single source — Rule 1: nothing gets ver2 on one source, ever`);
  });

  // SIGNALS lane (optional): live unverified items. Lean by rule — never a WIRE badge, capped.
  if (data.signals) {
    if (!Array.isArray(data.signals)) fail(`data.json: signals must be an array`);
    else {
      if (data.signals.length > 6) fail(`signals: ${data.signals.length} entries — cap is 6 (lean lane, no debunk-museum)`);
      const sigStates = ["open", "converging", "contradicted"];
      const sigRungs = [1, 2, 3, "3★"];
      data.signals.forEach((s, i) => {
        for (const k of ["id", "claim", "src", "lane", "rung", "state", "ttl"])
          if (s[k] === undefined || s[k] === "") fail(`signals[${i}]: missing "${k}"`);
        if (!sigStates.includes(s.state)) fail(`signals[${i}] (${s.id}): state must be open|converging|contradicted, got "${s.state}"`);
        if (!sigRungs.includes(s.rung)) fail(`signals[${i}] (${s.id}): rung must be 1|2|3|3★, got "${s.rung}"`);
        // Rule: a signal is NOT verified — it may never wear a WIRE tier badge.
        if (["ver2", "ver"].includes(s.tier)) fail(`signals[${i}] (${s.id}): a signal may never carry a ver/ver2 badge — that is WIRE's, not SIGNALS' (no laundering)`);
        if ((s.note ?? "").length > 260) fail(`signals[${i}] (${s.id}): note too long — keep it one line`);
      });
    }
  }

  if ((data.status ?? []).length !== 4) warn(`status has ${data.status?.length} rows (expected 4)`);
  if ((data.gauges ?? []).length !== 4) warn(`gauges has ${data.gauges?.length} entries (expected 4)`);
  if ((data.dials ?? []).length !== 4) warn(`dials has ${data.dials?.length} entries (expected 4)`);
  (data.dials ?? []).forEach((d, i) => {
    if (typeof d.rot !== "number" || d.rot < -60 || d.rot > 60) fail(`dials[${i}].rot must be a number in [-60,60]`);
  });

  (data.verify ?? []).forEach((v, i) => {
    for (const k of ["who", "handle", "avatar", "reach", "quote", "rows"])
      if (!v[k]) fail(`verify[${i}]: missing "${k}"`);
    (v.rows ?? []).forEach((r, j) => {
      if (!["confirmed", "disputed", "unverified", "partial"].includes(r.verdict))
        fail(`verify[${i}].rows[${j}]: bad verdict "${r.verdict}"`);
      for (const k of ["cls", "c", "n", "src"]) if (!r[k]) fail(`verify[${i}].rows[${j}]: missing "${k}"`);
    });
  });

  const probs = (data.scenarios ?? []).map((s) => parseFloat(s.prob));
  const sum = probs.reduce((a, b) => a + b, 0);
  if (probs.some(isNaN)) fail(`scenarios: unparseable prob`);
  else if (Math.abs(sum - 100) > 1) fail(`scenarios: probabilities sum to ${sum}%, must total 100% (Rule 4: explicit analytical judgments)`);
  const kinds = (data.scenarios ?? []).map((s) => s.kind).sort();
  if (JSON.stringify(kinds) !== JSON.stringify(["base", "risk", "tail"]))
    warn(`scenarios kinds are ${kinds} (expected exactly base/risk/tail)`);

  if ((data.triggers ?? []).length !== 5) warn(`triggers has ${data.triggers?.length} entries (expected 5, ordered)`);
  if (!data.uae_means || data.uae_means.length < 200) fail(`uae_means: the UAE lens is the product (Rule 7) — missing or too thin`);

  (data.trace?.lines ?? []).forEach((l, i) => {
    if (!/^(\s*-?[\d.]+,-?[\d.]+\s*)+$/.test(l.points)) fail(`trace.lines[${i}]: malformed points string`);
  });
}

/* ── 2. sources.json — registry aligned to the lane/theater vocabulary ── */
const sources = loadJSON("data/sources.json");
if (sources) {
  if (!Array.isArray(sources) || sources.length < 100) fail(`sources.json: expected the full ~110-entry registry, got ${sources?.length}`);
  const validTiers = ["T1", "T2", "T1-ELEVATED", "T1-UNRELIABLE", "SPECIALIST", "META"];
  // Roster of 14 lanes (LANES.md) — a source names one or more; keeps registry ↔ lane queryable.
  const LANES = new Set(["strikes_ops", "threats", "cyber_sabotage", "diplomacy", "leadership_internal", "maritime_incidents", "naval_military_movement", "air_traffic_airspace", "ports_advisories", "proxy_axis", "war_risk_economy", "uae_local", "israel_intel", "nuclear"]);
  // 5 theaters (ARCHITECTURE.md) + cross-theater for global tracking/wires/meta.
  const THEATERS = new Set(["tehran-internal", "israel-lebanon", "iraq-syria-yemen", "hormuz-redsea", "gulf-uae", "cross-theater"]);
  // Convergence mediums (OFF/WIRE/OSINT/STATE/SOC count for independence) + specialist buckets.
  const MEDIA = new Set(["STATE", "WIRE", "OSINT", "SOC", "OFF", "TRACK", "ANALYST", "MARKET", "META"]);
  const laneCov = {}; for (const l of LANES) laneCov[l] = 0;
  sources.forEach((s, i) => {
    if (!s.name) fail(`sources[${i}]: missing name`);
    if (!validTiers.includes(s.tier)) fail(`sources[${i}] (${s.name}): unknown tier "${s.tier}"`);
    if (!THEATERS.has(s.theater)) fail(`sources[${i}] (${s.name}): theater "${s.theater}" not in the 5+cross roster — classify it (intake step 1)`);
    if (!MEDIA.has(s.medium)) fail(`sources[${i}] (${s.name}): medium "${s.medium}" invalid`);
    if (!Array.isArray(s.lanes) || s.lanes.length === 0) fail(`sources[${i}] (${s.name}): no lanes — a registered source that feeds no lane is never monitored (intake step 3)`);
    else s.lanes.forEach((l) => { if (!LANES.has(l)) fail(`sources[${i}] (${s.name}): lane "${l}" not in the 14-lane roster`); else laneCov[l]++; });
    if (typeof s.hits !== "number" || typeof s.misses !== "number") fail(`sources[${i}] (${s.name}): hits/misses must be numbers (intake step 4: scoring)`);
    // optional DIRECT-engine feed wiring (Telegram real-time L3 pipe)
    if (s.feed) {
      const feedKinds = ["telegram-web", "official-web", "rss", "x-mirror", "x-only"];
      if (!feedKinds.includes(s.feed.kind)) fail(`sources[${i}] (${s.name}): feed.kind "${s.feed.kind}" invalid`);
      // a wired telegram-web feed must carry a url unless explicitly flagged for handle resolution
      if (s.feed.kind === "telegram-web" && !s.feed.url && !s.feed.resolve)
        fail(`sources[${i}] (${s.name}): telegram-web feed has no url and no resolve flag — wire the handle or mark resolve:true`);
    }
  });
  // A lane with no registered source is a coverage hole, not a validation error — warn so intake targets it.
  for (const [l, n] of Object.entries(laneCov)) if (n === 0) warn(`sources.json: lane "${l}" has 0 registered sources — coverage hole, feed it via intake`);
}

/* ── 3. patterns.json ────────────────────────────────────────── */
const patterns = loadJSON("data/patterns.json");
if (patterns) {
  const states = ["HYPOTHESIS", "ACTIVE", "STRESSED", "CONFIRMED", "BROKEN"];
  (patterns.patterns ?? []).forEach((p, i) => {
    for (const k of ["id", "name", "state", "rule", "evidence", "history"])
      if (!p[k]) fail(`patterns[${i}]: missing "${k}"`);
    if (!states.includes(p.state)) fail(`patterns[${i}] (${p.id}): invalid state "${p.state}"`);
    (p.history ?? []).forEach((h, j) => {
      if (!states.includes(h.state)) fail(`patterns[${i}].history[${j}]: invalid state "${h.state}"`);
    });
  });
}

/* ── 4. scenarios.json (forecast ledger) ─────────────────────── */
const ledger = loadJSON("data/scenarios.json");
if (ledger) {
  (ledger.ledger ?? []).forEach((set, i) => {
    if (!set.issued) fail(`ledger[${i}]: missing issued date`);
    const setProbs = (set.entries ?? []).map((e) => parseFloat(e.prob));
    const s = setProbs.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 100) > 1) fail(`ledger[${i}] (${set.issued}): probs sum to ${s}%`);
    (set.entries ?? []).forEach((e, j) => {
      if (!["HIT", "MISS", "PARTIAL", "OPEN"].includes(e.outcome))
        fail(`ledger[${i}].entries[${j}]: bad outcome "${e.outcome}"`);
      if (set.graded && e.outcome !== "OPEN" && !e.lesson)
        fail(`ledger[${i}].entries[${j}]: graded ${e.outcome} without a lesson — the lesson IS the product`);
      if (!set.graded && e.outcome !== "OPEN")
        fail(`ledger[${i}].entries[${j}]: outcome ${e.outcome} in an ungraded set`);
    });
  });
}

/* ── 4b. candidates.json (SCOUT nomination queue) ────────────── */
const candidates = loadJSON("data/candidates.json");
if (candidates) {
  const cStatuses = ["nominated", "approved", "rejected", "stale"];
  const cTypes = ["new-source", "mirror", "retier", "replace-placeholder"];
  (candidates.queue ?? []).forEach((c, i) => {
    for (const k of ["id", "nominated", "type", "name", "proposed_tier", "fills", "evidence", "status"])
      if (!c[k]) fail(`candidates[${i}]: missing "${k}" — a nomination without evidence/fills is noise`);
    if (!cStatuses.includes(c.status)) fail(`candidates[${i}] (${c.id}): bad status "${c.status}"`);
    if (!cTypes.includes(c.type)) fail(`candidates[${i}] (${c.id}): bad type "${c.type}"`);
    if (["approved", "rejected"].includes(c.status) && !c.review)
      fail(`candidates[${i}] (${c.id}): ${c.status} without a review note — reviews teach the scout`);
  });
  // A nominated candidate must never already be a citable registry source.
  if (sources) {
    const names = new Set(sources.map((s) => s.name.toLowerCase()));
    (candidates.queue ?? []).forEach((c, i) => {
      if (c.status === "nominated" && names.has(c.name?.toLowerCase()))
        fail(`candidates[${i}] (${c.id}): "${c.name}" already in sources.json — dedupe before nominating`);
    });
  }
}

/* ── 5. index.html — the §5 bug class ───────────────────── */
const html = readFileSync(join(root, "index.html"), "utf8");

// 5a. node --check on the script block (§5 bug 3: non-negotiable pipeline step)
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) fail("index.html: no <script> block found");
for (const [i, js] of scripts.entries()) {
  const dir = mkdtempSync(join(tmpdir(), "hormuz-"));
  const f = join(dir, `block${i}.js`);
  writeFileSync(f, js);
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    fail(`index.html <script> block ${i} failed node --check:\n${e.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 5b. §5 bug 2: no JS ternary syntax inside CSS
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
if (/===|!==/.test(styles) || /\?[^;{}]*:[^;{}]*\}/.test(styles.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => l.includes("===")).join("\n")))
  fail("index.html: JS ternary/comparison syntax detected inside <style> (§5 bug 2)");

// 5c. §5 bug 4: no web storage (artifact-compat rule)
if (/localStorage|sessionStorage/.test(html))
  fail("index.html: localStorage/sessionStorage is banned (§5 bug 4)");

// 5d. straight apostrophe inside single-quoted JS strings is the original killer bug.
// The template renders from JSON so content strings never live in the JS; still, flag suspicious lines.
for (const js of scripts) {
  js.split("\n").forEach((line, n) => {
    if (/'[A-Za-z ]+'[a-z]/.test(line) && !/\\'/.test(line))
      warn(`index.html script line ${n + 1}: possible unescaped apostrophe in single-quoted string — "${line.trim().slice(0, 60)}…"`);
  });
}

/* ── 6. index.html inline data block — the LIVE surface (obj 5) ──── */
/* The deployed tracker renders from <script id="data">…</script>, not the split
 * data/data.json (now legacy/optional). This validates the file Vercel serves. */
{
  const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) fail("index.html: no inline <script id=\"data\"> block — the live surface is missing");
  else {
    let live = null;
    try { live = JSON.parse(m[1]); } catch (e) { fail(`index.html inline data: invalid JSON — ${e.message}`); }
    if (live) {
      for (const k of ["meta", "signals", "scenarios", "triggers", "patterns", "ledger"])
        if (!(k in live)) fail(`index.html inline data: missing top-level key "${k}"`);
      const tiers = ["flash", "ver2", "ver", "pending", "disputed"];
      const sig = live.signals;
      if (!Array.isArray(sig)) fail("index.html inline data: signals must be an array");
      else {
        if (sig.length > 24) fail(`index.html signals: ${sig.length} entries — cap 24 (lean strip, not a firehose dump)`);
        sig.forEach((s, i) => {
          for (const k of ["id", "tier", "claim", "region"])
            if (!s[k]) fail(`index.html signals[${i}]: missing "${k}"`);
          if (s.tier && !tiers.includes(s.tier)) fail(`index.html signals[${i}] (${s.id}): unknown tier "${s.tier}"`);
          // adversary discipline: a disputed signal must show WHY it's contested (conflict a/b or a note)
          if (s.tier === "disputed" && !s.conflict && !s.note)
            fail(`index.html signals[${i}] (${s.id}): disputed but no conflict{a,b} or note — never confirm adversary-origin silently`);

          /* TIME DISCIPLINE — the page must not be able to ship while misstating time.
             Authored age/live strings froze at writing time and the surface claimed
             "~fresh" on 6-day-old cards for days. Age is now DERIVED from last_seen,
             so last_seen is mandatory and the authored fields are banned outright. */
          if (!s.last_seen)
            fail(`index.html signals[${i}] (${s.id}): missing "last_seen" — age is derived, not authored`);
          else if (isNaN(Date.parse(s.last_seen)))
            fail(`index.html signals[${i}] (${s.id}): last_seen "${s.last_seen}" is not a parseable date`);
          else if (Date.parse(s.last_seen) - Date.now() > 36e5)
            fail(`index.html signals[${i}] (${s.id}): last_seen is in the future`);
          if ("age" in s) fail(`index.html signals[${i}] (${s.id}): authored "age" is banned — derive from last_seen`);
          if ("live" in s) fail(`index.html signals[${i}] (${s.id}): authored "live" is banned — derive from last_seen`);

          /* A FLASH is unverified. Fresh+unverified is the product's speed lane;
             stale+unverified is the weakest thing on the board and must be resolved
             (promoted on evidence, converted to a watch, or dropped) — never parked. */
          const ageH = s.last_seen ? (Date.now() - Date.parse(s.last_seen)) / 36e5 : 0;
          if (s.tier === "flash" && ageH > 48)
            fail(`index.html signals[${i}] (${s.id}): FLASH is ${Math.round(ageH / 24)}d old — unverified claims may not sit unresolved past 48h (promote, convert to watch, or drop)`);
        });
      }
      // FULL FEED — everything gathered, deduped, UNCAPPED (must not limit to a few visible selections)
      if (live.feed !== undefined) {
        if (!Array.isArray(live.feed)) fail("index.html feed must be an array");
        else live.feed.forEach((f, i) => {
          for (const k of ["lane", "tier", "claim", "src"])
            if (!f[k]) fail(`index.html feed[${i}]: missing "${k}"`);
          if (f.tier && !tiers.includes(f.tier)) fail(`index.html feed[${i}]: unknown tier "${f.tier}"`);
        });
      }

      const probs = (live.scenarios ?? []).map((s) => parseFloat(s.prob));
      const sum = probs.reduce((a, b) => a + b, 0);
      if (live.scenarios && Math.abs(sum - 100) > 1) fail(`index.html scenarios: probs sum to ${sum}%, must total 100%`);
    }
  }
}

/* ── 7. coverage floor — a run must be BROAD (obj 2) ──────────────── */
/* Reads data/last-run.json, the manifest the signals loop writes. If a run under-
 * collects, this FAILS — "silent lane is a finding" becomes an enforced check,
 * not a hope. Absent manifest = warn (no run recorded), never a hard fail. */
const MIN_LANES = 8, MIN_THEATERS = 4, MIN_ITEMS = 12;
const lastRun = loadJSON("data/last-run.json");
if (!lastRun) warn("data/last-run.json absent — no signals run recorded yet; coverage floor not exercised");
else {
  const lanes = lastRun.lanes_covered?.length ?? 0;
  const theaters = lastRun.theaters_covered?.length ?? 0;
  const items = lastRun.items ?? (Array.isArray(lastRun.candidates) ? lastRun.candidates.length : 0);
  if (lanes < MIN_LANES) fail(`last-run: only ${lanes} lanes covered (floor ${MIN_LANES}) — run is too narrow, widen collection before shipping`);
  if (theaters < MIN_THEATERS) fail(`last-run: only ${theaters} theaters covered (floor ${MIN_THEATERS})`);
  if (items < MIN_ITEMS) fail(`last-run: only ${items} candidate items (floor ${MIN_ITEMS}) — the funnel is too thin`);
  if (lanes >= MIN_LANES && theaters >= MIN_THEATERS && items >= MIN_ITEMS)
    console.log(`✔ coverage floor met — ${lanes} lanes · ${theaters} theaters · ${items} items (${lastRun.ts ?? "?"})`);
}

/* ── report ──────────────────────────────────────────────────── */
for (const w of warns) console.warn("⚠  " + w);
if (errors.length) {
  for (const e of errors) console.error("✖  " + e);
  console.error(`\nVALIDATION FAILED — ${errors.length} error(s). Do not ship.`);
  process.exit(1);
}
console.log(`✔ validation passed (${warns.length} warning(s)) — data + template are shippable`);
