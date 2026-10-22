#!/usr/bin/env node
/**
 * trackers — non-news signal routes: aircraft, ships' warnings, internet
 * outages, satellite fire detections. Free, mostly keyless, community or official.
 *
 * Each tracker turns a data reading into a one-line item in the same feed as the
 * news. It states what the data says — position, time, value — and nothing more.
 * No model; no judgement of significance beyond a geographic box.
 *
 * Trackers skip the TOPIC gate (they are in-theatre by construction) and apply
 * their own time window, because their timestamps mean different things
 * (observation time, issue date, advisory effective date).
 *
 * Key-gated trackers (FIRMS_KEY, CF_RADAR_TOKEN) report "no key" and produce
 * nothing until the secret exists. That is recorded, not hidden.
 *
 * Usage: imported by collector.mjs.   node collector/scripts/military-trackers.mjs --selftest
 */

import { fetchText } from "./web-social-feed.mjs";

/* Theatre box: Red Sea → Gulf of Oman, Levant → Yemen. */
const BOX = { s: 12, n: 38, w: 32, e: 63 };
const inBox = (lat, lon) => lat >= BOX.s && lat <= BOX.n && lon >= BOX.w && lon <= BOX.e;
const COUNTRIES = { IR: "Iran", IQ: "Iraq", IL: "Israel", LB: "Lebanon", YE: "Yemen", SA: "Saudi Arabia",
  AE: "UAE", QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman", SY: "Syria", JO: "Jordan" };
const SEA = /PERSIAN GULF|ARABIAN GULF|STRAIT OF HORMUZ|GULF OF OMAN|ARABIAN SEA|RED SEA|GULF OF ADEN|BAB.?EL.?MANDEB|IRAN|UNITED ARAB EMIRATES|SAUDI ARABIA|QATAR|BAHRAIN|KUWAIT|OMAN|YEMEN|IRAQ/i;

/* Named points for "distance from" lines. City/terminal-level coordinates. */
const SITES = [
  ["Bandar Abbas", 27.18, 56.27], ["Kharg Island", 29.25, 50.32], ["Bushehr", 28.92, 50.83],
  ["Abadan", 30.34, 48.30], ["Asaluyeh", 27.48, 52.61], ["Jask", 25.64, 57.77], ["Chabahar", 25.29, 60.64],
  ["Qeshm", 26.95, 56.27], ["Isfahan", 32.65, 51.67], ["Natanz", 33.72, 51.73], ["Tehran", 35.69, 51.39],
  ["Tabriz", 38.08, 46.29], ["Shiraz", 29.59, 52.58], ["Ahvaz", 31.32, 48.67], ["Kermanshah", 34.31, 47.07],
  ["Ras Tanura", 26.64, 50.16], ["Abqaiq", 25.94, 49.68], ["Dhahran", 26.29, 50.11], ["Riyadh", 24.71, 46.68],
  ["Jeddah", 21.49, 39.19], ["Yanbu", 24.09, 38.06], ["Jizan", 16.89, 42.55],
  ["Fujairah", 25.13, 56.33], ["Ruwais", 24.11, 52.73], ["Jebel Ali", 25.01, 55.06], ["Abu Dhabi", 24.45, 54.38],
  ["Dubai", 25.20, 55.27], ["Al Dhafra AB", 24.25, 54.55], ["Ras Laffan", 25.91, 51.55], ["Al Udeid AB", 25.12, 51.32],
  ["Bahrain (NSA)", 26.21, 50.61], ["Kuwait City", 29.37, 47.98], ["Duqm", 19.67, 57.70], ["Muscat", 23.59, 58.41],
  ["Basra", 30.51, 47.81], ["Baghdad", 33.31, 44.37], ["Erbil", 36.19, 44.01], ["Hodeidah", 14.80, 42.95],
  ["Sanaa", 15.37, 44.19], ["Aden", 12.79, 45.03], ["Haifa", 32.79, 34.99], ["Tel Aviv", 32.08, 34.78],
  ["Eilat", 29.56, 34.95], ["Dimona", 31.07, 35.03], ["Beirut", 33.89, 35.50], ["Damascus", 33.51, 36.28],
];
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 +
  Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
export function nearest(lat, lon) {
  let best = null;
  for (const [n, a, b] of SITES) { const d = km(lat, lon, a, b); if (!best || d < best.d) best = { n, d }; }
  return best;
}
const pos = (lat, lon) => `${Math.abs(lat).toFixed(2)}${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? "E" : "W"}`;
const near = (lat, lon) => { const n = nearest(lat, lon); return `${Math.round(n.d)} km from ${n.n} (${pos(lat, lon)})`; };
const H = 3600e3;

/* ── parsers (pure, testable) ─────────────────────────────────────────── */

/** adsb.lol / adsb.fi /v2/mil — ADSBexchange-v2 format. */
export function parseAdsbMil(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  return (j.ac || []).filter(a => typeof a.lat === "number" && typeof a.lon === "number" && inBox(a.lat, a.lon))
    .map(a => ({ hex: a.hex, flight: String(a.flight || "").trim(), type: a.t || "", reg: a.r || "",
      alt: a.alt_baro, lat: a.lat, lon: a.lon, gs: a.gs, squawk: a.squawk || "" }));
}

/** IODA /v2/outages/alerts — keep non-normal alerts for theatre countries. */
export function parseIoda(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  return (j.data || []).filter(a => a && a.level && a.level !== "normal" && COUNTRIES[a.entity?.code])
    .map(a => ({ code: a.entity.code, name: a.entity.name || COUNTRIES[a.entity.code], ds: a.datasource || "?",
      level: a.level, ts: (a.time || 0) * 1000, value: a.value, history: a.historyValue }));
}

/** NGA MSI broadcast warnings. issueDate looks like "101515Z MAY 2024". */
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
export function ngaDate(s) {
  const m = String(s || "").match(/^(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{4})$/);
  return m && m[4] in MON ? Date.UTC(+m[5], MON[m[4]], +m[1], +m[2], +m[3]) : null;
}
export function parseNga(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  return (j["broadcast-warn"] || []).filter(w => SEA.test(w.text || ""))
    .map(w => ({ key: `${w.navArea}-${w.msgNumber}-${w.msgYear}`, area: w.navArea, num: w.msgNumber, year: w.msgYear,
      ts: ngaDate(w.issueDate), text: String(w.text || "").replace(/\s+/g, " ").trim(), authority: w.authority || "" }));
}

/** MARAD MSCI advisories page — table rows "2026-011-<title> | Active | 09/09/2026". */
export function parseMarad(html) {
  const t = String(html).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const out = [], seen = new Set();
  for (const m of t.matchAll(/(20\d\d-\d{3})-(.+?)\s+(Active|Cancelled)\s+(\d\d)\/(\d\d)\/(\d{4})/g)) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    out.push({ id: m[1], title: m[2].trim().slice(0, 200), status: m[3], ts: Date.UTC(+m[6], +m[4] - 1, +m[5]) });
  }
  return out;
}

