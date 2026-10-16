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
  <a href="https://github.com/Jockjrop/dsh-usage-stats/releases/latest"><img src="https://img.shields.io/badge/release-v0.2.1-64748b?style=flat-square" alt="插件版本 0.2.1"></a>
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
  <a href="screenshots/usage.png"><img src="screenshots/usage.png" alt="用量面板：概览指标、今日图表与使用量热力图" width="800"></a>
</p>

<p align="center"><sub>查看今日与累计 Token、小时趋势和使用量热力图。</sub></p>

<table align="center">
  <thead>
    <tr><th align="center">配额</th><th align="center">控制</th></tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="screenshots/quotas.png"><img src="screenshots/quotas.png" alt="供应商余额与账号积分" width="400"></a></td>
      <td align="center"><a href="screenshots/controls.png"><img src="screenshots/controls.png" alt="模型功能、展示偏好与查询来源" width="400"></a></td>
    </tr>
    <tr>
      <td align="center">集中查看供应商余额、账号积分和周期额度。</td>
      <td align="center">设置模型功能、展示偏好和自定义配额查询。</td>
    </tr>
  </tbody>
</table>

<p align="center">
  <a href="screenshots/detection.png"><img src="screenshots/detection.png" alt="模型检测：候选排名、库内置信度与采样状态" width="800"></a>
</p>

<p align="center"><sub>查看 LM Fingerprint 候选排名、采样状态和已发生用量。</sub></p>

## 功能

| 页面 | 你可以做什么 |
| --- | --- |
| **用量** | 查看今日与累计 Token、使用天数、小时调用次数、每日／每周热力图、趋势、模型明细与输出速度。 |
| **配额** | 集中查看供应商余额、账号积分与周期配额，支持手动或定时刷新及自定义查询。 |
| **检测** | 独立选择供应商和模型，确认预算后运行 LM Fingerprint 检测，查看候选排名、采样状态与历史记录。 |
| **控制** | 调整展示偏好、配额查询设置、高级模型选择器与逐模型推理强度。 |

- **看清使用趋势**：按日／周浏览热力图，切换 7／30 天趋势，按供应商与模型查看用量。
- **比较输出速度**：按 TPS 排序，显示平均首 Token 耗时（TTFT）；缺少有效时间记录的样本不参与速度排名。
- **按需刷新配额**：通过 DSH 凭据服务查询已配置供应商，账号配额需要对应的账号插件或宿主服务。自动查询默认关闭。
- **独立运行检测**：默认采样 3 次，也可选择 1 次初筛；先确认预算，再手动开始，支持取消、超时和用量预算控制。
- **调整模型设置**：分别控制高级模型选择器与模型推理强度，保留已有的模型属性、参数映射和个人设置。
- **跟随应用语言**：支持中文、英语和日语，随 DSH 所选语言切换；用户自定义名称与配额标签保持原样。

检测通过随机数样本与参考库对照。排名和库内置信度表示与已知候选的接近程度，不能证明模型身份或能力。读取模型目录、预算和历史结果不会启动推理。

## 安装

当前插件版本为 **0.2.3**，适配 **DSH Desktop `0.2.1-alpha.2` 和 `0.2.0-rc.2`**。版本不匹配时，宿主插件管理器会拒绝安装或启用。

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
@sligqoer/dsh-usage-stats@0.2.1
```

也可从 [GitHub 发布页](https://github.com/Jockjrop/dsh-usage-stats/releases/latest)下载 `.tgz` 安装包和 `SHA256SUMS`，校验后填入压缩包的本地绝对路径，无需解压。

```powershell
Get-FileHash ./sligqoer-dsh-usage-stats-0.2.1.tgz -Algorithm SHA256
```

发布附件包含版本安装包 `sligqoer-dsh-usage-stats-0.2.1.tgz`、通用安装包 `dsh-usage-stats.tgz` 和校验文件 `SHA256SUMS`；两个安装包内容一致。

</details>

<details>
<summary>更新与迁移</summary>

通过 npm 包名安装的用户可在插件页使用「检查更新」。通过 GitHub 地址、压缩包或本地路径安装的用户，需要下载新版重新安装。

使用旧包名 `dsh-usage-stats` 的用户，先卸载旧包，再安装 `@sligqoer/dsh-usage-stats`。更新保留本地配置与用量数据；升级记录见 [CHANGELOG.md](CHANGELOG.md)。

</details>

## 使用

1. 在「用量」查看概览、趋势、热力图和输出速度；在「控制」调整模型明细与速度的显示。
2. 在「配额」点击供应商或账号卡片的刷新按钮。自动查询默认关闭，可在「控制」确认提示后开启。
3. 在「检测」选择供应商与模型、设置采样次数和输出上限，确认预算后手动开始。读取目录或历史结果不会启动检测。
4. 在「控制」分别开启或关闭高级模型选择器、模型推理强度和模型检测，编辑自定义配额查询。

## 数据与兼容

本地数据位于 `DSH_HOME/storages`：

| 文件或目录 | 内容 |
| --- | --- |
| `usage-stats-corpus.json` | 会话用量汇总。 |
| `usage-stats-display.json` | 用量展示偏好。 |
| `usage-stats-quota-controls.json` | 查询和模型设置、供应商配额缓存。 |
| `usage-stats-detections.json` | 检测结果与逐次样本用量。 |
| `usage-stats-lm-fingerprint/` | 通过校验的指纹引擎与参考库更新。 |
| `usage-stats-supplemental.json` | 按任务和样本 ID 去重的检测用量，重启后保留。 |

普通对话从 DSH 会话日志计数，检测用量按任务和样本 ID 去重后计入统计。请求诊断日志不参与 Token 汇总。更新会保留已保存的配置与历史用量。

从 0.2.0 升级后，模型检测使用 LM Fingerprint，不再提供旧版行为参考、KBF 导入／导出和能力基线测试；已发生的检测用量继续保留。发布安装包不包含个人会话、账号凭据、配额缓存或检测历史。

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

使用 Node.js 24，并安装 `package-lock.json` 锁定的依赖：

```sh
npm ci
npm run build
npm test
npm run check:release
npm run release
```

修改 `src/` 后运行 `npm run build` 生成 `lib/`。`npm run check:release` 检查版本、构建一致性、第三方完整性与工作区隐私文件；`npm run release` 构建安装包并在独立临时项目中验证安装与加载，输出位于 `release/`。

GitHub 发布流程要求标签与包版本一致（本版为 `v0.2.1`），通过检查后使用同一份安装包发布 npm 与 GitHub Release。npm 可信发布对应的工作流文件为 `.github/workflows/release.yml`。第三方资源、来源版本和许可记录于 `third_party/` 与 [NOTICE](NOTICE)，本项目使用 [Apache-2.0 许可证](LICENSE)。
