# MOTION.md — The Daily Title Sequence Grammar
### Authored by Fable 5 · reference implementation: `film-day135.html`
### Purpose: any capable model (Opus in the daily loop) regenerates a new instance
### from `data.json` by following this grammar. The grammar is fixed; only the
### day's content changes. Do not invent new motion — recast the day into this form.

---

## The format

A **28-second, vertical (430×900), self-playing, looping film** — the tracker's day
rendered as an opening title sequence. It must read **muted, on a phone, in one watch**.
All timestamps in **GST (UTC+4)**. Zero external assets; system font stacks only
(`ui-monospace…`, `system-ui…`, `Georgia…`).

## The five-act structure (fixed)

| Act | Window | Name | Job | Content source |
|---|---|---|---|---|
| 0 | 0–2.2s | **LEADER** | Set the cinematic register: film-leader countdown, grain, flicker | static |
| 1 | 2.2–7s | **THE PLACE** | The strait draws itself in light; sonar ping; lower-third: place + day number | `meta.day` |
| 2 | 7–13s | **THE WEEK** | 2–3 beats replay the period's kinetic events: blooms + caption slams with date/GST time | top `wire[]` items, hostile |
| 3 | 13.2–17.2s | **THE TURN** | The single most consequential event slams full-frame (red act) | the day's lead event |
| 4 | 17.2–22s | **THE FUTURES** | Counter-beat (diplomatic pulse, italic serif line), then the forecast panel wipes up from NOW; bars race to the scenario probabilities | `scenarios[]`, diplomatic wire item |
| 5 | 22–27.5s | **THE VERDICT** | Stage clears to near-black; tracked title; day/date in GST; three-line verdict | `meta` + authored verdict |

Loop: fade to black at 27.5s, hard reset at 28.4s, replay. Tap restarts.

## The verdict (the shareable line)

Act 5's three-line verdict is the film's reason to exist. Rules:
- Three short lines, italic serif, each a complete sentence.
- Lines 1–2 state the day's central tension as two facts that both hold.
- Line 3 resolves nothing: it names the coexistence. ("Both are true." / "Only one will hold." / "Neither side blinked.")
- Never a prediction, never sourced language, never a number.

## Motion vocabulary (the only moves allowed)

- **Draw-on**: SVG stroke reveal via `pathLength="1"` + dashoffset 1→0. Reserved for geography.
- **Bloom**: white-hot radial flash + 2 staggered expanding rings, `mix-blend-mode:screen`. Reserved for kinetic events.
- **Slam**: caption enters at scale 1.45 + blur 10px → 1/0 in ~250ms (`cubic-bezier(.2,.9,.25,1)`), holds, exits soft. Reserved for event captions; max 4 per film.
- **RGB-split**: dual text-shadow (warm/cool offset) — reserved for THE TURN's headline only.
- **Shake**: ±6px, 0.5s, once — only at THE TURN's impact.
- **Wipe-from-NOW**: `clip-path: inset(100% 0 0 0 → 0 0 0 0)` — reserved for the forecast panel.
- **Race**: bar fills with cubic ease + JS count-up numerals, staggered 250ms.
- **Track-in**: title letter-spacing .52em → .15em. Reserved for the title card.
- **Push-in**: the whole world scales 1→1.07 across the film. Constant, imperceptible, non-negotiable — it is what makes it feel filmed, not rendered.

## Restraint rules (what makes it cinematic instead of soup)

1. **One thing moves at a time.** A slam never overlaps a bloom's entrance; beats are ≥1.2s apart.
2. **Acts clear the stage.** Every act's elements are faded by the next (`body.pN` classes gate everything). Act 5 clears ALL of acts 2–4 explicitly.
3. **Color is act-scoped.** Cyan = geography, amber = time/dates, red = THE TURN only, green = diplomacy/base case. The red tint enters at act 3 and drains at act 4 — the film's emotional arc IS that tint.
4. **Type does the acting.** No icons, no illustration; captions, numerals and geography carry everything.
5. **Silence is a beat.** Act 1 holds ~2s with nothing but the drawn strait. Do not fill it.
6. **Grain + letterbox always.** 30px bars, animated grain at ≤.5 opacity, vignette. These sell "film" more than any transition.
7. `prefers-reduced-motion`: skip straight to the static title card.

## Engineering rules

- One self-contained HTML file. JS is a **schedule only** (`at(ms, fn)` timeline + reset); all visuals live in CSS keyframes/transitions gated by `body.p1…p5` classes.
- Reset must remove every state class, clear timers, force reflow, then re-run — the loop seam hides under the fade-to-black.
- Scale-to-fit wrapper (`min(vw/430, vh/900)`) for arbitrary viewports.
- Validate: `node --check` the script block; no localStorage; no external requests.

## Daily regeneration checklist (for Opus)

1. Read `data.json`. Pick: 2–3 hostile beats (act 2), the lead event (act 3), the diplomatic counter-beat (act 4), scenario probs (act 4 bars), and author the verdict per the rules above.
2. Update only: captions, timestamps (GST), bloom coordinates if geography changed, bar labels/percentages, title-card date/day, verdict.
3. Never touch: act timings, easings, the motion vocabulary, the color scoping, grain/letterbox.
4. Render 8 keyframes headless; check: no text clipped, no element from a previous act visible in act 5, title fits 430px.
5. Record webm (Playwright `recordVideo`), publish artifact to the same URL.