/** NASA FIRMS area CSV. */
export function parseFirms(csv, sat) {
  const [head, ...rows] = String(csv).trim().split(/\r?\n/);
  if (!head || !/latitude/.test(head)) return [];
  const h = head.split(",");
  const ix = k => h.indexOf(k);
  return rows.map(r => r.split(",")).map(c => {
    const lat = +c[ix("latitude")], lon = +c[ix("longitude")], d = c[ix("acq_date")], t = String(c[ix("acq_time")] || "").padStart(4, "0");
    return { lat, lon, frp: +c[ix("frp")] || 0, conf: c[ix("confidence")], sat,
      ts: Date.parse(`${d}T${t.slice(0, 2)}:${t.slice(2)}:00Z`) };
  }).filter(f => !isNaN(f.lat) && !isNaN(f.ts));
}

/** Cloudflare Radar outage annotations. */
export function parseCfOutages(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  return (j.result?.annotations || []).map(a => ({ id: a.id, ts: Date.parse(a.startDate), end: a.endDate || null,
    locs: (a.locations || []).filter(c => COUNTRIES[c]), desc: String(a.description || "").trim(),
    cause: a.outage?.outageCause || "", type: a.outage?.outageType || "", url: a.linkedUrl || null }))
    .filter(a => a.locs.length && !isNaN(a.ts));
}

/* ── runners ──────────────────────────────────────────────────────────── */

const fresh = (state, key, now) => { if (state.seen[key]) return false; state.seen[key] = new Date(now).toISOString(); return true; };
const item = (title, ts, link) => ({ title, orig: title, ts, link: link || null, tracker: true });

