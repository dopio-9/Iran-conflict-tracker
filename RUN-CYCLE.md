# Inbox session — runbook

The scheduled Claude Code session (owner's plan, hourly) does two jobs the
collector cannot: **translate** and **search**. Each firing writes `collector/data/inbox/` on
branch `claude/inbox`, then dispatches the collector. Each firing does nothing else: no
analysis, no changes to sources, no summaries. (Claude Code has full repo access;
this runbook is just the hourly job.)

## Each firing

```bash
cd <repo>
git fetch -q origin main claude/inbox 2>/dev/null || git fetch -q origin main
git checkout -q -B claude/inbox origin/main
git checkout -q origin/claude/inbox -- collector/data/inbox 2>/dev/null || true   # keep earlier inbox files
```

### 1. Translate (up to 3 batches of 40)

```bash
node collector/scripts/inbox.mjs --pending --max 40 > /tmp/pending.json
```
Read `/tmp/pending.json` (array of `{id, text}`). Write `/tmp/reply.json`: a JSON
array of English strings, **one per input, same order**. Translate only — do not
summarise, shorten, merge, explain, or add context. Keep names, numbers, places.
```bash
node collector/scripts/inbox.mjs --apply /tmp/pending.json /tmp/reply.json
```
A rejected batch (wrong count, empty entry) changes nothing — fix the reply and
re-apply, or move on. Repeat while `--pending` returns lines (max 3 batches).

### 2. Search (this run's queries)

```bash
node collector/scripts/inbox.mjs --queries
```
For each query, search for news from the **last 12 hours** (Exa `web_search_exa`
if available, else WebSearch). Record every result, verbatim, in `/tmp/batch.json`:
```json
[{"title": "<exact title as returned>", "url": "https://…", "outlet": "<publisher or domain>",
  "published": "<ISO date if the tool gave one, else null>", "query": "<query>", "engine": "exa|websearch"}]
```
Do not rewrite titles, do not filter by credibility, do not drop results you
think are minor. Undated results are recorded with `published: null` (the
collector counts and drops them as undated).
```bash
node collector/scripts/inbox.mjs --add-search /tmp/batch.json
```

### 3. Save and trigger

```bash
git add collector/data/inbox && git commit -q -m "inbox: $(TZ=Asia/Dubai date '+%d %b %H:%M GST')" || true
git push -q --force-with-lease origin claude/inbox
```
Then dispatch workflow `collector.yml` on `main` (GitHub MCP
`actions_run_trigger`, method `run_workflow`).

### 4. Report

One line: `translated N · search +M (rejected R) · collector dispatched`.
If any step failed, say which and why. Nothing else.
