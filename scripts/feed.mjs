#!/usr/bin/env node
/**
 * feed — the RAW lane, persisted. Source → page with no model deciding what shows.
 *
 * Every earlier fast lane printed its findings to a CI log and waited for a Claude
 * session to read and "apply" them. No session → nothing surfaced; a session →
 * a model re-filtered it toward consensus. This script removes the session from
 * the path: it collects, gates, translates and WRITES data/feed.json, which the
 * collector workflow commits and the page renders directly.
 *
 * Gates, and only these (each one counted in the run record):
 *   1. RECENT  — inside the window (default 12h; future-dated beyond 90m is dropped)
 *   2. NOVEL   — fingerprint not already in data/claims.json
 *   3. TOPIC   — about the war (EN/FA/AR/HE keywords; non-English items that miss
 *                the keywords are re-checked on their English translation)
 * Never: source-tier ranking, corroboration, or a model choosing items.
 *
 * Exit code 1 when zero sources were reachable — a dead pipe must show red, not
 * pass quietly. Zero NEW items is not a failure (quiet hours exist); it is recorded.
 *
 * Usage:  node scripts/feed.mjs [--hours 12]      (needs open internet: run in CI)
 *         node scripts/feed.mjs --selftest
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { collect, normalize, fingerprint, isRelevant } from "./flash.mjs";
import { translateLines, needsTranslation } from "./translate.mjs";

const ROOT = new URL("../", import.meta.url);
const FEED = new URL("data/feed.json", ROOT);
const CLAIMS = new URL("data/claims.json", ROOT);
const KEEP_DAYS = 7, MAX_ITEMS = 1500, SKEW_MIN = 90, MAX_TRANSLATE = 150;

const readJSON = (u, d) => { try { return existsSync(u) ? JSON.parse(readFileSync(u, "utf8")) : d; } catch { return d; } };

/** One line, brief, never mid-word. Prefers a sentence end between 60 and 160 chars. */
export function brief(text, max = 160) {
  const t = String(text || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const m = [...head.matchAll(/[.!?؟。](\s|$)/g)].map(x => x.index).filter(i => i >= 60).pop();
  if (m) return t.slice(0, m + 1);
  const sp = head.lastIndexOf(" ", max - 2);
  return t.slice(0, sp > 60 ? sp : max - 1) + "…";
}

/** Pure gating step — testable without network. */
export function gate(results, { claims, now, windowH }) {
  const lo = now - windowH * 3600e3, hi = now + SKEW_MIN * 60e3;
  const sources = {}, kept = [], recheck = [];
  const f = { reachable: 0, fetched: 0, out_of_window: 0, seen_before: 0, off_topic: 0, kept: 0 };
  for (const { s, items, err } of results) {
    const st = sources[s.name] = { route: s.feed.agg || s.feed.fmt || s.feed.kind, lang: s.language || "?", items: items.length, new: 0, err: err || null };
    if (!err) f.reachable++;
    for (const raw of items) {
      f.fetched++;
      const it = normalize(s, raw);
      if (!it.ts || it.ts < lo || it.ts > hi) { f.out_of_window++; continue; }
      const id = fingerprint(it.title);
      if (claims[id]) { f.seen_before++; continue; }
      claims[id] = { first_seen: new Date(it.ts).toISOString(), source: it.src, title: it.title.slice(0, 160) };
      const rec = { ...it, id, _st: st };
      if (isRelevant(it.title)) kept.push(rec);
      else if (needsTranslation(it.title, it.lang)) recheck.push(rec);   // may be on-topic in another language
      else f.off_topic++;
    }
  }
  return { sources, kept, recheck, f };
}

async function run({ windowH = 12 } = {}) {
  const now = Date.now();
  const reg = JSON.parse(readFileSync(new URL("data/sources.json", ROOT), "utf8"));
  const claims = readJSON(CLAIMS, {});
  const feed = readJSON(FEED, { meta: {}, items: [] });

  const { live, results } = await collect(reg);
  const { sources, kept, recheck, f } = gate(results, { claims, now, windowH });

  // Translate: on-topic non-English first (for display), then off-keyword non-English (to re-check topic).
  const showTr = kept.filter(r => needsTranslation(r.title, r.lang));
  const queue = [...showTr, ...recheck].slice(0, MAX_TRANSLATE);
  const { out, status } = await translateLines(queue.map(r => r.orig.slice(0, 400)));
  queue.forEach((r, i) => { r.tr = out[i]; });
  for (const r of recheck) {
    if (r.tr && isRelevant(r.tr)) kept.push(r); else f.off_topic++;
  }
  f.kept = kept.length;

  const fresh = kept.map(r => {
    r._st.new++;
    return {
      id: r.id, ts: new Date(r.ts).toISOString(), src: r.src, via: r.via, lang: r.lang,
      line: brief(r.tr || r.title), orig: r.orig.slice(0, 600), url: r.url,
      tr: !!r.tr, untranslated: !r.tr && needsTranslation(r.title, r.lang),
    };
  });

  const cutoff = now - KEEP_DAYS * 86400e3;
  const byId = new Map();
  for (const it of [...fresh, ...(feed.items || [])]) if (!byId.has(it.id) && Date.parse(it.ts) >= cutoff) byId.set(it.id, it);
  const items = [...byId.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, MAX_ITEMS);
  for (const [k, v] of Object.entries(claims)) if (Date.parse(v.first_seen) < cutoff) delete claims[k];

  const exp = process.env.EXPERIMENT_START && process.env.EXPERIMENT_END
    ? { start: process.env.EXPERIMENT_START, end: process.env.EXPERIMENT_END } : (feed.meta?.experiment || null);
  const meta = {
    updated: new Date(now).toISOString(),
    runs: (feed.meta?.runs || 0) + 1,
    window_h: windowH,
    experiment: exp,
    last_run: { ts: new Date(now).toISOString(), sources: live.length, ...f, new: fresh.length, translate: status },
    sources,
  };
  writeFileSync(FEED, JSON.stringify({ meta, items }, null, 1) + "\n");
  writeFileSync(CLAIMS, JSON.stringify(claims) + "\n");

  console.log(`feed — run ${meta.runs} · ${live.length} realtime sources · ${windowH}h window`);
  console.log(`reachable ${f.reachable}/${live.length} · fetched ${f.fetched} · out-of-window ${f.out_of_window} · seen ${f.seen_before} · off-topic ${f.off_topic} · NEW ${fresh.length}`);
  console.log(`translate: ${status}`);
  console.log(`feed.json: ${items.length} items kept (${KEEP_DAYS}d rolling)`);
  for (const x of fresh.slice(0, 15)) console.log(`  ${x.ts.slice(11, 16)}Z ${String(x.src).slice(0, 22).padEnd(23)} ${x.line.slice(0, 100)}`);
  if (f.reachable === 0) { console.error("FAIL: zero sources reachable — the collector is blind"); process.exit(1); }
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  const now = Date.parse("2026-10-13T12:00:00Z");
  const S = (name, kind, extra = {}) => ({ name, language: "English", feed: { kind, url: "x", ...extra } });
  const results = [
    { s: S("Mehr", "rss"), err: null, items: [
      { title: "Missile strike reported near Bandar Abbas", ts: now - 3600e3, link: "u1" },
      { title: "Missile strike reported near Bandar Abbas", ts: now - 3500e3, link: "u1b" },   // dup claim
      { title: "Best grape farms of the season", ts: now - 3600e3, link: "u2" },               // off topic
      { title: "Old tanker attack in Hormuz", ts: now - 30 * 3600e3, link: "u3" },            // out of window
    ]},
    { s: S("GN-fa", "rss", { agg: "gnews" }), err: null, items: [
      { title: "Iran tanker seized in Strait of Hormuz - Tasnim", ts: now - 600e3, link: "g1" } ]},
    { s: { name: "Dead", language: "English", feed: { kind: "rss", url: "x" } }, err: "HTTP 403", items: [] },
  ];
  const g = gate(results, { claims: {}, now, windowH: 12 });
  ok("kept the war items, once each", g.kept.length === 2);
  ok("duplicate claim counted as seen", g.f.seen_before === 1);
  ok("off-topic counted, not silently lost", g.f.off_topic === 1);
  ok("out-of-window counted", g.f.out_of_window === 1);
  ok("dead source recorded with its error", g.sources.Dead.err === "HTTP 403" && g.f.reachable === 2);
  const gn = g.kept.find(k => k.via === "Google News");
  ok("Google News item attributed to the outlet", gn && gn.src === "Tasnim" && !/Tasnim/.test(gn.title));
  const fa = gate([{ s: { name: "FA", language: "Farsi", feed: { kind: "rss", url: "x" } }, err: null,
    items: [{ title: "یک خبر مهم امروز", ts: now - 60e3 }] }], { claims: {}, now, windowH: 12 });
  ok("non-English item missing keywords is queued for translation re-check, not dropped", fa.recheck.length === 1 && fa.f.off_topic === 0);
  ok("brief keeps short lines whole", brief("Tanker hit near Fujairah.") === "Tanker hit near Fujairah.");
  ok("brief is one line ≤161 chars", (() => { const b = brief("word ".repeat(80)); return b.length <= 161 && !/\n/.test(b); })());
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) selftest();
  else {
    const i = argv.indexOf("--hours");
    run({ windowH: i >= 0 ? Number(argv[i + 1]) || 12 : 12 }).catch(e => { console.error(e.stack || e.message); process.exit(1); });
  }
}
