# HORMUZ·LIVE

A personal Iran-conflict early-warning tracker for one UAE household.
Live at the Vercel project `iran-conflict-tracker-nextgen` (deploys from `main`).

- **RAW** — the top of the page. Machine-collected, unvetted. STORIES (repeats of one
  story grouped; the line is the earliest source's own words) with every raw item
  under a show button, plus a trackers strip (military aircraft, nav warnings, outages).
  Written to `data/feed.json` by an hourly GitHub Actions collector; translated and
  searched by a scheduled Claude session (`INBOX.md`); graded 24h later as
  *echoed ×N* or *alone*.
- **Analysis** — the rest of the page, from the JSON block inside `index.html`.

Operating rules, current state and open work: **`CLAUDE.md`**.

```sh
node scripts/validate.mjs                  # ship gate — run before every commit
node scripts/feed.mjs --selftest           # every script has --selftest
python3 -m http.server 8080                # then open http://localhost:8080/
```

No dependencies. Node 22+. The collector needs open internet, so it runs in
GitHub Actions (`.github/workflows/social-fetch.yml`), not the cloud sandbox.
Retired material is in `archive/`.
