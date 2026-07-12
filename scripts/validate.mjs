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
  const raw = readFileSync(join(root, rel), "utf8");
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

/* ── 2. sources.json ─────────────────────────────────────────── */
const sources = loadJSON("data/sources.json");
if (sources) {
  if (!Array.isArray(sources) || sources.length < 100) fail(`sources.json: expected the full ~110-entry registry, got ${sources?.length}`);
  const validTiers = ["T1", "T2", "T1-ELEVATED", "T1-UNRELIABLE", "SPECIALIST", "META"];
  sources.forEach((s, i) => {
    if (!s.name) fail(`sources[${i}]: missing name`);
    if (!validTiers.includes(s.tier)) fail(`sources[${i}] (${s.name}): unknown tier "${s.tier}"`);
  });
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

/* ── report ──────────────────────────────────────────────────── */
for (const w of warns) console.warn("⚠  " + w);
if (errors.length) {
  for (const e of errors) console.error("✖  " + e);
  console.error(`\nVALIDATION FAILED — ${errors.length} error(s). Do not ship.`);
  process.exit(1);
}
console.log(`✔ validation passed (${warns.length} warning(s)) — data + template are shippable`);
