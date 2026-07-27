#!/usr/bin/env node
/**
 * probe — the cheap test loop for source activation (Step A).
 *
 * WHY THIS EXISTS: adapters have to be written blind. The session sandbox cannot
 * reach news/AIS/advisory hosts (proxy allowlist), so every reader must be proven
 * on the CI runner, which has open egress. Before this, each attempt cost a full
 * gather run — ~5 minutes AND a burn of Perplexity credit for code that never
 * touches Perplexity. probe runs ALONE: no gather, no PPLX, no key, no cost.
 *
 * It answers three questions in ONE batched run, so activating ~60 sources costs
 * a couple of cycles instead of dozens:
 *   1. REACHABLE?  does the host answer from a GitHub Actions IP (datacenter IPs
 *      are routinely blocked by WAFs — that failure looks identical to a parser
 *      bug in a log, so it must be isolated here).
 *   2. FEED?       does the page DECLARE a feed via <link rel="alternate">?
 *      Sites advertise their own feeds — we read the declaration instead of
 *      guessing /feed, /rss, /rss.xml. No guessing, no search engine needed.
 *   3. SHAPE?      content-type, size, and a short body sample, so a parser can
 *      be written against something observed rather than imagined.
 *
 * Usage:  node scripts/probe.mjs                 → probe the built-in target list
 *         node scripts/probe.mjs <url> [url...]  → probe specific URLs
 *         node scripts/probe.mjs --feeds-only    → only report feed discovery
 */

const UA = "Mozilla/5.0 (compatible; HormuzLiveProbe/1.0; +https://github.com/dopio-9/Iran-conflict-tracker)";
const TIMEOUT_MS = 12000;
const CONCURRENCY = 6;

/* Built-in targets: the activation batch. Ordered by signal value, not convenience.
   EXPERT / MILITARY / NAVAL first — the layer the tracker has never read at all. */
const TARGETS = [
  // ── expert · military · naval (highest-value uncovered layer) ──
  "https://www.understandingwar.org", "https://news.usni.org", "https://www.twz.com",
  "https://www.navalnews.com", "https://www.iiss.org", "https://www.criticalthreats.org",
  "https://www.longwarjournal.org", "https://www.stripes.com",
  // ── free data / authority (I wrongly called these "paid-blocked") ──
  "https://portwatch.imf.org", "https://opensky-network.org", "https://www.ukmto.org",
  "https://straits.live", "https://straits.live/api", "https://straits.live/data",
  "https://www.iaea.org", "https://www.centcom.mil", "https://www.maritime-executive.com",
  "https://gcaptain.com", "https://www.seatrade-maritime.com", "https://lloydslist.com",
  // ── regional / wire ──
  "https://www.timesofisrael.com", "https://www.jpost.com", "https://www.ynet.co.il",
  "https://www.israelhayom.co.il", "https://www.haaretz.co.il",
  "https://www.iranintl.com", "https://en.mehrnews.com", "https://www.tasnimnews.com",
  "https://www.farsnews.ir", "https://en.irna.ir", "https://www.presstv.ir",
  "https://www.khabaronline.ir", "https://amwaj.media", "https://www.al-monitor.com",
  "https://shafaq.com", "https://www.rudaw.net", "https://www.almayadeen.net",
  "https://english.almanar.com.lb", "https://english.alarabiya.net", "https://www.aljazeera.com",
  "https://www.thenationalnews.com", "https://gulfnews.com", "https://www.khaleejtimes.com",
  "https://www.reuters.com", "https://apnews.com", "https://www.bbc.com",
  "https://www.dawn.com", "https://www.thecradle.co", "https://english.ahram.org.eg",
];

/* Telegram successor/mirror candidates for dark channels — a channel that is dark
   is not proof the beat is dark. Tested via the public t.me/s HTML view. */
const TG_MIRRORS = [
  "https://t.me/s/almanarnews", "https://t.me/s/almasirah", "https://t.me/s/sabreenS1",
  "https://t.me/s/Ansarallah_media", "https://t.me/s/qassam_ar", "https://t.me/s/Hezbollah_ar",
];

/* BATCH 2 — route alternates for batch-1 failures.
   A 403 on a homepage is NOT proof a source is unreachable: it is proof that ONE url
   failed. Datacenter-IP WAF rules routinely block the landing page while serving the
   feed, the bare domain, or a republisher. Nothing may be called "blocked" until the
   direct alternate, the beat substitute, and the republisher have all been tried. */
