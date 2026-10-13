#!/usr/bin/env node
/**
 * translate — the ONLY model step in the raw lane, and it is not allowed to edit.
 *
 * The raw feed exists because every earlier pipeline let a model sit between the
 * source and the page, and models summarise toward consensus. So this step has a
 * contract it cannot break:
 *   - it translates; it never selects, ranks, merges, shortens or comments;
 *   - it must return exactly as many lines as it was given, in order;
 *   - on ANY failure (no key, HTTP error, wrong count, unparseable reply) the
 *     original text is kept and the item still publishes, marked untranslated.
 * An item can therefore never be lost here — at worst it shows in its own language.
 *
 * Engine: Perplexity (PERPLEXITY_API_KEY, already a repo secret). Search is
 * disabled where the API allows it; if the API rejects that flag we retry without.
 */

const API = "https://api.perplexity.ai/chat/completions";
const BATCH = 30;
const NON_LATIN = /[Ѐ-ӿ֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿぀-ヿ一-鿿가-힯]/;

/** True when a line needs translating for an English reader. Latin-script
 *  non-English (Turkish, French…) is decided by the source's declared language. */
export function needsTranslation(text, lang = "") {
  if (NON_LATIN.test(String(text))) return true;
  const l = String(lang).toLowerCase();
  return !!l && l !== "?" && !/english|^en\b/.test(l) && !/\/\s*english|english\s*\//.test(l);
}

const SYSTEM = "You are a translation engine. Translate each input line into plain English. " +
  "Rules: translate only — do not summarise, shorten, explain, add context, or search. " +
  "Keep names, numbers and places exactly. Return ONLY a JSON array of strings with exactly " +
  "the same number of elements as the input, in the same order.";

async function callOnce(lines, key, disableSearch) {
  const body = {
    model: "sonar",
    temperature: 0,
    max_tokens: 4000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(lines) },
    ],
  };
  if (disableSearch) body.disable_search = true;
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await res.text();
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; e.body = txt.slice(0, 200); throw e; }
  const content = JSON.parse(txt)?.choices?.[0]?.message?.content || "";
  const m = content.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("reply had no JSON array");
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr) || arr.length !== lines.length) throw new Error(`count mismatch ${arr?.length}≠${lines.length}`);
  return arr.map(x => String(x ?? "").trim());
}

/** Translate lines. Returns { out, status } — out[i] is the translation or null
 *  (null = keep the original). Never throws. */
export async function translateLines(lines) {
  const out = new Array(lines.length).fill(null);
  const key = process.env.PERPLEXITY_API_KEY;
  if (!lines.length) return { out, status: "nothing to translate" };
  if (!key) return { out, status: "skipped: PERPLEXITY_API_KEY not set — lines kept in original language" };
  let done = 0, failed = 0, lastErr = "", disable = true;
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    try {
      let r;
      try { r = await callOnce(chunk, key, disable); }
      catch (e) {
        if (disable && e.status === 400) { disable = false; r = await callOnce(chunk, key, false); }
        else throw e;
      }
      r.forEach((t, k) => { if (t) { out[i + k] = t; done++; } });
    } catch (e) { failed += chunk.length; lastErr = (e.message + (e.body ? " " + e.body : "")).slice(0, 120); }
  }
  const status = failed ? `partial: ${done} translated, ${failed} kept original (${lastErr})` : `ok: ${done} translated`;
  return { out, status };
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (n, c) => { c ? (pass++, console.log("✔ " + n)) : (fail++, console.log("✘ " + n)); };
  ok("Farsi needs translation", needsTranslation("حمله موشکی به بندرعباس"));
  ok("Hebrew needs translation", needsTranslation("תקיפה איראנית במיצר הורמוז"));
  ok("Russian needs translation", needsTranslation("Удар по танкеру в Ормузском проливе"));
  ok("English does not", !needsTranslation("Tanker struck near Hormuz", "English"));
  ok("Turkish (Latin) by declared language", needsTranslation("Hürmüz Boğazı'nda tanker vuruldu", "Turkish"));
  ok("mixed 'Arabic/English' Latin line does not", !needsTranslation("Houthis claim strike", "Arabic/English"));
  const saved = process.env.PERPLEXITY_API_KEY; delete process.env.PERPLEXITY_API_KEY;
  translateLines(["حمله", "תקיפה"]).then(r => {
    ok("no key → nothing lost, all null (originals kept)", r.out.length === 2 && r.out.every(x => x === null));
    ok("no key → status says so", /skipped/.test(r.status));
    if (saved) process.env.PERPLEXITY_API_KEY = saved;
    console.log(`\nselftest ${pass}/${pass + fail} passed`);
    process.exit(fail ? 1 : 0);
  });
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) selftest();
