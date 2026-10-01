<p align="center">
  <img src="screenshots/icon.svg" alt="dsh-usage-stats" width="80" height="80">
</p>

<h1 align="center">dsh-usage-stats</h1>

<p align="center">
  <strong>在 DSH 里，看清 Token 用量、账户余额与订阅配额。</strong><br>
  为 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness 桌面端</a>打造的本地用量面板。
</p>

<p align="center">
  <a href="#安装"><img src="https://img.shields.io/badge/DSH-Desktop-2563eb?style=flat-square" alt="DSH 桌面端"></a>
  <a href="https://github.com/Jockjrop/dsh-usage-stats/releases/latest"><img src="https://img.shields.io/github/v/release/Jockjrop/dsh-usage-stats?style=flat-square&amp;color=64748b" alt="最新发行版"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-22c55e?style=flat-square" alt="Apache 2.0 许可"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文<br>
  <a href="https://github.com/Jockjrop/dsh-usage-stats/releases/latest">下载</a> ·
  <a href="#功能">功能</a> ·
  <a href="#安装">安装</a> ·
  <a href="#使用">使用</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/Jockjrop/dsh-usage-stats/issues">反馈问题</a>
</p>

<p align="center">
  <a href="screenshots/usage.png"><img src="screenshots/usage.png" alt="用量面板：概览指标、今日图表与使用量热力图" width="800"></a>
</p>

<p align="center"><sub>从今天用了多少，到长期使用趋势，一眼看清。</sub></p>

<table align="center">
  <thead>
    <tr><th align="center">配额</th><th align="center">控制</th></tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="screenshots/quotas.png"><img src="screenshots/quotas.png" alt="供应商余额与 WorkBuddy 积分" width="400"></a></td>
      <td align="center"><a href="screenshots/controls.png"><img src="screenshots/controls.png" alt="自动查询设置与自定义配额查询" width="400"></a></td>
    </tr>
    <tr>
      <td align="center">集中查看供应商余额与 WorkBuddy 积分。</td>
      <td align="center">设置自动刷新间隔和自定义配额查询。</td>
    </tr>
  </tbody>
</table>

## 功能

| 页面 | 你可以做什么 |
| --- | --- |
| **用量** | 查看今日与累计 Token、使用天数、小时调用次数、每日／每周热力图和模型明细。 |
| **配额** | 集中查看已配置平台的余额、订阅额度窗口，以及 WorkBuddy／WorkBuddy AI 积分。 |
| **控制** | 调整查询间隔、设置自定义配额接口、切换模型明细和高级模型选择器。 |

- **看清使用趋势**：历史图表支持 7／30／365 天和全部，按供应商、模型查看用量。
- **汇总账户配额**：使用内置读取器，也能为自定义供应商映射 JSON 响应。
- **按需刷新**：手动获取或开启定时查询；自动查询默认关闭。
- **更快选择模型**：可开启模型与推理强度面板，拖动滑条调整；关闭后恢复官方选择器。
- **融入桌面界面**：适配浅色／深色主题，图表自适应宽度，标签页固定，供应商选择支持键盘。
- **跟随应用语言**：支持中文、英语和日语，随 DSH 所选语言即时切换；用户自定义名称与配额标签保持原样。

## 安装

