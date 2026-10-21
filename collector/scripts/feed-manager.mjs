#!/usr/bin/env node
/**
 * feed — the RAW lane, persisted. Source → page with no model deciding what shows.
 *
 * Collects every realtime route (RSS, Telegram web, Google News, GDELT), the
 * trackers (aircraft, nav warnings, outages, fires) and the Claude-search inbox,
 * gates them, and WRITES collector/data/news-collector.json, which the collector workflow commits and
 * the page renders directly.
 *
 * Gates, and only these (each one counted in the run record):
 *   1. RECENT  — inside the window (default 12h; future-dated beyond 90m is dropped)
 *   2. NOVEL   — fingerprint not already in collector/data/de-dupe.json
 *   3. TOPIC   — about the war (EN/FA/AR/HE keywords). A non-English item that misses
 *                the keywords is HELD (collector/data/to-translate.json), not dropped, until the Claude
 *                session has translated it; then it is re-checked on the English.
 * Trackers skip TOPIC (in-theatre by construction) and apply their own windows.
 * Never: source-tier ranking, corroboration, or a model choosing items.
 *
 * Also, every run:
 *   - applies English from the inbox (collector/data/inbox/translations.json, written by the session);
 *   - groups items into stories (news-clustering.mjs) and measures lead time vs mainstream;
 *   - records each source's last output; a source silent for 7 days is retired
 *     from polling (owner decision 14 Oct 2026) — kept in the registry, marked why.
 *
 * Exit code 1 when zero sources were reachable — a dead pipe must show red.
 *
 * Usage:  node collector/scripts/feed-manager.mjs [--hours 12] [--inbox <dir>]   (needs open internet: CI)
 *         node collector/scripts/feed-manager.mjs --selftest
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { collect, normalize, fingerprint, isRelevant, decode } from "./web-feed.mjs";
import { needsTranslation } from "./translate.mjs";
import { track } from "./tracker-refresh.mjs";
import { readInbox } from "./inbox.mjs";
import { cluster, leadSummary } from "./news-clustering.mjs";

const ROOT = new URL("../", import.meta.url);
const P = f => new URL(`data/${f}`, ROOT);
const KEEP_DAYS = 7, MAX_ITEMS = 2000, SKEW_MIN = 90, HOLD_H = 48, RETIRE_DAYS = 7;
const SEARCH_SRC = { name: "Claude search", language: "English", feed: { kind: "inbox", agg: "search" } };

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

/** Search inbox entries → collect()-shaped result. Undated results cannot pass RECENT. */
export function searchResult(store) {
  return { s: SEARCH_SRC, err: null, items: (store?.items || []).map(r => ({
    title: r.title, orig: r.title, ts: r.published ? Date.parse(r.published) : null, link: r.url, outlet: r.outlet || null })) };
}

/** Pure gating step — testable without network. */
export function gate(results, { claims, now, windowH }) {
  const lo = now - windowH * 3600e3, hi = now + SKEW_MIN * 60e3;
  const sources = {}, kept = [], held = [];
  const f = { reachable: 0, fetched: 0, out_of_window: 0, seen_before: 0, off_topic: 0, held: 0, kept: 0 };
  for (const { s, items, err, note } of results) {
    const st = sources[s.name] = { route: s.feed.agg || s.feed.fmt || s.feed.kind, lang: s.language || "?", items: items.length, new: 0, err: err || null };
    if (note) st.note = note;
    if (!err && !note && s.feed.kind !== "inbox") f.reachable++;   // key-less trackers and the inbox prove nothing about the pipe
    const tracker = s.feed.kind === "tracker";
    for (const raw of items) {
      f.fetched++;
      const it = normalize(s, raw);
      if (!it.ts || it.ts > hi || (!tracker && it.ts < lo)) { f.out_of_window++; continue; }
      const id = fingerprint(it.title);
      if (claims[id]) { f.seen_before++; continue; }
      claims[id] = { first_seen: new Date(it.ts).toISOString(), source: it.src, title: it.title.slice(0, 160) };
      const rec = { ...it, id, _st: st, grp: tracker ? s.feed.fmt : null };
      if (tracker || isRelevant(it.title)) kept.push(rec);
      else if (needsTranslation(it.title, it.lang)) { held.push(rec); f.held++; }   // may be on-topic in another language
      else f.off_topic++;
    }
  }
  return { sources, kept, held, f };
}

