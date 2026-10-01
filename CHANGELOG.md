# Changelog / 更新日志

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
