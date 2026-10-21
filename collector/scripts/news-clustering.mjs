#!/usr/bin/env node
/**
 * cluster — DE-DUPE, not verification. Groups raw items that carry the same story
 * so the page can show one line per story, with every raw item underneath.
 *
 * Mechanical and visible:
 *   - matching is word overlap on the English line (or the original, for items
 *     still untranslated — they group with their own language);
 *   - the story line is the EARLIEST item's own line, never a written summary;
 *   - the tag is a keyword rule (tanker → SHIPPING), shown as a label only;
 *   - nothing is dropped: an item that matches nothing is a story of one.
 *
 * Lead time (the experiment's missing measure): for each story, the first
 * sighting vs the first mainstream outlet carrying it, and the delivery lag
 * (when the collector actually got the first item vs when it was posted).
 *
 * Usage: imported by feed-manager.mjs.   node collector/scripts/news-clustering.mjs --selftest
 */

import { keys } from "./news-grading.mjs";

/* Theatre words appear in almost every headline; they say nothing about WHICH story. */
const COMMON = new Set(("iran iranian iran's israel israeli strait hormuz gulf persian middle east news live update updates " +
  "breaking latest reportedly sources source official officials video watch today week amid tensions war " +
  "irgc guards revolutionary تنگه هرمز ایران سپاه اسرائیل آمریکا مضيق إيران الإيراني الإيرانية الحرس الثوري إسرائيل " +
  "الأمريكي أمريكا איראן ישראל הורמוז ארה\"ב").split(" "));
/* A story is a burst, not a thread: an item joins a group only within JOIN_H of
   the group's first item, so a running theme ("Hormuz attacks") does not absorb
   two days of separate incidents. */
const JOIN_H = 12;
const kw = line => new Set([...keys(line)].filter(w => !COMMON.has(w)));

export const MAINSTREAM = /\b(reuters|associated press|^ap\b|ap news|bloomberg|bbc|cnn|financial times|^ft\b|guardian|new york times|nytimes|washington post|wall street journal|wsj|sky news|cbs|nbc|abc news|fox news|afp|france 24|dw\b|axios|politico|^the times$|telegraph|al jazeera english|cnbc|npr)/i;

