# dsh-usage-stats

[English](README.md) | [中文](README.zh-CN.md)

Token usage statistics for the [DSH web GUI](https://github.com/deepseek-ai/dsh): a settings page **用量统计** that shows your model-token consumption as a GitHub-style heatmap, a 24-hour (today) token bar chart, a per-model breakdown, and whole-history totals — plus an **opencode-go usage panel** at the bottom that shows the local opencode (Go CLI / desktop) subscription usage: the official OpenCode Go quota when the login is a Go subscription, the local database otherwise.

Works as an external bundle patch — no DSH source changes required.

## Features

- **Usage heatmap** — GitHub-contribution-style calendar; one cell per day, colour intensity = billed tokens. Rendered as a single wrapped row covering the last six months, so it fits the settings pane width without horizontal scrolling.
- **24-hour token chart** — usage by hour of the current local day (one bar per hour).
- **Per-model breakdown** — stacked bars per provider/model with totals, plus a filtered view.
- **Time-range filter** — 7 / 30 / 90 / 365 days / all.
- **Model filter** — restrict every chart and total to a single provider/model.
- **opencode-go usage panel** — a standalone section at the bottom of the page: detects which subscription the local opencode login holds (`opencode-go` = OpenCode Go, `opencode` = OpenCode Zen) and renders accordingly. For **Go** it shows the official subscription quota (via `opencode.ai/zen/go/v1/usage`, reusing the local login) as **three progress-bar cards in the opencode.ai website style** (percent used, bar, $ spent / window limit, reset countdown; two-row layout — the first two cards in one row, the monthly card spanning the second row). For **Zen** (pay-as-you-go) the same official endpoint is tried first, rendering progress-bar cards when it answers; when the endpoint rejects the key (401/403/404) the three rolling windows fall back to the local opencode database (`opencode.db` `session` table), aggregated read-only, as numeric cards. The local database is always available as the hover comparison; with no login the whole section stays hidden.
- **Light & dark themes** — styled with the DSH alias theme tokens (`--dsw-alias-*`).

## How it works

Two halves, joined into one bundle row (`usage-stats`) by `cordis.patch.yml`:

| Half | File | Runs in | What it does |
| --- | --- | --- | --- |
| Host | `lib/index.js` | DSH host process | Aggregates `assistant/message` usage events from every session's durable log, keeps a persisted corpus, serves read-only `/api/dsh-usage-stats/stats`, `/api/dsh-usage-stats/opencode` and `/api/dsh-usage-stats/opencode-go` |
| Client | `lib/client.js` | Browser (dsh web GUI) | Registers the 用量统计 settings section under `settings.section` and renders the charts plus the opencode-go panel from the host routes |

### Performance model

- The corpus is aggregated into **per-session contributions** kept in memory **and** persisted to `<DSH_HOME>/storages/usage-stats-corpus.json`, so a server restart does not force a cold full scan.
- Refresh is **incremental**: a cheap fingerprint (file size + mtime) of each session's persisted log decides which sessions actually changed; only changed/new sessions are re-read (`sessionQuery.readSession()`), and totals are folded in memory in milliseconds.
- A **background interval (30 s)** keeps the corpus warm, and the server-local timezone seeds the buckets, so the first request after opening the GUI is served from warm memory instead of blocking on a multi-second scan.
- A request never waits more than **1500 ms** on a refresh: if a cold scan is still running it is served the current snapshot with `stale: true`, and the UI can refresh once more shortly after.

Day/week/hour buckets follow the browser's UTC offset (the `tz` query parameter, in minutes as `UTC - local`), so the heatmap days match your calendar.

## Install

The package declares `dsh.bundle.patch` (`cordis.patch.yml`), so it installs as a permanent bundle layer:

```sh
dsh plugin add link:/path/to/dsh-usage-stats
```

Or with npm-style linkage from the profile's `node_modules`:

```sh
npm install /path/to/dsh-usage-stats
```

Then open the DSH web GUI → Settings → **用量统计**.

## Uninstall

```sh
dsh plugin remove dsh-usage-stats
```

Or with npm:

```sh
npm uninstall dsh-usage-stats
```

`dsh plugin remove` also drops the plugin row from the profile's `dsh.profile.bundles` layer stack automatically. If you uninstall with npm directly, remove any leftover `dsh-usage-stats` entry from the `dsh.profile.bundles` list in the profile's `package.json`. Restart the DSH web GUI afterwards for the change to take effect.

## HTTP API

`GET /api/dsh-usage-stats/stats` (read-only; guarded by a loopback trust fence — only requests from `localhost`/`127.0.0.1` are answered).

Query parameters:

| Param | Meaning |
| --- | --- |
| `days` | Bucket window in days; `0` (default) means all history. Clamped to 3650. |
| `tz` | Browser UTC offset in minutes (`UTC - local`, e.g. `-480` for UTC+8). Seeds the day/week/hour buckets. |
| `model` | Optional `provider/model` key to filter to a single model. |
| `fresh` | `1` forces an incremental rescan before answering. |

Response shape (excerpt):

```jsonc
{
  "ok": true,
  "days": 365,
  "tz": -480,
  "totals": { "billed": 123456, "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ..., "cacheWriteTokens": ... },
  "messages": 271,
  "sessions": 12,
  "sessionsWithUsage": 9,
  "firstTime": 1735689600000,
  "lastTime": 1738022400000,
  "byDay":   [{ "date": "2025-01-01", "billed": ..., "inputTokens": ... }],
  "byWeek":  [{ "date": "2024-12-30", "billed": ... }],
  "byHour":  [{ "hour": 14, "billed": ... }],            // current local day only, 24 entries
  "byHourModels": [{ "hour": 14, "key": "deepseek/deepseek-chat", "billed": ... }],
  "byModel": [{ "key": "deepseek/deepseek-chat", "provider": "deepseek", "model": "deepseek-chat", "billed": ..., "lastTime": ... }],
  "syncedAt": 1738022400000,
  "stale": false,
  "scanMs": 12
}
```

`billed` = `inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`.

### opencode-go panel

`GET /api/dsh-usage-stats/opencode` (read-only, same loopback fence; `tz` / `fresh` params as above). Opens the local opencode database read-only (probed via `OPENCODE_DATA` → `$XDG_DATA_HOME/opencode` → `~/.local/share/opencode` → `%LOCALAPPDATA%/opencode` → `%APPDATA%/opencode`) and folds the `session` table (`tokens_*`, `cost`, `model`, `time_created`) into the same day/model buckets as the main page. Besides the lifetime totals, it folds **three rolling quota windows** (last 5 hours / 7 days / 30 days, `windows` field) exactly from session timestamps, plus **per-hour buckets** inside the 5-hour window (`h5Hours`, keyed by viewer-local hour start `hourStart`) for the panel's quota cards and hourly strip. The response is cached in memory for 30 s (opencode keeps writing while it runs); `?fresh=1` forces a re-read.

`GET /api/dsh-usage-stats/opencode-go` (official subscription quota, loopback fence; `fresh` param as above). Reads the local opencode auth file (`OPENCODE_AUTH` → `~/.local/share/opencode/auth.json` → `%LOCALAPPDATA%/opencode/auth.json`) and detects the subscription kind by auth entry — `opencode-go` = OpenCode Go, `opencode` (or legacy `zen`) = OpenCode Zen (the key never leaves the host process):

- **Go** — proxies the official usage endpoint `https://opencode.ai/zen/go/v1/usage` and returns the three rolling windows exactly like the opencode.ai website (`rolling` 5 hours / `weekly` / `monthly`), each with `percent` used, `resetsAt` reset time and `limit` (official USD window limits: $12 / $30 / $60).
- **Zen** — pay-as-you-go; the same official endpoint is tried first (`https://opencode.ai/zen/go/v1/usage` — the `zen/` segment is URL namespacing; the key is accepted server-side). When the endpoint answers, it returns progress-window percentages (same response shape as Go, but no fixed dollar caps — `limit` is null). When the endpoint rejects the key (HTTP 401/403/404) the code falls back to local-only mode: `available:true, official:false, subscription:"zen", reason:"no-official-usage-api"` and the panel renders the local-database numeric cards.
- Not logged in → `available:false, reason:"no-key"`; endpoint or network failure → `ok:false` + `error` (with `reason:"http-<status>"` / `"network"`).

Cached in memory for 60 s; `?fresh=1` forces a refresh.

```jsonc
// GET /api/dsh-usage-stats/opencode-go
{
  "ok": true,
  "available": true,            // false = not logged in / network error, see reason
  "official": true,             // false = Zen fallback (no official usage API)
  "subscription": "go",         // "go" = OpenCode Go, "zen" = OpenCode Zen
  "source": "opencode.ai/zen/go/v1/usage",
  "windows": {                  // same three windows as the opencode.ai website
    "rolling": { "title": "5小时用量", "percent": 1, "resetsAt": "2026-08-20T05:54:32.242Z",
                 "status": "ok", "limit": 12 },
    "weekly":  { "title": "周用量", "percent": 40, "resetsAt": "2026-08-24T00:00:00.242Z",
                 "status": "ok", "limit": 30 },
    "monthly": { "title": "月用量", "percent": 20, "resetsAt": "2026-09-15T23:48:34.242Z",
                 "status": "ok", "limit": 60 }
  },
  "syncedAt": 1787194800000, "scanMs": 320
}
```

Panel behaviour: the panel renders **only when an opencode subscription is detected** — Go: the official quota endpoint answers; Zen: the same endpoint answers or the key is rejected (401/403/404 falls back to local-only mode) — with no login / endpoint failure the whole section is not rendered. For **Go**, the quota-window section renders three progress-bar cards in the opencode.ai website style (large percent, rounded progress bar, $ spent / window limit, reset countdown; bar colour grades with usage: green <70%, orange 70–90%, red ≥90%; two-row layout — first two cards in one row, the monthly card spanning the full second row). For **Zen**, the same official endpoint is tried first — when it answers, the panel renders the same progress-bar cards (percent + bar + reset countdown, with "按量计费" placeholder instead of dollar limits); when the endpoint rejects the key, the three windows come from the local opencode database as numeric cards. Hover always shows window details plus the local-database rolling-window comparison (the local DB only backs the comparison, it never decides whether the panel shows).

```jsonc
{
  "ok": true,
  "available": true,            // false = no opencode.db found on this machine
  "dbPath": "C:\\Users\\me\\.local\\share\\opencode\\opencode.db",
  "totals": { "sessions": 36, "messages": 2690, "cost": 0, "billed": 210819937,
              "inputTokens": ..., "outputTokens": ..., "reasoningTokens": ...,
              "cacheReadTokens": ..., "cacheWriteTokens": ...,
              "additions": ..., "deletions": ..., "files": ... },
  "windows": {                  // rolling quota windows (exact from timestamps)
    "h5":    { "sessions": 4, "cost": 0.0012, "billed": 812034, "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ... },
    "week":  { "sessions": 23, "cost": 0.0112, "billed": 4321098, "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ... },
    "month": { "sessions": 61, "cost": 0.0234, "billed": 9876543, "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ... }
  },
  "h5Hours": [{ "hourStart": 1787191200000, "hour": 10, "sessions": 2, "cost": 0.0008,
                "billed": 400123, "inputTokens": ..., "outputTokens": ..., "cacheReadTokens": ... }],
  "firstTime": 1735689600000, "lastTime": 1738022400000,
  "byDay":   [{ "date": "2026-07-09", "sessions": 2, "billed": ..., "inputTokens": ... }],
  "byModel": [{ "key": "opencode/deepseek-v4-flash-free", "id": "deepseek-v4-flash-free",
                "provider": "opencode", "variant": "max", "sessions": 30, "billed": ... }],
  "recent":  [{ "id": "ses_...", "title": "...", "model": "...", "provider": "...",
                "billed": ..., "cost": ..., "timeCreated": 1786804839480 }],
  "syncedAt": 1738022400000, "scanMs": 12
}
```

## Tests

```sh
node usage-stats-host-test.mjs
```

Hermetic host test that cross-checks `foldResponse()` against an independent brute-force aggregation and exercises `syncCorpus()` incremental behaviour (first scan, no-change no-op, single append, session deletion, timezone re-bucket, persist/reload round trip) under an isolated `DSH_HOME`; part three verifies `collectOpencodeStats()` folding (totals / byDay / byModel / recent / 5-hour-week-month rolling windows / 5-hour per-hour buckets) against a scratch SQLite database and `findOpencodeDb()` probing of `OPENCODE_DATA`.

## Files

```
cordis.patch.yml      # bundle patch: inserts the usage-stats plugin row
package.json          # dual-face package (exports "." + "./client")
lib/index.js          # host half: aggregation + API
lib/client.js         # browser half: 用量统计 settings page
usage-stats-host-test.mjs  # hermetic host tests
```

## License

[Apache-2.0](LICENSE)
