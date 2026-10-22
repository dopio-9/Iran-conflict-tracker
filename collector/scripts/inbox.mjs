#!/usr/bin/env node
/**
 * inbox — the hand-off between the scheduled Claude session and the collector.
 *
 * The collector (GitHub Actions) has no model. Two jobs need one, and both run in
 * a scheduled Claude Code session on the owner's plan, which writes ONLY to
 * collector/data/inbox/ on the branch `claude/inbox`. The collector reads that branch.
 *
 *   translations.json  { id: { en, at } }   — English for items the feed holds
 *   exa-feed.json        { updated, items }   — Claude web-search results, verbatim
 *
 * Contracts this script enforces (the session cannot bypass them):
 *   TRANSLATION — the reply is a JSON array with exactly one string per pending
 *     line, in order. Wrong count, empty or non-string entries → the whole batch
 *     is rejected and the originals stay. Translation may never drop or merge.
 *   SEARCH — each result needs a title and an http(s) URL; outlet, published and
 *     query are copied as given. Nothing is summarised: the title is the outlet's.
 *
 * Usage (in the session):
 *   node collector/scripts/inbox.mjs --pending  [--data <dir>] [--max 120] > pending.json
 *   node collector/scripts/inbox.mjs --apply pending.json reply.json
 *   node collector/scripts/inbox.mjs --queries            (this run's search queries, one per line)
 *   node collector/scripts/inbox.mjs --add-search batch.json
 *   node collector/scripts/inbox.mjs --selftest
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const INBOX = new URL("data/inbox/", ROOT);
const TR = new URL("translations.json", INBOX), SR = new URL("exa-feed.json", INBOX);
const DAY = 86400e3;
const readJSON = (u, d) => { try { return existsSync(u) ? JSON.parse(readFileSync(u, "utf8")) : d; } catch { return d; } };

/** Lines still waiting for English, newest first: untranslated feed items + held items. */
export function pending(feed, hold, translations, { max = 120, now = Date.now() } = {}) {
  const out = [], seen = new Set(Object.keys(translations || {}));
  const push = (id, text, ts) => { if (!seen.has(id) && text && now - Date.parse(ts) < 2 * DAY) { seen.add(id); out.push({ id, ts, text: String(text).slice(0, 400) }); } };
  for (const it of feed?.items || []) if (it.untranslated) push(it.id, it.orig || it.line, it.ts);
  for (const [id, h] of Object.entries(hold || {})) push(id, h.orig || h.title, h.ts);
  return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, max).map(({ id, text }) => ({ id, text }));
}

/** Merge a translation reply. Returns { ok, n, reason }. Mutates translations only on success. */
export function applyReply(translations, pend, reply, now = Date.now()) {
  if (!Array.isArray(reply)) return { ok: false, n: 0, reason: "reply is not a JSON array" };
  if (reply.length !== pend.length) return { ok: false, n: 0, reason: `count mismatch ${reply.length}≠${pend.length}` };
  if (reply.some(x => typeof x !== "string" || !x.trim())) return { ok: false, n: 0, reason: "empty or non-string entry" };
  const at = new Date(now).toISOString();
  pend.forEach((p, i) => { translations[p.id] = { en: reply[i].replace(/\s+/g, " ").trim(), at }; });
  for (const [k, v] of Object.entries(translations)) if (now - Date.parse(v.at) > 7 * DAY) delete translations[k];
  return { ok: true, n: pend.length };
}