const TAGS = [
  ["NET OUTAGE", /internet outage|outage alert|shutdown of (the )?internet|قطع اینترنت|انقطاع الإنترنت/i],
  ["FIRE (SAT)", /satellite fire detection/i],
  ["MARITIME WARNING", /nav warning|maritime advisory|navarea|hydropac|ukmto (warning|advisory)/i],
  ["AIR (MIL)", /military aircraft in theatre/i],
  ["NUCLEAR", /nuclear|enrich|centrifuge|iaea|natanz|fordow|هسته|نووي|גרעין/i],
  ["SHIPPING", /tanker|vessel|ship\b|ships|cargo|bulker|ukmto|mine\b|mines\b|نفتکش|کشتی|ناقلة|سفينة|سفن|מכלית|ספינה/i],
  ["MISSILE", /missile|ballistic|rocket|موشک|صاروخ|صواريخ|טיל|רקט/i],
  ["DRONE", /drone|uav|shahed|پهپاد|مسيرة|مسيّرة|כטב"ם|רחפן/i],
  ["NAVAL", /carrier|warship|destroyer|frigate|navy|naval|fleet|ناو|البحرية|נושאת מטוסים/i],
  ["TROOPS", /troops|deploy|ground forces|soldiers|marines|brigade|نیروی زمینی|قوات|חיילים/i],
  ["STRIKE", /strike|airstrike|attack|explosion|blast|bomb|shelling|raid|حمله|انفجار|هجوم|قصف|غارة|تقיפה|תקיפה|פיצוץ/i],
  ["AIR", /airspace|flight|notam|airport|airline|aviation|پرواز|فرودگاه|مطار|רחיפה|טיסות/i],
  ["THREAT", /\bwarns?\b|threat|vows?\b|ultimatum|تهدید|هشدار|تهدد|يهدد|تحذير|מאיים|איום|אזהרה/i],
  ["DIPLOMACY", /talks|ceasefire|truce|negotiat|ambassador|sanction|summit|mediat|مذاکره|سفیر|آتش‌بس|مفاوضات|سفير|هدنة|משא ומתן|הפסקת אש/i],
];
export const tagOf = text => (TAGS.find(([, r]) => r.test(text)) || ["OTHER"])[0];

const text = it => (it.tr || !it.untranslated) ? it.line : (it.orig || it.line);

/**
 * @param items feed items (any order)
 * @returns clusters, newest activity first, each { id, tag, line, first:{src,ts,got,url}, n, n_src, srcs, ids,
 *          last_ts, ms:{src,ts}|null, lead_min|null, lag_min|null, flash }
 */
export function cluster(items, { now = Date.now(), hours = 48, flashMin = 45 } = {}) {
  const pool = items.filter(it => now - Date.parse(it.ts) < hours * 3600e3)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const groups = [];   // { members:[it], k:[Set] (first 6 members' keys), grp }
  for (const it of pool) {
    /* Tracker readings of one kind group per GST day (one aircraft = one line would flood the page). */
    const grp = it.grp ? `${it.grp}:${new Date(Date.parse(it.ts) + 4 * 3600e3).toISOString().slice(0, 10)}` : null;
    const k = kw(text(it));
    let g = null;
    if (grp) g = groups.find(x => x.grp === grp);
    else for (const x of groups) {
      if (x.grp || Date.parse(it.ts) - Date.parse(x.members[0].ts) > JOIN_H * 3600e3) continue;
      if (x.k.some(o => { let s = 0; for (const w of k) if (o.has(w)) s++; return s >= 2 && s / Math.min(k.size, o.size) >= 0.5; })) { g = x; break; }
    }
    if (!g) groups.push(g = { members: [], k: [], grp });
    g.members.push(it);
    if (g.k.length < 6) g.k.push(k);
  }
  const out = groups.map(({ members: m, grp }) => {
    const f = m[0], srcs = [...new Set(m.map(x => x.src))];
    const ms = m.find(x => MAINSTREAM.test(String(x.src)));
    const ft = Date.parse(f.ts);
    const line = grp && f.grp === "adsb-mil" ? `Military aircraft in theatre — ${m.length} airframe${m.length > 1 ? "s" : ""} today · latest: ${m[m.length - 1].line.replace(/^Military aircraft in theatre:\s*/, "")}` : f.line;
    return {
      id: f.id, tag: tagOf(m.map(text).join(" ")), line,
      first: { src: f.src, ts: f.ts, got: f.got || null, url: f.url || null },
      n: m.length, n_src: srcs.length, srcs: srcs.slice(0, 8), ids: m.map(x => x.id),
      last_ts: m[m.length - 1].ts,
      ms: ms && ms !== f ? { src: ms.src, ts: ms.ts } : null,
      lead_min: ms && ms !== f ? Math.round((Date.parse(ms.ts) - ft) / 60000) : null,
      lag_min: f.got ? Math.max(0, Math.round((Date.parse(f.got) - ft) / 60000)) : null,
      flash: f.got ? now - Date.parse(f.got) < flashMin * 60e3 : now - ft < flashMin * 60e3,
    };
  });
  /* Flash first, then by latest activity. */
  return out.sort((a, b) => (b.flash - a.flash) || (Date.parse(b.last_ts) - Date.parse(a.last_ts)));
}

/** Run-level lead summary over stories that started in the last 24h. */
export function leadSummary(clusters, now = Date.now()) {
  const day = clusters.filter(c => now - Date.parse(c.first.ts) < 86400e3);
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const withMs = day.filter(c => c.ms);
  const ahead = withMs.filter(c => c.lead_min > 0);
  return { stories_24h: day.length, multi_source: day.filter(c => c.n_src > 1).length,
    mainstream_later: withMs.length, ahead_of_mainstream: ahead.length,
    median_lead_min: med(ahead.map(c => c.lead_min)),
    median_delivery_lag_min: med(day.map(c => c.lag_min).filter(x => x != null)) };
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  const now = Date.parse("2026-10-14T00:00:00Z"), at = h => new Date(now - h * 3600e3).toISOString();
  const items = [
    { id: "1", ts: at(5), got: at(1), src: "Sepahcybery", line: "Second ship hit in Strait of Hormuz, UKMTO confirms", tr: true },
    { id: "2", ts: at(4.9), src: "straits.live", line: "UK reports tanker ship hit by projectile in Hormuz Strait, UKMTO" },
    { id: "3", ts: at(4), src: "Reuters", line: "UKMTO says ship hit by projectile in Strait of Hormuz" },
    { id: "4", ts: at(3.5), src: "Sepahcybery", line: "Aramco facilities in Saudi eastern region under Yemeni missile attack", tr: true },
    { id: "5", ts: at(2), src: "Bloomberg.com", line: "Aramco headquarters hit during Houthi missile attack on Saudi Arabia" },
    { id: "6", ts: at(1), src: "Mehr", line: "Iran says talks with Oman on regional developments" },
    { id: "7", ts: at(0.5), src: "adsb.lol military", grp: "adsb-mil", line: "Military aircraft in theatre: RCH871 · C17 — FL330, 40 km from Dubai" },
    { id: "8", ts: at(0.4), src: "adsb.fi military", grp: "adsb-mil", line: "Military aircraft in theatre: HOMER21 · P8 — FL250, 30 km from Bahrain (NSA)" },
  ];
  const c = cluster(items, { now });
  const ship = c.find(x => x.ids.includes("1")), ara = c.find(x => x.ids.includes("4"));
  ok("same ship story from 3 sources → one story", ship && ship.n === 3 && ship.n_src === 3);
  ok("story line is the earliest source's own line", ship.line === items[0].line && ship.first.src === "Sepahcybery");
  ok("tag by keyword rule", ship.tag === "SHIPPING" && ara.tag === "MISSILE");
  ok("lead time vs first mainstream (Reuters +60m)", ship.ms.src === "Reuters" && ship.lead_min === 60);
  ok("delivery lag measured from got", ship.lag_min === 240);
  ok("Aramco story groups the Telegram claim with Bloomberg", ara.n === 2 && ara.lead_min === 90);
  ok("unrelated item stays a story of one", c.find(x => x.ids.includes("6")).n === 1);
  ok("tracker aircraft group per day into one line", c.filter(x => x.tag === "AIR (MIL)").length === 1 && /2 airframes/.test(c.find(x => x.tag === "AIR (MIL)").line));
  ok("FLASH = first collected within the last 45 minutes", c.filter(x => x.flash).every(x => x.ids.some(id => ["7", "8"].includes(id))) || !c.some(x => x.flash && x.first.got));
  ok("nothing dropped", c.reduce((s, x) => s + x.n, 0) === items.length);
  const L = leadSummary(c, now);
  ok("lead summary counts stories ahead of mainstream", L.ahead_of_mainstream === 2 && L.median_lead_min >= 60);
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) selftest();
