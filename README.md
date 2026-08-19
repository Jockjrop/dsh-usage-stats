# dsh-usage-stats

[English](README.md) | [中文](README.zh-CN.md)

Token usage statistics for the [DSH web GUI](https://github.com/deepseek-ai/dsh): a settings page **用量统计** that shows your model-token consumption as a GitHub-style heatmap, a 24-hour (today) token bar chart, a per-model breakdown, and whole-history totals.

Works as an external bundle patch — no DSH source changes required.

## Features

- **Usage heatmap** — GitHub-contribution-style calendar; one cell per day, colour intensity = billed tokens. Rendered as a single wrapped row covering the last six months, so it fits the settings pane width without horizontal scrolling.
- **24-hour token chart** — usage by hour of the current local day (one bar per hour).
- **Per-model breakdown** — stacked bars per provider/model with totals, plus a filtered view.
- **Time-range filter** — 7 / 30 / 90 / 365 days / all.
- **Model filter** — restrict every chart and total to a single provider/model.
- **Light & dark themes** — styled with the DSH alias theme tokens (`--dsw-alias-*`).

## How it works

Two halves, joined into one bundle row (`usage-stats`) by `cordis.patch.yml`:

| Half | File | Runs in | What it does |
| --- | --- | --- | --- |
| Host | `lib/index.js` | DSH host process | Aggregates `assistant/message` usage events from every session's durable log, keeps a persisted corpus, serves read-only `/api/dsh-usage-stats/stats` |
| Client | `lib/client.js` | Browser (dsh web GUI) | Registers the 用量统计 settings section under `settings.section` and renders the charts from the host route |

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

## Tests

```sh
node usage-stats-host-test.mjs
```

Hermetic host test that cross-checks `foldResponse()` against an independent brute-force aggregation and exercises `syncCorpus()` incremental behaviour (first scan, no-change no-op, single append, session deletion, timezone re-bucket, persist/reload round trip) under an isolated `DSH_HOME`.

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