const RUN = {
  async "adsb-mil"(s, state, { now }) {
    const ac = parseAdsbMil(await fetchText(s.feed.url, 20000));
    const day = new Date(now).toISOString().slice(0, 10);
    const items = [];
    for (const a of ac) {
      if (!fresh(state, `adsb:${a.hex}:${day}`, now)) continue;     // one line per airframe per day
      const id = [a.flight, a.type, a.reg].filter(Boolean).join(" · ") || a.hex;
      const alt = a.alt === "ground" ? "on ground" : typeof a.alt === "number" ? `FL${Math.round(a.alt / 100)}` : "alt n/a";
      items.push(item(`Military aircraft in theatre: ${id} — ${alt}, ${near(a.lat, a.lon)}`, now,
        `https://globe.adsb.lol/?icao=${a.hex}`));
    }
    return { items, snap: ac };
  },
  async ioda(s, state, { now }) {
    const from = Math.floor((now - 6 * H) / 1000), until = Math.floor(now / 1000);
    const al = parseIoda(await fetchText(`${s.feed.url}?entityType=country&from=${from}&until=${until}`, 30000));
    const items = [];
    for (const a of al) {
      if (!fresh(state, `ioda:${a.code}:${a.ds}:${a.ts}`, now)) continue;
      items.push(item(`Internet outage alert — ${a.name}: ${a.ds} ${a.level}` +
        (a.value != null && a.history ? ` (${Math.round(100 * a.value / a.history)}% of normal)` : ""), a.ts,
        `https://ioda.inetintel.cc.gatech.edu/country/${a.code}`));
    }
    return { items, snap: al };
  },
  async nga(s, state, { now }) {
    const w = parseNga(await fetchText(s.feed.url, 30000));
    const items = [];
    for (const x of w) {
      if (!x.ts || now - x.ts > 36 * H || !fresh(state, `nga:${x.key}`, now)) continue;
      items.push(item(`Nav warning ${x.area === "P" ? "HYDROPAC" : x.area === "A" ? "HYDROLANT" : "NAVAREA " + x.area} ${x.num}/${String(x.year).slice(2)}: ${x.text}`,
        x.ts, "https://msi.nga.mil/NavWarnings"));
    }
    return { items, snap: w.length };
  },
  async marad(s, state, { now }) {
    const a = parseMarad(await fetchText(s.feed.url, 30000));
    const items = [];
    for (const x of a) {
      if (x.status !== "Active" || now - x.ts > 72 * H || !fresh(state, `marad:${x.id}`, now)) continue;
      items.push(item(`US Maritime Advisory ${x.id}: ${x.title}`, x.ts, s.feed.url));
    }
    return { items, snap: a.filter(x => x.status === "Active").length };
  },
  async firms(s, state, { now, env }) {
    if (!env.FIRMS_KEY) return { items: [], snap: null, note: "no key (FIRMS_KEY)" };
    state.firms = state.firms || {};
    const baseline = !Object.keys(state.firms).length;   // first run learns the standing flares
    const all = [];
    for (const sat of ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT"])
      all.push(...parseFirms(await fetchText(`${s.feed.url}/${env.FIRMS_KEY}/${sat}/${BOX.w},${BOX.s},${BOX.e},${BOX.n}/1`, 40000), sat));
    const items = [], wk = now - 7 * 24 * H;
    for (const [c, t] of Object.entries(state.firms)) if (Date.parse(t) < wk) delete state.firms[c];
    for (const f of all.sort((a, b) => b.frp - a.frp)) {
      const cell = `${f.lat.toFixed(1)},${f.lon.toFixed(1)}`;
      const known = state.firms[cell];
      state.firms[cell] = new Date(Math.max(f.ts, Date.parse(known || 0) || 0)).toISOString();
      if (baseline || known || now - f.ts > 12 * H) continue;     // standing flares and old passes are not news
      const n = nearest(f.lat, f.lon);
      if (n.d > 40) continue;                                    // only near named sites
      if (!fresh(state, `firms:${cell}:${new Date(f.ts).toISOString().slice(0, 13)}`, now)) continue;
      items.push(item(`Satellite fire detection (new spot) ${near(f.lat, f.lon)} — FRP ${Math.round(f.frp)} MW, ${f.sat.replace(/_NRT$/, "").replace(/_/g, " ")}`,
        f.ts, `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${f.lon.toFixed(2)},${f.lat.toFixed(2)},10z`));
    }
    return { items, snap: { detections: all.length, cells: Object.keys(state.firms).length, baseline } };
  },
  async "cf-radar"(s, state, { now, env }) {
    if (!env.CF_RADAR_TOKEN) return { items: [], snap: null, note: "no key (CF_RADAR_TOKEN)" };
    const res = await fetch(`${s.feed.url}?dateRange=2d&limit=100&format=json`,
      { headers: { Authorization: `Bearer ${env.CF_RADAR_TOKEN}` }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const a = parseCfOutages(await res.text());
    const items = [];
    for (const x of a) {
      if (now - x.ts > 48 * H || !fresh(state, `cf:${x.id}`, now)) continue;
      items.push(item(`Internet outage (Cloudflare Radar) — ${x.locs.map(c => COUNTRIES[c]).join(", ")}: ` +
        [x.cause, x.type].filter(Boolean).join(", ") + (x.desc ? ` — ${x.desc}` : ""), x.ts,
        x.url || "https://radar.cloudflare.com/outage-center"));
    }
    return { items, snap: a.length };
  },
};

export const isTracker = s => !s.retired && s.feed?.kind === "tracker" && RUN[s.feed.fmt];

/** Run every tracker. Returns results in collect()'s shape plus a snapshot. */
export async function track(reg, state, { now = Date.now(), env = process.env } = {}) {
  state.seen = state.seen || {};
  for (const [k, t] of Object.entries(state.seen)) if (now - Date.parse(t) > 8 * 24 * H) delete state.seen[k];
  const results = [], snap = { ts: new Date(now).toISOString() };
  for (const s of reg.filter(isTracker)) {
    try {
      const r = await RUN[s.feed.fmt](s, state, { now, env });
      results.push({ s, items: r.items, err: null, note: r.note || null });
      snap[s.feed.fmt] = r.snap;
    } catch (e) {
      results.push({ s, items: [], err: String(e.message).slice(0, 40) });
    }
  }
  state.snapshot = snap;
  return results;
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  const adsb = JSON.stringify({ ac: [
    { hex: "ae1234", flight: "RCH871 ", t: "C17", r: "07-7171", alt_baro: 33000, lat: 25.1, lon: 55.2 },
    { hex: "ae0001", flight: "NORTH48", t: "BE20", lat: 60.4, lon: -145.5 }] });
  const a = parseAdsbMil(adsb);
  ok("adsb: keeps only aircraft inside the theatre box", a.length === 1 && a[0].flight === "RCH871");
  ok("nearest site is Dubai for 25.1N 55.2E", nearest(25.1, 55.2).n === "Dubai" || nearest(25.1, 55.2).n === "Jebel Ali");
  const io = parseIoda(JSON.stringify({ data: [
    { entity: { code: "IR", name: "Iran" }, datasource: "bgp", level: "critical", time: 1760500000, value: 40, historyValue: 100 },
    { entity: { code: "FR", name: "France" }, datasource: "bgp", level: "critical", time: 1760500000 },
    { entity: { code: "IQ", name: "Iraq" }, datasource: "ping-slash24", level: "normal", time: 1760500000 }] }));
  ok("ioda: theatre country non-normal alerts only", io.length === 1 && io[0].code === "IR");
  ok("nga: issueDate parsed", ngaDate("101515Z MAY 2024") === Date.UTC(2024, 4, 10, 15, 15));
  const ng = parseNga(JSON.stringify({ "broadcast-warn": [
    { navArea: "P", msgNumber: 9, msgYear: 2026, issueDate: "131200Z OCT 2026", text: "STRAIT OF HORMUZ.\nMINE DANGER AREA" },
    { navArea: "P", msgNumber: 10, msgYear: 2026, issueDate: "131200Z OCT 2026", text: "CORAL SEA. LIGHT UNRELIABLE" }] }));
  ok("nga: only theatre-sea warnings", ng.length === 1 && /HORMUZ/.test(ng[0].text));
  const md = parseMarad("<tr><td>2026-011-Persian Gulf, Strait of Hormuz and Gulf of Oman-Iranian Attacks on Commercial Vessels</td><td>Active</td><td>09/09/2026</td></tr>");
  ok("marad: advisory row parsed", md.length === 1 && md[0].id === "2026-011" && md[0].ts === Date.UTC(2026, 8, 9));
  const fc = parseFirms("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n26.64,50.15,330,0.4,0.4,2026-10-13,2214,N20,VIIRS,n,2.0NRT,290,85.2,N", "VIIRS_NOAA20_NRT");
  ok("firms: csv parsed with UTC time", fc.length === 1 && fc[0].ts === Date.UTC(2026, 9, 13, 22, 14) && fc[0].frp === 85.2);
  const cf = parseCfOutages(JSON.stringify({ result: { annotations: [
    { id: "x1", startDate: "2026-10-13T10:00:00Z", locations: ["IR"], description: "Government-directed shutdown", outage: { outageCause: "GOVERNMENT_DIRECTED", outageType: "NATIONWIDE" } },
    { id: "x2", startDate: "2026-10-13T10:00:00Z", locations: ["BR"] }] } }));
  ok("cf radar: theatre outages only", cf.length === 1 && cf[0].locs[0] === "IR");
  const reg = [{ name: "FIRMS", feed: { kind: "tracker", fmt: "firms", url: "x" } }];
  track(reg, {}, { now: Date.now(), env: {} }).then(r => {
    ok("key-gated tracker without key reports it, produces nothing, no error", r[0].note && !r[0].err && !r[0].items.length);
    console.log(`\nselftest ${pass}/${pass + fail} passed`);
    process.exit(fail ? 1 : 0);
  });
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) selftest();
