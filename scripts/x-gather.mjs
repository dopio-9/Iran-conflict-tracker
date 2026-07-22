#!/usr/bin/env node
/**
 * X / social gather + score client for HORMUZ·LIVE.
 *
 * THE MISSING ENGINE. telegram.mjs gathers+scores feed.kind "telegram-web";
 * nothing gathered or scored feed.kind "x-mirror" — so every X source sat at
 * hits:0 forever, never queried, never able to climb perplexity.mjs's per-lane
 * steer (which ranks by tier THEN hits). This closes that loop for X, using the
 * SAME split the Telegram path uses: FETCH here (CI, where api.perplexity.ai +
 * the key live), EMIT a SCOREBOARD line, and let the session apply+commit it via
 * apply-score.mjs. No new CI commit-back.
 *
 * Fetch mechanism: X has no public unauthenticated HTML endpoint (t.me/s has;
 * nitter is largely dead), so we recall each handle's recent posts THROUGH
 * Perplexity, steered to x.com/twitter/nitter, and keep only citations
 * attributable to that handle. This reuses the verified queryPerplexity/decompose
 * path rather than scraping X directly.
 *
 * Scoring (mirrors telegram.mjs --score semantics so apply-score.mjs is engine-agnostic):
 *   hit   = a handle-attributed primary within TTL (fresh) → the handle is feeding signals now
 *   miss/empty = query returned ZERO primaries → dead/misnamed/private handle → dark(empty)
 *   miss/stale = primaries exist but none fresh + handle-attributed → lowTempo, not dark
 *   miss/error = exception → consecutive-miss ladder (dark@3, retire@5)
 *
 * Network note: api.perplexity.ai is NOT on the sandbox egress allowlist — run
 * from the Actions runner. --selftest exercises the classification offline.
 *
 * Key: PERPLEXITY_API_KEY (env / Actions secret). Never commit it.
 */
import { readFileSync } from "node:fs";
import { queryPerplexity, decompose } from "./perplexity.mjs";

const TTL_FRESH_DAYS = 3; // a handle silent longer is not feeding signals now

/** Extract the @handle from an x-mirror feed url (https://x.com/<handle>). */
function handleOf(s) {
  const m = (s.feed?.url || "").match(/(?:x\.com|twitter\.com|nitter\.[^/]+)\/@?([A-Za-z0-9_]+)/i);
  return m ? m[1] : null;
}

/** Is this primary url a post BY the given handle (not just mentioning it)? */
function attributableTo(url, handle) {
  if (!url || !handle) return false;
  const re = new RegExp(`(?:x\\.com|twitter\\.com|nitter\\.[^/]+)/@?${handle}(?:[/?#]|$)`, "i");
  return re.test(url);
}

/**
 * Classify one handle's decomposed PPLX result into a scoreboard outcome.
 * Pure function — unit-testable offline via --selftest.
 */
export function classify(primaries, handle, { recencyDays = TTL_FRESH_DAYS } = {}) {
  if (!primaries.length) return { outcome: "miss", reason: "empty", freshestMin: null, postCount: 0 };
  const own = primaries.filter((p) => attributableTo(p.url, handle));
  const ownDatedAges = own.filter((p) => p.ageDays != null).map((p) => p.ageDays);
  const freshestDays = ownDatedAges.length ? Math.min(...ownDatedAges) : null;
  const freshOwn = freshestDays != null && freshestDays <= recencyDays;
  const freshestMin = freshestDays != null ? freshestDays * 1440 : null;
  if (freshOwn) return { outcome: "hit", reason: "live", freshestMin, postCount: own.length };
  // primaries came back but none are fresh posts BY the handle → low tempo, not dead
  return { outcome: "miss", reason: "stale", freshestMin, postCount: own.length };
}

/* ── score: per-handle outcome for the scoring loop (runs in CI) ──── */
async function score() {
  const reg = JSON.parse(readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"));
  const xs = reg.filter((s) => s.feed?.kind === "x-mirror" && s.feed.url);
  const channels = [];
  for (const s of xs) {
    const handle = handleOf(s);
    let res = { outcome: "miss", reason: "error", freshestMin: null, postCount: 0 };
    try {
      if (!handle) throw new Error("unresolved handle");
      const topics = (s.lanes || []).join(", ") || "the Iran conflict";
      const q = `Recent posts from the X (Twitter) account @${handle} in the last ${TTL_FRESH_DAYS} days about ${topics}. List each post with its date and a direct link to the post on x.com. Only that account's own posts.`;
      const r = await queryPerplexity(q, { recency: "week", maxTokens: 500, searchDomains: ["x.com", "twitter.com", "nitter.net"] });
      const d = decompose(r, { recencyDays: TTL_FRESH_DAYS, query: q });
      res = classify(d.primaries, handle, { recencyDays: TTL_FRESH_DAYS });
    } catch (e) {
      res = { outcome: "miss", reason: "error", freshestMin: null, postCount: 0, err: e.message };
    }
    channels.push({ id: s.id, name: s.name, outcome: res.outcome, reason: res.reason, freshestMin: res.freshestMin, postCount: res.postCount });
    const fd = res.freshestMin != null ? `${Math.round(res.freshestMin / 1440)}d` : "?";
    console.log(`▸ #${s.id} @${handle || "??"}  [${s.theater} · ${(s.lanes || []).join(",")}]  ${res.outcome}/${res.reason} · own-posts ${res.postCount} · freshest ${fd}`);
  }
  const board = { ts: new Date().toISOString(), engine: "x", channels };
  console.log("SCOREBOARD:" + JSON.stringify(board));
  const hits = channels.filter((c) => c.outcome === "hit").length;
  const empty = channels.filter((c) => c.reason === "empty").length;
  console.log(`\nscored ${channels.length} x-mirror handles — ${hits} hit · ${empty} empty(dark) · ${channels.length - hits - empty} stale/err`);
}

/* ── offline selftest: proves classification without network ──────── */
function selftest() {
  const H = "IranPresspOk";
  const now = 0; // ageDays are precomputed in fixtures below
  const cases = [
    { name: "fresh own post → hit", primaries: [{ url: `https://x.com/${H}/status/1`, ageDays: 0 }], expect: "hit" },
    { name: "own post but stale → stale", primaries: [{ url: `https://x.com/${H}/status/2`, ageDays: 9 }], expect: "stale" },
    { name: "others fresh, none by handle → stale", primaries: [{ url: "https://x.com/SomeoneElse/status/3", ageDays: 0 }], expect: "stale" },
    { name: "no primaries → empty", primaries: [], expect: "empty" },
    { name: "underscore handle attribution", primaries: [{ url: "https://x.com/_Iran__News/status/4", ageDays: 1 }], expect: "hit", handle: "_Iran__News" },
  ];
  let ok = 0;
  for (const c of cases) {
    const got = classify(c.primaries, c.handle || H);
    const key = got.outcome === "hit" ? "hit" : got.reason; // map to expected label
    const pass = key === c.expect;
    ok += pass ? 1 : 0;
    console.log(`${pass ? "✔" : "✖"} ${c.name} → ${got.outcome}/${got.reason}${pass ? "" : ` (expected ${c.expect})`}`);
  }
  console.log(`\nselftest ${ok}/${cases.length} passed`);
  if (ok !== cases.length) process.exit(1);
}

/* ── CLI ───────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === "--score") score().catch((e) => { console.error(e.message); process.exit(1); });
  else if (arg === "--selftest") selftest();
  else { console.error("usage: node scripts/x-gather.mjs --score | --selftest"); process.exit(2); }
}
