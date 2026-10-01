# dsh-usage-stats

[English](README.md) | [中文](README.zh-CN.md)

A token usage and quota dashboard for [DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness). Open **Settings → 用量统计** to view usage history, connected account quotas, and query controls.

The plugin loads through an external bundle patch without DSH source changes. It supports the desktop profile and Electron main window.

## Screenshots

### Usage · 用量

Today's tokens, active days, lifetime tokens, hourly tokens/calls, and a daily or weekly heatmap.

![Usage overview, hourly chart and heatmap](screenshots/usage.png)

### Quotas · 配额

Provider balances, subscription windows, and optional WorkBuddy credits. Visible cards depend on your configured providers and successful queries.

![Provider balances and WorkBuddy credits](screenshots/quotas.png)

### Controls · 控制

Automatic quota refresh, interval, model details, advanced model selector, and custom queries.

![Refresh controls and custom quota queries](screenshots/controls.png)

## Features

- Daily/weekly heatmap with paging; today's 24-hour token chart and call-count line.
- Model distribution and details; historical filters for 7 / 30 / 365 days or all history. Overview cards retain their day/lifetime meanings.
- Compact token totals with exact values in tooltips and integer call counts. Statistics follow the desktop system timezone.
- Built-in quota readers for Claude, DeepSeek, StepFun, Codex, Copilot, OpenRouter, Moonshot, Kimi Coding, MiniMax, Z.AI / GLM Coding, Alibaba Cloud Token Plan China, xAI, and OpenCode Go. Availability depends on credentials, permissions and upstream APIs.
- Separate WorkBuddy / WorkBuddy AI panels when the optional `dsh-workbuddy-connect` adapter is enabled. Other features do not require it.
- Custom JSON quota queries: select a configured provider, edit, test, then confirm. Confirmed queries override the provider's built-in reader; removal restores it.
- Optional model/reasoning popup with an effort slider. Turning it off restores DSH's official selector immediately.
- DSH light/dark themes, responsive charts, keyboard-operable provider picker, and pinned tabs.

Automatic quota refresh and the advanced selector are **off by default**; model details are **on by default**. Intervals are 10 minutes, 1 hour (default), 5 hours, or daily. Automatic refresh requires acknowledging possible query costs and continues while settings are closed. Normal quota-page reads use cached data; refresh buttons request new data.

## Install

You need DSH Desktop and Node.js for the build commands. Development is verified with Node.js 24. SQLite fingerprints require `node:sqlite` in the host runtime; otherwise sessions are reread.

```sh
git clone https://github.com/Jockjrop/dsh-usage-stats.git
cd dsh-usage-stats
npm ci
npm run build
npm test
```

Install the package into the **desktop** profile. The current DSH CLI reserves that profile for Electron, so `dsh plugin --profile desktop` cannot manage it.

Manual installation on Windows:

1. Fully exit DSH Desktop. Keep the clone in a permanent location.
2. Back up `<DSH_HOME>/profiles/desktop/package.json`. Add `dsh-usage-stats` to its existing dependencies as `link:<absolute-clone-directory>`, and append `dsh-usage-stats` to its existing `dsh.profile.bundles` array. Preserve other entries; use forward slashes in the link.
3. Run `pnpm install` in that desktop profile directory.
4. Start DSH Desktop and open **Settings → 用量统计**.

This fragment shows the two entries to merge. Replace the link placeholder with your clone path; do not overwrite the existing profile:

```json
{
  "dependencies": {
    "dsh-usage-stats": "link:<absolute-clone-directory>"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-usage-stats"]
    }
  }
}
```

`DSH_HOME` is DSH's data directory; when unset, the plugin uses `.dsh` under the current user's home. The clone can live anywhere and has no machine-specific absolute paths.

To update, pull this repository, run `npm ci`, `npm run build` and `npm test`, then restart DSH Desktop. To uninstall, exit the app, remove only this dependency and bundle entry, run `pnpm install` in the desktop profile, and restart.

## Quota queries

A configured balance may show **未查询** before its first query. Missing permissions, expired logins, unavailable endpoints or invalid responses can hide a card or mark it unavailable. Panels report API data; token totals are not converted into estimated account charges.

Open **控制 → 配额查询**, select a provider, edit the template, **test**, then **confirm**. Changes invalidate the test; successful tests expire after 15 minutes.

Example for an API returning `{ "data": { "balance": 12.34 } }`:

```json
{
  "url": "https://api.example.com/balance",
  "method": "GET",
  "auth": "provider",
  "headers": { "accept": "application/json" },
  "response": {
    "metrics": [
      { "label": "Account balance", "kind": "amount", "remaining": "data.balance", "currency": "USD" }
    ]
  }
}
```

