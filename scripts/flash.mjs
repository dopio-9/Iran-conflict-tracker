#!/usr/bin/env node
/**
 * flash — the FAST LANE. One source is enough.
 *
 * WHY THIS EXISTS: every other engine here answers "what is established?" and
 * needs corroboration before it will say anything. That is the slow lane, and it
 * is structurally incapable of being first. The whole point of carrying Farsi
 * Telegram channels, Hebrew wires and regional agencies is to catch the one or
 * two scattered sources claiming something before anyone else confirms it. A
 * claim that only one source is making is not noise to be filtered — it is the
 * product. Corroboration is the next day's job, not this one's.
 *
 * So flash does NOT gate on agreement. It gates on two things only:
 *   1. RECENT  — the item is inside the flash window (default 6h). Anything
 *      older belongs to the slow lane, which can weigh and confirm it.
 *   2. NOVEL   — this claim has not been seen before. First sighting is
 *      recorded in data/claims.json with a first_seen timestamp, so a story
 *      that has been running for three days stops being a flash after its
 *      first appearance, no matter how often it is republished.
 *
 * What it deliberately does NOT do:
 *   - rank by source tier. A T3 regional channel beating Reuters by four hours
 *     is the exact event this lane exists to catch; ranking would bury it.
 *   - drop single-source items. See above.
 *   - write to index.html. It emits FLASH:{...} for the session to read and
 *     apply, the same split every other engine uses: FETCH in CI where egress
 *     is open, APPLY in session, so CI never commits back and re-fires itself.
 *
 * Usage:  node scripts/flash.mjs              → default 6h window
 *         node scripts/flash.mjs --hours 12
 *         node scripts/flash.mjs --selftest
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseFeed } from "./read.mjs";

const UA = "Mozilla/5.0 (compatible; HormuzLiveFlash/1.0; +https://github.com/dopio-9/Iran-conflict-tracker)";
const TIMEOUT_MS = 12000;
const CONCURRENCY = 8;
const DEFAULT_WINDOW_H = 6;
const SKEW_MIN = 90;          // same tolerance read.mjs uses; a future date is not freshness
const CLAIMS_PATH = new URL("../data/claims.json", import.meta.url);

/* ── novelty ──────────────────────────────────────────────────────────────
   Fingerprint on the CLAIM, not the URL. The same story reaches us from a
   dozen republishers with a dozen different links and slightly different
   headline furniture; keying on the link would let each one re-flash. */
const STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is",
  "are", "was", "were", "be", "by", "with", "from", "as", "that", "this", "it", "its", "has",
  "have", "had", "says", "say", "said", "after", "over", "amid", "new", "report", "reports"]);