/** Apply English from the inbox to feed items and the hold queue. Returns counts. */
export function applyTranslations(items, hold, tr, { now, out }) {
  let applied = 0, released = 0, dropped = 0, expired = 0;
  for (const it of items) if (it.untranslated && tr[it.id]) {
    it.line = brief(tr[it.id].en); it.tr = true; it.untranslated = false; applied++;
  }
  for (const [id, h] of Object.entries(hold)) {
    if (tr[id]) {
      delete hold[id];
      if (isRelevant(tr[id].en)) { out.push({ ...h, id, line: brief(tr[id].en), tr: true, untranslated: false, got: new Date(now).toISOString() }); released++; }
      else dropped++;
    } else if (now - Date.parse(h.ts) > HOLD_H * 3600e3) { delete hold[id]; expired++; }
  }
  return { applied, released, dropped_after_translation: dropped, expired_untranslated: expired };
}

/** Track each source's last output; retire after RETIRE_DAYS of silence. Returns names retired now. */
export function health(reg, results, hl, now) {
  const iso = new Date(now).toISOString(), retired = [];
  for (const { s, items, err, note } of results) {
    if (s.feed.kind === "inbox" || note) continue;              // the inbox and key-less trackers are not "dead"
    const h = hl[s.name] = hl[s.name] || { first: iso, last_ok: null };
    if (!err && items.length) h.last_ok = iso;
    const since = Date.parse(h.last_ok || h.first);
    if (now - since >= RETIRE_DAYS * 86400e3) {
      const r = reg.find(x => x.name === s.name);
      if (r && !r.retired) { r.retired = { since: iso, reason: `no output for ${RETIRE_DAYS} days`, last_ok: h.last_ok, by: "collector" }; retired.push(s.name); }
    }
  }
  return retired;
}

