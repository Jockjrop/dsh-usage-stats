<p align="center">
  <img src="screenshots/icon.svg" alt="DSH 用量统计" width="80" height="80">
</p>

<h1 align="center">dsh-usage-stats</h1>

<p align="center">
  <strong>在 DSH 里，看清 Token 用量、账户余额与供应商配额。</strong><br>
  为 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness 桌面端</a>打造的本地用量面板。
</p>

<p align="center">
  <a href="#安装"><img src="https://img.shields.io/badge/DSH-Desktop-2563eb?style=flat-square" alt="DSH 桌面端"></a>
  <a href="https://github.com/Jockjrop/dsh-usage-stats/releases/latest"><img src="https://img.shields.io/badge/release-v0.2.6-64748b?style=flat-square" alt="插件版本 0.2.6"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-22c55e?style=flat-square" alt="Apache 2.0 许可"></a>
</p>

<p align="center">
  <a href="README.en.md">English</a><br>
  <a href="https://github.com/Jockjrop/dsh-usage-stats/releases/latest">下载</a> ·
  <a href="#功能">功能</a> ·
  <a href="#安装">安装</a> ·
  <a href="#使用">使用</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/Jockjrop/dsh-usage-stats/issues">反馈问题</a>
</p>

<p align="center">
  <a href="screenshots/usage.png"><img src="screenshots/usage.png" alt="用量面板：概览指标、当日走势与使用量热力图" width="860"></a>
</p>

<p align="center"><sub>看清今日与累计用量、当日走势、热力图和模型输出速度。</sub></p>

<table align="center">
  <tbody>
    <tr>
      <td align="center"><a href="screenshots/logs.png"><img src="screenshots/logs.png" alt="请求日志：逐次查看 Token、费用与速度" width="420"></a><br><sub>逐次核对每次请求的 Token、费用与速度。</sub></td>
      <td align="center"><a href="screenshots/costs.png"><img src="screenshots/costs.png" alt="成本面板：区间成本与逐模型花费" width="420"></a><br><sub>按模型查看区间花费，补齐未收录模型的价格。</sub></td>
    </tr>
    <tr>
      <td align="center"><a href="screenshots/rules.png"><img src="screenshots/rules.png" alt="规则面板：归并模型的不同名称" width="420"></a><br><sub>把同一模型的多种名称归并成一条统计。</sub></td>
      <td align="center"><a href="screenshots/quotas.png"><img src="screenshots/quotas.png" alt="配额面板：供应商余额、账号积分与周期额度" width="420"></a><br><sub>集中查看供应商余额、账号积分与周期额度。</sub></td>
    </tr>
    <tr>
      <td align="center"><a href="screenshots/detection.png"><img src="screenshots/detection.png" alt="模型检测：候选排名、库内置信度与采样状态" width="420"></a><br><sub>确认预算后运行检测，查看候选排名与已发生用量。</sub></td>
      <td align="center"><a href="screenshots/controls.png"><img src="screenshots/controls.png" alt="控制面板：模块开关、模型设置与自定义查询" width="420"></a><br><sub>开关各模块，调整模型选择、主题色与自动刷新。</sub></td>
    </tr>
  </tbody>
</table>

<p align="center">
  <a href="screenshots/dashboard.png"><img src="screenshots/dashboard.png" alt="侧边栏用量仪表盘：区间指标、趋势与请求日志" width="860"></a>
</p>

<p align="center"><sub>从侧栏打开仪表盘，快速查看区间成本、趋势和最近的请求日志。</sub></p>

## 功能

| 页面 | 你可以做什么 |
| --- | --- |
| **用量** | 查看今日与累计 Token、使用天数、小时调用次数、每日／每周热力图、趋势、模型明细与输出速度。 |
| **日志** | 按时间查看每次请求的应用、供应商、模型、成本、Token 与速度，支持筛选和翻页。 |
| **成本** | 按价格表折算成本，查看总成本、区间成本、区间 Tokens 与逐模型花费，可维护自定义单价。 |
| **规则** | 将同一模型的不同原始名称归并为一个名称，让用量、日志和成本统一统计。 |
| **配额** | 集中查看供应商余额、账号积分与周期配额，支持手动或定时刷新及自定义查询。 |
| **检测** | 独立选择供应商和模型，确认预算后运行 LM Fingerprint 检测，查看请求进度、采样状态、候选排名与历史结果。 |
| **控制** | 调整展示偏好、配额查询设置、高级模型选择器与逐模型推理强度。 |