const ALTERNATES = [
  // UKMTO / maritime authority — the highest-value UAE source in the registry
  "https://ukmto.org", "https://www.ukmto.org/rss", "https://www.ukmto.org/indian-ocean/incidents",
  "https://www.maritime.dot.gov/msci", "https://shipping.nato.int",
  // IAEA — declared feeds live under /newscenter on most builds
  "https://iaea.org", "https://www.iaea.org/feeds/topnews.rss", "https://www.iaea.org/newscenter/pressreleases",
  // CENTCOM — .mil blocks datacenter IPs; DVIDS republishes the same releases
  "https://centcom.mil", "https://www.dvidshub.net/rss/unit/USCENTCOM", "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945",
  // PAKISTAN — the blind spot that hid the talks track. Zero alternatives tried before now.
  "https://www.geo.tv", "https://www.thenews.com.pk", "https://tribune.com.pk",
  "https://arynews.tv", "https://www.brecorder.com", "https://dawn.com",
  // direct-feed attempts for homepage-403 outlets
  "https://www.timesofisrael.com/feed/", "https://www.israelhayom.co.il/rss",
  "https://english.alarabiya.net/rss", "https://www.almayadeen.net/rss",
  "https://www.seatrade-maritime.com/rss.xml", "https://www.tasnimnews.com/en/rss/feed",
  "https://amwaj.media/feed", "https://www.presstv.ir/rss.xml",
  // free tracking / data alternates (TRACK layer — I wrongly called this paid-blocked)
  "https://straits.live/api/transits", "https://portwatch.imf.org/api",
  "https://opensky-network.org/api/states/all?lamin=22&lomin=50&lamax=30&lomax=60",
  "https://api.adsb.lol/v2/point/26.2/56.3/50",
];


/* BATCH 3 — remaining legitimate routes for the maritime-authority gap.
   UKMTO + MARAD + NATO Shipping all 403 from CI (uniform datacenter-IP WAF policy
   across UK/US/NATO). Not spoofing the UA to evade that — an operator's access
   control is theirs to set. These are independent authorities and commercial
   incident digests that publish the same advisory content openly. */
const BATCH3 = [
  // official / quasi-official maritime security
  "https://www.jmic.online", "https://www.maritimeglobalsecurity.org",
  "https://www.imo.org", "https://www.icc-ccs.org/piracy-reporting-centre",
  // commercial incident digests that republish UKMTO advisories
  "https://ambrey.com", "https://www.dryadglobal.com", "https://www.dryadglobal.com/feed",
  "https://www.maritime-executive.com/rss", "https://splash247.com", "https://splash247.com/feed/",
  "https://lloydslist.com/rss", "https://www.tradewindsnews.com",
  // AIS / transit data alternates (the /api and /data PAGES were 200 — find the real endpoints)
  "https://straits.live/feed.xml", "https://portwatch.imf.org/pages/port-monitor",
  "https://api.adsb.lol/v2/mil",
  // AP retry (errored once) + Amwaj retry (429/500 = transient)
  "https://apnews.com/index.rss", "https://amwaj.media",
];


/* BATCH 4 — the marine stack the user supplied, tested FROM CI this time.
   These were dismissed earlier on a sandbox-only test (403/000), which proves
   nothing: the sandbox is proxy-blocked from every news/AIS host. Free routes get
   tested before any paid API is requested. */
const BATCH4 = [
  "https://www.marinevesseltraffic.com", "https://www.marinevesseltraffic.com/HORMUZ-STRAIT/ship-traffic-tracker",
  "https://www.marinetraffic.com", "https://www.vesselfinder.com", "https://www.shipfinder.com",
  "https://hormuzstraitmonitor.com", "https://www.hormuztracker.com", "https://hormuztracking.com",
  "https://www.cruisingearth.com", "https://insights.windward.ai",
  "https://straits.live/data", "https://straits.live/vessels",
  // does PPLX support sub-day recency? (fast lane depends on it) — doc check only
  "https://docs.perplexity.ai/api-reference/chat-completions-post",
];

/* BATCH 5 — COMPREHENSION probe, not a reachability probe.
   Batch 4 proved these pages answer; it did not prove their NUMBERS are readable.
   A dashboard's signal is the transit count, not the <title>. Three outcomes matter
   and they have completely different costs, so they must be told apart before any
   reader is written:
     SERVER  — figures sit in the served markup            → plain fetch, cheap
     API     — page hydrates from a JSON endpoint          → best case, clean json route
     CLIENT  — canvas/JS paints it, markup holds nothing   → needs headless browser
   Guessing between these is what produced the "0 usable feeds" line in batch 4. */
const BATCH5 = [
  "https://hormuzstraitmonitor.com", "https://www.hormuztracker.com", "https://hormuztracking.com",
  "https://straits.live/vessels", "https://straits.live/data", "https://insights.windward.ai",
  "https://www.vesselfinder.com", "https://www.shipfinder.com",
];

