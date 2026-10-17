# Design Lab — exploration archive (NOT wired into the live tracker)

These are visual/motion concept explorations for the Iran Conflict Tracker.
They are **standalone** files, deliberately kept out of `/index.html` and the
live build. The production tracker's design is unchanged. Pick any of these up
later as a starting point for a full build.

## Structural concepts (real Day 135 data, phone-first)
| File | Concept — "what kind of object is the tracker?" |
|---|---|
| `comp-a-admiralty.html` | **Admiralty Plot** — the strait as a nautical chart; events plotted in place |
| `comp-b-extra.html` | **The Gulf Extra** — a wartime broadsheet extra edition |
| `comp-c-opswall.html` | **Ops Wall** — a glanceable instrument panel (lamps, valves, relays, CRT) |
| `comp-d-seismic.html` | **Seismic Ledger** — one time-spine; forecast cone occupies the future above NOW |

## Avant-garde concepts
| File | Concept |
|---|---|
| `x1-redacted.html` | **The Redacted File** — verification tiers ARE the black bars; bars lift as claims verify |
| `x2-thermogram.html` | **Thermogram** — no UI; the war as a pure heat field, read pre-attentively |
| `x3-illuminated.html` | **Illuminated Chronicle** — the war recorded as a Persian court manuscript folio |
| `x4-orbital.html` | **Orbital Nocturne** — night pass from orbit; the UAE lens expressed as light (full grid vs dark grid) |

## Motion / video
| File | What it is |
|---|---|
| `film-day135.html` | **The Daily Title Sequence** — a 28s, five-act, self-playing title film of the day |
| `film-artifact.html` | Same, wrapped for publishing (scale-to-fit, tap-to-replay) |
| `MOTION.md` | **The motion grammar** — the spec that lets any model regenerate a new daily film from `data.json`. Read this first if resuming the video work. |

## To resume
- Static concepts: open any `.html` directly in a browser.
- Video: `MOTION.md` is the authoritative spec; `film-day135.html` is the reference
  implementation. Regeneration checklist is at the bottom of `MOTION.md`.
