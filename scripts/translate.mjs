#!/usr/bin/env node
/**
 * translate — decides which lines need English. The translating itself is done
 * by the scheduled Claude session (owner decision 14 Oct 2026: use Claude on the
 * owner's plan, not a paid API) under the count-checked contract in inbox.mjs.
 * The collector never waits for it: untranslated items publish in their own
 * language and gain English on a later run.
 */

const NON_LATIN = /[Ѐ-ӿ֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿぀-ヿ一-鿿가-힯]/;

/** True when a line needs translating for an English reader. Latin-script
 *  non-English (Turkish, French…) is decided by the source's declared language. */
export function needsTranslation(text, lang = "") {
  if (NON_LATIN.test(String(text))) return true;
  const l = String(lang).toLowerCase();
  return !!l && l !== "?" && !/english|^en\b/.test(l) && !/\/\s*english|english\s*\//.test(l);
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
  console.log(`\nselftest ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) selftest();