/* BATCH 6 — CONNECT. Every registry entry that has a URL recorded but NO reader.
   All 45 sit at h0/m0: never fetched, not once. They are not dark and not failed —
   nothing was ever wired to them. Reuters, UKMTO, IAEA, WAM, Anadolu and Mehr are
   in here. Chasing new sources while these sit unplugged is the same instinct as
   pruning: it reaches for novelty instead of using what is already owned.
   The declared-feed check is the payload — a <link rel="alternate"> hit converts an
   entry straight into the rss route, which is the only route running at 14/15. */
const BATCH6 = [
  // wires · media (diplomacy 1/23 lives or dies here)
  "https://reuters.com", "https://apnews.com", "https://aa.com.tr", "https://npr.org",
  "https://nbcnews.com", "https://cbsnews.com", "https://cnbc.com", "https://newarab.com",
  // official · authority (nuclear 0/4 and ports_advisories are entirely here)
  "https://iaea.org", "https://ukmto.org", "https://idf.il", "https://jmic.online",
  "https://iranwatch.org", "https://thesoufancenter.org", "https://iea.org",
  // gulf · uae_local 1/8 — the household's own geography
  "https://wam.ae", "https://qna.org.qa", "https://alarabiya.net", "https://english.alarabiya.net",
  // iranian domestic — the regional-language early layer, 3 producing today
  "https://mehrnews.com", "https://tasnimnews.com", "https://presstv.ir", "https://iranwire.com",
  "https://yjc.ir", "https://entekhab.ir", "https://fa.abna24.com", "https://ir.voanews.com",
  "https://iranmonitor.org", "https://iranwarlive.com", "https://amwaj.media",
  // axis · regional
  "https://almasirah.net.ye", "https://ina.iq", "https://timesofisrael.com", "https://caliber.az",
  "https://iz.ru", "https://kommersant.ru", "https://tag24.de", "https://ironsight.noblerworks.com",
  // track · market
  "https://marinetraffic.com", "https://adsbexchange.com", "https://flightradar24.com",
  "https://flightaware.com", "https://kpler.com", "https://polymarket.com", "https://hormuztracking.com",
];

/** Does this page carry the FIGURES, or just the furniture?
 *  Reports where the numbers live so a reader is written against fact, not hope. */
