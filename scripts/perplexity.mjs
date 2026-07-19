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

/* ── CLI ───────────────────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === "--selftest") selftest();
  else if (!arg) {
    console.error('usage: node scripts/perplexity.mjs "<query>"   |   --selftest');
    process.exit(2);
  } else {
    queryPerplexity(arg)
      .then((r) => console.log(JSON.stringify(decompose(r, { query: arg }), null, 2)))
      .catch((e) => { console.error(String(e.message).replace(/pplx-[A-Za-z0-9]+/g, "pplx-REDACTED")); process.exit(1); });
  }
}
