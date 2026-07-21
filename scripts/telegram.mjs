#!/usr/bin/env node
/**
 * Telegram DIRECT engine for HORMUZ·LIVE — the real-time L3 pipe for Telegram.
 *
 * SEAT: the THIRD gather engine, alongside WEB (WebSearch) and PPLX (Perplexity).
 * WEB and PPLX are index-lagged — they see a Telegram post days after it lands.
 * This polls the source DIRECTLY: every public channel is served as static HTML
 * at https://t.me/s/<handle> with per-message <time datetime> stamps. No API, no
 * auth, no bridge to host (tg2rss/RSS-Bridge just wrap this same page). That is
 * the whole point — it fits the no-infrastructure constraint.
 *
 * DISCIPLINE, same as the Perplexity lane:
 *   - DATE-STAMP every post; freshness is read from t.me/s, not guessed.
 *   - This is a GATHER engine, never a verifier. Adversary-origin Telegram
 *     (IRGC/axis channels) still tiers DISPUTED downstream — real-time ≠ trusted.
 *
 * Network note: reaches t.me (Telegram web). Like api.perplexity.ai, this is NOT
 * on the build sandbox's egress allowlist — reachability is proven in CI, not
 * here. `--smoke` answers "can the runner reach + parse t.me/s at all"; `--gather`
 * then walks the registry's wired channels.
 *
 * STATUS: VERIFIED by CI run 29734013637 (20 Jul 2026, social-fetch on this
 * branch); re-run 21 Jul for the Day-143 update. Smoke green: t.me/s reachable + parsed. Gather: 21/21 handles
 * resolved, 0 HTTP failures. It immediately surfaced real-time regional signal
 * WebSearch/Perplexity miss — e.g. an Arabic strike report on Kuwait's Al-Ahmadi
 * port 6 MINUTES old, and OSINTdefender's live Bahrain-intercept thread. ~10 of
 * 21 channels returned 0 posts (HTTP 200 but empty = private/restricted, or a
 * handle that redirects) — a "dark channel" finding, not a parser fault (Farsi,
 * Arabic, Hebrew and English all parsed). Date-stamping correctly exposed the
 * low-tempo channels (6–40d stale) so none masquerade as fresh.
 */

const DAY_MS = 86_400_000;
const UA = "Mozilla/5.0 (compatible; HormuzLive/1.0; +https://t.me/s)";

/** Fetch a public channel's t.me/s HTML. Needs network. */
export async function fetchChannel(handle) {
  const url = `https://t.me/s/${handle}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en,fa,ar,he" } });
  if (!res.ok) throw new Error(`t.me/s/${handle} HTTP ${res.status}`);
  return res.text();
}

const stripHtml = (s) =>
  s.replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

/**
 * Parse t.me/s HTML into date-stamped posts, in document order (oldest→newest,
 * as the page renders them). Each message lives in a `tgme_widget_message_wrap`
 * block carrying a <time datetime> and a message_text div.
 * @returns {{date, ageDays, ageMin, text}[]}
 */
export function parsePosts(html, { now = Date.now() } = {}) {
  const posts = [];
  const blocks = html.split("tgme_widget_message_wrap").slice(1); // [0] = page header
  for (const b of blocks) {
    const dt = (b.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || null;
    const tm = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = tm ? stripHtml(tm[1]) : "";
    if (!dt && !text) continue;
    const t = dt ? Date.parse(dt) : NaN;
    const dated = !Number.isNaN(t);
    posts.push({
      date: dt,
      ageDays: dated ? Math.floor((now - t) / DAY_MS) : null,
      ageMin: dated ? Math.floor((now - t) / 60_000) : null,
      text,
    });
  }
  return posts;
}

/* ── live smoke: prove the runner can reach + parse t.me/s at all ──── */
/* Uses the official @telegram channel — guaranteed public, always posting — so
 * a FAIL means reachability/markup, never a bad handle of ours. */
async function smoke() {
  const handle = "telegram";
  const html = await fetchChannel(handle);
  const posts = parsePosts(html);
  const dated = posts.filter((p) => p.ageDays !== null);
  const shape = { handle, bytes: html.length, posts: posts.length, dated: dated.length, withText: posts.filter((p) => p.text).length };
  console.log("live shape:", JSON.stringify(shape));
  if (!(posts.length > 0 && dated.length > 0)) {
    console.error("✖ smoke FAIL — reached the page but parsed no dated posts (egress blocked, or t.me/s markup changed)");
    process.exit(1);
  }
  const newest = dated[dated.length - 1];
  console.log(`✔ smoke PASS — t.me/s reachable + parsed; newest post ${newest.ageMin}m old: "${(newest.text || "").slice(0, 60)}"`);
}

/* ── gather: walk the registry's wired Telegram channels (runs in CI) ──── */
/* Also validates our handles: a channel that 404s here needs its handle fixed
 * (intake "wire" step). Prints latest posts, date-stamped, per channel. */
async function gather() {
  const fs = await import("node:fs");
  const reg = JSON.parse(fs.readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  const tg = reg.filter((s) => s.feed?.kind === "telegram-web" && s.feed.url);
  const unresolved = reg.filter((s) => s.feed?.kind === "telegram-web" && !s.feed.url);
  console.log(`Telegram DIRECT gather — ${tg.length} wired channels (${unresolved.length} awaiting handle resolution)\n`);
  let ok = 0, fail = 0;
  for (const s of tg) {
    const handle = s.feed.url.replace(/.*t\.me\/s\//, "");
    try {
      const posts = parsePosts(await fetchChannel(handle)).filter((p) => p.text);
      const fresh = posts.filter((p) => p.ageMin != null).map((p) => p.ageMin);
      const freshest = fresh.length ? Math.min(...fresh) : null;
      ok++;
      console.log(`▸ #${s.id} ${s.name}  [${s.theater} · ${s.lanes.join(",")}]  ${posts.length} posts · freshest ${freshest != null ? freshest + "m" : "?"}`);
      for (const p of posts.slice(-3).reverse())
        console.log(`   [${p.date ?? "?"}${p.ageMin != null ? ` ${p.ageMin}m` : ""}] ${p.text.slice(0, 90)}`);
    } catch (e) {
      fail++;
      console.log(`▸ #${s.id} ${s.name}  — FAIL (${e.message}) — check handle`);
    }
  }
  if (unresolved.length) {
    console.log(`\nawaiting handle resolution: ${unresolved.map((s) => `#${s.id} ${s.name}`).join(", ")}`);
  }
  console.log(`\n${ok} ok · ${fail} failed of ${tg.length} wired`);
}

