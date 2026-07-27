#!/usr/bin/env node
/**
 * read — the single reader engine (Step C).
 *
 * ONE engine, pluggable ROUTES — not a new script per source type. telegram.mjs and
 * x-gather.mjs each grew their own fetch+score+emit stack; a third and fourth copy
 * would be sprawl. Routes share one fetch, one scorer, and the one SCOREBOARD
 * contract apply-score.mjs already consumes, so adding a source type is a function,
 * not a file.
 *
 *   route "rss"  → RSS/Atom feed, parsed for dated items      (built)
 *   route "html" → fetch + per-source extractor               (next)
 *   route "json" → API endpoint                               (next)
 *
 * WHY THIS MATTERS: before this, 134 of 178 registry sources had no reader at all.
 * WIRE (41 sources) had 1 hit between them; ANALYST (24) had 1; TRACK/OFF/STATE/META
 * had zero, ever. The tracker reported journalism ABOUT its sources instead of
 * reading them. This is the first engine that opens a primary and reads it.
 *
 * Feed URLs are never guessed: probe.mjs reads each site's own
 * <link rel="alternate"> declaration and those verified URLs are wired into
 * sources.json as feed{kind:"rss",url}.
 *
 * Network: CI only (the session sandbox is proxy-blocked from news hosts).
 * No API key, no cost — RSS is free, which is why every source moved onto this
 * route stops consuming Perplexity credit permanently.
 */
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; HormuzLiveReader/1.0; +https://github.com/dopio-9/Iran-conflict-tracker)";
const TIMEOUT_MS = 15000;
const TTL_FRESH_H = 72;   // a feed silent >3d is not feeding signals now
const CONCURRENCY = 5;
const SHOW_ITEMS = 4;     // recent items printed per source, for folding into signals

const decode = s => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
};

/** Parse RSS <item> or Atom <entry> into {title, link, date, ts, body}. */
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.map(b => {
    const title = tag(b, "title");
    // Atom puts the url in href; RSS in <link> text
    const link = tag(b, "link") || (b.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || null;
    const raw = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date") || null;
    const t = raw ? Date.parse(raw) : NaN;
    const body = tag(b, "content:encoded") || tag(b, "description") || tag(b, "summary") || "";
    return { title, link, date: raw, ts: isNaN(t) ? null : t, body: body.slice(0, 400) };
  }).filter(i => i.title || i.link);
}