- **看清使用趋势**：按日／周浏览热力图，切换 7／30 天趋势，按供应商与模型查看用量。
- **侧边栏仪表盘**：从侧栏打开「用量统计」，切换成本、请求数、真实 Tokens 与缓存命中率，按小时、天、月或 53 周热力图查看，并内置请求日志、筛选与翻页。
- **快速上手与反馈**：右上角「快速上手」按页面介绍用法，发送图标直达 GitHub Issues；「控制」页顶部可直接前往仓库点 Star。
- **比较输出速度**：按 TPS 排序，显示平均首 Token 耗时（TTFT）；缺少有效时间记录的样本不参与速度排名。
- **按需刷新配额**：通过 DSH 凭据服务查询已配置供应商，账号配额需要对应的账号插件或宿主服务。自动查询默认关闭。
- **统一数值单位**：大数值统一以 `k` / `M` / `B` 显示，中英日界面读法一致。
- **独立运行检测**：按步骤选择模型、确认预算并查看结果；默认采样 3 次，也可选择 1 次初筛，支持进度查看、取消、超时和用量预算控制。
- **调整模型设置**：分别控制高级模型选择器与模型推理强度，保留已有的模型属性、参数映射和个人设置。
- **跟随应用语言**：支持中文、英语和日语，随 DSH 所选语言切换；用户自定义名称与配额标签保持原样。

检测通过随机数样本与参考库对照。排名和库内置信度表示与已知候选的接近程度，不能证明模型身份或能力。读取模型目录、预算和历史结果不会启动推理。

## 安装

当前插件版本为 **0.2.6**，适配 **DSH Desktop `0.2.1-rc.3`**，兼容范围为 `>=0.2.1-rc.1 <=0.2.1-rc.3`（含 0.2.1-rc.1、0.2.1-rc.2、0.2.1-rc.3）。版本不匹配时，宿主插件管理器会拒绝安装或启用。

