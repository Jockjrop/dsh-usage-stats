# Changelog / 更新日志

## 0.2.0 - 2026-10-05

<a id="v020-zh"></a>
**简体中文** · [English](#v020-en)

### ✨ 新增功能

- 新增「匹配」页面，跟随当前会话的模型与推理设置，结合已有响应提示与行为指纹检测评估模型匹配情况。
- 支持 28 份公开行为参考、完整检测或随机抽样、KBF JSON 导入／导出，以及通过可信供应商建立本地参考；新增 16 项能力测试，用于对照本地基线检查能力下降。
- 检测完成后显示 0–100 的「参考接近度」，并给出「未发现明显异常」「疑似不匹配」「疑似能力下降」或「无法判定」的结果。接近度按有效回答的一致率计算；取消、中断及证据不足时不评分。
- 新增「token输出速度」，按供应商与模型的 TPS 从高到低排列，同时显示平均 TTFT。TPS 使用 DSH 的累计输出 Token／累计解码耗时口径；缺少有效时间记录的样本不参与排名。
- 概览展开后新增缓存命中率、历史单日 Token 峰值、最长单轮任务时长、当前连续天数、最长连续使用天数，以及最近 7 天最常用的一个模型。同名模型跨供应商合并，任务时长排除轮次之间的等待。
- 控制页新增「检测模型匹配」和「token输出速度」开关，分别默认关闭、开启，保存后重启仍生效。

### 🐛 问题修复

- 修复分叉会话把继承记录的 Token、速度样本与任务时长重复计入的问题，升级后重读可用的会话日志；防止延迟返回的旧设置覆盖刚保存的开关状态。
- 修复检测消耗未纳入用量统计的问题，逐次保存已上报的 Token，纳入概览、图表、模型分布与 TPS／TTFT；失败、取消及重启恢复时保留已发生消耗，避免重复计入。
- 修复检测完成后结果不明确、切换会话后结果消失的问题。保留最近 10 次检测结果；无能力基线时明确说明无法判断下降，宿主重启中断的检测显示「无法判定」。
- 配额查询失败时持久保留最近成功的数据和获取时间，显示安全的失败提示；单张卡片仅刷新对应供应商，较旧的全部刷新结果不覆盖较新的单供应商结果。
- 修复合并同名模型后的供应商搜索，保留供应商与标签页切换时的查询草稿，并在升级时重读现有日志补齐 TPS／TTFT 时间记录。

### 🎨 体验优化

- 检测结果置于表单上方，保留分数、结论、模型与消耗；参数、中间验证过程、统计检验和通道表现收进默认折叠的「检测详情」。
- 概览指标居中对齐顶部摘要，移除 Token 分项与会话明细区域；速度列表仅保留供应商小字，统一图表颜色并补充精确数值提示。
- 独立检测先预览预算，再由用户手动启动，支持取消、请求超时与已上报 Token 预算控制；默认读取已有响应时不发起模型请求。

### ⚠️ 其他变更

- 继续仅适配 DSH Desktop，保留现有设置与统计数据。随包提供公开参考资料的来源、校验值与 Apache 2.0 许可。
- 展示截图与测试样例改用模拟数据，补齐私人检测记录的忽略规则；发布包增加版本一致性与隐私文件检查。

<a id="v020-en"></a>
**English** · [简体中文](#v020-zh)

### ✨ New Features

- Add a Match tab that follows the current conversation's model and reasoning settings, combining existing response hints with behavioral fingerprint audits.
- Include 28 public behavioral references, full or randomly sampled audits, KBF JSON import/export, and private reference calibration through a trusted provider. Add 16 capability tasks to compare against a local baseline.
- Show a 0–100 reference similarity score and a clear verdict after auditing. Scores measure valid-answer agreement; cancelled, interrupted and insufficient-evidence runs remain unscored.
- Add Token output speed, ranking provider/model pairs by descending TPS with average TTFT. TPS uses DSH's cumulative output tokens divided by cumulative decode time; samples without valid timing are excluded.
- Expand the overview with cache hit rate, historical daily token peak, longest completed user round, current and longest usage streaks, and the most-called model in the last seven days. Merge model names across providers and exclude idle gaps between rounds.
- Add persistent visibility switches: Detect model match defaults off, and Token output speed defaults on.

### 🐛 Bug Fixes

- Exclude inherited fork history from billed tokens, speed samples and task durations, rescanning available session logs on upgrade. Prevent delayed settings responses from undoing newly saved switches.
- Count reported audit tokens in overview, charts, model distribution and TPS/TTFT after each call. Preserve incurred usage after failures, cancellation and restarts without double counting restored results.
- Make completed results explicit and retain the last ten audits across conversation changes. Explain missing capability baselines and mark host-interrupted runs inconclusive.
- Persist the last successful quota data and fetch time after failed refreshes with safe diagnostics. Refresh individual providers and prevent older full refreshes from overwriting newer card results.
- Fix provider search in merged model rows, retain query drafts across provider/tab changes, and rescan available logs on upgrade to recover TPS/TTFT timing.

### 🎨 Improvements

- Show results above the form with the score, verdict, model and usage. Collapse parameters, intermediate validation, statistical checks and channel performance under Audit details by default.
- Center overview metrics with the summary, remove token categories and session details, simplify speed rows to provider-only subtext, and align chart colors and exact-value tooltips.
- Preview the budget before manually starting an independent audit, with cancellation, request timeouts and reported-token limits. Reading existing responses does not run a model.

### ⚠️ Other Changes

- Keep DSH Desktop support and existing settings/statistics. Include provenance, checksums and Apache 2.0 licensing for the public references.
- Use synthetic screenshots and test fixtures, exclude private audit records from Git, and add release checks for version consistency and private files.

## 0.1.2 - 2026-10-01

### 中文

- 使用独立的 npm 包名 `@sligqoer/dsh-usage-stats`。通过此包名安装后，插件管理器可从 npm 获取新版本并进行更新。
- 同步 bundle 与界面模块的包名；构建时从 `package.json` 注入界面模块标识，保留原有用量数据、配额接口和设置标识。
- 发布脚本支持作用域包的压缩包命名，并验证预构建包的安装、宿主入口和界面入口。
- GitHub Actions 增加 npm 可信发布流程，使用同一份验证过的压缩包发布 npm 与 GitHub Release；已有版本只在压缩包完整性一致时跳过发布。
- 更新中英文安装与升级说明：旧版卸载后改用新 npm 包名安装一次，后续使用「检查更新」。保留 GitHub Release 压缩包作为手动安装选项。

### English

- Use the dedicated npm package name `@sligqoer/dsh-usage-stats`. Install by this name so the plugin manager can discover and install updates from npm.
- Align the bundle and renderer module with the scoped package name. Inject the renderer identity from `package.json` while preserving usage data, quota routes, and settings identifiers.
- Support scoped archive names and verify the prebuilt package's installation, host entry, and renderer entry.
- Add npm trusted publishing to GitHub Actions. Publish the same verified archive to npm and GitHub Releases, and skip existing npm versions only when archive integrity matches.
- Update installation and migration instructions in both languages: uninstall the old package once, install the scoped npm package, then use Check updates. Keep Release archives available for manual installation.

## 0.1.1 - 2026-10-01

### 中文

- 新增英语、日语界面适配，跟随 DSH 所选语言即时切换，覆盖用量图表、配额、控制设置、模型选择器和提示文案；保留用户自定义名称与标签。
- 修复反复打开配额页面时卡片消失后重建的闪烁，保留已有数据与 WorkBuddy 套餐展开状态。
- 刷新期间及部分请求失败时保留最近成功的配额数据，显示失败提示，并防止过期请求覆盖新结果。
- 顶部版本号改为构建时读取 `package.json`，与插件包版本保持一致。
- 修复英语界面在窄屏下的图表标题和按钮组横向溢出。

### English

- Add English and Japanese UI translations that update with DSH's selected language, including usage charts, quotas, controls, the model selector, and notices. Preserve user-defined names and labels.
- Fix quota cards disappearing and rebuilding when reopening the quota tab. Keep existing data and expanded WorkBuddy plans.
- Retain the last successful quota data during refreshes and partial failures, show error notices, and prevent stale requests from overwriting newer results.
- Read the header version from `package.json` during the build so it matches the plugin package.
- Fix chart headings and button groups overflowing in the English UI on narrow screens.
