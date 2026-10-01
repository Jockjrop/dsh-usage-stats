# Changelog / 更新日志

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