async function fetchText(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

/** Classify one source's feed result. Mirrors telegram.mjs semantics so
 *  apply-score.mjs stays engine-agnostic: hit | miss(empty|stale|error). */
export function classify(items, { ttlH = TTL_FRESH_H, now = Date.now() } = {}) {
  if (!items.length) return { outcome: "miss", reason: "empty", freshestMin: null, postCount: 0 };
  const ages = items.filter(i => i.ts).map(i => (now - i.ts) / 60000);
  const freshestMin = ages.length ? Math.round(Math.min(...ages)) : null;
  if (freshestMin !== null && freshestMin <= ttlH * 60)
    return { outcome: "hit", reason: "live", freshestMin, postCount: items.length };
  if (freshestMin === null)
    return { outcome: "miss", reason: "stale", freshestMin: null, postCount: items.length }; // undated feed — cannot prove freshness
  return { outcome: "miss", reason: "stale", freshestMin, postCount: items.length };
}

async function readOne(s) {
  const url = s.feed.url;
  try {
    const items = parseFeed(await fetchText(url));
    return { s, items, res: classify(items) };
  } catch (e) {
    return { s, items: [], res: { outcome: "miss", reason: "error", freshestMin: null, postCount: 0, err: e.message.slice(0, 50) } };
  }
}

async function runRss() {
  const reg = JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  const feeds = reg.filter(s => s.feed?.kind === "rss" && s.feed.url);
  console.log(`RSS read — ${feeds.length} wired feeds · CI egress · no API key, no cost\n`);
  const out = [];
  for (let i = 0; i < feeds.length; i += CONCURRENCY) {
    out.push(...await Promise.all(feeds.slice(i, i + CONCURRENCY).map(readOne)));
  }
  const channels = [];
  for (const { s, items, res } of out) {
    const fresh = res.freshestMin != null
      ? (res.freshestMin < 60 ? res.freshestMin + "m" : Math.round(res.freshestMin / 60) + "h")
      : "?";
    console.log(`▸ #${s.id} ${s.name}  [${s.theater} · ${(s.lanes || []).join(",")}]  ${res.outcome}/${res.reason} · ${res.postCount} items · freshest ${fresh}${res.err ? " · " + res.err : ""}`);
    // print the recent items — this is the PRIMARY TEXT the session folds into signals
    for (const it of items.filter(i => i.ts).sort((a, b) => b.ts - a.ts).slice(0, SHOW_ITEMS)) {
      const ageH = Math.round((Date.now() - it.ts) / 36e5);
      console.log(`    [${ageH}h] ${(it.title || "").slice(0, 110)}`);
      if (it.body) console.log(`          ${it.body.slice(0, 150)}`);
      if (it.link) console.log(`          ${it.link}`);
    }
    channels.push({ id: s.id, name: s.name, outcome: res.outcome, reason: res.reason, freshestMin: res.freshestMin, postCount: res.postCount });
  }
  const board = { ts: new Date().toISOString(), engine: "rss", channels };
  console.log("\nSCOREBOARD:" + JSON.stringify(board));
  const hits = channels.filter(c => c.outcome === "hit").length;
  const empty = channels.filter(c => c.reason === "empty").length;
  console.log(`\nread ${channels.length} feeds — ${hits} hit · ${empty} empty · ${channels.length - hits - empty} stale/err`);
}

/* ── route: json — live API endpoints (TRACK medium) ──────────────────
   The TRACK layer (14 sources) had never produced a single observation because no
   engine read it, and I twice mis-diagnosed that as commercial gating. probe proved
   OpenSky and adsb.lol answer for free. This reads them and scores on whether the
   endpoint returned live records — the same hit/miss contract as every other route. */
const JSON_SHAPE = {
  // OpenSky: {time, states:[[icao24, callsign, origin_country, ...]]}
  "opensky-network.org": j => ({ n: (j.states || []).length, note: (j.states || []).slice(0, 3).map(s => `${(s[1] || "").trim()}(${s[2]})`).join(", ") }),
  // adsb.lol: {ac:[...], total}
  "api.adsb.lol": j => ({ n: j.total ?? (j.ac || []).length, note: (j.ac || []).slice(0, 3).map(a => a.flight || a.hex).join(", ") }),
};

async function readJson(s) {
  try {
    const txt = await fetchText(s.feed.url);
    const j = JSON.parse(txt);
    const host = new URL(s.feed.url).hostname.replace(/^www\./, "");
    const shape = Object.entries(JSON_SHAPE).find(([h]) => host.includes(h))?.[1];
    const { n, note } = shape ? shape(j) : { n: Array.isArray(j) ? j.length : Object.keys(j).length, note: "" };
    return { s, res: n > 0
      ? { outcome: "hit", reason: "live", freshestMin: 0, postCount: n, note }
      : { outcome: "miss", reason: "empty", freshestMin: null, postCount: 0, note: "endpoint OK but zero records" } };
  } catch (e) {
    return { s, res: { outcome: "miss", reason: "error", freshestMin: null, postCount: 0, err: e.message.slice(0, 50) } };
  }
}

async function runJson() {
  const reg = JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  const eps = reg.filter(s => s.feed?.kind === "json" && s.feed.url);
  console.log(`JSON read — ${eps.length} endpoints · free APIs, no key\n`);
  const out = [];
  for (const e of eps) out.push(await readJson(e));
  const channels = out.map(({ s, res }) => {
    console.log(`▸ #${s.id} ${s.name}  [${s.theater}]  ${res.outcome}/${res.reason} · ${res.postCount} records${res.note ? " · " + res.note : ""}${res.err ? " · " + res.err : ""}`);
    return { id: s.id, name: s.name, outcome: res.outcome, reason: res.reason, freshestMin: res.freshestMin, postCount: res.postCount };
  });
  console.log("\nSCOREBOARD:" + JSON.stringify({ ts: new Date().toISOString(), engine: "json", channels }));
  console.log(`\nread ${channels.length} endpoints — ${channels.filter(c => c.outcome === "hit").length} hit`);
}

/* offline selftest — proves the parser + classifier without network */
function selftest() {
  const now = Date.now();
  const rss = `<rss><channel>
    <item><title>Fresh strike report</title><link>https://x/1</link>
      <pubDate>${new Date(now - 2 * 36e5).toUTCString()}</pubDate>
      <description><![CDATA[<p>Body &amp; text</p>]]></description></item>
    <item><title>Old item</title><link>https://x/2</link>
      <pubDate>${new Date(now - 30 * 24 * 36e5).toUTCString()}</pubDate></item>
  </channel></rss>`;
  const atom = `<feed><entry><title>Atom entry</title>
      <link rel="alternate" href="https://y/1"/>
      <updated>${new Date(now - 60 * 60000).toISOString()}</updated>
      <summary>Summary text</summary></entry></feed>`;
  const cases = [
    ["rss parses 2 items", parseFeed(rss).length === 2],
    ["cdata + entities decoded", parseFeed(rss)[0].body === "Body & text"],
    ["rss link extracted", parseFeed(rss)[0].link === "https://x/1"],
    ["atom entry parsed", parseFeed(atom).length === 1],
    ["atom href link extracted", parseFeed(atom)[0].link === "https://y/1"],
    ["fresh feed → hit", classify(parseFeed(rss)).outcome === "hit"],
    ["all-old feed → stale", classify(parseFeed(rss).slice(1)).reason === "stale"],
    ["empty feed → empty", classify([]).reason === "empty"],
  ];
  let ok = 0;
  for (const [name, pass] of cases) { ok += pass ? 1 : 0; console.log(`${pass ? "✔" : "✖"} ${name}`); }
  console.log(`\nselftest ${ok}/${cases.length} passed`);
  if (ok !== cases.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv[2];
  if (a === "--rss") runRss().catch(e => { console.error(e.message); process.exit(1); });
  else if (a === "--json") runJson().catch(e => { console.error(e.message); process.exit(1); });
  else if (a === "--selftest") selftest();
  else { console.error("usage: node scripts/read.mjs --rss | --json | --selftest"); process.exit(2); }
}