export function fingerprint(title) {
  const words = String(title || "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
  /* Sorted + deduped: word order and small rewrites should not mint a new claim.
     Capped at 12 so a long headline and its truncated republish still match. */
  const key = [...new Set(words)].sort().slice(0, 12).join(" ");
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/* ── relevance ────────────────────────────────────────────────────────────
   The first live run produced 110 novel items of which roughly 20 mattered; the
   rest was recipes, telehealth, provincial newspaper front pages and grape
   farming. That is not a corroboration problem, so tier ranking would not fix it
   — a T3 channel still has to be able to beat Reuters. It is a TOPIC problem.
   This gate asks only "is this about the war", never "do enough sources agree",
   so a single scattered claim still publishes. Multi-language by necessity: the
   earliest signals arrive in Farsi, Arabic and Hebrew, and an English-only
   vocabulary would silently discard exactly the layer this lane exists for. */
const TOPIC = [
  // EN
  /\b(strike|struck|missile|drone|uav|airstrike|shelling|explosion|blast|attack)\w*/i,
  /\b(hormuz|bandar|abbas|khark|kharg|bushehr|natanz|fordow|isfahan|esfahan)\b/i,
  /\b(tanker|vessel|convoy|escort|warship|frigate|destroyer|carrier|naval|blockade|chokepoint|bab.?el.?mandeb|red sea|strait)\w*/i,
  /\b(irgc|centcom|idf|houthi|ansarallah|hezbollah|revolutionary guard|pentagon)\w*/i,
  /\b(nuclear|enrich|centrifuge|iaea|warhead|sanction|embargo)\w*/i,
  /\b(airspace|notam|flight (ban|cancel|suspend)|airport clos|evacuat|advisory|alert)\w*/i,
  /\b(iran|iranian|tehran|israel|yemen|gulf|uae|emirates|dubai|abu dhabi|qatar|oman|saudi)\w*/i,
  /\b(ceasefire|truce|talks|negotiat|mediat|escalat|retaliat|ultimatum|deadline)\w*/i,
  // FA
  /(حمله|موشک|پهپاد|جنگ|تنگه|هرمز|نفتکش|سپاه|آمریکا|اسرائیل|مذاکره|تحریم|هسته|آتش‌بس|بندرعباس)/,
  // AR
  /(هجوم|قصف|صاروخ|مسيرة|حرب|مضيق|هرمز|ناقلة|الحوثي|إسرائيل|إيران|مفاوضات|حصار|تصعيد)/,
  // HE
  /(תקיפה|טיל|מלחמה|איראן|חות'י|מיצר|הורמוז|גרעין|הסלמה|משא ומתן)/,
];
/* Explicit rejects: lifestyle desks share a feed with the news desk, so a
   general-interest outlet leaks soft content that happens to mention a country. */
const NOT_TOPIC = [
  /\b(recipe|cook|chef|restaurant|diet|fitness|wellness|horoscope|celebrity|fashion|beach|holiday|tourism|grape|farm|telehealth|football|soccer|basketball|cricket|movie|film|series|album)\w*/i,
  /(מתכון|שף|טיול|חופש|כדורגל)/,
];

export function isRelevant(title) {
  const t = String(title || "");
  if (NOT_TOPIC.some(r => r.test(t))) return false;
  /* Count DISTINCT MATCHED KEYWORDS, not distinct patterns. Counting patterns
     silently penalised every non-Latin script: all Farsi terms live in one
     regex, all Hebrew in another, so a headline like "حمله موشکی به بندرعباس"
     could never score above 1 and was dropped while its English equivalent
     passed. That would have discarded precisely the early regional layer this
     lane exists to catch — the filter would have quietly recreated the blind
     spot it was written to fix. */
  const hits = new Set();
  for (const r of TOPIC)
    for (const m of t.matchAll(new RegExp(r.source, r.flags.includes("g") ? r.flags : r.flags + "g")))
      hits.add(m[0].toLowerCase());
  /* Two distinct terms, so a passing country mention is not enough on its own. */
  return hits.size >= 2;
}

function loadClaims() {
  if (!existsSync(CLAIMS_PATH)) return {};
  try { return JSON.parse(readFileSync(CLAIMS_PATH, "utf8")); } catch { return {}; }
}

async function fetchText(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "User-Agent": UA, "Accept": "*/*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

/* Telegram's public web view is not a feed; each post is a wrapper div carrying
   its own datetime. Reading it here keeps the fast lane's highest-value layer
   (Farsi/Arabic channels that fire before state media) inside the same window. */
function parseTelegram(html) {
  const out = [];
  const blocks = html.match(/<div class="tgme_widget_message[\s\S]*?(?=<div class="tgme_widget_message\b|$)/g) || [];
  for (const b of blocks) {
    const ts = Date.parse((b.match(/<time[^>]*datetime="([^"]+)"/i) || [])[1] || "");
    const text = (b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
    const title = text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const link = (b.match(/href="(https:\/\/t\.me\/[^"]+)"/i) || [])[1] || null;
    if (title && !isNaN(ts)) out.push({ title: title.slice(0, 240), ts, link, body: "" });
  }
  return out;
}

async function pull(s) {
  try {
    const txt = await fetchText(s.feed.url);
    const items = s.feed.kind === "telegram-web" ? parseTelegram(txt) : parseFeed(txt);
    return { s, items, err: null };
  } catch (e) {
    return { s, items: [], err: e.message.slice(0, 40) };
  }
}

async function run({ windowH = DEFAULT_WINDOW_H } = {}) {
  const reg = JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  /* Realtime routes only. html has no realtime sources and returns undated text,
     which cannot be placed in a time window at all — the fast lane is entirely a
     question of WHEN, so an undated source has nothing to contribute to it. */
  const live = reg.filter(s => !s.retired && s.feed?.url &&
    (s.feed.kind === "rss" || s.feed.kind === "telegram-web"));

  console.log(`flash — ${live.length} realtime sources · ${windowH}h window · novelty vs data/claims.json\n`);

  const results = [];
  for (let i = 0; i < live.length; i += CONCURRENCY)
    results.push(...await Promise.all(live.slice(i, i + CONCURRENCY).map(pull)));

  const now = Date.now();
  const claims = loadClaims();
  const lo = now - windowH * 3600e3;
  const hi = now + SKEW_MIN * 60e3;

  const flashes = [];
  let scanned = 0, inWindow = 0, reachable = 0, offTopic = 0;

  for (const { s, items, err } of results) {
    if (!err) reachable++;
    for (const it of items) {
      scanned++;
      if (!it.ts || it.ts < lo || it.ts > hi) continue;
      inWindow++;
      if (!isRelevant(it.title)) { offTopic++; continue; }
      const fp = fingerprint(it.title);
      if (claims[fp]) continue;                       // seen before — not a first signal
      claims[fp] = { first_seen: new Date(it.ts).toISOString(), source: s.name, title: String(it.title).slice(0, 160) };
      flashes.push({
        fp,
        ts: it.ts,
        ageMin: Math.max(0, Math.round((now - it.ts) / 60000)),
        source: s.name,
        lang: s.language || "?",
        medium: s.medium || "?",
        tier: s.tier || "?",
        lanes: (s.lanes || []).slice(0, 3),
        title: String(it.title).slice(0, 220),
        link: it.link || null,
      });
    }
  }

  flashes.sort((a, b) => b.ts - a.ts);
  writeFileSync(CLAIMS_PATH, JSON.stringify(claims, null, 0) + "\n");

  for (const f of flashes.slice(0, 60))
    console.log(`  [${String(f.ageMin + "m").padStart(5)}] ${String(f.source).slice(0, 22).padEnd(23)} ${f.lang.slice(0, 7).padEnd(8)} ${f.lanes.join(",").slice(0, 28).padEnd(29)} ${f.title.slice(0, 96)}`);

  console.log(`\n── FLASH ──`);
  console.log(`sources reachable : ${reachable}/${live.length}`);
  console.log(`items scanned     : ${scanned}`);
  console.log(`inside ${String(windowH).padEnd(2)}h window : ${inWindow}`);
  console.log(`off-topic dropped : ${offTopic}`);
  console.log(`NOVEL (first seen): ${flashes.length}`);
  console.log(`claims ledger     : ${Object.keys(claims).length} fingerprints`);
  console.log(`\nFLASH:${JSON.stringify({ ts: new Date(now).toISOString(), windowH, flashes: flashes.slice(0, 80) })}`);
  return flashes;
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };

  ok("same claim, reordered words → same fingerprint",
    fingerprint("Tanker struck near Hormuz") === fingerprint("Near Hormuz, tanker struck"));
  ok("stopwords and punctuation ignored",
    fingerprint("A tanker was struck in the Strait!") === fingerprint("Tanker struck Strait"));
  ok("republished with 'Report:' prefix → same fingerprint",
    fingerprint("Report: tanker struck near Hormuz") === fingerprint("Tanker struck near Hormuz"));
  ok("different claims → different fingerprints",
    fingerprint("Tanker struck near Hormuz") !== fingerprint("Airport closed in Tehran"));
  ok("empty title is stable, not a crash", typeof fingerprint("") === "string");

  ok("war claim in English passes",      isRelevant("Tanker struck near Hormuz as US strikes resume"));
  ok("war claim in Farsi passes",        isRelevant("حمله موشکی به بندرعباس؛ سپاه واکنش نشان داد"));
  ok("war claim in Hebrew passes",       isRelevant("תקיפה איראנית במיצר הורמוז"));
  ok("war claim in Arabic passes",       isRelevant("قصف صاروخي على مضيق هرمز"));
  ok("recipe column dropped",            !isRelevant("30 החופים הכי טובים באיטליה ל-2026"));
  ok("telehealth filler dropped",        !isRelevant("How telehealth is helping close the healthcare gap in rural Zimbabwe"));
  ok("UAE grape farming dropped",        !isRelevant("UAE-grown grapes: Farmer produces 10,000 grapevines in RAK mountains"));
  ok("single country mention not enough", !isRelevant("Savannah Guthrie pleads for help to find missing mother"));
  ok("diplomacy on the war passes",      isRelevant("Washington, Tehran close to agreeing reopening of Strait of Hormuz"));

  const html = `<div class="tgme_widget_message" data-post="x/1">
    <a href="https://t.me/x/1"></a><time datetime="2026-07-27T18:00:00+00:00"></time>
    <div class="tgme_widget_message_text">Explosion reported near Bandar Abbas</div></div>`;
  const tg = parseTelegram(html);
  ok("telegram post parsed with its own timestamp",
    tg.length === 1 && tg[0].title === "Explosion reported near Bandar Abbas" && !isNaN(tg[0].ts));

  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) selftest();
  else {
    const hi = argv.indexOf("--hours");
    const windowH = hi >= 0 ? Number(argv[hi + 1]) || DEFAULT_WINDOW_H : DEFAULT_WINDOW_H;
    run({ windowH }).catch(e => { console.error(e.message); process.exit(1); });
  }
}

export { run, parseTelegram };