Replace the example URL with a working endpoint. Templates support GET/POST, JSON bodies, amount/window metrics, and paths such as `data.items[0].balance`. Windows accept `remainingPercent`, `usedPercent`, or `total` with `remaining` / `used`; `response.rows` selects an array. Use `auth: "none"` for unauthenticated endpoints. A prefilled `/balance` is an editable example for an unknown gateway.

Optional host credential references:

| Reader | Credentials |
| --- | --- |
| OpenRouter account credits | `OPENROUTER_MANAGEMENT_API_KEY` |
| xAI prepaid balance | `XAI_MANAGEMENT_API_KEY`, `XAI_TEAM_ID` |
| Alibaba Cloud Token Plan China | `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`; optional `ALIBABA_CLOUD_SECURITY_TOKEN` |

Other readers use the corresponding DSH provider credential or supported existing OAuth grant. Claude, Codex and Copilot do not refresh or modify logins. OpenCode Go uses only its own configured DSH credential; Zen has no built-in wallet reader but accepts custom queries. Alibaba Cloud's international Token Plan is not queried.

## Privacy and local storage

- Usage is aggregated on the host. The corpus stores counts, model identifiers and compact usage timestamps, without conversation text.
- Credentials are resolved on the host and used for the relevant quota endpoint. API keys, OAuth tokens and raw upstream responses are not returned to the renderer.
- Authenticated custom queries must match the provider's configured origin or official quota origin. Templates reject credential-bearing URL parameters, authentication headers and common credential fields in bodies. Requests do not follow redirects; custom HTTP queries have an 8-second timeout and a 1 MB response limit.
- Local APIs check socket address, Host, Origin and cross-site requests. Responses use `Cache-Control: no-store`; unexpected host exceptions return generic errors.
- WorkBuddy adapters use the active host port and retain quota display fields.
- No analytics or telemetry endpoint is included. Quota tests, manual refreshes and automatic refreshes after opt-in access the relevant quota services.

| File under `<DSH_HOME>/storages/` | Contents |
| --- | --- |
| `usage-stats-corpus.json` | Per-session usage contributions |
| `usage-stats-controls.json` | Controls, custom templates and quota snapshots |

These files contain private usage/account information, with paths resolved at runtime. Runtime data, environment files, credentials, databases, logs, backups and previews are excluded from Git. The npm package uses an explicit file allowlist. Supplied showcase screenshots contain the figures displayed at capture time.

The loopback API assumes a trusted local host; another process under your account can access local data.

## Development

Edit **`src/`**. `npm run build` synchronizes modules to `lib/` and root compatibility copies; package exports load `lib/`.

```text
src/                  canonical host, client, quota readers and controls
lib/                  generated package entry points
test/                 isolated behavior, privacy and consistency tests
test/fixtures/        portable DSH theme alias contract
scripts/              build and synthetic heatmap checks
screenshots/          usage, quotas and controls showcase
cordis.patch.yml       desktop-only bundle registration
```

Tests use synthetic data and temporary DSH homes, with no live credentials, paid calls or installed DSH instance. The theme test uses the checked-in contract; set `DSH_THEME_CLIENT` to validate an installed theme client file.

```sh
node scripts/render-heatmap-check.mjs
node scripts/check-heat-tip-placement.mjs
npm run preview:heatmap
npm pack --dry-run
```

The preview writes an ignored `preview-heatmap.html`. Consistency tests ensure source, package and compatibility copies match.

`platform: "web"` is DSH Desktop's renderer transport. Both plugin halves require the desktop profile; the client also requires the native `dshDesktop.deviceInfo` bridge. Ordinary web/browser profiles do not start this plugin.

## Local API

Routes use the `/api/dsh-usage-stats/` prefix and loopback trust checks.

| Route | Method | Purpose |
| --- | --- | --- |
| `stats` | GET | Usage; `days`, `tz`, `model`, optional `fresh=1` |
| `provider-quotas` | GET | Cached quotas; `fresh=1` refreshes |
| `workbuddy`, `workbuddy-ai` | GET | Optional adapter caches; support `fresh=1` |
| `controls` | GET / POST | Read/update controls; writes require JSON |
| `quota-providers` | GET | Configured providers and credential-free templates |
| `quota-test` | POST | Test a template and return an expiring confirmation ID |

`stats.billed` is input + output + cache-read + cache-write tokens. The corpus refreshes every 30 seconds; requests wait up to 1500 ms and can return `stale: true` / `partial: true`. Timezone changes re-bucket stored events; old retained hourly aggregates may be approximate at fractional-hour boundaries.

## License

[Apache-2.0](LICENSE)