**推荐通过 DSH 桌面端安装 [npm 包 `@sligqoer/dsh-usage-stats`](https://www.npmjs.com/package/@sligqoer/dsh-usage-stats)。** 已包含预构建模块，无需克隆仓库或在本机构建；通过包名安装后可使用插件页的「检查更新」。

### 1. 打开插件安装入口

在 DSH 桌面端主界面的侧栏进入 **插件 → 添加插件**。

### 2. 填入完整 npm 包名

```text
@sligqoer/dsh-usage-stats
```

将包名粘贴到 **包名或地址**，点击 **安装**。请保留完整的 `@sligqoer/` 前缀。

### 3. 启用并打开面板

点击 **立即启用**，进入 **设置 → 用量统计**。如果插件管理器提示需要重启，按提示重启 DSH。

用量页会读取本地 DSH 会话。进入 **配额**，点击对应卡片的刷新按钮，即可查询账户数据。

<details>
<summary>安装指定版本或已下载的压缩包</summary>

要安装指定版本 `0.1.2`，在同一安装入口填入：

```text
@sligqoer/dsh-usage-stats@0.1.2
```

也可以手动安装 [Release 压缩包](https://github.com/Jockjrop/dsh-usage-stats/releases/latest)，在安装入口填入以下地址，或下载 `.tgz` 与 `SHA256SUMS` 后填写压缩包的本地绝对路径。安装前无需解压。

```text
https://github.com/Jockjrop/dsh-usage-stats/releases/latest/download/dsh-usage-stats.tgz
```

```powershell
Get-FileHash ./sligqoer-dsh-usage-stats-0.1.2.tgz -Algorithm SHA256
```

</details>

<details>
<summary>从源码安装／手动链接开发目录</summary>

开发时准备 Git、Node.js 和 pnpm，再构建仓库。以下步骤已在 Windows + Node.js 24 环境验证：

```sh
git clone https://github.com/Jockjrop/dsh-usage-stats.git
cd dsh-usage-stats
npm ci
npm run build
```

请将克隆目录保存在固定位置，DSH 会链接到该目录。

在 **插件 → 添加插件** 填入克隆目录的绝对路径，安装后点击 **立即启用**。如果选择手动链接，完全退出 DSH 桌面端，备份其 profile 的 `package.json`，然后在**刚克隆的目录内，用 PowerShell** 运行：

```powershell
$pluginDir = (Get-Location).Path.Replace('\', '/')
$dshDataDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshDataDir 'profiles/desktop'
pnpm --dir $profileDir add "link:$pluginDir"
```

打开 `$profileDir/package.json`，在其已有的 `dsh.profile.bundles` 数组末尾加入 `"@sligqoer/dsh-usage-stats"`，保留其他 bundle 条目。

DSH 桌面端自行管理 desktop profile，不能使用 `dsh plugin --profile desktop`。手动链接完成后，启动应用并进入 **设置 → 用量统计**。

</details>

<details>
<summary>更新与卸载</summary>

**从旧版迁移：** 在「插件」页面卸载旧的 `dsh-usage-stats`，再填入 `@sligqoer/dsh-usage-stats` 安装并启用。包名切换仅需做一次；插件继续使用原有的数据目录、配额接口和设置标识。

**npm 安装：** 使用插件页的「检查更新」，按提示更新并重启。当前更新检查器只处理直接通过 npm 包名安装的插件。GitHub 地址、压缩包地址、本地路径或 `link:` 安装需要手动升级；这些来源显示「已是最新版本」也不代表没有新发布。

**Release 安装：** 从「插件」页面卸载后，使用上面的 Release 地址重新安装并启用新版。彻底卸载时，使用同一页面的卸载操作。

**源码安装：** 完全退出 DSH 桌面端，在克隆目录执行以下命令，再启动应用：

```sh
git pull --ff-only
npm ci
npm run build
```

**手动链接卸载：** 退出桌面端，从 desktop profile 中仅移除 `@sligqoer/dsh-usage-stats` 依赖和 bundle 条目，在该 profile 运行 `pnpm install`，然后重启。

</details>

## 使用

**用量**用于查看总量与趋势。悬停图表或热力图格子可以查看明细；切换历史筛选时，概览卡片仍按今日／完整历史口径显示。

**配额**展示平台接口返回的数据。已配置但尚未查询的余额可能显示 **未查询**；卡片是否可用取决于凭据和账户权限。

**控制**管理显示与刷新方式：

| 设置 | 默认值 |
| --- | --- |
| 自动获取配额 | 关闭 |
| 查询间隔 | 1 小时；也可选 10 分钟、5 小时、每天 |
| 模型明细与分布 | 开启 |
| 高级模型选择器 | 关闭 |

开启自动查询前需要确认可能产生的查询成本。关闭设置页后，宿主仍按间隔执行；平时打开配额页只读取缓存。

<details>
<summary><strong>支持的平台与凭据</strong></summary>

内置读取器覆盖 Claude、DeepSeek、StepFun、Codex、GitHub Copilot、OpenRouter、Moonshot 国内／国际、Kimi Coding、MiniMax 国内／国际、Z.AI、智谱 GLM Coding、阿里云 Token Plan 国内版、xAI 和 OpenCode Go。

供应商需要已在 DSH 中配置。支持 OAuth 的读取器使用已有且未过期的登录，本插件不会刷新或改写登录信息。

| 可选读取器 | 宿主凭据引用 |
| --- | --- |
| OpenRouter 账户总余额 | `OPENROUTER_MANAGEMENT_API_KEY` |
| xAI 预付余额 | `XAI_MANAGEMENT_API_KEY`、`XAI_TEAM_ID` |
| 阿里云 Token Plan 国内版 | `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`；临时凭据可加 `ALIBABA_CLOUD_SECURITY_TOKEN` |

OpenCode Go 只使用其自身在 DSH 中配置的凭据。Zen 没有内置钱包余额读取器，可使用自定义查询；阿里云国际版 Token Plan 暂未接入。

WorkBuddy 与 WorkBuddy AI 依赖可选的 `dsh-workbuddy-connect` 适配器，两套积分分别缓存、分别刷新。

</details>

<details>
<summary><strong>配置自定义配额查询</strong></summary>

1. 进入 **控制 → 配额查询**，选择已有供应商。
2. 填写查询 URL 和响应字段映射。
3. 点击 **测试**，检查解析出的结果。
4. 确认查询后，在 **配额** 页面查看。

假设接口返回 `{ "data": { "balance": 12.34 } }`：

```json
{
  "url": "https://api.example.com/balance",
  "method": "GET",
  "auth": "provider",
  "headers": { "accept": "application/json" },
  "response": {
    "metrics": [
      {
        "label": "账户可用余额",
        "kind": "amount",
        "remaining": "data.balance",
        "currency": "CNY"
      }
    ]
  }
}
```

将示例 URL 替换为供应商的真实接口。`auth: "provider"` 使用其已有的 DSH 凭据，认证查询地址需与配置地址或官方配额地址同源。

模板支持 GET／POST、JSON body、余额／窗口指标，以及 `data.items[0].balance` 等字段路径。窗口支持百分比或 `total` 搭配 `remaining`／`used`，`response.rows` 指定数组；无需认证时使用 `auth: "none"`。

修改模板后需要重新测试，成功结果有效期为 15 分钟。确认后的自定义查询覆盖该供应商的内置读取器，移除后恢复。

</details>

## 隐私

用量统计在本机完成。插件保存统计数、模型标识和用量时间记录，不保存对话正文；凭据只在宿主读取，不返回渲染进程。

测试查询与刷新会访问对应平台的配额服务。插件不含分析上报或遥测接口。

<details>
<summary>本地存储与请求保护</summary>

两个文件位于 `<DSH_HOME>/storages/`；未设置 `DSH_HOME` 时使用当前用户的 `.dsh/storages/`：

| 文件 | 内容 |
| --- | --- |
| `usage-stats-corpus.json` | 按会话保存的用量贡献 |
| `usage-stats-controls.json` | 控制设置、自定义模板与配额快照 |

这些是私人的本地数据，与凭据、环境文件、数据库、日志、备份和预览一起排除在 Git 之外。

接口检查回环地址、Host、Origin 与跨站请求，使用 `Cache-Control: no-store`，隐藏未知宿主异常的原始详情。同一用户权限下的其他进程可以访问本地数据。

自定义查询拒绝模板中的认证请求头和常见凭据字段；使用供应商认证时要求对应来源，不跟随重定向，超时 8 秒，响应上限 1 MB。WorkBuddy 适配器只保留配额展示字段。

</details>

## 常见问题

**支持 DSH Web 吗？**

当前版本只在 desktop profile 和 Electron 主窗口加载。

**为什么配额卡片不显示或无法获取？**

先确认供应商已配置、凭据可用且账户支持配额接口。普通模型 API Key 可能没有账单查询权限。

**Token 总数就是账单金额吗？**

不是。总数为输入、输出、缓存读取和缓存写入 Token 之和，账户余额来自平台接口。

**会修改 DSH 的文件吗？**

插件注册外部 bundle。高级模型选择器开启时接管界面槽位，关闭后恢复官方选择器，不修改 DSH 源码。

## 参与贡献

欢迎提交问题和改进。报告问题时，请附上 DSH 版本、插件版本、复现步骤，以及已处理私人账户信息的截图。

<details>
<summary><strong>开发与本地接口</strong></summary>

只编辑 `src/` 中的模块源码。`npm run build` 同步到 `lib/` 和根目录兼容副本，并从 `package.json` 注入界面模块的包名和顶部版本号，包入口加载 `lib/`。

```sh
npm run build
npm test
node scripts/render-heatmap-check.mjs
node scripts/check-heat-tip-placement.mjs
npm run preview:heatmap
npm pack --dry-run
npm run release
```

测试使用模拟数据与临时 DSH 目录，无需真实凭据或付费调用。可设置 `DSH_THEME_CLIENT` 验证已安装主题，默认使用随仓库提供的变量契约。模拟预览生成已忽略的 `preview-heatmap.html`。

`npm run release` 构建插件，将 `sligqoer-dsh-usage-stats-<版本号>.tgz`、`dsh-usage-stats.tgz` 别名与 `SHA256SUMS` 写入已忽略的 `release/`，并在临时 profile 验证安装。发行说明包含 [CHANGELOG.md](CHANGELOG.md) 中对应版本的更新内容。

推送与 `package.json` 版本一致的 `v<版本号>` 标签后，GitHub Actions 会运行测试，使用 npm 可信发布将验证过的压缩包发布为公开包，再将同一文件发布到 GitHub Release。可信发布绑定 `Jockjrop/dsh-usage-stats` 仓库的 `release.yml` 工作流，无需在仓库保存 npm 令牌。`npm run publish:release` 发布已构建的压缩包；已有版本仅在完整性与本地压缩包一致时跳过，内容不同则终止。

接口统一使用 `/api/dsh-usage-stats/` 前缀：

| 路由 | 方法 | 作用 |
| --- | --- | --- |
| `stats` | GET | 用量；`days`、`tz`、`model`、`fresh=1` |
| `provider-quotas` | GET | 配额缓存；`fresh=1` 刷新 |
| `workbuddy`、`workbuddy-ai` | GET | 适配器缓存；支持 `fresh=1` |
| `controls` | GET／POST | 读取／修改设置，写入要求 JSON |
| `quota-providers` | GET | 已有供应商与无凭据模板 |
| `quota-test` | POST | 测试模板并返回限时确认 ID |

语料库每 30 秒刷新；接口最多等待 1500 ms，可能返回 `stale: true`／`partial: true`。SQLite 指纹要求 `node:sqlite`，否则回退为重读会话。时区变化时按已存事件重新分桶，逐小时保存的旧历史在半小时时区边界上可能存在近似。

`platform: "web"` 是 DSH 桌面端使用的渲染通信格式；两端入口仍要求 desktop profile 与渲染进程的原生桥接。

</details>

## 许可

[Apache-2.0](LICENSE)。
