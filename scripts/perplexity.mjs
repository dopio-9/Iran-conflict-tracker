#!/usr/bin/env node
/**
 * Perplexity gather client for HORMUZ·LIVE.
 *
 * SEAT (see agents/GATHER.md + agents/BUILD.md §B): a Haiku-tier recall booster.
 * It surfaces primaries; it is NEVER a verifier. Its synthesis narrative is
 * discarded — only the cited primaries survive, each date-stamped, and the
 * caller tiers them independently. Nothing here reaches WIRE or the LISTEN
 * ladder directly.
 *
 * The two disciplines this module enforces mechanically:
 *   1. DECOMPOSE — drop the prose answer, keep the citations as primaries.
 *   2. DATE-STAMP — read each primary's date; a claim whose only citations are
 *      stale is a RECIRCULATION, not a fresh finding (the 17 Jul UAE-evacuation
 *      failure that motivated this — a synthesis engine blends events months
 *      apart into a false present).
 *
 * Network note: reaches api.perplexity.ai, which is NOT on this sandbox's
 * egress allowlist — run it from the GitHub Actions runner or locally, not the
 * Claude Code sandbox. `--selftest` exercises the decomposition logic offline.
 *
 * STATUS: VERIFIED against the live API by CI run 29687989324 (19 Jul 2026,
 * `on: push` smoke on this branch). Real shape returned by model `sonar`:
 *   { citations: 14, search_results: 14 }  — BOTH arrays present.
 * `search_results` carries the dates; decompose() read them and returned a
 * correct FRESH verdict (freshest primary 2d old). The citations[] fallback is
 * kept only as a defensive hedge — search_results is the confirmed dated path.
 *
 * Key: PERPLEXITY_API_KEY (env / Actions secret). Never commit it.
 */

const API = "https://api.perplexity.ai/chat/completions";
const DAY_MS = 86_400_000;

/** Call Perplexity. Returns the raw API JSON. Needs network + key. */
export async function queryPerplexity(query, { model = "sonar", recency = "week", maxTokens = 800 } = {}) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("PERPLEXITY_API_KEY not set");
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return sourced facts with citations. Do not editorialize; do not merge events from different dates." },
        { role: "user", content: query },
      ],
      search_recency_filter: recency, // day|week|month|year — bias toward fresh
      return_citations: true,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

/**
 * Decompose a Perplexity response into date-stamped primaries.
 * The prose answer is intentionally discarded.
 * @returns {{query, primaries, freshest_days, recirculation, undated, note}}
 */
export function decompose(apiResponse, { recencyDays = 3, now = Date.now(), query = "" } = {}) {
  // Prefer search_results (carry title+url+date); fall back to bare citations.
  const raw =
    apiResponse?.search_results?.length
      ? apiResponse.search_results
      : (apiResponse?.citations ?? []).map((url) => ({ url, title: null, date: null }));

  const primaries = raw.map((r) => {
    const t = r.date ? Date.parse(r.date) : NaN;
    const ageDays = Number.isNaN(t) ? null : Math.floor((now - t) / DAY_MS);
    return { title: r.title ?? null, url: r.url, date: r.date ?? null, ageDays };
  });

  const dated = primaries.filter((p) => p.ageDays !== null);
  const undated = primaries.filter((p) => p.ageDays === null).map((p) => p.url);
  const freshest_days = dated.length ? Math.min(...dated.map((p) => p.ageDays)) : null;

  // RECIRCULATION: we have dated primaries and none of them is fresh.
  const recirculation = dated.length > 0 && freshest_days > recencyDays;

  let note;
  if (recirculation)
    note = `RECIRCULATION — freshest dated citation is ${freshest_days}d old (> ${recencyDays}d). Tier as stale; do not present as new.`;
  else if (!dated.length)
    note = `DATE-UNKNOWN — no citation carried a date; freshness unverifiable, tier conservatively.`;
  else note = `FRESH — freshest dated citation is ${freshest_days}d old.`;

  return { query, synthesis_discarded: true, primaries, freshest_days, recirculation, undated, note };
}