/** Validate and append search results. Returns { added, rejected }. */
export function addSearch(store, batch, now = Date.now()) {
  store.items = store.items || [];
  const have = new Set(store.items.map(x => x.url));
  let added = 0, rejected = 0;
  for (const r of Array.isArray(batch) ? batch : []) {
    const title = String(r?.title || "").replace(/\s+/g, " ").trim();
    const url = String(r?.url || "");
    if (!title || !/^https?:\/\//i.test(url)) { rejected++; continue; }
    if (have.has(url)) continue;
    const pub = r.published && !isNaN(Date.parse(r.published)) ? new Date(r.published).toISOString() : null;
    store.items.push({ title: title.slice(0, 300), url, outlet: r.outlet ? String(r.outlet).slice(0, 80) : null,
      published: pub, query: r.query ? String(r.query).slice(0, 120) : null, engine: r.engine ? String(r.engine).slice(0, 30) : null,
      found: new Date(now).toISOString() });
    have.add(url); added++;
  }
  store.items = store.items.filter(x => now - Date.parse(x.found) < 2 * DAY);
  store.updated = new Date(now).toISOString();
  return { added, rejected };
}

/** Collector side: read what the session left (dir = an extracted copy of collector/data/inbox). */
export function readInbox(dir) {
  const base = dir ? new URL(`file://${dir.replace(/\/?$/, "/")}`) : INBOX;
  return { translations: readJSON(new URL("translations.json", base), {}),
    search: readJSON(new URL("exa-feed.json", base), { items: [] }) };
}

/** This run's search queries: PER_RUN of the list, rotating by UTC hour so every query runs within a few hours. */
export function queriesFor(cfg, now = Date.now()) {
  const q = cfg?.queries || [], n = Math.min(cfg?.per_run || 8, q.length);
  if (!n) return [];
  const start = (Math.floor(now / 3600e3) * n) % q.length;
  return Array.from({ length: n }, (_, i) => q[(start + i) % q.length]);
}

function save(u, v) { mkdirSync(INBOX, { recursive: true }); writeFileSync(u, JSON.stringify(v, null, 1) + "\n"); }

function cli(argv) {
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes("--pending")) {
    const d = arg("--data") ? new URL(`file://${arg("--data").replace(/\/?$/, "/")}`) : new URL("data/", ROOT);
    const p = pending(readJSON(new URL("news-collector.json", d), {}), readJSON(new URL("to-translate.json", d), {}), readJSON(TR, {}),
      { max: Number(arg("--max")) || 120 });
    process.stdout.write(JSON.stringify(p, null, 1) + "\n");
    console.error(`pending: ${p.length} lines`);
  } else if (argv.includes("--apply")) {
    const i = argv.indexOf("--apply");
    const pend = JSON.parse(readFileSync(argv[i + 1], "utf8")), reply = JSON.parse(readFileSync(argv[i + 2], "utf8"));
    const tr = readJSON(TR, {});
    const r = applyReply(tr, pend, reply);
    if (!r.ok) { console.error(`REJECTED: ${r.reason} — originals kept`); process.exit(2); }
    save(TR, tr); console.log(`applied ${r.n} translations · ${Object.keys(tr).length} in inbox`);
  } else if (argv.includes("--add-search")) {
    const store = readJSON(SR, { items: [] });
    const r = addSearch(store, JSON.parse(readFileSync(arg("--add-search"), "utf8")));
    save(SR, store); console.log(`search: +${r.added} · rejected ${r.rejected} · ${store.items.length} held (48h)`);
  } else if (argv.includes("--queries")) {
    for (const q of queriesFor(readJSON(new URL("data/search-queries.json", ROOT), {}))) console.log(q);
  } else console.error("usage: --queries | --pending | --apply pending.json reply.json | --add-search batch.json | --selftest");
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  const now = Date.parse("2026-10-16T12:00:00Z"), iso = h => new Date(now - h * 3600e3).toISOString();
  const feed = { items: [{ id: "a", ts: iso(1), orig: "حمله", untranslated: true }, { id: "b", ts: iso(1), line: "Tanker hit" },
    { id: "c", ts: iso(60), orig: "قديم", untranslated: true }] };
  const hold = { h: { ts: iso(2), orig: "תקיפה" } };
  const p = pending(feed, hold, {}, { now });
  ok("pending = untranslated feed items + held items, inside 48h", p.length === 2 && p[0].id === "a" && p[1].id === "h");
  ok("already-translated ids are not asked again", pending(feed, hold, { a: { en: "x", at: iso(0) } }, { now }).length === 1);
  const tr = {};
  ok("wrong count → whole batch rejected, nothing written", !applyReply(tr, p, ["Attack"], now).ok && !Object.keys(tr).length);
  ok("empty entry → rejected", !applyReply(tr, p, ["Attack", " "], now).ok);
  ok("exact count → applied in order", applyReply(tr, p, ["Attack", "Strike"], now).ok && tr.a.en === "Attack" && tr.h.en === "Strike");
  const st = { items: [] };
  const r = addSearch(st, [{ title: "Tanker hit off Fujairah", url: "https://x.ae/1", outlet: "X", published: iso(1) },
    { title: "", url: "https://x.ae/2" }, { title: "No url", url: "ftp://x" }, { title: "Tanker hit off Fujairah", url: "https://x.ae/1" }], now);
  ok("search: valid kept, invalid rejected, duplicate URL skipped", r.added === 1 && r.rejected === 2 && st.items.length === 1);
  ok("search: title stored verbatim", st.items[0].title === "Tanker hit off Fujairah" && st.items[0].published === iso(1));
  const cfg = { per_run: 3, queries: ["a", "b", "c", "d", "e"] };
  const q1 = queriesFor(cfg, 0), q2 = queriesFor(cfg, 3600e3);
  ok("queries rotate by hour, PER_RUN each", q1.join("") === "abc" && q2.join("") === "dea");
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  argv.includes("--selftest") ? selftest() : cli(argv);
}