function comprehend(html) {
  const strip = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  /* Hydration blobs: the whole dataset, already in the page, no endpoint needed. */
  const blobs = [];
  if (/__NEXT_DATA__/.test(html)) blobs.push("__NEXT_DATA__");
  if (/__NUXT__/.test(html)) blobs.push("__NUXT__");
  if (/application\/ld\+json/i.test(html)) blobs.push("ld+json");
  if (/self\.__next_f/.test(html)) blobs.push("next-flight");

  /* Candidate JSON endpoints referenced by the page's own scripts. Read from the
     markup — never invented, same discipline as <link rel=alternate> for feeds. */
  const api = new Set();
  for (const m of html.matchAll(/["'`](\/(?:api|data|v\d)\/[A-Za-z0-9_\-\/.]{2,60})["'`]/g)) api.add(m[1]);
  for (const m of html.matchAll(/["'`](https?:\/\/[A-Za-z0-9.\-]+\/(?:api|v\d)\/[A-Za-z0-9_\-\/.]{2,60})["'`]/g)) api.add(m[1]);

  /* The actual question: are there numbers in the visible text, and do any of them
     sit next to the vocabulary this tracker cares about? */
  const numbers = (strip.match(/\b\d[\d,.]*\b/g) || []).length;
  const DOMAIN = /\b(transit|vessel|ship|tanker|traffic|AIS|dark|arriv|depart|underway|anchor|escort|warship|naval)\w*\b/gi;
  const domainHits = (strip.match(DOMAIN) || []).length;
  const nearNumber = [];
  for (const m of strip.matchAll(/([A-Za-z][A-Za-z ]{2,28}?)\s*[:\-–]?\s*(\d[\d,.]*)\s*(%|vessels?|ships?|transits?)?/g)) {
    if (DOMAIN.test(m[1])) { DOMAIN.lastIndex = 0; nearNumber.push(`${m[1].trim()}=${m[2]}${m[3] || ""}`); }
    if (nearNumber.length >= 6) break;
  }

  const verdict = nearNumber.length >= 2 ? "SERVER"
    : blobs.length ? "BLOB"
    : api.size ? "API"
    : numbers < 20 && strip.length < 1200 ? "CLIENT"
    : "THIN";

  return { verdict, textLen: strip.length, numbers, domainHits, blobs, api: [...api].slice(0, 4), nearNumber, text: strip.slice(0, 260) };
}

async function fetchWithTimeout(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "User-Agent": UA, "Accept": "*/*" } });
  } finally { clearTimeout(t); }
}

/** Read declared feeds from <link rel="alternate" type="application/rss+xml|atom+xml"> */
function declaredFeeds(html, baseUrl) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  for (const tag of html.match(re) || []) {
    if (!/rel\s*=\s*["']?alternate/i.test(tag)) continue;
    if (!/type\s*=\s*["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try { out.push(new URL(href, baseUrl).href); } catch { /* skip malformed */ }
  }
  return [...new Set(out)];
}

async function probe(url) {
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url);
    const ms = Date.now() - t0;
    const ct = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok) return { url, ok: false, status: res.status, ms, ct, note: "HTTP " + res.status };
    const body = await res.text();
    const isFeed = /xml|rss|atom/i.test(ct) || /^\s*<(\?xml|rss|feed)\b/i.test(body.slice(0, 200));
    const isJson = /json/i.test(ct) || /^\s*[[{]/.test(body.slice(0, 40));
    const feeds = isFeed || isJson ? [] : declaredFeeds(body, url);
    let sample = "";
    if (isFeed) {
      const items = (body.match(/<item\b|<entry\b/gi) || []).length;
      const title = (body.match(/<title[^>]*>([\s\S]{0,90}?)<\/title>/i) || [])[1] || "";
      const hasFull = /<content:encoded|<content\b/i.test(body);
      sample = `FEED items=${items} full-text=${hasFull ? "YES" : "no"} first="${title.replace(/<!\[CDATA\[|\]\]>/g, "").trim().slice(0, 50)}"`;
    } else if (isJson) {
      sample = "JSON " + body.slice(0, 110).replace(/\s+/g, " ");
    } else {
      const title = (body.match(/<title[^>]*>([\s\S]{0,80}?)<\/title>/i) || [])[1] || "";
      sample = `HTML "${title.trim().slice(0, 46)}"`;
    }
    const comp = COMPREHEND && !isFeed && !isJson ? comprehend(body) : null;
    return { url, ok: true, status: res.status, ms, ct, bytes: body.length, feeds, sample, comp, kind: isFeed ? "feed" : isJson ? "json" : "html" };
  } catch (e) {
    return { url, ok: false, status: 0, ms: Date.now() - t0, note: e.name === "AbortError" ? "TIMEOUT" : e.message.slice(0, 60) };
  }
}

async function runBatch(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    results.push(...await Promise.all(urls.slice(i, i + CONCURRENCY).map(probe)));
  }
  return results;
}

const argv = process.argv.slice(2);
const feedsOnly = argv.includes("--feeds-only");
const COMPREHEND = argv.includes("--comprehend");
const CONNECT = argv.includes("--connect");
const urls = argv.filter(a => !a.startsWith("--"));
const targets = urls.length ? urls : CONNECT ? BATCH6 : COMPREHEND ? BATCH5 : BATCH4;

console.log(`probe — ${targets.length} targets · runner egress · no PPLX spend\n`);
const results = await runBatch(targets);

const reachable = results.filter(r => r.ok);
const feedFound = reachable.filter(r => r.kind === "feed" || (r.feeds && r.feeds.length));

for (const r of results) {
  if (!r.ok) { if (!feedsOnly) console.log(`✖ ${String(r.status || "ERR").padEnd(4)} ${r.url}  — ${r.note}`); continue; }
  const feedNote = r.feeds && r.feeds.length ? `  → DECLARES ${r.feeds.length} feed(s): ${r.feeds.slice(0, 2).join(" , ")}` : "";
  console.log(`✔ ${String(r.status).padEnd(4)} ${String(r.ms + "ms").padEnd(7)} ${r.kind.padEnd(4)} ${r.url}`);
  console.log(`     ${r.sample}${feedNote}`);
  if (r.comp) {
    const c = r.comp;
    console.log(`     ${c.verdict.padEnd(6)} text=${c.textLen}b numbers=${c.numbers} domain-words=${c.domainHits}`);
    if (c.blobs.length)      console.log(`     blob   ${c.blobs.join(", ")}`);
    if (c.api.length)        console.log(`     api?   ${c.api.join(" , ")}`);
    if (c.nearNumber.length) console.log(`     FIGURES ${c.nearNumber.join(" · ")}`);
    console.log(`     text>  ${c.text.slice(0, 200)}`);
  }
}

if (COMPREHEND) {
  const tally = {};
  for (const r of reachable) if (r.comp) tally[r.comp.verdict] = (tally[r.comp.verdict] || 0) + 1;
  console.log(`\n── COMPREHENSION ──`);
  console.log(Object.entries(tally).map(([k, v]) => `${k}:${v}`).join("  ") || "none");
}

console.log(`\n── SUMMARY ──`);
console.log(`reachable from runner : ${reachable.length}/${results.length}`);
console.log(`with a usable feed    : ${feedFound.length}`);
console.log(`blocked / error       : ${results.length - reachable.length}`);
console.log(`\nFEEDS:${JSON.stringify(feedFound.map(r => ({ src: r.url, feeds: r.kind === "feed" ? [r.url] : r.feeds })))}`);