/* ── offline self-test: the 17 Jul UAE-evacuation case ─────────────── */
function selftest() {
  const now = Date.parse("2026-07-19T00:00:00Z");
  // Fixture mirrors what Perplexity actually returned: the "airports tonight"
  // claim, cited only to 14 Mar primaries plus undated aggregators.
  const fixture = {
    choices: [{ message: { content: "Risk to DXB/AUH tonight is elevated…(discarded)" } }],
    search_results: [
      { title: "Iran threatens UAE ports — Fortune", url: "https://fortune.com/2026/03/14/iran-threat-uae-ports/", date: "2026-03-14" },
      { title: "Iran state media warns residents around three UAE ports", url: "https://www.iranintl.com/en/202603148707", date: "2026-03-14" },
      { title: "EurasianTimes syndication", url: "https://eurasiantimes.com/iran-warns-uae-airports/", date: null },
    ],
  };
  const out = decompose(fixture, { recencyDays: 3, now, query: "Iran evacuate UAE airports tonight?" });
  const pass = out.recirculation === true && out.freshest_days >= 120 && out.undated.length === 1;
  console.log(JSON.stringify(out, null, 2));
  console.log(pass ? "\n✔ selftest PASS — recirculation correctly flagged" : "\n✖ selftest FAIL");
  process.exit(pass ? 0 : 1);
}

/* ── live smoke test: one real call, assert the shape (runs in CI) ──── */
async function smoke() {
  const r = await queryPerplexity("In one sentence, what is the Strait of Hormuz?", { maxTokens: 120 });
  const content = r?.choices?.[0]?.message?.content;
  const cites = r?.citations ?? [];
  const results = r?.search_results ?? [];
  const shape = { model: r?.model, has_content: typeof content === "string", citations: cites.length, search_results: results.length };
  console.log("live shape:", JSON.stringify(shape));
  const ok = shape.has_content && (cites.length > 0 || results.length > 0);
  if (!ok) { console.error("✖ smoke FAIL — no content or no citations/search_results (use a sonar model)"); process.exit(1); }
  const dec = decompose(r, { query: "smoke" });
  console.log(`✔ smoke PASS — ${dec.primaries.length} primaries, note: ${dec.note}`);
}

/* ── gather lane: real recall to COMPLEMENT web search (runs in CI) ──── */
/* Reads agents/gather-queries.json, runs each through Perplexity, prints the
 * decomposed + date-stamped primaries. This is the second, independent recall
 * engine: convergence between this and the session's web search raises signal
 * confidence; its per-primary dates are what catch recirculation. */
async function gather() {
  const fs = await import("node:fs");
  const qpath = new URL("../agents/gather-queries.json", import.meta.url);
  const queries = JSON.parse(fs.readFileSync(qpath, "utf8"));
  for (const q of queries) {
    try {
      const r = await queryPerplexity(q, { recency: "week", maxTokens: 400 });
      const d = decompose(r, { query: q, recencyDays: 3 });
      const rows = d.primaries.slice(0, 6)
        .map((p) => `    · [${p.date ?? "undated"}${p.ageDays != null ? ` ${p.ageDays}d` : ""}] ${(p.title ?? "").slice(0, 70)} — ${p.url}`)
        .join("\n");
      console.log(`\n▸ ${q}\n  ${d.note}\n${rows}`);
    } catch (e) {
      console.log(`\n▸ ${q}\n  ERROR: ${String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")}`);
    }
  }
}

/* ── CLI ───────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === "--selftest") selftest();
  else if (arg === "--smoke") smoke().catch((e) => { console.error(String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")); process.exit(1); });
  else if (arg === "--gather") gather().catch((e) => { console.error(String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")); process.exit(1); });
  else if (!arg) {
    console.error('usage: node scripts/perplexity.mjs "<query>"   |   --selftest');
    process.exit(2);
  } else {
    queryPerplexity(arg)
      .then((r) => console.log(JSON.stringify(decompose(r, { query: arg }), null, 2)))
      .catch((e) => { console.error(String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")); process.exit(1); });
  }
}
