# 更新日志 / Changelog

## 0.2.5 - 2026-10-24

<a id="v025-zh"></a>
**简体中文** · [English](#v025-en)

### 🐛 问题修复

- 适配 DSH Desktop 0.2.1-rc.3，兼容范围改为 `>=0.2.1-rc.1 <=0.2.1-rc.3`（含 0.2.1-rc.1、0.2.1-rc.2、0.2.1-rc.3），不再列入 0.2.1-alpha.2 与 0.2.0 系列。
- 用量语料缓存只对当前用户可读（0600），避免会话标题与工作目录被其他本地账号读取。
- 补齐设置、配额与检测接口错误串的中英日翻译，英文/日文界面不再混入中文报错。
- 统一 `/api/dsh-usage-stats` 各路由的本机来源校验与 403 文案。
- 指纹引擎更新改用语义化版本比较，预发布或跨主版本号不会再被误判为更旧而跳过。

### ⚡ 性能与健壮性

- SQLite 会话指纹可用且覆盖全部会话时，跳过 `sessions/` 目录的全量遍历。
- 高级模型选择器与推理面板所需的宿主服务改为可选获取，单个服务缺失不再导致整个设置页不挂载。
- 指纹引擎完整性校验按文件签名缓存，检测与目录读取不再重复哈希 16 MB 参考库。
- 统计接口仅在首次请求等待检测用量同步，之后交给后台定时与事件刷新，慢模型枢纽不再拖慢每次页面加载。
- 协议版本号统一引用 `PROTOCOL_VERSION`，避免多处硬编码漂移。

### 🧰 工程化

- 新增 `npm run lint`（语法、JSON、三语条目）与 `engines.node`。
- 新增 push/PR CI（lint、构建一致性、测试、发布检查）与 Dependabot、`.editorconfig`。

<a id="v025-en"></a>
**English** · [简体中文](#v025-zh)

### 🐛 Bug Fixes

- Support DSH Desktop 0.2.1-rc.3 and narrow the compatibility range to `>=0.2.1-rc.1 <=0.2.1-rc.3` (covering 0.2.1-rc.1, 0.2.1-rc.2 and 0.2.1-rc.3), dropping 0.2.1-alpha.2 and the 0.2.0 series.
- Write the usage corpus cache owner-only (0600) so session titles and working directories stay unreadable to other local accounts.
- Localize the remaining settings, quota and detection API errors in Chinese, English and Japanese instead of leaking Chinese text into the English/Japanese UI.
- Unify the loopback trust check and 403 message across all `/api/dsh-usage-stats` routes.
- Compare fingerprint engine versions semantically so prereleases or cross-major releases are no longer mistaken for older builds and skipped.

### ⚡ Performance and robustness

- Skip the full `sessions/` directory walk when SQLite fingerprints are available and cover every listed session.
- Acquire the services used by the model seat and reasoning panel optionally, so one missing service no longer prevents the whole settings section from mounting.
- Cache engine integrity verification by file signature so detection and catalog reads no longer re-hash the 16 MB reference bank.
- Wait for detection usage only on the first stats request; later requests rely on the background interval and hub events, so a slow model hub no longer delays every page load.
- Reference `PROTOCOL_VERSION` instead of scattering protocol literals.

### 🧰 Tooling

- Add `npm run lint` (syntax, JSON documents, three-language table) and `engines.node`.
- Add push/PR CI (lint, build freshness, tests, release checks) plus Dependabot and `.editorconfig`.

## 0.2.4 - 2026-10-17

<a id="v024-zh"></a>
**简体中文** · [English](#v024-en)

### 🎨 体验优化

- 检测页按「选择检测模型 → 确认预算 → 检测结果」显示当前步骤，突出预算与开始操作，增加请求进度、取消入口和空状态。
- 调整字体、间距和状态颜色，适配深浅主题与窄窗口；预算参数、检测详情和指纹引擎信息默认折叠，更新异常仍直接显示。

### 🐛 问题修复

- 适配 DSH Desktop 0.2.1-rc.2，并兼容 0.2.1-rc.1、0.2.1-alpha.2、0.2.0-rc.2 和 0.2.0-rc.1，保留已有桌面渲染器标记兼容。
- 更换模型或参数后重新确认预算，历史结果保留原检测条件；检测运行中不再提前显示无法判定的说明，精简重复提示。

<a id="v024-en"></a>
**English** · [简体中文](#v024-zh)

### 🎨 Improvements

- Guide detection through model selection, budget confirmation and results, with clearer primary actions, request progress, cancellation and empty states.
- Refine typography, spacing and status colors for light and dark themes and narrow windows. Collapse budget parameters, technical details and engine information by default while keeping update warnings visible.

### 🐛 Bug Fixes

- Support DSH Desktop 0.2.1-rc.2 alongside 0.2.1-rc.1, 0.2.1-alpha.2, 0.2.0-rc.2 and 0.2.0-rc.1, retaining both desktop renderer markers.
- Require a new budget after model or parameter changes and keep saved results tied to their original settings. Avoid premature inconclusive explanations while detection runs and remove repeated notices.

## 0.2.3 - 2026-10-16

<a id="v023-zh"></a>
**简体中文** · [English](#v023-en)

### 🐛 问题修复

- 适配 DSH Desktop 0.2.0-rc.2 的桌面渲染器标记：preload 桥 `dshDesktop` 只暴露 `protocolVersion`，不再提供 `deviceInfo` 函数。「用量统计」设置页此前因此不注册，现在新旧两种标记都接受，纯浏览器访问仍保持不挂载。`0.2.1-alpha.2` 与 `0.2.0-rc.2` 两个宿主版本均受支持。

<a id="v023-en"></a>
**English** · [简体中文](#v023-zh)

### 🐛 Bug Fixes

- Adapt to the DSH Desktop 0.2.0-rc.2 renderer marker: the `dshDesktop` preload bridge exposes only `protocolVersion` and no longer carries a `deviceInfo` function. The usage statistics settings page failed to register because of this; both markers are now accepted, while plain browser tabs still never mount. Both `0.2.1-alpha.2` and `0.2.0-rc.2` hosts remain supported.

## 0.2.2 - 2026-10-16

<a id="v022-zh"></a>
**简体中文** · [English](#v022-en)

### 🐛 问题修复

- 修正 DSH Desktop 兼容版本声明为 0.2.0-rc.2，避免该版本被宿主插件管理器误拒绝安装或启用。
- 保留 0.2.1-alpha.2 支持，并同步安装说明与中英日插件描述。

<a id="v022-en"></a>
**English** · [简体中文](#v022-zh)

### 🐛 Bug Fixes

- Correct the DSH Desktop compatibility declaration to 0.2.0-rc.2 so the host plugin manager accepts installation and activation on that version.
- Retain support for 0.2.1-alpha.2 and update installation instructions and Chinese, English and Japanese plugin descriptions.

## 0.2.1 - 2026-10-14

<a id="v021-zh"></a>
**简体中文** · [English](#v021-en)

### ✨ 新增功能

- 模型检测改用 LM Fingerprint，通过随机数样本与参考库生成候选排名；独立选择已配置供应商与模型，默认带入当前会话模型。
- 默认采样 3 次，支持 1 次初筛；单次输出上限默认 4,096 Token，可设为 1,024–16,384。支持预算确认、取消、超时与用量预算控制。
- 内置指纹引擎与参考库，每日检查上游更新；代码与数据通过完整性和接口校验后共同启用，更新失败保留已验证版本，检测任务固定引擎版本。
- 新增逐模型推理强度设置，支持关闭、极低、低、中、高、极高、最大七档，保留已有模型属性与参数映射；推理强度和高级模型选择器分别控制。

### 🐛 问题修复

- 检测停止、失败或重启后保留已发生用量，按任务与样本 ID 去重后计入统计，避免恢复历史结果时重复计数。
- 参数变更使已确认预算失效，避免继续使用与当前设置不一致的检测计划。
- 兼容读取已有控制设置与供应商配额缓存，查询失败时保留最近成功的数据和获取时间。
- 单张供应商卡片刷新时，仅对应按钮显示加载状态；支持不同供应商并发刷新，失败提示局限于对应卡片，较旧响应不会覆盖其他供应商的新结果。
- 配额页仅显示当前已有供应商，已移除供应商的历史缓存不再显示；刷新、重启和迟到响应不会恢复其卡片。

### 🎨 体验优化

- 展示候选排名、逐次采样状态及已发生用量，保留有效的部分样本。仅 3 个有效样本显示库内置信度，低于 75% 提示不足；排名和置信度不作为模型身份或能力证明。
- 默认开启输出速度、模型推理强度、高级模型选择器和模型检测，关闭模型明细与分布、自动获取余额；查询间隔默认 10 分钟，自定义查询默认为空，保留已保存的个人设置。
- 查询来源在浮层中编辑，已启用的自定义查询默认折叠。控制设置统一位于控制页，插件详情页提供简洁说明。
- 配额页优先显示 DeepSeek，再按已开启账号的顺序展示账号积分与周期额度。

### ⚠️ 其他变更

- 不再提供旧版行为参考、KBF 导入／导出与能力基线测试。普通对话仍从 DSH 会话日志计数，读取模型目录、预算与历史结果不会启动推理。
- 用量展示偏好保存于 usage-stats-display.json，查询与模型设置、供应商配额缓存保存于 usage-stats-quota-controls.json；检测历史与去重用量独立持久化。
- 提供 protocolVersion: 1 的 dshUsageStats 服务，支持读取用量、模型速度、配额和控制设置。
- 适配 DSH Desktop 0.2.1-alpha.2 和 0.2.1-rc.2，由宿主插件管理器拒绝不匹配版本的安装与启用。
- 发布包包含指纹引擎、参考库、品牌资源、来源校验信息与第三方许可；使用 Undici 处理更新请求，使用 TypeScript 擦除上游引擎类型。
- 补齐私人运行数据的忽略规则与发布隐私检查，校验版本、构建产物、第三方哈希及独立项目安装；提供版本安装包、通用安装包和 SHA256SUMS。

<a id="v021-en"></a>
**English** · [简体中文](#v021-zh)

### ✨ New Features

- Replace model detection with LM Fingerprint candidate rankings based on random-number samples and a reference library. Select a configured provider and model independently, with the current conversation model selected initially.
- Use three samples by default or one for screening. The default per-sample output cap is 4,096 tokens, adjustable from 1,024 to 16,384, with budget confirmation, cancellation, timeouts and reported-usage limits.
- Bundle the fingerprint engine and reference library and check upstream daily. Activate code and data together after integrity and interface checks; failed updates retain the verified version, and running tasks keep their engine version.
- Add per-model reasoning settings with off, minimal, low, medium, high, xhigh and max levels. Preserve model properties and parameter mappings, and control reasoning features and the advanced model selector independently.

### 🐛 Bug Fixes

- Retain incurred detection usage after stops, failures and restarts, deduplicate it by task and sample ID, and avoid counting restored history twice.
- Invalidate confirmed budgets when parameters change so a detection plan cannot run with mismatched settings.
- Read existing control settings and provider quota caches compatibly, retaining the last successful data and fetch time after query failures.
- Keep each provider's refresh indicator and errors on its own card, allow different providers to refresh concurrently, and prevent older responses from overwriting newer results from other providers.
- Show quotas only for providers that still exist in the current configuration. Removed providers stay hidden despite cached balances, refreshes, restarts or delayed responses.

### 🎨 Improvements

- Show candidate rankings, per-sample status and incurred usage, retaining valid partial samples. Display library confidence only with three valid samples and warn below 75%; rankings and confidence do not prove model identity or capability.
- Enable output speed, reasoning features, the advanced model selector and detection by default. Model breakdowns and automatic balance queries start off, the query interval starts at ten minutes, and custom queries start empty while saved preferences remain available.
- Edit query sources in an overlay and collapse enabled custom queries by default. Keep settings together in Controls and provide a concise plugin description.
- Show DeepSeek first in Quotas, followed by enabled accounts in their configured order, including account credits and quota windows.

### ⚠️ Other Changes

- Remove the earlier behavioral references, KBF import/export and capability baseline tests. Conversation usage still comes from DSH session logs; reading catalogs, budgets or saved results never starts inference.
- Store display preferences in usage-stats-display.json and query/model settings and provider quota caches in usage-stats-quota-controls.json. Persist detection history and deduplicated usage separately.
- Expose the dshUsageStats host service with protocolVersion: 1 for usage, model speed, quotas and control settings.
- Support DSH Desktop 0.2.1-alpha.2 and 0.2.1-rc.2, with the host plugin manager rejecting installation and activation on mismatched versions.
- Ship the fingerprint engine, reference library, brand assets, source checksums and third-party licenses. Use Undici for updates and TypeScript to erase upstream engine types.
- Exclude private runtime data and validate release privacy, versions, generated files, third-party hashes and installation in an isolated project. Provide a versioned archive, a generic archive and SHA256SUMS.

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
