# dsh-usage-stats

[English](README.md) | [中文](README.zh-CN.md)

[DSH Web GUI](https://github.com/deepseek-ai/dsh) 的 Token 用量统计插件：设置页 **用量统计** 以 GitHub 风格热力图展示模型 Token 消耗，并附带当日 24 小时 Token 柱状图、按模型拆分统计与全历史汇总。

以外部 bundle 补丁方式工作，无需改动 DSH 源码。

## 功能特性

- **用量热力图** — GitHub 贡献风格日历；每格代表一天，颜色深浅 = 计费 Token 数。以单行换行布局覆盖最近六个月，适配设置面板宽度，无需横向滚动。
- **24 小时 Token 图** — 当前本地日按小时统计用量（每小时一根柱）。
- **按模型拆分** — 按 provider/model 堆叠柱状图与合计，并支持筛选视图。
- **时间范围筛选** — 7 / 30 / 90 / 365 天 / 全部。
- **模型筛选** — 将全部图表与合计限定到某个 provider/model。
- **浅色与深色主题** — 使用 DSH 别名主题变量（`--dsw-alias-*`）样式化。

## 工作原理

两个半区，由 `cordis.patch.yml` 合并为一行 bundle（`usage-stats`）：

| 半区 | 文件 | 运行位置 | 作用 |
| --- | --- | --- | --- |
| Host | `lib/index.js` | DSH 宿主进程 | 汇总每个会话持久日志中的 `assistant/message` 用量事件，维护持久化语料库，提供只读 `/api/dsh-usage-stats/stats` |
| Client | `lib/client.js` | 浏览器（dsh web GUI） | 在 `settings.section` 下注册「用量统计」设置区块，并从宿主路由渲染图表 |

### 性能模型

- 语料库聚合为**按会话的贡献**，保存在内存中**并**持久化到 `<DSH_HOME>/storages/usage-stats-corpus.json`，服务器重启无需冷全量扫描。
- 刷新是**增量**的：以每个会话持久日志的廉价指纹（文件大小 + mtime）判断哪些会话真正变化；只重读变化/新增的会话（`sessionQuery.readSession()`），并在毫秒级内在内存中折叠合计。
- **后台定时任务（30 秒）** 保持语料库温热，且桶以服务器本地时区为种子，打开 GUI 后的首次请求由热内存直接服务，而非阻塞在多秒扫描上。
- 请求等待刷新的时间从不超过 **1500 ms**：若冷扫描仍在进行，则返回当前快照并标记 `stale: true`，UI 稍后可再次刷新。

日/周/小时桶跟随浏览器 UTC 偏移（`tz` 查询参数，单位为分钟，`UTC - local`），因此热力图的天与你的日历一致。

## 安装

包声明了 `dsh.bundle.patch`（`cordis.patch.yml`），因此以永久 bundle 层方式安装：

```sh
dsh plugin add link:/path/to/dsh-usage-stats
```

或者通过 profile 的 `node_modules` 以 npm 风格链接：

```sh
npm install /path/to/dsh-usage-stats
```

然后打开 DSH Web GUI → 设置 → **用量统计**。

## HTTP API

`GET /api/dsh-usage-stats/stats`（只读；由回环信任围栏保护——仅响应来自 `localhost`/`127.0.0.1` 的请求）。

查询参数：

| 参数 | 含义 |
| --- | --- |
| `days` | 桶窗口天数；`0`（默认）表示全部历史。上限 3650。 |
| `tz` | 浏览器 UTC 偏移（分钟，`UTC - local`，例如 UTC+8 为 `-480`），作为日/周/小时桶的种子。 |
| `model` | 可选的 `provider/model` 键，筛选到单一模型。 |
| `fresh` | `1` 强制在应答前进行增量重扫。 |

响应结构（节选）：

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
  "byHour":  [{ "hour": 14, "billed": ... }],            // 仅当前本地日，24 条
  "byHourModels": [{ "hour": 14, "key": "deepseek/deepseek-chat", "billed": ... }],
  "byModel": [{ "key": "deepseek/deepseek-chat", "provider": "deepseek", "model": "deepseek-chat", "billed": ..., "lastTime": ... }],
  "syncedAt": 1738022400000,
  "stale": false,
  "scanMs": 12
}
```

`billed` = `inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`。

## 测试

```sh
node usage-stats-host-test.mjs
```

封闭式宿主测试：将 `foldResponse()` 与独立的暴力聚合交叉校验，并在隔离的 `DSH_HOME` 下演练 `syncCorpus()` 的增量行为（首次扫描、无变化 no-op、单次追加、会话删除、时区重新分桶、持久化/重载往返）。

## 文件

```
cordis.patch.yml      # bundle 补丁：插入 usage-stats 插件行
package.json          # 双面包（导出 "." + "./client"）
lib/index.js          # 宿主半区：聚合 + API
lib/client.js         # 浏览器半区：用量统计设置页
usage-stats-host-test.mjs  # 封闭式宿主测试
```

## 许可

[Apache-2.0](LICENSE)