**推荐通过 DSH Desktop 安装 [npm 包 `@sligqoer/dsh-usage-stats`](https://www.npmjs.com/package/@sligqoer/dsh-usage-stats)。** 已包含预构建模块，无需克隆仓库或在本机构建；通过包名安装后可使用插件页的「检查更新」。

### 1. 打开插件安装入口

在 DSH Desktop 主界面侧栏进入 **插件 → 添加插件**。

### 2. 填入完整 npm 包名

```text
@sligqoer/dsh-usage-stats
```

将包名粘贴到 **包名或地址**，点击 **安装**，保留完整的 `@sligqoer/` 前缀。

### 3. 启用并打开面板

点击 **立即启用**，进入 **设置 → 用量统计**。插件管理器提示需要重启时，完全退出并重新打开 DSH Desktop。

<details>
<summary>安装指定版本或已下载的压缩包</summary>

安装本次版本时，在同一入口填入：

```text
@sligqoer/dsh-usage-stats@0.2.6
```

也可从 [GitHub 发布页](https://github.com/Jockjrop/dsh-usage-stats/releases/latest)下载 `.tgz` 安装包和 `SHA256SUMS`，校验后填入压缩包的本地绝对路径，无需解压。

```powershell
Get-FileHash ./sligqoer-dsh-usage-stats-0.2.6.tgz -Algorithm SHA256
```

发布附件包含版本安装包 `sligqoer-dsh-usage-stats-0.2.6.tgz`、通用安装包 `dsh-usage-stats.tgz` 和校验文件 `SHA256SUMS`；两个安装包内容一致。

</details>

<details>
<summary>更新与迁移</summary>

通过 npm 包名安装的用户可在插件页使用「检查更新」。通过 GitHub 地址、压缩包或本地路径安装的用户，需要下载新版重新安装。

使用旧包名 `dsh-usage-stats` 的用户，先卸载旧包，再安装 `@sligqoer/dsh-usage-stats`。更新保留本地配置与用量数据；升级记录见 [CHANGELOG.md](CHANGELOG.md)。

</details>

## 使用

1. 在「用量」查看概览、趋势、热力图和输出速度；侧栏「用量统计」可直接打开仪表盘。
2. 在「日志」按供应商、模型筛选每次请求；在「成本」选择日期范围查看花费并维护价格表；在「规则」把同一模型的不同名称归并为一个名称。
3. 在「配额」点击供应商或账号卡片的刷新按钮。自动查询默认关闭，可在「控制」确认提示后开启。
4. 在「检测」选择供应商与模型，设置采样次数和输出上限，点击「查看检测预算」，确认后点击「开始检测（会消耗 Token）」。读取目录或历史结果不会启动检测。
5. 在「控制」分别开启或关闭高级模型选择器、模型推理强度和模型检测，编辑自定义配额查询；右上角「快速上手」可查看各页面说明。

检测页按「选择检测模型 → 确认预算 → 检测结果」提示当前步骤。更改模型或参数后，需要重新查看预算；检测中可查看请求进度、逐次采样状态并取消。历史结果保留原模型与参数，检测详情和指纹引擎信息可按需展开。

## 数据与兼容

本地数据位于 `DSH_HOME/storages`：

| 文件或目录 | 内容 |
| --- | --- |
| `usage-stats-corpus.json` | 会话用量汇总。 |
| `usage-stats-display.json` | 用量展示偏好。 |
| `usage-stats-quota-controls.json` | 查询和模型设置、供应商配额缓存。 |
| `usage-stats-prices.json` | 模型自定义单价（美元/百万 Tokens）。 |
| `usage-stats-rules.json` | 模型名称归并规则。 |
| `usage-stats-detections.json` | 检测结果与逐次样本用量。 |
| `usage-stats-lm-fingerprint/` | 通过校验的指纹引擎与参考库更新。 |
| `usage-stats-supplemental.json` | 按任务和样本 ID 去重的检测用量，重启后保留。 |

普通对话从 DSH 会话日志计数，检测用量按任务和样本 ID 去重后计入统计。请求诊断日志不参与 Token 汇总。更新会保留已保存的配置与历史用量。上述文件在支持的平台上以仅当前用户可读的权限写入。

从 0.2.0 升级后，模型检测使用 LM Fingerprint，不再提供旧版行为参考、KBF 导入／导出和能力基线测试；已发生的检测用量继续保留。发布安装包不包含个人会话、账号凭据、配额缓存或检测历史；本地缓存以仅当前用户可读的权限写入。

## 常见问题

**支持 DSH Web 吗？**

当前版本仅支持 DSH Desktop 的 desktop profile。

**为什么配额卡片不显示或无法获取？**

先确认供应商已配置、凭据可用、账号插件已启用且账户支持对应配额接口。普通模型 API Key 可能没有账单查询权限。

**Token 总数就是账单金额吗？**

不是。Token 统计来自本地会话和已上报的检测用量，账户余额与周期额度来自供应商接口。

**检测排名能证明真实模型身份吗？**

不能。候选排名表示与参考库的接近程度；请求模型不在参考库时，候选仅供比较。

## 接口

宿主服务 `dshUsageStats` 使用 `protocolVersion: 1`，提供 `readStats`、`readControls`、`updateControls`、`readProviderQuotas` 和 `readSupplementalUsage`。

HTTP 接口使用 `/api/dsh-usage-stats/*`，提供统计、控制、配额查询与检测功能，仅接受本机与可信来源请求，并禁用缓存。

## 开发

使用 Node.js 22 或更高（开发与 CI 使用 24），并安装 `package-lock.json` 锁定的依赖：

```sh
npm ci
npm run lint
npm run build
npm test
npm run check:release
npm run release
```

修改 `src/` 后运行 `npm run build` 生成 `lib/`。`src/client.js` 是渲染器模板，`client-messages.js`、`client-styles.js`、`client-format.js` 等模块由构建按标记内联，发布产物仍是单个 `lib/client.js`。`npm run lint` 校验语法、JSON 文档与三语条目；`npm run check:release` 检查版本、构建一致性、第三方完整性与工作区隐私文件；`npm run release` 构建安装包并在独立临时项目中验证安装与加载，输出位于 `release/`。

GitHub 发布流程要求标签与包版本一致（本版为 `v0.2.6`），通过检查后使用同一份安装包发布 npm 与 GitHub Release。npm 可信发布对应的工作流文件为 `.github/workflows/release.yml`。第三方资源、来源版本和许可记录于 `third_party/` 与 [NOTICE](NOTICE)，本项目使用 [Apache-2.0 许可证](LICENSE)。