/* ── score: per-channel outcome for the scoring loop (runs in CI) ──── */
/* Emits a machine-readable SCOREBOARD line the session reads (get_job_logs) and
 * feeds to apply-score.mjs, which writes hits/misses/dark back to the registry.
 * Split (fetch in CI, write in session) avoids CI commit-back loops; the Routine
 * later does both in one context. Outcome per channel:
 *   hit  = has a post within TTL_FRESH
 *   miss = 0 posts (reason:empty → private/bad-handle) OR only stale posts (reason:stale) */
const TTL_FRESH_MIN = 4320; // 3 days — a channel silent longer is not feeding signals now
async function score() {
  const fs = await import("node:fs");
  const reg = JSON.parse(fs.readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  const tg = reg.filter((s) => s.feed?.kind === "telegram-web" && s.feed.url);
  const channels = [];
  for (const s of tg) {
    const handle = s.feed.url.replace(/.*t\.me\/s\//, "");
    let postCount = 0, freshestMin = null, reason = "empty", outcome = "miss";
    try {
      const posts = parsePosts(await fetchChannel(handle)).filter((p) => p.text);
      postCount = posts.length;
      const ages = posts.filter((p) => p.ageMin != null).map((p) => p.ageMin);
      freshestMin = ages.length ? Math.min(...ages) : null;
      if (postCount === 0) reason = "empty";
      else if (freshestMin != null && freshestMin <= TTL_FRESH_MIN) { reason = "live"; outcome = "hit"; }
      else reason = "stale";
    } catch (e) {
      reason = "error";
    }
    channels.push({ id: s.id, name: s.name, outcome, reason, freshestMin, postCount });
  }
  const board = { ts: new Date().toISOString(), engine: "telegram", channels };
  console.log("SCOREBOARD:" + JSON.stringify(board));
  const hits = channels.filter((c) => c.outcome === "hit").length;
  const empty = channels.filter((c) => c.reason === "empty").length;
  console.log(`\nscored ${channels.length} channels — ${hits} hit · ${empty} empty(dark) · ${channels.length - hits - empty} stale/err`);
}

/* ── CLI ───────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === "--smoke") smoke().catch((e) => { console.error(e.message); process.exit(1); });
  else if (arg === "--gather") gather().catch((e) => { console.error(e.message); process.exit(1); });
  else if (arg === "--score") score().catch((e) => { console.error(e.message); process.exit(1); });
  else if (arg && !arg.startsWith("--")) fetchChannel(arg).then((h) => console.log(JSON.stringify(parsePosts(h).slice(-5), null, 2))).catch((e) => { console.error(e.message); process.exit(1); });
  else { console.error('usage: node scripts/telegram.mjs --smoke | --gather | --score | <handle>'); process.exit(2); }
}