async function run({ windowH = 12, inboxDir = null } = {}) {
  const now = Date.now(), nowIso = new Date(now).toISOString();
  const reg = readJSON(P("sources.json"), []);
  const claims = readJSON(P("de-dupe.json"), {});
  const feed = readJSON(P("news-collector.json"), { meta: {}, items: [] });
  const hold = readJSON(P("to-translate.json"), {});
  const tstate = readJSON(P("tracker-list.json"), {});
  const hl = readJSON(P("source-retire.json"), {});
  const inbox = readInbox(inboxDir);

  const { live, results } = await collect(reg);
  results.push(...await track(reg, tstate, { now }));
  results.push(searchResult(inbox.search));
  const { sources, kept, held, f } = gate(results, { claims, now, windowH });

  const strip = r => ({ id: r.id, ts: new Date(r.ts).toISOString(), got: nowIso, src: r.src, via: r.via, lang: r.lang,
    line: brief(r.title), orig: String(r.orig || r.title).slice(0, 600), url: r.url, tr: false,
    untranslated: !r.grp && needsTranslation(r.title, r.lang), ...(r.grp ? { grp: r.grp } : {}) });
  const fresh = kept.map(r => { r._st.new++; return strip(r); });
  for (const r of held) { const { line, tr, untranslated, ...h } = strip(r); hold[r.id] = h; }

  /* English from the session: applies to new + existing items, releases held ones. */
  const released = [];
  const old = feed.items || [];
  for (const it of old) { it.line = decode(it.line); it.orig = decode(it.orig); }   // items saved before entity decoding
  const trc = applyTranslations([...fresh, ...old], hold, inbox.translations, { now, out: released });
  f.kept = kept.length + released.length;

  const cutoff = now - KEEP_DAYS * 86400e3;
  const byId = new Map();
  for (const it of [...fresh, ...released, ...old]) if (!byId.has(it.id) && Date.parse(it.ts) >= cutoff) byId.set(it.id, it);
  const items = [...byId.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, MAX_ITEMS);
  for (const [k, v] of Object.entries(claims)) if (Date.parse(v.first_seen) < cutoff) delete claims[k];

  const stories = cluster(items, { now });
  const retiredNow = health(reg, results, hl, now);

  const meta = {
    updated: nowIso,
    runs: (feed.meta?.runs || 0) + 1,
    window_h: windowH,
    last_run: { ts: nowIso, sources: results.length, realtime: live.length, ...f, new: fresh.length + released.length,
      translate: trc, hold: Object.keys(hold).length, untranslated: items.filter(i => i.untranslated).length,
      search: { items: inbox.search.items?.length || 0, updated: inbox.search.updated || null },
      retired_now: retiredNow },
    lead: leadSummary(stories, now),
    trackers: tstate.snapshot || null,
    resolved: feed.meta?.resolved || null,
    sources,
  };
  writeFileSync(P("news-collector.json"), JSON.stringify({ meta, stories: stories.slice(0, 400), items }, null, 1) + "\n");
  writeFileSync(P("de-dupe.json"), JSON.stringify(claims) + "\n");
  writeFileSync(P("to-translate.json"), JSON.stringify(hold) + "\n");
  writeFileSync(P("tracker-list.json"), JSON.stringify(tstate) + "\n");
  writeFileSync(P("source-retire.json"), JSON.stringify(hl, null, 1) + "\n");
  if (retiredNow.length) writeFileSync(P("sources.json"), JSON.stringify(reg, null, 2) + "\n");

  console.log(`feed — run ${meta.runs} · ${results.length} routes (${live.length} realtime + trackers + search) · ${windowH}h window`);
  console.log(`reachable ${f.reachable}/${results.length} · fetched ${f.fetched} · out-of-window ${f.out_of_window} · seen ${f.seen_before} · off-topic ${f.off_topic} · held ${f.held} → NEW ${meta.last_run.new}`);
  console.log(`translate (from inbox): ${JSON.stringify(trc)} · hold ${meta.last_run.hold} · untranslated in feed ${meta.last_run.untranslated}`);
  console.log(`stories ${stories.length} · lead ${JSON.stringify(meta.lead)}`);
  if (retiredNow.length) console.log(`retired (7 days silent): ${retiredNow.join(", ")}`);
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
  ok("non-English item missing keywords is HELD for translation, not dropped", fa.held.length === 1 && fa.f.off_topic === 0);
  const trk = gate([{ s: { name: "adsb", language: "English", feed: { kind: "tracker", fmt: "adsb-mil", url: "x" } }, err: null,
    items: [{ title: "Military aircraft in theatre: RCH1 — FL300", ts: now - 40 * 3600e3, tracker: true }] }], { claims: {}, now, windowH: 12 });
  ok("tracker items skip TOPIC and the news window", trk.kept.length === 1 && trk.kept[0].grp === "adsb-mil");
  const sr = gate([searchResult({ items: [{ title: "Tanker hit off Fujairah, Iran blamed", url: "https://a/1", outlet: "The National", published: new Date(now - 3600e3).toISOString() },
    { title: "Undated Hormuz tanker result", url: "https://a/2" }] })], { claims: {}, now, windowH: 12 });
  ok("search inbox: dated result kept under the outlet's name; undated cannot pass RECENT",
    sr.kept.length === 1 && sr.kept[0].src === "The National" && sr.kept[0].via === "Claude search" && sr.f.out_of_window === 1);
  const items = [{ id: "a", ts: new Date(now).toISOString(), line: "حمله", orig: "حمله", untranslated: true }];
  const hold = { h1: { ts: new Date(now).toISOString(), src: "X", orig: "خبر" }, h2: { ts: new Date(now).toISOString(), src: "X", orig: "مرغ" },
    h3: { ts: new Date(now - 50 * 3600e3).toISOString(), src: "X", orig: "قديم" } };
  const out = [];
  const t = applyTranslations(items, hold, { a: { en: "Missile attack on Bandar Abbas" }, h1: { en: "IRGC navy hits tanker in Hormuz" }, h2: { en: "Chicken prices today" } }, { now, out });
  ok("translation applied to a feed item", items[0].tr && items[0].line === "Missile attack on Bandar Abbas" && t.applied === 1);
  ok("held item released when its English is on-topic", out.length === 1 && out[0].id === "h1" && t.released === 1);
  ok("held item off-topic in English is counted, not shown", t.dropped_after_translation === 1);
  ok("held item past 48h without English expires, counted", t.expired_untranslated === 1 && !Object.keys(hold).length);
  const reg = [{ name: "Quiet", feed: { kind: "rss" } }, { name: "Live", feed: { kind: "rss" } }, { name: "FIRMS", feed: { kind: "tracker" } }];
  const hl = { Quiet: { first: new Date(now - 8 * 86400e3).toISOString(), last_ok: null } };
  const rt = health(reg, [{ s: reg[0], items: [], err: null }, { s: reg[1], items: [1], err: null }, { s: reg[2], items: [], err: null, note: "no key" }], hl, now);
  ok("source silent 7 days is retired with a reason; live and key-less ones are not",
    rt.length === 1 && reg[0].retired?.reason && !reg[1].retired && !reg[2].retired);
  ok("brief keeps short lines whole", brief("Tanker hit near Fujairah.") === "Tanker hit near Fujairah.");
  ok("brief is one line ≤161 chars", (() => { const b = brief("word ".repeat(80)); return b.length <= 161 && !/\n/.test(b); })());
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes("--selftest")) selftest();
  else run({ windowH: Number(arg("--hours")) || 12, inboxDir: arg("--inbox") })
    .catch(e => { console.error(e.stack || e.message); process.exit(1); });
}
