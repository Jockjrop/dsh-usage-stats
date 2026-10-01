/**
 * dsh-usage-stats — desktop renderer half. Loaded by DSH's client-modules
 * bundle route at /plugins/dsh-usage-stats/client.js inside the Electron app.
 *
 * Registers a settings page (用量统计) under settings.section: a usage
 * heatmap (GitHub-contribution-style calendar, one cell per day, colour =
 * billed tokens; paged to fit the settings pane without horizontal scrolling), a
 * 24-hour token bar chart (usage by hour of the current day), a per-model
 * stacked bar chart, and whole-window totals. Time-range (segmented preset
 * group 7天/30天/1年/全部 — same pill toggle style as the token 用量 view
 * switch) and model filters are selectable; data comes from the host route
 * /api/dsh-usage-stats/stats.
 *
 * Styling uses the DSH theme alias tokens (--dsw-alias-*), so the page stays
 * legible in light AND dark themes. DOM failure policy: mounting problems are
 * logged, never thrown — an external plugin must not take the GUI down.
 */
window.__ModuleLoader__.load({
  id: 'dsh-usage-stats',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    /** Stable data attribute identifying this settings section. */
    var SECTION_ID = 'usage-stats'
    var STYLE_ID = 'dsh-usage-stats-styles'
    // Replaced from package.json by the build and npm prepack steps.
    var PLUGIN_VERSION = "0.1.1"
    var localeService = null
    var translate = null

    // Chinese is also the fallback for standalone checks without the host service.
    // Each entry supplies the English and Japanese dictionaries for DSH's locale registry.
    var messages = {
      '用量统计': ['Usage statistics', '利用状況'],
      '用量统计页面': ['Usage statistics tabs', '利用状況のタブ'],
      '用量': ['Usage', '使用量'],
      '配额': ['Quota', '利用枠'],
      '控制': ['Controls', '設定'],
      '刷新用量统计': ['Refresh usage statistics', '利用状況を更新'],
      '刷新全部配额': ['Refresh all quotas', 'すべての利用枠を更新'],
      '部分配额未能更新，请稍后刷新重试。': ['Some quotas could not be updated. Try refreshing again later.', '一部の利用枠を更新できませんでした。しばらくしてから再試行してください。'],
      '部分会话读取失败': ['Some sessions could not be read', '一部のセッションを読み込めませんでした'],
      '在 GitHub 查看 dsh-usage-stats': ['View dsh-usage-stats on GitHub', 'GitHub で dsh-usage-stats を表示'],
      '概览指标': ['Overview', '概要'],
      '今日tokens数': ["Today's tokens", '今日のトークン数'],
      '使用天数': ['Active days', '利用日数'],
      '累计tokens数': ['Total tokens', '累計トークン数'],
      '暂无数据': ['No data yet', 'データはまだありません'],
      '今日Token用量': ["Today's token usage", '今日のトークン使用量'],
      '今日Token用量统计模式': ["Today's token grouping", '今日のトークン使用量の集計方法'],
      '供应商·模型': ['Provider · Model', 'プロバイダー・モデル'],
      '按模型': ['By model', 'モデル別'],
      '使用量热力图': ['Usage heatmap', '使用量ヒートマップ'],
      '热力图时长': ['Heatmap interval', 'ヒートマップの間隔'],
      '每日': ['Daily', '日別'],
      '每周': ['Weekly', '週別'],
      '每日Token趋势图': ['Daily token trend', '日別トークン使用量の推移'],
      '每日Token趋势时长': ['Token trend period', 'トークン推移の期間'],
      '7天': ['7 days', '7日間'],
      '30天': ['30 days', '30日間'],
      '模型明细与分布': ['Model details and distribution', 'モデル別の詳細と分布'],
      '每个供应商 · 模型组合单独统计': ['Count each provider and model combination separately', 'プロバイダーとモデルの組み合わせごとに集計'],
      '合并同名模型，不区分供应商': ['Combine matching model names across providers', '同名モデルをプロバイダーを問わず合算'],
      '模型用量清单 ({count})': ['Model usage ({count})', 'モデル使用量一覧（{count}）'],
      '搜索模型或供应商名称…': ['Search models or providers…', 'モデル名・プロバイダー名で検索…'],
      '模型名称': ['Model', 'モデル名'],
      '用量 Tokens': ['Tokens used', 'トークン使用量'],
      '占比': ['Share', '割合'],
      '分布条': ['Distribution', '分布'],
      '最后活跃时间': ['Last active', '最終利用日時'],
      '没有找到匹配的模型': ['No matching models', '一致するモデルがありません'],
      '收起清单': ['Collapse list', '一覧を折りたたむ'],
      '展开其余 {count} 个模型': ['Show {count} more models', '残り{count}個のモデルを表示'],
      '近期调用': ['Recent activity', '最近の利用'],
      '全部': ['All', 'すべて'],
      '其他': ['Other', 'その他'],
      '没有按模型聚合的数据': ['No usage data by model', 'モデル別の集計データがありません'],
      '窗口内没有记录': ['No records in this period', 'この期間に記録がありません'],
      '无记录': ['No records', '記録なし'],
      '不在所选时间范围内': ['Outside the selected period', '選択した期間の範囲外'],
      '，不在所选时间范围内': [', outside the selected period', '、選択した期間の範囲外'],
      '正在读取模型明细…': ['Loading model details…', 'モデルの詳細を読み込み中…'],
      '模型明细暂不可用': ['Model details are temporarily unavailable', 'モデルの詳細を現在取得できません'],
      '总调用次数': ['Total calls', '総呼び出し回数'],
      '{count} 次': ['{count} calls', '{count}回'],
      '{count} 次调用': ['{count} calls', '{count}回の呼び出し'],
      '{date} 当周': ['Week of {date}', '{date}の週'],
      '{year}年{month}月{day}日起的一周': ['Week starting {year}-{month}-{day}', '{year}年{month}月{day}日からの週'],
      '{year}年{month}月{day}日': ['{year}-{month}-{day}', '{year}年{month}月{day}日'],
      '{hour}时': ['{hour}:00', '{hour}時'],
      '{time}，{count} 次调用，{tokens} tokens': ['{time}, {count} calls, {tokens} tokens', '{time}、{count}回の呼び出し、{tokens}トークン'],
      '{time}: {tokens} tokens，{count} 次调用': ['{time}: {tokens} tokens, {count} calls', '{time}：{tokens}トークン、{count}回の呼び出し'],
      ' · 全天': [' · All day', '・終日'],
      'Token 用量': ['Token usage', 'トークン使用量'],
      '每日Token用量与调用次数': ['Daily token usage and calls', '日別のトークン使用量と呼び出し回数'],
      '今日每小时用量与调用次数': ["Today's hourly usage and calls", '今日の時間別使用量と呼び出し回数'],
      '调用次数': ['Calls', '呼び出し回数'],
      '少': ['Less', '少'],
      '多': ['More', '多'],
      '热力图翻页': ['Heatmap pagination', 'ヒートマップのページ切り替え'],
      '当前显示的日期范围': ['Visible date range', '表示中の日付範囲'],
      '查看更早日期': ['Show earlier dates', '以前の日付を表示'],
      '查看较新日期': ['Show later dates', '以降の日付を表示'],
      '连接模型服务后，可读取的配额会显示在这里': ['Connect a model provider to see available quotas here', 'モデルプロバイダーに接続すると、取得可能な利用枠が表示されます'],
      '上次获取时间：{time}': ['Last fetched: {time}', '最終取得日時：{time}'],
      '未查询': ['Not queried', '未照会'],
      '未获取': ['Not available', '未取得'],
      '未登录': ['Signed out', '未ログイン'],
      '刷新 {name} 配额': ['Refresh {name} quota', '{name}の利用枠を更新'],
      '{name} 配额{status}': ['{name} quota: {status}', '{name}の利用枠：{status}'],
      '已在模型设置中配置，尚未查询配额。': ['Configured in model settings; quota has not been queried yet.', 'モデル設定に登録済みです。利用枠はまだ照会されていません。'],
      '尚未获取到有效配额，可刷新重试。': ['No valid quota data yet. Refresh to try again.', '有効な利用枠を取得できていません。更新して再試行してください。'],
      '上限 {amount}': ['Limit {amount}', '上限 {amount}'],
      '剩余 {value}': ['{value} remaining', '残り{value}'],
      '重置时间：{time}': ['Resets at: {time}', 'リセット日時：{time}'],
      '即将重置': ['Resetting soon', 'まもなくリセット'],
      '{minutes} 分钟后重置': ['Resets in {minutes} min', '{minutes}分後にリセット'],
      '{hours} 小时{minutes}后重置': ['Resets in {hours}h{minutes}', '{hours}時間{minutes}後にリセット'],
      ' {minutes} 分': [' {minutes}m', '{minutes}分'],
      '{days} 天{hours}后重置': ['Resets in {days}d{hours}', '{days}日{hours}後にリセット'],
      ' {hours} 小时': [' {hours}h', '{hours}時間'],
      '刷新 {name} 账号与积分': ['Refresh {name} account and credits', '{name}のアカウントとクレジットを更新'],
      '剩余积分合计': ['Total remaining credits', '残りクレジット合計'],
      '有效套餐 {active} / {total} 个': ['Active plans {active} / {total}', '有効なプラン {active} / {total}'],
      '套餐': ['Plan', 'プラン'],
      '{name} 剩余 {percent}%': ['{name}: {percent}% remaining', '{name}：残り{percent}%'],
      '计费套餐': ['Billing plan', '課金プラン'],
      '使用中': ['In use', '利用中'],
      '{value} 积分': ['{value} credits', '{value}クレジット'],
      '收起其余套餐': ['Collapse other plans', '他のプランを折りたたむ'],
      '展开其余 {count} 个套餐': ['Show {count} more plans', '残り{count}件のプランを表示'],
      '免费': ['Free', '無料'],
      '{value} 积分/次': ['{value} credits/call', '1回あたり{value}クレジット'],
      '模型优惠': ['Model offers', 'モデルの特典'],
      '自动获取剩余余额': ['Fetch remaining balance automatically', '残高を自動取得'],
      '自动查询费用提醒': ['Automatic query cost notice', '自動照会の料金に関する確認'],
      '自动查询可能会消耗少量余额，具体取决于供应商的计费规则。确认开启后，将立即获取一次，之后按所选间隔更新。': ['Automatic queries may incur a small charge, depending on the provider. Enabling this fetches once immediately, then updates at the selected interval.', '自動照会では、プロバイダーの料金設定によって少額の残高が消費される場合があります。有効にすると直ちに1回取得し、以後は選択した間隔で更新します。'],
      '确认开启': ['Enable', '有効にする'],
      '取消': ['Cancel', 'キャンセル'],
      '自动获取间隔': ['Automatic refresh interval', '自動取得の間隔'],
      '10 分钟': ['10 minutes', '10分'],
      '1 小时': ['1 hour', '1時間'],
      '5 小时': ['5 hours', '5時間'],
      '每天': ['Daily', '毎日'],
      '下次获取：{time} · 当前设置：{interval}': ['Next fetch: {time} · Interval: {interval}', '次回取得：{time}・現在の間隔：{interval}'],
      '当前设置：{interval}': ['Current interval: {interval}', '現在の間隔：{interval}'],
      '高级模型选择器': ['Advanced model selector', '詳細モデル選択'],
      '已关闭，已恢复官方模型选择器': ['Disabled; the default model selector is restored', '無効にしました。標準のモデル選択に戻りました'],
      '已开启高级模型选择器': ['Advanced model selector enabled', '詳細モデル選択を有効にしました'],
      '配额查询': ['Quota queries', '利用枠の照会'],
      '刷新供应商列表': ['Refresh provider list', 'プロバイダー一覧を更新'],
      '查询来源': ['Query source', '照会元'],
      '正在加载供应商…': ['Loading providers…', 'プロバイダーを読み込み中…'],
      '选择已有供应商': ['Select a provider', 'プロバイダーを選択'],
      '已保存自定义查询': ['Saved custom query', '保存済みのカスタム照会'],
      '内置扩展查询': ['Built-in extension query', '拡張機能の標準照会'],
      '内置供应商查询': ['Built-in provider query', 'プロバイダーの標準照会'],
      '尚无可选来源，请先添加模型供应商或启用支持的扩展。': ['No sources available. Add a model provider or enable a supported extension.', '照会元がありません。モデルプロバイダーを追加するか、対応する拡張機能を有効にしてください。'],
      '正在查询…': ['Querying…', '照会中…'],
      '查询配额': ['Query quota', '利用枠を照会'],
      '查询模板（JSON）': ['Query template (JSON)', '照会テンプレート（JSON）'],
      '重置模板': ['Reset template', 'テンプレートをリセット'],
      '用 AI 生成模板': ['Generate a template with AI', 'AIでテンプレートを作成'],
      '复制提示词': ['Copy prompt', 'プロンプトをコピー'],
      '可复制的模板生成提示词': ['Template generation prompt', 'テンプレート作成用プロンプト'],
      '已复制，粘贴到任意 AI 对话即可': ['Copied. Paste into an AI chat.', 'コピーしました。AIのチャットに貼り付けてください'],
      '复制失败，请手动选中下方提示词': ['Copy failed. Select the prompt below to copy it manually.', 'コピーできませんでした。下のプロンプトを選択して手動でコピーしてください'],
      '正在测试…': ['Testing…', 'テスト中…'],
      '测试查询': ['Test query', '照会をテスト'],
      '正在保存…': ['Saving…', '保存中…'],
      '确认并显示': ['Confirm and display', '確定して表示'],
      '测试会发起一次请求，可能消耗少量余额。': ['Testing sends one request and may incur a small charge.', 'テストでは1回リクエストを送信します。少額の残高が消費される場合があります。'],
      '测试成功 · {name}': ['Test successful · {name}', 'テスト成功・{name}'],
      '已启用的自定义查询': ['Enabled custom queries', '有効なカスタム照会'],
      '编辑': ['Edit', '編集'],
      '移除': ['Remove', '削除'],
      '正在读取设置…': ['Loading settings…', '設定を読み込み中…'],
      '设置已保存': ['Settings saved', '設定を保存しました'],
      '已保存，可在配额页查看此供应商。': ['Saved. This provider is now available on the quota tab.', '保存しました。利用枠タブでこのプロバイダーを確認できます。'],
      '已移除自定义查询，恢复内置配额查询。': ['Custom query removed; the built-in quota query is restored.', 'カスタム照会を削除し、標準の利用枠照会に戻しました。'],
      '查询已更新，可在配额页查看。': ['Query updated. View it on the quota tab.', '照会を更新しました。利用枠タブで確認できます。'],
      '请先在 WorkBuddy 中登录。': ['Sign in to WorkBuddy first.', '先にWorkBuddyにログインしてください。'],
      '尚未获取到配额，请检查扩展是否启用后重试。': ['Quota is not available yet. Check that the extension is enabled and try again.', '利用枠をまだ取得できていません。拡張機能が有効か確認して再試行してください。'],
      '模板不是有效 JSON，请检查引号、逗号和括号。': ['Invalid JSON template. Check quotes, commas and brackets.', 'テンプレートのJSONが無効です。引用符、カンマ、括弧を確認してください。'],
      '重试': ['Retry', '再試行'],
      '自动': ['Auto', '自動'],
      '默认': ['Default', '既定'],
      '关': ['Off', 'オフ'],
      '极简': ['Minimal', '最小'],
      '低': ['Low', '低'],
      '中': ['Medium', '中'],
      '高': ['High', '高'],
      '极高': ['Extra high', '非常に高い'],
      '极致': ['Maximum', '最大'],
      '推理强度': ['Reasoning effort', '推論の強度'],
      '‹ 模型': ['‹ Models', '‹ モデル'],
      '模型目录加载失败': ['Failed to load model catalog', 'モデル一覧を読み込めませんでした'],
      '加载中…': ['Loading…', '読み込み中…'],
      '选择模型': ['Select a model', 'モデルを選択'],
      '账户可用余额': ['Available balance', '利用可能な残高'],
      '账户可用额度': ['Available credit', '利用可能なクレジット'],
      '充值余额': ['Paid balance', 'チャージ残高'],
      '赠送余额': ['Gift balance', '付与残高'],
      '预付费余额': ['Prepaid balance', '前払い残高'],
      '密钥额度': ['API key allowance', 'APIキーの利用枠'],
      '余额': ['Balance', '残高'],
      '{hours} 小时剩余': ['{hours}-hour remaining', '{hours}時間枠の残り'],
      '周剩余': ['Weekly remaining', '週間枠の残り'],
      '月剩余': ['Monthly remaining', '月間枠の残り'],
      '窗口剩余': ['Window remaining', '期間枠の残り'],
      '积分剩余': ['Credits remaining', '残りクレジット'],
      'Token 配额剩余': ['Tokens remaining', '残りトークン枠'],
      '高级请求剩余': ['Premium requests remaining', '残りプレミアムリクエスト'],
      '聊天请求剩余': ['Chat requests remaining', '残りチャットリクエスト'],
      '补全请求剩余': ['Completion requests remaining', '残り補完リクエスト'],
      'Claude 订阅': ['Claude subscription', 'Claudeサブスクリプション'],
      'OpenAI Codex 订阅': ['OpenAI Codex subscription', 'OpenAI Codexサブスクリプション'],
      'StepFun 阶跃星辰': ['StepFun', 'StepFun'],
      'Moonshot AI 国内': ['Moonshot AI China', 'Moonshot AI 中国'],
      'MiniMax 国际': ['MiniMax Global', 'MiniMax グローバル'],
      'MiniMax 国内': ['MiniMax China', 'MiniMax 中国'],
      '智谱 GLM Coding': ['Zhipu GLM Coding', 'Zhipu GLM Coding'],
      '阿里云 Token Plan 国内': ['Alibaba Cloud Token Plan China', 'Alibaba Cloud Token Plan 中国'],
      '配额窗口 {index}': ['Quota window {index}', '利用枠の期間 {index}'],
      '其他模型': ['Other models', 'その他のモデル'],
      '查询模板应为 JSON 对象，且不超过 16 KB。': ['The query template must be a JSON object of at most 16 KB.', '照会テンプレートは16 KB以下のJSONオブジェクトにしてください。'],
      '请填写配额查询 URL。': ['Enter a quota query URL.', '利用枠照会のURLを入力してください。'],
      '查询 URL 格式无效。': ['Invalid query URL.', '照会URLの形式が無効です。'],
      '查询 URL 需使用 HTTPS；本机供应商可使用 HTTP。': ['Use HTTPS for the query URL. Local providers may use HTTP.', '照会URLにはHTTPSを使用してください。ローカルのプロバイダーはHTTPも使用できます。'],
      '请使用供应商凭据认证，不要把密钥放入 URL。': ['Use provider credentials; do not put API keys in the URL.', 'プロバイダーの認証情報を使用し、URLにキーを含めないでください。'],
      '查询方法仅支持 GET 或 POST。': ['Only GET and POST queries are supported.', '照会方法はGETまたはPOSTのみ対応しています。'],
      'auth 仅支持 provider 或 none。': ['auth must be provider or none.', 'authはproviderまたはnoneにしてください。'],
      'headers 应为 JSON 对象，最多 20 项。': ['headers must be a JSON object with at most 20 entries.', 'headersは20項目以下のJSONオブジェクトにしてください。'],
      '认证由供应商凭据提供，请移除模板中的密钥或认证请求头。': ['Authentication uses provider credentials. Remove keys and authentication headers from the template.', '認証にはプロバイダーの認証情報を使用します。テンプレート内のキーや認証ヘッダーを削除してください。'],
      '请求头值应为单行文本。': ['Header values must be single-line text.', 'ヘッダーの値は1行のテキストにしてください。'],
      'GET 查询不能包含 body。': ['GET queries cannot include a body.', 'GET照会にbodyは指定できません。'],
      'POST body 应为 JSON 对象或数组。': ['The POST body must be a JSON object or array.', 'POSTのbodyはJSONオブジェクトまたは配列にしてください。'],
      '请使用供应商凭据认证，不要在 body 中填写密钥。': ['Use provider credentials; do not put API keys in the body.', 'プロバイダーの認証情報を使用し、bodyにキーを含めないでください。'],
      '请填写 response 字段映射。': ['Enter response field mappings.', 'responseのフィールドマッピングを入力してください。'],
      '此供应商没有内置解析器，请使用 response.metrics 映射。': ['This provider has no built-in parser. Use response.metrics mappings.', 'このプロバイダーには標準の解析処理がありません。response.metricsのマッピングを使用してください。'],
      'response.metrics 需包含 1–20 个指标。': ['response.metrics must contain 1–20 metrics.', 'response.metricsには1～20個の指標を指定してください。'],
      'response.rows 应为数组字段路径。': ['response.rows must be an array field path.', 'response.rowsには配列のフィールドパスを指定してください。'],
      '每个指标需填写 label 和 kind（amount 或 window）。': ['Each metric needs label and kind (amount or window).', '各指標にlabelとkind（amountまたはwindow）を指定してください。'],
      '指标字段路径应为不超过 200 字符的文本。': ['Metric field paths must be text of at most 200 characters.', '指標のフィールドパスは200文字以下にしてください。'],
      '余额指标需提供 remaining，或 total 与 used 字段路径。': ['Balance metrics need remaining, or both total and used field paths.', '残高指標にはremaining、またはtotalとusedのフィールドパスを指定してください。'],
      '配额指标需提供百分比或总量与剩余量字段路径。': ['Quota metrics need a percentage, or total and remaining field paths.', '利用枠指標には割合、または総量と残量のフィールドパスを指定してください。'],
      '查询响应过大（上限 1 MB）。': ['Query response exceeds the 1 MB limit.', '照会の応答が上限の1 MBを超えています。'],
      '查询未返回 JSON 数据。': ['The query did not return JSON.', '照会結果がJSONではありません。'],
      '查询响应不是有效 JSON，或读取已超时。': ['The response is invalid JSON or timed out.', '応答のJSONが無効か、読み取りがタイムアウトしました。'],
      '所选供应商已不存在，请重新选择。': ['The selected provider no longer exists. Select another provider.', '選択したプロバイダーが見つかりません。選択し直してください。'],
      'HTTP 本机查询地址需与供应商配置地址同源。': ['Local HTTP queries must use the configured provider origin.', 'ローカルHTTP照会にはプロバイダー設定と同じオリジンを使用してください。'],
      '认证查询地址需与所选供应商的地址或官方配额地址同源。': ['Authenticated queries must use the provider or official quota origin.', '認証付き照会にはプロバイダーまたは公式の利用枠URLと同じオリジンを使用してください。'],
      '未找到可用的供应商凭据，请先在模型设置中配置或登录。': ['No provider credentials found. Configure them or sign in in model settings.', 'プロバイダーの認証情報がありません。モデル設定で登録するか、ログインしてください。'],
      '未配置 xAI 管理凭据和团队 ID。': ['xAI management credentials and team ID are not configured.', 'xAIの管理用認証情報とチームIDが設定されていません。'],
      '查询失败，请检查地址和网络（8 秒超时，不跟随重定向）。': ['Query failed. Check the URL and network (8-second timeout; redirects disabled).', '照会に失敗しました。URLとネットワークを確認してください（8秒でタイムアウト、リダイレクトなし）。'],
      '查询返回 HTTP {status}，请检查地址和供应商凭据。': ['Query returned HTTP {status}. Check the URL and provider credentials.', '照会結果はHTTP {status}でした。URLとプロバイダーの認証情報を確認してください。'],
      '响应中未找到有效配额，请检查 response 的字段路径。': ['No valid quota found. Check the response field paths.', '有効な利用枠が見つかりません。responseのフィールドパスを確認してください。'],
      '未知配额来源。': ['Unknown quota source.', '利用枠の照会元が不明です。'],
      '此来源使用内置适配器，无需填写 HTTP 查询模板。': ['This source uses a built-in adapter; no HTTP template is needed.', 'この照会元は標準のアダプターを使用します。HTTPテンプレートは不要です。'],
      '设置应为 JSON 对象。': ['Settings must be a JSON object.', '設定はJSONオブジェクトにしてください。'],
      '模板已修改或测试已过期，请重新测试后确认。': ['The template changed or the test expired. Test again before confirming.', 'テンプレートが変更されたか、テスト結果の期限が切れました。再テストしてから確定してください。'],
      '自定义查询最多支持 50 个供应商。': ['Custom queries support up to 50 providers.', 'カスタム照会は最大50プロバイダーまで対応しています。'],
      '自动查询开关值无效。': ['Invalid automatic query switch value.', '自動照会のスイッチ値が無効です。'],
      '请先确认自动查询可能会消耗少量余额。': ['Confirm that automatic queries may incur a small charge.', '自動照会で少額の残高が消費される場合があることを確認してください。'],
      '仅支持 10 分钟、1 小时、5 小时或每天。': ['Supported intervals: 10 minutes, 1 hour, 5 hours or daily.', '間隔は10分、1時間、5時間、または毎日のみ対応しています。'],
      '模型明细开关值无效。': ['Invalid model details switch value.', 'モデル詳細のスイッチ値が無効です。'],
      '高级模型选择器开关值无效。': ['Invalid advanced model selector switch value.', '詳細モデル選択のスイッチ値が無効です。'],
      '未知设置操作。': ['Unknown settings action.', '設定の操作が不明です。'],
      '设置保存失败，请检查存储目录权限。': ['Failed to save settings. Check storage directory permissions.', '設定を保存できませんでした。保存先フォルダーの権限を確認してください。'],
      '未知 WorkBuddy 积分来源。': ['Unknown WorkBuddy credit source.', 'WorkBuddyのクレジット取得元が不明です。'],
      '用量统计暂时不可用，请稍后重试。': ['Usage statistics are temporarily unavailable. Try again later.', '利用状況を現在取得できません。しばらくしてから再試行してください。'],
      '请求来源不受信任。': ['The request origin is not trusted.', 'リクエストの送信元が信頼されていません。'],
      '操作失败，请稍后重试。': ['The operation failed. Try again later.', '操作に失敗しました。しばらくしてから再試行してください。'],
      '该供应商': ['this provider', 'このプロバイダー'],
      '请帮我为「{name}」写一份 DSH 用量统计插件的余额查询模板（JSON）。': ['Write a balance query template (JSON) for "{name}" for the DSH usage statistics plugin.', 'DSH利用状況プラグイン用に「{name}」の残高照会テンプレート（JSON）を作成してください。'],
      '【输出要求】': ['[Output requirements]', '【出力要件】'],
      '只输出一个 JSON 对象，不要解释、不要 markdown 代码块围栏。': ['Output one JSON object only, without explanations or Markdown code fences.', 'JSONオブジェクトを1つだけ出力し、説明やMarkdownのコードフェンスは付けないでください。'],
      '【获取接口信息的方式】': ['[Finding API details]', '【API情報の調べ方】'],
      '请先自己联网搜索「{name}」的余额 / 用量查询接口文档，不要一上来就找我要资料。': ['First search online for the balance / usage API documentation for "{name}" before asking me for information.', 'まず「{name}」の残高・使用量照会APIのドキュメントを検索してください。最初から資料を求めないでください。'],
      '优先按下面的顺序查：官方 API 文档 → 余额或 billing / usage 接口说明 → 社区示例或 SDK 源码。': ['Search in this order: official API docs → balance or billing / usage API docs → community examples or SDK source.', '公式APIドキュメント → 残高・billing / usage APIの説明 → コミュニティの例やSDKソースの順に調べてください。'],
      '如果能查到明确的接口地址与返回字段，直接据此写出模板。': ['If the endpoint and response fields are documented, use them to write the template.', 'APIのURLと応答フィールドを確認できた場合は、それに基づいてテンプレートを作成してください。'],
      '只有在确实查不到、或查到多个互相冲突的结果时，才向我提问；提问要具体，一次只问最关键的一点。': ['Ask me only if information is unavailable or contradictory. Ask one specific, essential question at a time.', '情報が見つからないか矛盾する場合にだけ質問してください。一度に最も重要な点を1つ、具体的に尋ねてください。'],
      '如果你搜索到的是猜测而非确定的字段路径，请在回答里简要注明依据，方便我核对。': ['If a field path is inferred rather than confirmed, briefly state the evidence so I can verify it.', 'フィールドパスが確認済みではなく推測の場合は、確認できるよう根拠を簡潔に示してください。'],
      '【字段说明】': ['[Fields]', '【フィールドの説明】'],
      'url：查询地址，必须与下面 auth 所用凭据同源。': ['url: query URL, on the same origin as the credentials used by auth.', 'url：照会URL。authで使用する認証情報と同じオリジンにしてください。'],
      'method：GET 或 POST。': ['method: GET or POST.', 'method：GETまたはPOST。'],
      'auth："provider" 表示复用该供应商已保存的凭据；"none" 表示不需要认证。': ['auth: "provider" reuses saved provider credentials; "none" means no authentication.', 'auth："provider"は保存済みの認証情報を使用し、"none"は認証なしを意味します。'],
      'headers：可选，附加请求头对象。': ['headers: optional additional request headers object.', 'headers：任意。追加のリクエストヘッダーのオブジェクト。'],
      'body：可选，POST 时发送的请求体对象。': ['body: optional request body object for POST.', 'body：任意。POSTで送信するリクエスト本文のオブジェクト。'],
      'response.rows：可选。当余额在数组里时填写该数组的字段路径，例如 "data.list"。': ['response.rows: optional array field path when balances are in an array, e.g. "data.list".', 'response.rows：任意。残高が配列にある場合、そのフィールドパスを指定します。例："data.list"。'],
      'response.metrics：指标数组，每项包含：': ['response.metrics: an array of metrics, each containing:', 'response.metrics：指標の配列。各項目には次のフィールドを含めます：'],
      '  label：界面显示的名称，例如 "账户可用余额"。': ['  label: display name, e.g. "Available balance".', '  label：画面に表示する名称。例："利用可能な残高"。'],
      '  kind："amount" 表示金额，"window" 表示带重置时间的额度窗口。': ['  kind: "amount" for balances, "window" for quota windows with reset times.', '  kind："amount"は金額、"window"はリセット日時のある利用枠。'],
      '  remaining：金额型指标在响应中的字段路径，例如 "data.balance"。': ['  remaining: response field path for an amount metric, e.g. "data.balance".', '  remaining：金額指標の応答フィールドパス。例："data.balance"。'],
      '  usedPercent / remainingPercent：额度窗口型指标使用，取值为百分比字段路径。': ['  usedPercent / remainingPercent: percentage field paths for quota window metrics.', '  usedPercent / remainingPercent：期間枠指標の割合を示すフィールドパス。'],
      '  currency：可选，金额单位，如 "CNY" 或 "USD"。': ['  currency: optional currency, e.g. "CNY" or "USD".', '  currency：任意。通貨単位。例："CNY"または"USD"。'],
      '【取值规则】': ['[Value rules]', '【値の指定方法】'],
      '字段路径用点号表示层级，例如 data.balance_infos.0.total_balance。': ['Use dot-separated field paths, e.g. data.balance_infos.0.total_balance.', 'フィールドパスの階層はドットで区切ります。例：data.balance_infos.0.total_balance。'],
      '数字字符串也要能直接使用，不要额外包装。': ['Numeric strings should work directly without extra wrappers.', '数値文字列も追加のラッパーなしでそのまま使用できるようにしてください。'],
      '【参考格式】': ['[Example format]', '【参考形式】'],
      '【当前情况】': ['[Current context]', '【現在の状況】'],
      '供应商 ID：{provider}': ['Provider ID: {provider}', 'プロバイダーID：{provider}'],
      '（未指定）': ['(not specified)', '（未指定）'],
      '现有模板（可在此基础上修正）：\n': ['Existing template (you may revise it):\n', '現在のテンプレート（修正の参考にしてください）：\n'],
      '该供应商目前没有模板，请从零编写。': ['This provider has no template yet. Write one from scratch.', 'このプロバイダーにはまだテンプレートがありません。新規に作成してください。'],
    }

    function t(text, params) {
      if (translate) return translate(text, params)
      return String(text || '').replace(/\{(\w+)\}/g, function (match, key) { return params && key in params ? String(params[key]) : match })
    }

    function currentLanguage() {
      return localeService ? String(localeService.getSnapshot().active).toLowerCase().split('-')[0] : 'zh'
    }

    function useLocaleRevision() {
      if (localeService && React.useSyncExternalStore) React.useSyncExternalStore(function (listener) { return localeService.subscribe(listener) }, function () { return localeService.getSnapshot() })
    }

    function quotaLabel(label, custom) {
      if (custom) return label
      var hours = /^(.*?)(\d+(?:\.\d+)?) 小时剩余$/.exec(label)
      if (hours) return hours[1] + t('{hours} 小时剩余', { hours: hours[2] })
      var period = /^(.*?)(周剩余|月剩余|窗口剩余)$/.exec(label)
      var window = /^配额窗口 (\d+)$/.exec(label)
      return period ? period[1] + t(period[2]) : window ? t('配额窗口 {index}', { index: window[1] }) : t(label)
    }

    function uiError(error) {
      var http = /^查询返回 HTTP (\d+)，请检查地址和供应商凭据。$/.exec(error)
      return http ? t('查询返回 HTTP {status}，请检查地址和供应商凭据。', { status: http[1] }) : t(error)
    }

    /* ------------------------------------------------------------------ */
    /* Formatting helpers                                                  */
    /* ------------------------------------------------------------------ */

    function fmt(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
      if (currentLanguage() === 'en' && Math.abs(n) >= 1e9) return Number((n / 1e9).toFixed(2)) + 'B'
      if (currentLanguage() !== 'en' && Math.abs(n) >= 1e8) return Number((n / 1e8).toFixed(2)) + (currentLanguage() === 'ja' ? '億' : '亿')
      if (Math.abs(n) >= 1e6) return Number((n / 1e6).toFixed(2)) + 'M'
      if (Math.abs(n) >= 1e3) return Number((n / 1e3).toFixed(2)) + 'k'
      return String(Math.round(n))
    }

    function fmtExact(n) {
      return Number(n || 0).toLocaleString(currentLanguage() === 'zh' ? 'zh-CN' : currentLanguage() === 'ja' ? 'ja-JP' : 'en-US')
    }

    /** Human countdown to a quota reset, e.g. "3小时21分后" / "2天后". */
    function fmtReset(iso) {
      if (!iso) return ''
      var ms = new Date(iso).getTime() - Date.now()
      if (!(ms > 0)) return t('即将重置')
      var totalMin = Math.ceil(ms / 60000)
      if (totalMin < 60) return t('{minutes} 分钟后重置', { minutes: totalMin })
      var h = Math.floor(totalMin / 60)
      var m = totalMin % 60
      if (h < 24) return t('{hours} 小时{minutes}后重置', { hours: h, minutes: m > 0 ? t(' {minutes} 分', { minutes: m }) : '' })
      var d = Math.floor(h / 24)
      var hr = h % 24
      return t('{days} 天{hours}后重置', { days: d, hours: hr > 0 ? t(' {hours} 小时', { hours: hr }) : '' })
    }

    /** Format a timestamp at a fixed UTC offset (UTC - local minutes). */
    function fmtInTz(dateOrMs, tzMin) {
      if (!dateOrMs) return '—'
      var d = new Date(dateOrMs)
      if (Number.isNaN(d.getTime())) return '—'
      var shifted = new Date(d.getTime() - tzMin * 60000)
      var y = shifted.getUTCFullYear()
      var mo = String(shifted.getUTCMonth() + 1).padStart(2, '0')
      var day = String(shifted.getUTCDate()).padStart(2, '0')
      var h = String(shifted.getUTCHours()).padStart(2, '0')
      var min = String(shifted.getUTCMinutes()).padStart(2, '0')
      var s = String(shifted.getUTCSeconds()).padStart(2, '0')
      return y + '-' + mo + '-' + day + ' ' + h + ':' + min + ':' + s
    }

    /** Desktop-local tz offset in "UTC - local" minutes (API convention). */
    var LOCAL_TZ = (function () {
      try { return new Date().getTimezoneOffset() } catch (e) { return 0 }
    })()

    /**
     * "上次获取" line shown under each quota card. Accepts a millisecond
     * timestamp or an ISO string; anything missing or unparseable yields '—'
     * so the row keeps its height and never shows "Invalid Date".
     */
    function fmtFetched(value) {
      if (value === null || value === undefined || value === '') return '—'
      var ms = typeof value === 'number' ? value : new Date(value).getTime()
      if (!Number.isFinite(ms) || ms <= 0) return '—'
      var d = new Date(ms)
      if (Number.isNaN(d.getTime())) return '—'
      var p = function (n) { return String(n).padStart(2, '0') }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

    // Keep tiny positive shares visible instead of rounding them to 0%.
     function formatPct(value) {
       var pct = Number(value) || 0
       if (pct === 0) return '0%'
       var digits = 1
       while (digits < 6 && Number(pct.toFixed(digits)) === 0) digits += 1
       return pct.toFixed(digits).replace(/\.?(0+)$/, '') + '%'
     }

     function monthShort(dateKey) {
      var parts = String(dateKey).split('-')
      if (parts.length !== 3) return ''
      var month = Number(parts[1])
      if (!(month >= 1 && month <= 12)) return ''
      return new Intl.DateTimeFormat(currentLanguage() === 'en' ? 'en-US' : 'ja-JP', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)))
    }

    function readJson(response) {
      return response.json().then(function (body) {
        if (!response.ok || (body && body.ok === false)) throw new Error((body && body.error) || ('HTTP ' + response.status))
        return body
      })
    }

    /** Desktop API client, forwarded to the local host by the dsh-app protocol. */
    var UsageApi = (function () {
      function UsageApi() {}
      UsageApi.prototype.stats = function (opts) {
        var search = new URLSearchParams()
        if (opts.days > 0) search.set('days', String(opts.days))
        if (opts.model) search.set('model', opts.model)
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/stats' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.providerQuotas = function (opts) {
        var search = new URLSearchParams()
        if (opts && opts.fresh) search.set('fresh', '1')
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/provider-quotas' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      /**
       * WorkBuddy's display-only document through our host cache. Only an
       * explicit refresh or the enabled host timer calls the plugin upstream.
       * Shape:
       * { status: 'signed-in'|'signed-out', nickname?, expiresAt?, models?,
       *   credits?: { total, accounts: [{ packageName, remain, size }] },
       *   creditsError? }.
       */
      UsageApi.prototype.workbuddyStatus = function (opts) {
        var source = opts && opts.source === 'workbuddy-ai' ? 'workbuddy-ai' : 'workbuddy'
        return fetch('/api/dsh-usage-stats/' + source + (opts && opts.fresh ? '?fresh=1' : ''), {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        }).then(readJson)
      }
      UsageApi.prototype.quotaSource = function (source, opts) {
        return fetch('/api/dsh-usage-stats/' + encodeURIComponent(source) + (opts && opts.fresh ? '?fresh=1' : ''), {
          headers: { accept: 'application/json' },
        }).then(readJson)
      }
      UsageApi.prototype.controls = function (patch) {
        return fetch('/api/dsh-usage-stats/controls', patch === undefined ? { headers: { accept: 'application/json' } } : {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(patch),
        }).then(readJson)
      }
      UsageApi.prototype.quotaProviders = function () {
        return fetch('/api/dsh-usage-stats/quota-providers', { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.testQuota = function (provider, template) {
        return fetch('/api/dsh-usage-stats/quota-test', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ provider: provider, template: template }),
        }).then(readJson)
      }
      return UsageApi
    })()

    /* ------------------------------------------------------------------ */
    /* Styles — DSH alias tokens (legible in light and dark themes)        */
    /* ------------------------------------------------------------------ */

    var navIconMask = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5h11M4 11.5v-3M8 11.5v-5M12 11.5v-8"/></svg>')
    // Doubles as the dshus-select chevron: the stroke is painted with
    // currentColor, so one data URI follows the field colour in either theme.
    var selectChevronMask = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5 8 10.5 12 6.5"/></svg>')
    var styles = [
      '[data-dshus-nav-icon] > svg { display: none; }',
      '[data-dshus-nav-icon]::before { content: ""; width: 16px; height: 16px; flex: none; background: currentColor; -webkit-mask: url("' + navIconMask + '") center / contain no-repeat; mask: url("' + navIconMask + '") center / contain no-repeat; }',
      // Keep the toolbar outside the panels' size-containment context.
      '.dshus-page { font-family: var(--dsw-font-family, ui-sans-serif, system-ui, sans-serif); color: var(--dsw-alias-label-primary, #1f2430); box-sizing: border-box; min-height: 100%; overflow-anchor: none; --dshus-heat: #22c55e; }',
      '.dshus-page * { box-sizing: border-box; }',
      '.dshus-panels { container-type: inline-size; }',
      '.dshus-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); }',
      '.dshus-setting-row:last-child { border-bottom: 0; padding-bottom: 0; }',
      '.dshus-setting-label { display: block; font-size: 14px; font-weight: 500; line-height: 22px; }',
      '.dshus-setting-help { margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }',
      // The switch owns its own on/off palette: brand-primary is near-white in the
      // dark theme, so using it as the "on" track made the two states look alike.
      // Both track states contrast with the near-white knob, so the knob stays
      // visible whether the switch is on or off, in either theme.
      '.dshus-switch { flex: none; position: relative; width: 38px; height: 22px; padding: 0; border: 1px solid transparent; border-radius: 11px; background: var(--dshus-switch-off, #b8bcc4); cursor: pointer; transition: background-color .15s ease; }',
      '.dshus-switch.on, .dshus-switch[aria-checked="true"] { background: var(--dshus-switch-on, #2563eb); }',
      '.dshus-switch::after { content: ""; position: absolute; top: 50%; left: 2px; width: 16px; height: 16px; margin-top: -8px; border-radius: 50%; background: var(--dshus-switch-knob, #f9fafb); box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease; }',
      '.dshus-switch.on::after, .dshus-switch[aria-checked="true"]::after { transform: translateX(16px); }',
      '.dshus-switch:disabled { opacity: .55; cursor: wait; }',
      '.dshus-switch:focus-visible, .dshus-field:focus-visible { outline: 2px solid var(--dsh-alias-brand-primary, #3b82f6); outline-offset: 3px; }',
      '.dshus-field { min-width: 0; max-width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l2, #414144); border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 13px; color-scheme: inherit; }',
      '.dshus-field:disabled { opacity: .6; }',
      '.dshus-field option { background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-field::placeholder { color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      // A native <select> renders its own control inside the box we style, so the
      // list arrow lands wherever the platform puts it and the height/typography
      // drift from the rest of the form. This one is appearance:none with a
      // hand-placed arrow, sized to the same 34px rhythm as the picker trigger.
      '.dshus-select { appearance: none; -webkit-appearance: none; width: 148px; min-height: 34px; padding: 0 32px 0 12px; font-size: 13px; line-height: 20px; cursor: pointer; background-image: url("' + selectChevronMask + '"); background-repeat: no-repeat; background-position: right 11px center; background-size: 14px 14px; }',
      '.dshus-select:hover:not(:disabled) { border-color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      '.dshus-select:disabled { cursor: default; background-image: none; }',
      '.dshus-select::-ms-expand { display: none; }',
      '.dshus-provider-picker { position: relative; margin-top: 8px; }',
      '.dshus-query-select { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; text-align: left; cursor: pointer; }',
      '.dshus-query-select:disabled { cursor: default; }',
      '.dshus-provider-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-provider-dot { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #16a34a; }',
      '.dshus-provider-chevron { flex: none; width: 14px; height: 14px; }',
      '.dshus-provider-list { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0; padding: 4px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border: 1px solid var(--dsw-alias-border-l2, #414144); border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); box-shadow: 0 4px 12px rgba(0,0,0,.16); }',
      '.dshus-provider-list.above { top: auto; bottom: calc(100% + 4px); }',
      '.dshus-provider-option { display: flex; align-items: center; gap: 12px; min-height: 34px; padding: 6px 8px; border-radius: 4px; font-size: 13px; line-height: 22px; cursor: pointer; }',
      '.dshus-provider-option.active { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.dshus-provider-option[aria-selected="true"] { font-weight: 600; }',
      '.dshus-query-editor { display: block; width: 100%; min-height: 250px; margin-top: 8px; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 1.6; tab-size: 2; }',
      '.dshus-prompt { margin-top: 12px; border: 1px solid var(--dsw-alias-border-l2, #414144); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); overflow: hidden; }',
      '.dshus-prompt-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); }',
      '.dshus-prompt-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-prompt-copy { height: 26px; font-size: 12px; }',
      // The prompt is meant to be selected and copied, so it scrolls rather than
      // truncates and keeps the monospace rhythm of the JSON editor above it.
      '.dshus-prompt-body { margin: 0; padding: 10px; max-height: 190px; overflow: auto; overscroll-behavior: contain; font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary, #1f2430); user-select: text; }',
      '.dshus-prompt-body:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: -3px; }',
      '.dshus-prompt-note { margin: 0; padding: 7px 10px; border-top: 1px solid var(--dsw-alias-border-l2, #414144); font-size: 12px; color: var(--dsw-alias-brand-primary, #3b82f6); }',
      '.dshus-cost-note { margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b7280); }',
      '.dshus-control-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }',
      '.dshus-confirm { margin-top: 12px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #414144); background: var(--dsw-alias-bg-layer-3, #f3f4f6); border-radius: 8px; }',
      '.dshus-confirm p { margin: 0; font-size: 13px; line-height: 1.6; }',
      '.dshus-query-preview { margin-top: 12px; padding: 10px 0; border-top: 1px solid var(--dsw-alias-border-l2, #414144); font-size: 13px; line-height: 1.8; }',
      '.dshus-control-status { font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); line-height: 1.6; }',
      '.dshus-saved-query { display: flex; align-items: center; gap: 8px; padding-top: 10px; font-size: 13px; }',
      '.dshus-saved-query span { flex: 1; min-width: 0; overflow-wrap: anywhere; }',
      '@container (max-width: 420px) { .dshus-setting-row { gap: 10px; } .dshus-select { width: 120px; } }',
      // Title and tabs share one sticky box: no guessed offset or independent
      // pinning. Reserve the refresh button's height even on the control tab.
      '.dshus-toolbar { position: sticky; top: 0; z-index: 3; margin-bottom: 16px; background: var(--dsw-alias-bg-layer-2, #fff); }',
      '.dshus-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 46px; padding: 4px 4px 12px 0; }',
      '.dshus-brand { display: flex; flex: 1; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; }',
      '.dshus-brand-icon { display: inline-block; width: 17px; height: 17px; flex: none; background: currentColor; -webkit-mask: url("' + navIconMask + '") center / contain no-repeat; mask: url("' + navIconMask + '") center / contain no-repeat; }',
      '.dshus-title { flex: none; font-size: 15px; font-weight: 400; letter-spacing: 0.01em; line-height: 22px; margin: 0; white-space: nowrap; }',
      '.dshus-brand-meta { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; line-height: 20px; white-space: nowrap; }',
      '.dshus-brand-link { min-width: 0; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }',
      '.dshus-brand-link:visited { color: var(--dsw-alias-label-secondary, #6b7280); }',
      '.dshus-brand-link:hover { color: var(--dsw-alias-brand-primary, #3b82f6); text-decoration: underline; }',
      '.dshus-brand-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; border-radius: 2px; }',
      '.dshus-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); }',
      '.dshus-tab { flex: none; margin-bottom: -1px; padding: 9px 18px 11px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary, #9ca3af); font: inherit; font-size: 14px; font-weight: 500; line-height: 20px; cursor: pointer; }',
      '.dshus-tab:hover { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-tab.on { color: var(--dsw-alias-label-primary, #1f2430); border-bottom-color: currentColor; font-weight: 600; }',
      '.dshus-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: -3px; }',
      '.dshus-quota-panel[hidden] { display: none !important; }',
      '.dshus-quota-panel:empty::before { content: attr(data-empty-label); display: block; padding: 32px 16px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 16px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; text-align: center; }',

      '.dshus-tools { display: flex; align-items: center; flex: none; width: 30px; height: 30px; }',
      '.dshus-range { display: flex; align-items: center; gap: 2px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); border-radius: 10px; padding: 3px; }',
      '.dshus-range-btn { height: 24px; padding: 0 11px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }',
      '.dshus-range-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1)); }',
      '.dshus-range-btn.on { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-brand-primary, #3b82f6); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.12); }',
      '.dshus-btn { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }',
      '.dshus-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1)); }',
      '.dshus-btn:disabled { opacity: 0.55; cursor: default; }',
      '.dshus-icon-btn { width: 30px; min-width: 30px; padding: 0; justify-content: center; border-radius: 9px; }',
      '.dshus-icon-btn svg { display: block; width: 16px; height: 16px; }',
      '.dshus-icon-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; }',
      '.dshus-heading-refresh { margin-left: auto; }',
      '.dshus-spin { width: 13px; height: 13px; border: 2px solid var(--dsw-alias-border-l2, #d0d5dd); border-top-color: var(--dsw-alias-brand-primary, #3b82f6); border-radius: 50%; animation: dshus-spin 0.7s linear infinite; display: inline-block; }',
      '@keyframes dshus-spin { to { transform: rotate(360deg); } }',

      /* metric cards */
      '.dshus-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }',
      '@container (max-width: 480px) { .dshus-card { padding: 10px 8px; } .dshus-card .v { font-size: 16px; } }',
      '.dshus-card { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 14px; padding: 14px 14px 12px; min-width: 0; text-align: center; }',
      '.dshus-card .v { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; line-height: 24px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-card .k { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #6b7280); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-card .sub { font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }',

      /* 概览指标 / 配额横向条：同一行内以竖线分割，不再使用独立小卡片 */
      '.dshus-statbar { display: flex; align-items: stretch; flex-wrap: wrap; background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 14px; padding: 14px 6px; }',
      '.dshus-statbar .dshus-stat { position: relative; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 0 10px; text-align: center; }',
      // 竖线用绝对定位画满整行高度：直接给分栏加 border-left 时，分栏自身高度
      // 可能小于行高（内容只有两行文字），竖线就会断掉。
      '.dshus-statbar .dshus-stat + .dshus-stat::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-statbar .dshus-stat .v { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; line-height: 24px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.dshus-statbar .dshus-stat .k { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.dshus-statbar .dshus-stat .sub { font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '@container (max-width: 480px) { .dshus-statbar { padding: 12px 2px; } .dshus-statbar .dshus-stat { padding: 0 6px; } .dshus-statbar .dshus-stat .v { font-size: 16px; line-height: 20px; } }',

      /* 多值余额沿用概览分栏；周期额度逐行对齐名称、进度、百分比与重置时间。 */
      '.dshus-quota-bar { padding: 14px 6px 12px; }',
      '.dshus-quota-bar .dshus-stat { flex: 1 1 160px; }',
      '.dshus-quota-bar .dshus-stat .v { font-size: 22px; line-height: 26px; }',
      '.dshus-quota-bar .dshus-stat .k { margin-top: 2px; }',
      // 余额分栏中零宽的轨道会留下空白；数值与上限直接相邻。
      '.dshus-quota-bar .dshus-stat .dshus-go-track { display: none; }',
      '.dshus-quota-bar .dshus-stat .dshus-go-foot { margin-top: 2px; }',
      // 窄面板中的余额分栏可能换行，统一隐藏竖线，避免出现孤立的分隔线。
      '@container (max-width: 640px) { .dshus-quota-bar .dshus-stat + .dshus-stat::before { display: none; } }',
      '.dshus-fetched { margin-top: 10px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-quota-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 12px; }',
      '.dshus-module .dshus-quota-heading h3 { flex: 1; min-width: 0; margin: 0; overflow-wrap: anywhere; }',
      '.dshus-quota-heading .dshus-fetched { margin-top: 0; }',
      '.dshus-quota-rows { display: grid; gap: 12px; }',
      '.dshus-quota-bar + .dshus-quota-rows { margin-top: 16px; }',
      '.dshus-quota-row { display: grid; grid-template-columns: minmax(128px, 1.2fr) minmax(0, 2fr) 48px minmax(136px, .9fr); align-items: center; gap: 16px; min-height: 24px; }',
      '.dshus-quota-name { min-width: 0; }',
      '.dshus-quota-label { display: block; font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-secondary, #4b5563); overflow-wrap: anywhere; }',
      '.dshus-quota-detail { display: block; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.dshus-quota-row .dshus-go-track { width: 100%; min-width: 0; height: 6px; background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); }',
      '.dshus-quota-pct { font-size: 15px; font-weight: 600; line-height: 22px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.dshus-quota-reset { min-width: 0; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '@container (max-width: 640px) { .dshus-quota-row { grid-template-columns: minmax(96px, 1fr) minmax(0, 2fr) 42px; gap: 4px 12px; } .dshus-quota-name { grid-row: span 2; } .dshus-quota-reset { grid-column: 2 / -1; } .dshus-quota-heading .dshus-fetched { order: 1; flex-basis: 100%; } }',
      '@container (max-width: 360px) { .dshus-quota-row { grid-template-columns: minmax(80px, 1fr) minmax(0, 1.5fr) 38px; column-gap: 8px; } .dshus-quota-label { font-size: 13px; } .dshus-quota-pct { font-size: 14px; } }',

      /* official OpenCode Go quota progress-bar cards (opencode.ai style) */
      '.dshus-go-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }',
      '.dshus-go-cards .dshus-go-last { grid-column: 1 / -1; }',
      '.dshus-go-card { padding-bottom: 13px; }',
      '.dshus-go-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }',
      '.dshus-go-head .k { margin-top: 0; font-size: 13px; }',
      '.dshus-go-pct { font-size: 25px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1; }',
      '.dshus-go-track { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); overflow: hidden; }',
      '.dshus-go-fill { height: 100%; border-radius: 999px; transition: width 0.35s ease; }',
      '.dshus-go-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 9px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #6b7280); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }',
      '.dshus-go-reset { color: var(--dsw-alias-label-caption, #9ca3af); font-size: 12px; }',


      /* WorkBuddy (dsh-workbuddy-connect) quota board extras */
      '.dshus-wb-total-value { font-size: 25px; }',
      '@container (max-width: 480px) { .dshus-wb-module .dshus-go-cards { grid-template-columns: minmax(0, 1fr); } }',
      '.dshus-wb-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }',
      '.dshus-wb-chips-label { font-size: 11.5px; color: var(--dsw-alias-label-caption, #9ca3af); }',
      '.dshus-wb-chip { display: inline-flex; align-items: center; flex-wrap: wrap; max-width: 100%; gap: 6px; font-size: 11.5px; padding: 2px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-wb-chip > span { min-width: 0; overflow-wrap: anywhere; }',
      '.dshus-wb-chip .rate { color: var(--dsw-alias-label-caption, #9ca3af); }',
      '.dshus-wb-chip .tag { color: #16a34a; font-weight: 600; }',
      '.dshus-wb-name { flex: 1 1 auto; min-width: 0; }',
      '.dshus-wb-inuse { flex: 0 0 auto; padding: 0 6px; border-radius: 999px; font-size: 10px; font-weight: 600; line-height: 16px; background: rgba(34, 197, 94, 0.12); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.25); }',

      /* modules — every usage module framed in one large card */
      '.dshus-module { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 16px; padding: 16px 18px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }',
      '.dshus-module h3 { margin: 0 0 12px; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; color: var(--dsw-alias-label-secondary, #4b5563); display: flex; align-items: center; gap: 8px; }',
      '#dshus-usage-panel .dshus-module h3 { font-weight: 400; }',
      '@container (max-width: 480px) { #dshus-usage-panel .dshus-module h3 { flex-wrap: wrap; } #dshus-usage-panel .dshus-head-tools { max-width: 100%; flex-wrap: wrap; gap: 8px; } }',
      '.dshus-balance-module { display: flex; align-items: center; gap: 12px; min-height: 62px; padding: 14px 18px; }',
      '.dshus-balance-title { display: flex; align-items: center; gap: 6px; min-width: 0; }',
      '.dshus-balance-module h3 { margin: 0; white-space: nowrap; }',
      '.dshus-balance-value { margin-left: auto; color: var(--dsw-alias-label-primary, #1f2430); font-size: 22px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      // 余额卡片：数值右对齐，下面一行小字显示上次获取时间。
      '.dshus-balance-side { margin-left: auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }',
      '.dshus-balance-side .dshus-balance-value { margin-left: 0; }',
      '.dshus-balance-side .dshus-fetched { margin-top: 0; }',
      '@container (max-width: 420px) { .dshus-balance-module { padding: 12px; flex-wrap: wrap; gap: 8px; } .dshus-balance-title { width: 100%; justify-content: space-between; } .dshus-balance-module h3 { font-size: 13px; white-space: normal; overflow-wrap: anywhere; } .dshus-balance-title .dshus-icon-btn { flex: none; } .dshus-balance-side { width: 100%; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; } .dshus-balance-side .dshus-fetched { order: -1; min-width: 0; } .dshus-balance-value { font-size: 18px; } }',
      '.dshus-balance-status { color: var(--dsw-alias-label-caption, #6b7280); font-size: 14px; font-weight: 400; }',

      /* Compact calendar; weekly totals fill seven-cell columns from below.
         The strip is a bare grid — paging moved to the card header and the
         scale legend to a footer row, so the calendar never gets a side rail
         that shifts it when paging becomes unavailable. */
      '.dshus-heat-wrap { width: 100%; display: flex; align-items: center; }',
      '.dshus-heat-viewport { min-width: 0; flex: 1 1 auto; box-sizing: border-box; padding: 4px; overflow: hidden; display: flex; flex-direction: column; align-items: center; }',
      '.dshus-heat-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; min-height: 28px; }',
      '.dshus-heat-legend { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); }',
      '.dshus-heat-legend-cell { width: 11px; height: 11px; border-radius: 3px; background: var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-heat-pager { margin-left: auto; }',
      '.dshus-heat-nav-group { display: inline-flex; align-items: center; gap: 2px; }',
      '.dshus-heat-nav-label { min-width: 68px; text-align: right; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; }',
      '.dshus-heat-nav-static .dshus-heat-nav { display: none; }',
      '.dshus-heat-nav { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); cursor: pointer; }',
      '.dshus-heat-nav:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1)); }',
      '.dshus-heat-nav:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; }',
      '.dshus-heat-nav:disabled { opacity: .28; cursor: default; }',
      '.dshus-heat-label-month { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-caption, #9ca3af); margin: 8px 0 0; height: 16px; }',
      '.dshus-heat { display: inline-flex; gap: 4px; animation: dshus-heat-in .5s ease-out; }',
      '@keyframes dshus-heat-in { from { opacity: 0; } to { opacity: 1; } }',
      '.dshus-heat-col { display: flex; flex-direction: column; gap: 4px; }',
      '.dshus-heat-weekly { --dshus-week-fill: #0089ff; }',
      '.dshus-heat-weekly .dshus-heat-col.weekly-active { --dshus-week-fill: #67b6ff; }',
      '.dshus-cell { width: var(--dshus-cell-size, 16px); height: var(--dshus-cell-size, 16px); border-radius: 4px; background: var(--dsw-alias-border-l2, #e5e7eb); cursor: pointer; transition: background-color .16s ease; }',
      '.dshus-cell:hover { filter: brightness(1.2); }',
      '.dshus-cell:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 1px; }',
      '.dshus-heat-weekly .dshus-cell { background: color-mix(in srgb, var(--dsw-alias-border-l2, #e5e7eb) 28%, transparent); }',
      '.dshus-heat-weekly .dshus-cell:hover { filter: none; }',
      '.dshus-heat-modes { flex-shrink: 0; gap: 16px; padding: 0; background: transparent; }',
      '.dshus-heat-modes .dshus-range-btn { height: 24px; padding: 0; font-weight: 400; }',
      '.dshus-heat-modes .dshus-range-btn.on { background: transparent; box-shadow: none; font-weight: 400; }',
      '.dshus-head-tools { margin-left: auto; display: inline-flex; align-items: center; gap: 18px; }',
      '.dshus-heat-total-label { font-size: 12px; color: var(--dsw-alias-label-caption, #9ca3af); }',
      '@media (prefers-reduced-motion: reduce) { .dshus-heat { animation: none; } .dshus-cell { transition: none; } }',

      /* bars */
      '.dshus-bars { width: 100%; position: relative; z-index: 1; }',
      '.dshus-bars-content { display: flex; align-items: stretch; gap: 2px; min-width: 0; width: 100%; position: relative; }',
      '.dshus-hour { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }',
      '.dshus-hour-bar { flex: 0 0 150px; display: flex; align-items: flex-end; overflow: hidden; }',
      '.dshus-bar { width: 100%; border-radius: 3px 3px 0 0; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; min-height: 2px; cursor: pointer; }',
      '.dshus-bar { transition: height 1s cubic-bezier(0.22, 0.61, 0.36, 1); }',
      '.dshus-bar-seg { width: 100%; }',
      '.dshus-bar-label { text-align: center; font-size: 9px; line-height: 12px; min-height: 12px; margin-top: 4px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.dshus-call-line { position: absolute; left: 0; top: 0; width: 100%; height: 150px; z-index: 2; pointer-events: none; overflow: visible; }',
      '.dshus-call-path { transform-box: view-box; transition: transform 1s cubic-bezier(0.22, 0.61, 0.36, 1); }',
      '.dshus-call-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--dsw-alias-bg-layer-1, #fff); background: #3b82f6; transform: translate(-50%, -50%); transition: transform 1s cubic-bezier(0.22, 0.61, 0.36, 1); z-index: 3; pointer-events: none; }',
      '@media (prefers-reduced-motion: reduce) { .dshus-bar, .dshus-call-path, .dshus-call-dot { transition: none; } }',
      '.dshus-call-axis { position: relative; width: 34px; flex: 0 0 34px; height: 150px; color: #3b82f6; font-size: 10px; font-variant-numeric: tabular-nums; }',
      '.dshus-call-axis span { position: absolute; left: 2px; white-space: nowrap; transform: translateY(-50%); }',
      '.dshus-call-axis-label { color: #3b82f6; font-size: 11px; text-align: right; margin-top: 4px; }',
      '.dshus-hour-hit-area { position: absolute; inset: 0 0 auto; height: 150px; z-index: 4; display: flex; }',
      '.dshus-hour-hit { flex: 1 1 0; min-width: 0; cursor: crosshair; }',
      '.dshus-hour-hit:hover { background: rgba(59, 130, 246, 0.06); }',
      '.dshus-hour-hit:focus-visible { outline: 2px solid #3b82f6; outline-offset: -2px; }',
      '.dshus-hover-line { position: absolute; top: 0; height: 150px; border-left: 1px solid var(--dsw-alias-label-caption, #9ca3af); z-index: 3; pointer-events: none; }',
      /* 24h chart — variable Y scale + dashed grid lines (enlarged & left-shifted) */
      '.dshus-bars-wrap { display: flex; gap: 4px; align-items: flex-start; margin-left: -4px; }',
      '.dshus-yaxis { position: relative; width: 34px; flex: 0 0 34px; height: 150px; flex-shrink: 0; }',
      '.dshus-yaxis-tick { position: absolute; right: 2px; font-size: 10px; line-height: 10px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; transform: translateY(-50%); white-space: nowrap; }',
      '.dshus-chart-area { flex: 1 1 auto; min-width: 0; position: relative; }',
      '.dshus-grid { position: absolute; left: 0; right: 0; top: 0; height: 150px; pointer-events: none; z-index: 0; }',
      '.dshus-grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--dsw-alias-border-l2, #d0d5dd); opacity: 0.95; }',

      /* donut (per-model token share) */
      '.dshus-donut { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }',
      '.dshus-donut-wrap { position: relative; flex: 0 0 auto; }',
      '.dshus-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }',
      '.dshus-donut-center .v { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; line-height: 22px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-donut-center .k { font-size: 10.5px; color: var(--dsw-alias-label-caption, #9ca3af); margin-top: 2px; }',
      '.dshus-donut-legend { flex: 1 1 260px; min-width: 230px; display: flex; flex-direction: column; gap: 7px; }',
      '.dshus-donut-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-primary, #1f2430); cursor: pointer; padding: 2px 4px; border-radius: 4px; }',
      '.dshus-donut-row:hover, .dshus-donut-row:focus-visible { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08)); outline: none; }',
      '.dshus-tip { position: fixed; z-index: 9999; pointer-events: none; background: var(--dsw-alias-tooltip-bg, #2c2c2e); color: #ffffff; border-radius: 8px; padding: 6px 10px; font-size: 12px; line-height: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.28); max-width: 280px; white-space: normal; }',
      '.dshus-tip-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-tip-val { opacity: 0.88; margin-top: 2px; font-variant-numeric: tabular-nums; white-space: pre-line; }',
      '.dshus-chart-tip { width: 260px; max-width: min(260px, calc(100vw - 24px)); padding: 10px 12px; }',
      '.dshus-chart-tip .dshus-tip-name { font-size: 13px; color: #60a5fa; }',
      '.dshus-tip-time { color: rgba(255,255,255,0.62); margin: 4px 0 8px; }',
      '.dshus-tip-row { display: flex; align-items: center; gap: 7px; padding: 3px 0; border-top: 1px solid rgba(255,255,255,0.1); }',
      '.dshus-tip-row span:nth-child(2) { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-tip-row strong { font-variant-numeric: tabular-nums; }',
      '.dshus-tip-swatch { flex: 0 0 8px; height: 8px; border-radius: 50%; }',
      '.dshus-heat-tip { width: 320px; max-width: calc(100vw - 20px); max-height: calc(100vh - 20px); padding: 10px 12px; border-radius: 12px; overflow-y: auto; pointer-events: auto; }',
      '.dshus-heat-tip .dshus-tip-name { font-size: 13px; font-weight: 400; white-space: normal; }',
      '.dshus-heat-tip .dshus-tip-val { margin-bottom: 8px; }',
      '.dshus-heat-tip .dshus-tip-row span:nth-child(2) { white-space: normal; overflow-wrap: anywhere; }',
      '.dshus-heat-tip .dshus-tip-row strong { white-space: nowrap; }',
      '.dshus-heat-tip .dshus-tip-row:last-child span:first-child { flex: 1 1 auto; }',
      '.dshus-donut-dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }',
      '.dshus-donut-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.dshus-donut-pct { flex: 0 0 46px; text-align: right; color: var(--dsw-alias-label-secondary, #4b5563); font-variant-numeric: tabular-nums; }',
      '.dshus-donut-val { flex: 0 0 70px; text-align: right; color: var(--dsw-alias-label-secondary, #4b5563); font-variant-numeric: tabular-nums; }',
      '.dshus-card-model .v { font-size: 15px; line-height: 20px; }',
      '.dshus-card-model .sub { font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',

      /* Model breakdown table and search */
      '.dshus-model-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 18px; margin-bottom: 10px; flex-wrap: wrap; }',
      '.dshus-search-input { height: 30px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12px; width: 220px; outline: none; }',
      '.dshus-search-input:focus { border-color: var(--dsw-alias-brand-primary, #3b82f6); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15); }',
      '.dshus-table-wrap { overflow-x: auto; margin-top: 6px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 10px; }',
      '.dshus-table { width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left; }',
      '.dshus-table th { padding: 9px 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #4b5563); background: var(--dsw-alias-bg-layer-2, #f9fafb); border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb); font-size: 12px; white-space: nowrap; }',
      '.dshus-table td { padding: 9px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2, #f2f3f6); color: var(--dsw-alias-label-primary, #1f2430); font-variant-numeric: tabular-nums; }',
      '.dshus-table tr:last-child td { border-bottom: none; }',
      '.dshus-table tr:hover td { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.04)); }',
      '.dshus-table-model-cell { display: flex; align-items: center; gap: 8px; font-weight: 500; }',
      '.dshus-table-bar-cell { width: 140px; }',
      '.dshus-table-bar-bg { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #e5e7eb); overflow: hidden; }',
      '.dshus-table-bar-fill { height: 100%; border-radius: 999px; }',

      '.dshus-muted { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12.5px; }',
      '.dshus-error { color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 13px; margin: 8px 0; white-space: pre-wrap; }',

    ].join('\n')

    function injectStyles() {
      // Always refresh the stylesheet content, even when the element already
      // exists: a previous in-page load may have injected an older version
      // (e.g. stretched cells) whose rules would otherwise keep applying.
      var style = document.getElementById(STYLE_ID)
      if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = styles
    }

    // The host chooses sidebar icons by hard-coded section id and ignores slot
    // icon metadata. Mark only our settings row so CSS can show a chart glyph.
    function markUsageNavIcon() {
      var buttons = document.querySelectorAll('[data-shortcut-modal="settings"] nav button')
      for (var i = 0; i < buttons.length; i++) {
        var label = buttons[i].querySelector('span')
        if (label && label.textContent.trim() === t('用量统计')) {
          buttons[i].setAttribute('data-dshus-nav-icon', '')
        }
      }
    }

    function watchUsageNavIcon() {
      if (typeof MutationObserver === 'undefined' || !document.body) return function () {}
      markUsageNavIcon()
      var observer = new MutationObserver(markUsageNavIcon)
      observer.observe(document.body, { childList: true, subtree: true })
      return function () { observer.disconnect() }
    }

    /* ------------------------------------------------------------------ */
    /* Heatmap (GitHub-style calendar)                                     */
    /* ------------------------------------------------------------------ */

    /** Keep one full strip visible; extend it into older pages only as needed. */
    function buildHeatmap(dayMap, days, tzMin, pageWeeks) {
      var todayKey = new Date(Date.now() - tzMin * 60000).toISOString().slice(0, 10)
      var todayOrdinal = Date.parse(todayKey + 'T00:00:00Z') / 86400000
      var firstOrdinal = days > 0 ? todayOrdinal - days + 1 : todayOrdinal - 364
      if (!(days > 0)) {
        dayMap.forEach(function (_bucket, date) {
          var ordinal = Date.parse(date + 'T00:00:00Z') / 86400000
          if (Number.isFinite(ordinal) && ordinal < firstOrdinal) firstOrdinal = ordinal
        })
      }
      // Monday is always the first cell in a column. This keeps every
      // calendar week's seven days together, including the incomplete week
      // at either end of the available history.
      var todayWeekStart = Date.parse(weekStart(todayKey) + 'T00:00:00Z') / 86400000
      var firstWeekStart = Date.parse(weekStart(new Date(firstOrdinal * 86400000).toISOString().slice(0, 10)) + 'T00:00:00Z') / 86400000
      var colCount = Math.max(pageWeeks, Math.round((todayWeekStart - firstWeekStart) / 7) + 1)
      var firstColOrdinal = todayWeekStart - (colCount - 1) * 7
      function key(ordinal) { return new Date(ordinal * 86400000).toISOString().slice(0, 10) }
      var weeks = []
      var max = 0
      for (var col = 0; col < colCount; col++) {
        var colStart = firstColOrdinal + col * 7
        var cells = []
        for (var i = 0; i < 7; i++) {
          var ordinal = colStart + i
          var k = key(ordinal)
          var inWindow = ordinal >= firstOrdinal && ordinal <= todayOrdinal
          var bucket = dayMap.get(k) || null
          var v = bucket ? bucket.billed : 0
          if (v > max && inWindow) max = v
          cells.push({ date: k, value: v, bucket: bucket, inWindow: inWindow })
        }
        weeks.push({ start: key(colStart), cells: cells })
      }
      return { weeks: weeks, max: max, today: todayKey }
    }

    function weekStart(date) {
      var ordinal = Date.parse(date + 'T00:00:00Z') / 86400000
      var day = (new Date(ordinal * 86400000).getUTCDay() + 6) % 7
      return new Date((ordinal - day) * 86400000).toISOString().slice(0, 10)
    }

    function weeklyBuckets(dayMap, dayModelMap) {
      var buckets = new Map()
      var models = new Map()
      dayMap.forEach(function (day, date) {
        var key = weekStart(date)
        var bucket = buckets.get(key)
        if (!bucket) { bucket = { date: key, billed: 0, calls: 0 }; buckets.set(key, bucket) }
        bucket.billed += day.billed || 0
        bucket.calls += day.calls || 0
        var dailyModels = dayModelMap.get(date) || []
        var modelBuckets = models.get(key)
        if (!modelBuckets) { modelBuckets = new Map(); models.set(key, modelBuckets) }
        dailyModels.forEach(function (model) {
          var current = modelBuckets.get(model.key)
          if (!current) {
            current = { key: model.key, provider: model.provider, model: model.model, billed: 0, calls: 0 }
            modelBuckets.set(model.key, current)
          }
          current.billed += model.billed || 0
          current.calls += model.calls || 0
        })
      })
      var modelLists = new Map()
      models.forEach(function (items, key) {
        modelLists.set(key, Array.from(items.values()).sort(function (a, b) { return b.billed - a.billed }))
      })
      return { buckets: buckets, models: modelLists }
    }

    function heatLevel(value, max) {
      if (!(value > 0) || !(max > 0)) return 0
      var r = value / max
      if (r > 0.75) return 4
      if (r > 0.5) return 3
      if (r > 0.25) return 2
      return 1
    }

    /** Colour for a heat level — heat green blended to transparent via color-mix. */
    function cellColor(level) {
      switch (level) {
        case 1: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 22%, transparent)'
        case 2: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 45%, transparent)'
        case 3: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 72%, transparent)'
        case 4: return 'var(--dshus-heat, #22c55e)'
        default: return ''
      }
    }

    function Heatmap(props) {
      var weekly = props.mode === 'weekly'
      var weeklyData = weekly ? weeklyBuckets(props.dayMap, props.dayModelMap) : null
      var weeklyMax = 0
      if (weekly) weeklyData.buckets.forEach(function (bucket) { weeklyMax = Math.max(weeklyMax, bucket.billed || 0) })
      var dayMap = props.dayMap
      var dayModelMap = props.dayModelMap
      var days = props.days
      var MIN_CELL = 15
      var GAP = 5
      // Hover only brightens the cell (filter), so the gutter exists purely so a
      // forced 25px track cannot push the grid past the pane: it now also owns
      // the gap between the strip and its pager.
      var EDGE_GUTTER = 4
      var viewportRef = React.useRef(null)
      var widthState = React.useState(0)
      var width = widthState[0]
      var setWidth = widthState[1]
      // Paging is owned by the usage page, which renders the arrows in the card
      // header. The index arrives as props.pageIndex and the geometry this
      // component computes goes back out through props.onPageInfo, so pageCount
      // and the visible window stay in one place.
      var reportPageInfo = props.onPageInfo
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var selectedWeekState = React.useState(null)
      var selectedWeek = selectedWeekState[0]
      var setSelectedWeek = selectedWeekState[1]
      var hideTimerRef = React.useRef(null)
      var modelCacheRef = React.useRef(new Map())
      var modelVersionState = React.useState(0)
      var modelVersion = modelVersionState[0]
      var setModelVersion = modelVersionState[1]
      var tipRef = React.useRef(null)

      var modelCacheKey = function (date) { return String(props.syncedAt || 0) + '|' + (props.modelKey || '') + '|' + date }
      var modelResult = function (date) {
        var result
        if (weekly) result = { status: 'ready', models: weeklyData.models.get(weekStart(date)) || [] }
        else if (dayModelMap.has(date)) result = { status: 'ready', models: dayModelMap.get(date) || [] }
        else result = modelCacheRef.current.get(modelCacheKey(date)) || { status: props.loadDayModels ? 'idle' : 'unavailable', models: [] }
        return { status: result.status, models: groupModelRows(result.models) }
      }
      var requestModels = function (cell) {
        if (weekly || !cell.inWindow || !cell.bucket || !props.loadDayModels || dayModelMap.has(cell.date)) return
        var key = modelCacheKey(cell.date)
        if (modelCacheRef.current.has(key)) return
        modelCacheRef.current.set(key, { status: 'loading', models: [] })
        Promise.resolve().then(function () { return props.loadDayModels(cell.date) }).then(function (models) {
          modelCacheRef.current.set(key, { status: 'ready', models: models })
          setModelVersion(function (v) { return v + 1 })
        }).catch(function () {
          modelCacheRef.current.set(key, { status: 'error', models: [] })
          setModelVersion(function (v) { return v + 1 })
        })
      }

      // useLayoutEffect measures before the first renderer paint, so changing
      // range or resizing the pane does not briefly show a one-week strip.
      var useMeasureEffect = React.useLayoutEffect || React.useEffect
      useMeasureEffect(function () {
        var node = viewportRef.current
        if (!node) return
        var measure = function () {
          var nextWidth = Math.max(0, node.clientWidth)
          setWidth(nextWidth)
        }
        measure()
        var observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null
        if (observer) observer.observe(node)
        else if (window.addEventListener) window.addEventListener('resize', measure)
        return function () {
          if (observer) observer.disconnect()
          else if (window.removeEventListener) window.removeEventListener('resize', measure)
        }
      }, [])

      // Fit complete weeks inside the viewport padding, then let their cells use
      // the remaining width. MAX_CELL keeps the calendar from turning into a
      // sparse wall of squares when the settings pane is dragged wide.
      var heatAreaWidth = Math.max(0, width - EDGE_GUTTER * 2)
      var visibleCount = Math.min(53, Math.max(1, Math.floor((heatAreaWidth + GAP) / (MIN_CELL + GAP))))
      var CELL = heatAreaWidth > 0 ? Math.min(25, Math.max(MIN_CELL, (heatAreaWidth - (visibleCount - 1) * GAP) / visibleCount)) : MIN_CELL
      var STEP = CELL + GAP
      var heat = buildHeatmap(dayMap, days, props.tz, visibleCount)
      var pageCount = Math.max(1, Math.ceil(heat.weeks.length / visibleCount))
      var page = props.pageIndex == null ? 0 : Math.min(Math.max(0, props.pageIndex), pageCount - 1)
      var end = heat.weeks.length - page * visibleCount
      var weeks = heat.weeks.slice(Math.max(0, end - visibleCount), end)

      // Publish the paging geometry to the card header. Report the column start
      // (Monday, the same key the grid renders as data-week-start) so the label
      // and the pager state always describe the window actually on screen.
      React.useEffect(function () {
        if (!reportPageInfo) return
        var first = weeks.length > 0 ? weeks[0].start : null
        var lastKey = weeks.length > 0 ? weeks[weeks.length - 1].start : null
        var last = lastKey !== null && lastKey > heat.today ? heat.today : lastKey
        reportPageInfo({
          page: page,
          pageCount: pageCount,
          first: first,
          last: last,
          firstMonth: first === null ? '' : monthShort(first),
          lastMonth: last === null ? '' : monthShort(last),
        })
      }, [reportPageInfo, page, pageCount, visibleCount, props.mode, days, dayMap, heat.today])

      var clearHideTimer = function () {
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      var hideTip = function () { clearHideTimer(); setTip(null) }
      var hideTipSoon = function () {
        clearHideTimer()
        hideTimerRef.current = setTimeout(function () { setTip(null) }, 120)
      }
      React.useEffect(function () {
        if (window.addEventListener) window.addEventListener('resize', hideTip)
        return function () {
          clearHideTimer()
          if (window.removeEventListener) window.removeEventListener('resize', hideTip)
        }
      }, [])
      var TIP_GAP = 8
      var TIP_MARGIN = 10
      /**
       * Anchor the tooltip to the BOTTOM-RIGHT of the hovered cell so it never
       * covers the cell or the days around it. Only when that would leave the
       * window do we fall back: align to the right edge, then flip above.
       * Kept as a pure function of the anchor + size so the post-render measure
       * pass can re-run it once the real tooltip height is known.
       */
      var placeTip = function (anchor, tipWidth, tipHeight) {
        var x = anchor.right + TIP_GAP
        if (x + tipWidth > window.innerWidth - TIP_MARGIN) {
          // Not enough room on the right: hang it off the left of the cell
          // instead of letting it run past the window edge.
          x = anchor.left - TIP_GAP - tipWidth
        }
        if (x < TIP_MARGIN) x = Math.max(TIP_MARGIN, Math.min(anchor.right + TIP_GAP, window.innerWidth - tipWidth - TIP_MARGIN))

        var y = anchor.bottom + TIP_GAP
        if (y + tipHeight > window.innerHeight - TIP_MARGIN) {
          // No room below: flip above the cell.
          y = anchor.top - TIP_GAP - tipHeight
        }

        return {
          x: Math.max(TIP_MARGIN, Math.min(window.innerWidth - tipWidth - TIP_MARGIN, x)),
          y: Math.max(TIP_MARGIN, Math.min(window.innerHeight - tipHeight - TIP_MARGIN, y)),
        }
      }
      // Must mirror .dshus-heat-tip's own width/max-width so the first, pre-measure
      // placement already picks the right side; the measure effect then corrects
      // both axes from the real box.
      var tipWidthFor = function () { return Math.min(320, window.innerWidth - 20) }
      var showTip = function (e, cell) {
        clearHideTimer()
        requestModels(cell)
        var models = modelResult(cell.date).models
        var bounds = e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null
        var anchor = bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
        var position = placeTip(anchor, tipWidthFor(), Math.min(window.innerHeight - 20, 80 + models.length * 25))
        setTip(function (previous) {
          if (previous && previous.anchor && previous.cell.date === cell.date && previous.cell.bucket === cell.bucket && previous.cell.inWindow === cell.inWindow && previous.days === days && previous.mode === props.mode && previous.anchor.left === anchor.left && previous.anchor.top === anchor.top && previous.anchor.right === anchor.right && previous.anchor.bottom === anchor.bottom) return previous
          return { x: position.x, y: position.y, anchor: anchor, cell: cell, days: days, mode: props.mode }
        })
      }
      var tipEl = null
      if (tip !== null && tip.days === days && tip.mode === props.mode) {
        var weekDate = weekly ? weekStart(tip.cell.date) : tip.cell.date
        var bucket = weekly ? weeklyData.buckets.get(weekDate) : tip.cell.bucket
        var tipInWindow = weekly || tip.cell.inWindow
        var tipValue = bucket ? bucket.billed || 0 : 0
        var detail = modelResult(tip.cell.date)
        var modelRows = detail.models.map(function (m) {
          return React.createElement('div', { className: 'dshus-tip-row', key: m.key },
            React.createElement('span', { className: 'dshus-tip-swatch', style: { background: sharedModelColor(m.model) } }),
            React.createElement('span', { title: m.model }, m.model),
            React.createElement('strong', { title: fmtExact(m.billed) + ' tokens' }, fmt(m.billed)),
          )
        })
        tipEl = React.createElement('div', {
          className: 'dshus-tip dshus-heat-tip',
          ref: tipRef,
          style: { left: tip.x, top: tip.y },
          onMouseEnter: clearHideTimer,
          onMouseLeave: hideTip,
        },
          React.createElement('div', { className: 'dshus-tip-name', title: bucket ? fmtExact(tipValue) + ' tokens' : undefined }, weekly ? weekDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, function (_match, year, month, day) { return t('{year}年{month}月{day}日起的一周', { year: year, month: month, day: day }) }) : tip.cell.date),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-val', title: bucket ? fmtExact(tipValue) + ' tokens' : undefined }, bucket ? fmt(tipValue) + ' tokens' : t('无记录')),
          !tipInWindow && React.createElement('div', { className: 'dshus-tip-val' }, t('不在所选时间范围内')),
          tipInWindow && modelRows,
          tipInWindow && bucket && detail.models.length === 0 && !weekly && React.createElement('div', { className: 'dshus-tip-val' },
            detail.status === 'loading' || detail.status === 'idle' ? t('正在读取模型明细…') : t('模型明细暂不可用'),
          ),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-row', style: { color: '#60a5fa' } },
            React.createElement('span', null, t('总调用次数')),
            React.createElement('strong', null, t('{count} 次', { count: fmtExact(bucket && bucket.calls) })),
          ),
        )
      }
      useMeasureEffect(function () {
        if (!tip || !tipRef.current) return
        var bounds = tipRef.current.getBoundingClientRect()
        var position = placeTip(tip.anchor, bounds.width, bounds.height)
        if (Math.abs(position.x - tip.x) > .5 || Math.abs(position.y - tip.y) > .5) {
          setTip(function (current) { return current === tip ? Object.assign({}, tip, position) : current })
        }
      }, [tip, modelVersion, width, props.mode, days])

      var segs = []
      var prevMonth = ''
      for (var wi = 0; wi < weeks.length; wi++) {
        var monthDate = weeks[wi].cells[6].date
        var m = monthShort(monthDate > heat.today ? heat.today : monthDate)
        if (m !== prevMonth) {
          if (prevMonth !== '') segs[segs.length - 1].end = wi - 1
          segs.push({ label: m, start: wi, end: wi })
          prevMonth = m
        }
      }
      if (segs.length > 0) segs[segs.length - 1].end = weeks.length - 1
      var heatWidth = weeks.length * STEP - GAP
      var labelWidth = Math.max(36, heatWidth)
      var monthLabels = segs.map(function (seg, i) {
        var cx = ((seg.start + seg.end) / 2) * STEP + CELL / 2 + (labelWidth - heatWidth) / 2
        // Keep the label fully inside the strip even for a 1-week edge month
        // (wider labels like 12月 need extra room on both sides).
        cx = Math.min(Math.max(cx, 16), labelWidth - 16)
        return React.createElement('span', {
          key: 'ml' + i,
          style: { position: 'absolute', left: cx, transform: 'translateX(-50%)', whiteSpace: 'nowrap' },
        }, seg.label)
      })
      var monthRow = React.createElement('div', {
        className: 'dshus-heat-label-month',
        style: { position: 'relative', width: labelWidth, height: 16 },
      }, monthLabels)

      var activeWeek = weekly && tip && tip.mode === props.mode ? weekStart(tip.cell.date) : selectedWeek
      var weekCols = weeks.map(function (week, w) {
        var weekBucket = weekly && weeklyData.buckets.get(week.start)
        var weekValue = weekBucket ? weekBucket.billed || 0 : 0
        var filledCells = weekly && weekValue > 0 && weeklyMax > 0 ? Math.max(1, Math.round(weekValue / weeklyMax * 7)) : 0
        return React.createElement('div', { className: 'dshus-heat-col' + (weekly && activeWeek === week.start ? ' weekly-active' : ''), key: week.start, 'data-week-start': week.start },
          week.cells.map(function (cell, c) {
            if (!cell.inWindow && !weekly) {
              return React.createElement('div', {
                className: 'dshus-cell',
                key: w + '-' + c,
                role: 'gridcell',
                'aria-label': cell.date + t('，不在所选时间范围内'),
                onMouseMove: function (e) { showTip(e, cell) },
                onClick: function (e) { if (weekly) setSelectedWeek(week.start); if (e) showTip(e, cell) },
                onMouseLeave: hideTipSoon,
              })
            }
            var level = heatLevel(cell.value, heat.max)
            var models = modelResult(cell.date).models
            var filled = weekly && c >= 7 - filledCells
            var ariaLabel = t('{time}: {tokens} tokens，{count} 次调用', { time: weekly ? t('{date} 当周', { date: cell.date }) : cell.date, count: fmtExact(weekly ? weekBucket && weekBucket.calls : cell.bucket && cell.bucket.calls), tokens: fmtExact(weekly ? weekBucket && weekBucket.billed : cell.value) })
            if (models.length > 0) ariaLabel += '；' + models.map(function (m) { return m.model + ' ' + fmtExact(m.billed) }).join('；')
            return React.createElement('div', {
              className: 'dshus-cell' + (filled ? ' weekly-filled' : ''),
              key: w + '-' + c,
              tabIndex: 0,
              role: 'gridcell',
              'aria-label': ariaLabel,
              onMouseMove: function (e) { showTip(e, cell) },
              onClick: function (e) { if (weekly) setSelectedWeek(week.start); if (e) showTip(e, cell) },
              onMouseLeave: hideTipSoon,
              onFocus: function (e) {
                var rect = e.currentTarget.getBoundingClientRect()
                showTip({ currentTarget: e.currentTarget, clientX: rect.left, clientY: rect.bottom }, cell)
              },
              onBlur: hideTip,
              style: weekly ? (filled ? { background: 'var(--dshus-week-fill, #0089ff)' } : undefined) : (level > 0 ? { background: cellColor(level) } : undefined),
            })
          }),
        )
      })

      return React.createElement('div', { className: weekly ? 'dshus-heat-weekly' : undefined, style: { '--dshus-heat': '#0089ff' } },
        React.createElement('div', { className: 'dshus-heat-wrap' },
          React.createElement('div', {
            className: 'dshus-heat-viewport',
            ref: viewportRef,
            'data-page': page,
            'data-page-count': pageCount,
            style: { '--dshus-cell-size': CELL + 'px' },
          },
            React.createElement('div', { className: 'dshus-heat', key: props.mode + '-' + page + '-' + visibleCount, role: 'grid', 'aria-label': t('使用量热力图') }, weekCols),
            monthRow,
          ),
        ),
        // Colour scale replaces the old 累计总量 caption (which only restated the
        // 每周 switch next to it) with the one legend the calendar actually
        // needs: what the shades of blue mean.
        React.createElement('div', { className: 'dshus-heat-legend', 'aria-hidden': 'true' },
          React.createElement('span', null, t('少')),
          [1, 2, 3, 4].map(function (level) {
            return React.createElement('span', { className: 'dshus-heat-legend-cell', key: 'lg' + level, style: { background: cellColor(level) } })
          }),
          React.createElement('span', null, t('多')),
        ),
        tipEl,
      )
    }

    /**
     * Pager for the heatmap, rendered into the card header so the calendar
     * itself stays a bare grid. `info` is published by Heatmap via onPageInfo;
     * `onStep` receives +1 (older) / -1 (newer).
     */
    function heatArrow(left) {
      return React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        React.createElement('path', { d: left ? 'M11 3 4 8l7 5Z' : 'M5 3l7 5-7 5Z', fill: 'currentColor' }),
      )
    }

    function HeatPager(props) {
      var info = props.info
      var range = ''
      if (info && info.firstMonth) range = info.firstMonth === info.lastMonth ? info.firstMonth : info.firstMonth + ' – ' + info.lastMonth
      var canOlder = Boolean(info) && info.page < info.pageCount - 1
      var canNewer = Boolean(info) && info.page > 0
      return React.createElement('div', {
        className: 'dshus-heat-nav-group' + (info && info.pageCount > 1 ? '' : ' dshus-heat-nav-static'),
        role: 'group',
        'aria-label': t('热力图翻页'),
      },
        React.createElement('span', { className: 'dshus-heat-nav-label', title: t('当前显示的日期范围') }, range),
        React.createElement('button', {
          type: 'button',
          className: 'dshus-heat-nav',
          'aria-label': t('查看更早日期'),
          disabled: !canOlder,
          onClick: function () { props.onStep(1) },
        }, heatArrow(true)),
        React.createElement('button', {
          type: 'button',
          className: 'dshus-heat-nav',
          'aria-label': t('查看较新日期'),
          disabled: !canNewer,
          onClick: function () { props.onStep(-1) },
        }, heatArrow(false)),
      )
    }

    /* ------------------------------------------------------------------ */
    /* 24-hour token bar chart (usage by hour of day over the window)      */
    /* ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ */
    /* Charts                                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * useGrowIn(active): returns [grown, ref]. While `active`, the chart
     * element (ref) stays in its hidden "start" state until it first becomes
     * visible in the viewport (IntersectionObserver); only then does `grown`
     * flip to true — deferred by two animation frames so the hidden state is
     * guaranteed to be painted before the CSS transition starts (otherwise
     * Chromium skips the transition entirely). Charts below the fold begin
     * drawing when the user scrolls to them, not at page open.
     */
    function useGrowIn(active) {
      var grownState = React.useState(false)
      var grown = grownState[0]
      var ref = React.useRef(null)
      React.useEffect(function () {
        if (grown) return
        var el = ref.current
        if (!el || !active) return
        var started = false
        var io = null
        function start() {
          if (started) return
          started = true
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { grownState[1](true) })
          })
        }
        if (typeof IntersectionObserver === 'undefined') { start(); return undefined }
        io = new IntersectionObserver(function (entries) {
          for (var ei = 0; ei < entries.length; ei++) {
            if (entries[ei].isIntersecting) {
              start()
              io.disconnect()
              break
            }
          }
        }, { threshold: 0.15 })
        io.observe(el)
        return function () {
          if (io !== null) io.disconnect()
        }
      }, [active])
      return [grown, ref]
    }

    /**
     * Merge key for one model: case-insensitive, provider prefix and tag suffix
     * dropped, so "GLM-4.7" vs "glm-4.7" and "stealth/ox-alpha" vs "OX-ALPHA"
     * land in one bucket. The ox / x-preview family are earlier gateway names of
     * what is now served as glm-5.3-flash, so they fold into that bucket too.
     * Shared by the trend tooltip, the donut and the hourly chart.
     */
    function sharedNormModelKey(name) {
      var s = String(name || '').trim()
      var low = s.toLowerCase()
      var slash = low.lastIndexOf('/')
      if (slash !== -1) low = low.slice(slash + 1)
      var colon = low.indexOf(':')
      if (colon !== -1) low = low.slice(0, colon)
      if (low.endsWith('-free')) low = low.slice(0, -5)
      if (low === 'x-preview-f' || low === 'x-preview' || low === 'x-privew' || low === 'x-privew-f' || low === 'ox' || low === 'ox-alpha') low = 'glm-5.3-flash'
      return low
    }

    /**
     * Display name for a merged group: the basename of the winning variant (text
     * after the last '/', original casing). OpenRouter-style ids carry a namespace
     * prefix ("z-ai/glm-5.3-flash"); showing the full id would make the merged
     * group look like a provider leaked in, so the prefix is always dropped.
     */
    function sharedModelDisplayName(name) {
      var s = String(name || '').trim()
      var slash = s.lastIndexOf('/')
      return slash !== -1 ? s.slice(slash + 1) : s
    }

    /** Model-only breakdown shared by heatmap hovers and daily trends. */
    function groupModelRows(rows) {
      var merged = []
      var index = Object.create(null)
      for (var i = 0; i < rows.length; i++) {
        var entry = rows[i]
        if (entry.key === '__all__') { merged.push(entry); continue }
        var modelId = sharedNormModelKey(entry.model || entry.key)
        var existing = index[modelId]
        if (existing === undefined) {
          index[modelId] = merged.length
          merged.push({ key: 'by-model:' + modelId, provider: '', model: sharedModelDisplayName(entry.model), billed: entry.billed || 0 })
        } else {
          merged[existing].billed += entry.billed || 0
        }
      }
      return merged.sort(function (a, b) { return (b.billed || 0) - (a.billed || 0) })
    }

    /** Distinct, theme-agnostic hues for the model segments. */
    var sharedModelColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

    /**
     * Stable colour for a merged model name. Hashing the name (not the position)
     * keeps one model on the same hue in every chart and on every day, so the
     * daily trend bars and its tooltip swatches agree.
     */
    function sharedModelColor(name) {
      var key = sharedNormModelKey(name)
      var hash = 0
      for (var i = 0; i < key.length; i++) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0
      return sharedModelColors[hash % sharedModelColors.length]
    }

    function Bars(props) {
      var hourModels = props.hourModels // [{hour, models:[{key,provider,model,billed}]}]
      var byHour = props.byHour || []
      var colorOf = props.colorOf
      var daily = props.variant === 'daily'

      // ALL hooks run unconditionally, before any early return, so the hook
      // count stays identical whether the window has records or not.
      // Grow-in: bars stay at 0% height until the chart scrolls into view,
      // then transition up to their real height once (visibility-triggered,
      // see useGrowIn).
      var grow = useGrowIn(!!(hourModels && hourModels.length > 0))
      var grown = grow[0]
      var barsRef = grow[1]
      // One hover region per hour, including the empty space above the bar.
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]

      if (!hourModels || hourModels.length === 0) return React.createElement('div', { className: 'dshus-muted' }, t('窗口内没有记录'))

      var showTip = function (e, index) {
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 270 > window.innerWidth) x = Math.max(8, e.clientX - 270)
        var estimatedHeight = 70 + ((hourModels[index].models || []).length + 1) * 23
        if (y + estimatedHeight > window.innerHeight) y = Math.max(8, window.innerHeight - estimatedHeight - 8)
        setTip({ x: x, y: y, index: index })
      }
      var hideTip = function () { setTip(null) }
      var tipEl = null
      if (tip !== null && hourModels[tip.index]) {
        var tipItem = hourModels[tip.index]
        var tipHour = tipItem.hour
        var tipBucket = byHour[tipHour] || {}
        var tipCalls = Number(tipBucket.calls) || 0
        var tipTokens = Number(tipBucket.billed) || 0
        var tipModels = tipItem.models || []
        var tipDate = daily ? new Date(tipItem.date + 'T00:00:00Z') : new Date(Date.now() - LOCAL_TZ * 60000)
        var tipDayLabel = t('{year}年{month}月{day}日', { year: tipDate.getUTCFullYear(), month: tipDate.getUTCMonth() + 1, day: tipDate.getUTCDate() })
        tipEl = React.createElement('div', { className: 'dshus-tip dshus-chart-tip', style: { left: tip.x, top: tip.y } },
          React.createElement('div', { className: 'dshus-tip-name' }, t('{count} 次调用', { count: fmtExact(tipCalls) })),
          React.createElement('div', { className: 'dshus-tip-time' }, tipDayLabel + (daily ? t(' · 全天') : ' · ' + String(tipHour).padStart(2, '0') + ':00–' + String(tipHour).padStart(2, '0') + ':59')),
          React.createElement('div', { className: 'dshus-tip-row' },
            React.createElement('span', { className: 'dshus-tip-swatch', style: { background: '#94a3b8' } }),
            React.createElement('span', null, t('Token 用量')),
            React.createElement('strong', null, fmt(tipTokens)),
          ),
          tipModels.filter(function (mm) { return !daily || mm.key !== '__all__' }).map(function (mm) {
            // The daily trend lists models only: repeating the provider on every
            // row made the breakdown harder to scan than the model names.
            var label = daily ? mm.model : (mm.provider ? mm.provider + ' · ' + mm.model : mm.model)
            return React.createElement('div', { className: 'dshus-tip-row', key: mm.key },
              React.createElement('span', { className: 'dshus-tip-swatch', style: { background: colorOf ? colorOf(mm.key) : '#94a3b8' } }),
              React.createElement('span', null, label),
              React.createElement('strong', null, fmt(mm.billed || 0)),
            )
          }),
        )
      }

      var max = 0
      for (var i = 0; i < hourModels.length; i++) {
        var tot = 0
        var ms = hourModels[i].models || []
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        if (tot > max) max = tot
      }
      // ---- Y轴可变刻度 + 虚线网格（nice 数算法：1/2/5 * 10^n，目标4段）----
      function getYScale(m) {
        if (!(m > 0)) return { yMax: 1, ticks: [0, 1], step: 1 }
        var target = 4
        var rough = m / target
        var mag = Math.pow(10, Math.floor(Math.log10(rough)))
        if (!isFinite(mag) || mag === 0) mag = 1
        var residual = rough / mag
        var nice
        if (residual <= 1) nice = 1 * mag
        else if (residual <= 2) nice = 2 * mag
        else if (residual <= 5) nice = 5 * mag
        else nice = 10 * mag
        var step = nice
        if (step < 1) step = 1
        var yMax = Math.ceil(m / step) * step
        var ticks = []
        for (var v = 0; v <= yMax + 1e-9; v += step) {
          var vv = Math.round(v / step) * step
          if (Math.abs(vv) < 1e-9) vv = 0
          ticks.push(vv)
        }
        if (ticks.length < 2) ticks = [0, yMax]
        if (ticks.length > 6) {
          step *= 2
          yMax = Math.ceil(m / step) * step
          ticks = []
          for (var v2 = 0; v2 <= yMax + 1e-9; v2 += step) {
            var vv2 = Math.round(v2 / step) * step
            if (Math.abs(vv2) < 1e-9) vv2 = 0
            ticks.push(vv2)
          }
        }
        return { yMax: yMax, ticks: ticks, step: step }
      }
      var scale = getYScale(max)
      var yMax = scale.yMax
      var ticks = scale.ticks
      var maxCalls = 0
      for (var ci = 0; ci < hourModels.length; ci++) {
        var hourCallCount = byHour[hourModels[ci].hour] ? Number(byHour[hourModels[ci].hour].calls) || 0 : 0
        if (hourCallCount > maxCalls) maxCalls = hourCallCount
      }
      var callYMax = getYScale(maxCalls).yMax
      var callY = function (calls) { return 6 + (1 - calls / callYMax) * 138 }
      var callBaseline = callY(0)
      var callPoints = hourModels.map(function (item, i) {
        var calls = byHour[item.hour] ? Number(byHour[item.hour].calls) || 0 : 0
        return ((i + 0.5) * 10) + ',' + callY(calls)
      }).join(' ')
      var yAxis = React.createElement('div', { className: 'dshus-yaxis' },
        ticks.map(function (v) {
          var top = yMax > 0 ? (1 - v / yMax) * 100 : 100
          return React.createElement('div', { className: 'dshus-yaxis-tick', key: 'y' + v, style: { top: top + '%' } }, v === 0 ? '0' : fmt(v))
        })
      )
      var grid = React.createElement('div', { className: 'dshus-grid' },
        ticks.map(function (v) {
          if (v === 0) return null
          var top = yMax > 0 ? (1 - v / yMax) * 100 : 100
          return React.createElement('div', { className: 'dshus-grid-line', key: 'g' + v, style: { top: top + '%' } })
        })
      )
      // One column per hour: the bar sits on top of its own label inside the
      // same flex column, so a bar can never be positioned under a different
      // hour's label (see the CSS comment for the old misalignment).
      var columns = hourModels.map(function (item, index) {
        var ms = item.models || []
        var tot = 0
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        var empty = !(tot > 0)
        var h = yMax > 0 ? Math.round((tot / yMax) * 100) : 0
        var segs = ms.map(function (mm) {
          var sh = tot > 0 ? Math.round((mm.billed / tot) * 100) : 0
          return React.createElement('div', {
            className: 'dshus-bar-seg',
            key: mm.key,
            style: { height: sh + '%', background: colorOf ? colorOf(mm.key) : undefined },
          })
        })
        var bar = React.createElement('div', {
          className: 'dshus-bar',
          // Zero-usage hours keep the grid slot but render no visible bar.
          style: empty
            ? { height: 0, minHeight: 0, background: 'transparent' }
            : { height: grown ? Math.max(4, h) + '%' : '0%' },
        }, segs)
        return React.createElement('div', { className: 'dshus-hour', key: item.hour },
          React.createElement('div', { className: 'dshus-hour-bar' }, bar),
          React.createElement('div', { className: 'dshus-bar-label' }, daily
            ? ((hourModels.length <= 7 || index % 5 === 0 || index === hourModels.length - 1) ? item.date.slice(5).replace('-', '/') : '')
            : (item.hour % 3 === 0 || item.hour === 23 ? item.hour : '')),
        )
      })
      var callDots = hourModels.map(function (item, i) {
        var calls = byHour[item.hour] ? Number(byHour[item.hour].calls) || 0 : 0
        if (calls === 0) return null
        return React.createElement('div', {
          key: 'call-' + item.hour,
          className: 'dshus-call-dot',
          style: { left: ((i + 0.5) / hourModels.length * 100) + '%', top: callY(calls) + 'px', transform: 'translate(-50%, -50%) translateY(' + (grown ? 0 : callBaseline - callY(calls)) + 'px)' },
        })
      })
      var hitAreas = hourModels.map(function (item, i) {
        var bucket = byHour[item.hour] || {}
        return React.createElement('div', {
          key: 'hit-' + item.hour,
          className: 'dshus-hour-hit',
          role: 'gridcell',
          tabIndex: 0,
          'aria-label': t('{time}，{count} 次调用，{tokens} tokens', { time: daily ? item.date : t('{hour}时', { hour: item.hour }), count: bucket.calls || 0, tokens: fmt(bucket.billed || 0) }),
          onMouseMove: function (e) { showTip(e, i) },
          onFocus: function (e) {
            var rect = e.currentTarget.getBoundingClientRect()
            showTip({ clientX: rect.left, clientY: rect.bottom }, i)
          },
          onBlur: hideTip,
        })
      })
      return React.createElement('div', null,
        React.createElement('div', { className: 'dshus-bars-wrap' },
          yAxis,
          React.createElement('div', { className: 'dshus-chart-area' },
            grid,
            React.createElement('div', { className: 'dshus-bars' },
              React.createElement('div', { className: 'dshus-bars-content', ref: barsRef },
                columns,
                React.createElement('svg', { className: 'dshus-call-line', viewBox: '0 0 ' + hourModels.length * 10 + ' 150', preserveAspectRatio: 'none', 'aria-hidden': true },
                  React.createElement('g', { className: 'dshus-call-path', style: { transformOrigin: '0 ' + callBaseline + 'px', transform: grown ? 'scaleY(1)' : 'scaleY(0)' } },
                    React.createElement('polyline', { points: callPoints, fill: 'none', stroke: '#3b82f6', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }),
                  ),
                ),
                callDots,
                tip !== null && React.createElement('div', { className: 'dshus-hover-line', style: { left: ((tip.index + 0.5) / hourModels.length * 100) + '%' } }),
                React.createElement('div', { className: 'dshus-hour-hit-area', role: 'grid', 'aria-label': daily ? t('每日Token用量与调用次数') : t('今日每小时用量与调用次数'), onMouseLeave: hideTip }, hitAreas),
              ),
            ),
          ),
          React.createElement('div', { className: 'dshus-call-axis', 'aria-label': t('调用次数') },
            React.createElement('span', { style: { top: '0%' } }, callYMax),
            React.createElement('span', { style: { top: '100%' } }, '0'),
          ),
        ),
        React.createElement('div', { className: 'dshus-call-axis-label' }, t('调用次数')),
        tipEl,
      )
    }

    /* ------------------------------------------------------------------ */
    /* Daily token trend                                                   */
    /* ------------------------------------------------------------------ */

    function DailyTrend(props) {
      var count = props.period === 'month' ? 30 : 7
      var today = Date.parse(new Date(Date.now() - props.tz * 60000).toISOString().slice(0, 10) + 'T00:00:00Z') / 86400000
      var dayModels = []
      var dayTotals = []
      for (var i = 0; i < count; i++) {
        var date = new Date((today - count + 1 + i) * 86400000).toISOString().slice(0, 10)
        var bucket = props.dayMap.get(date)
        var value = bucket ? bucket.billed || 0 : 0
        var models = props.dayModelMap.get(date) || []
        if (!models.length && value > 0) models = [{ key: '__all__', provider: '', model: t('全部'), billed: value }]
        // The daily breakdown is keyed by model alone, so the same model served by
        // two providers folds into one row instead of repeating under each provider.
        var merged = groupModelRows(models)
        dayModels.push({ hour: i, date: date, models: merged.length ? merged : models })
        dayTotals.push({ hour: i, date: date, billed: value, calls: bucket ? bucket.calls || 0 : 0 })
      }
      // Merged rows are keyed "by-model:<name>", which the provider-keyed colour
      // lookup does not know, so resolve those from the shared model palette.
      // The key never varies across days, so a model keeps one colour chart-wide.
      var trendColorOf = function (key) {
        if (key.indexOf('by-model:') !== 0) return props.colorOf(key)
        return sharedModelColor(key.slice('by-model:'.length))
      }
      // A fresh chart instance restarts the grow-in animation for every day
      // when switching between seven and thirty days.
      return React.createElement(Bars, { key: props.period, hourModels: dayModels, byHour: dayTotals, colorOf: trendColorOf, variant: 'daily' })
    }

    /* ------------------------------------------------------------------ */
    /* Per-model donut chart                                               */
    /* ------------------------------------------------------------------ */

    /** Distinct, theme-agnostic hues for the model segments. */
    var DONUT_COLORS = sharedModelColors

    function Donut(props) {
      var byModel = props.byModel || []
      var onSelect = props.onSelect
      var colorOf = props.colorOf

      // ALL hooks run unconditionally, before any early return, so the hook
      // count stays identical across empty/non-empty renders.
      // Custom hover tooltip (replaces the ugly native one). Position follows
      // the cursor; content = model + tokens + share.
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var tipKeyState = React.useState('')
      var tipKey = tipKeyState[0]
      var setTipKey = tipKeyState[1]

      if (byModel.length === 0) return React.createElement('div', { className: 'dshus-muted' }, t('没有按模型聚合的数据'))
      var total = 0
      for (var i = 0; i < byModel.length; i++) total += byModel[i].billed
      if (!(total > 0)) return React.createElement('div', { className: 'dshus-muted' }, t('没有按模型聚合的数据'))

      // Keep the chart readable: top 8 models + "其他" for the rest.
      var show = byModel.slice(0, 8)
      var restBilled = 0
      for (var r = 8; r < byModel.length; r++) restBilled += byModel[r].billed
      if (restBilled > 0) show.push({ key: '__rest__', provider: '', model: t('其他'), billed: restBilled })

      var showTip = function (e, key) {
        setTipKey(key)
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 220 > window.innerWidth) x = e.clientX - 220
        setTip({ x: x, y: y })
        window.addEventListener('scroll', hideTip, { passive: true, once: true })
      }
      var hideTip = function () {
        setTip(null)
        setTipKey('')
      }
      var tipData = null
      for (var ti = 0; ti < show.length; ti++) {
        if (show[ti].key === tipKey) {
          tipData = show[ti]
          break
        }
      }
      var tipEl = null
      if (tip !== null && tipData) {
        var tipLabel = tipData.provider ? tipData.provider + ' · ' + tipData.model : tipData.model
        var tipPct = (tipData.billed / total) * 100
        tipEl = React.createElement('div', {
          className: 'dshus-tip',
          style: { left: tip.x, top: tip.y },
        },
          React.createElement('div', { className: 'dshus-tip-name' }, tipLabel),
          React.createElement('div', { className: 'dshus-tip-val' },
            fmt(tipData.billed) + ' tokens · ' + formatPct(tipPct)),
        )
      }

      var SIZE = 168
      var R = 62
      var STROKE = 26
      var C = 2 * Math.PI * R
      var cumAngle = -90 // start at 12 o'clock
      var arcs = show.map(function (m, idx) {
        var frac = m.billed / total
        var arcLen = Math.max(frac * C - 2, 0.5)
        var el = React.createElement('circle', {
          key: m.key,
          cx: SIZE / 2,
          cy: SIZE / 2,
          r: R,
          fill: 'none',
          stroke: colorOf ? colorOf(m.key) : DONUT_COLORS[idx % DONUT_COLORS.length],
          strokeWidth: STROKE,
          strokeDasharray: arcLen + ' ' + (C - arcLen),
          transform: 'rotate(' + cumAngle + ' ' + (SIZE / 2) + ' ' + (SIZE / 2) + ')',
          style: { cursor: m.key === '__rest__' ? 'default' : 'pointer' },
          onMouseMove: function (e) { showTip(e, m.key) },
          onMouseLeave: hideTip,
        })
        cumAngle += frac * 360
        return el
      })

      var legend = show.map(function (m, idx) {
        var pct = (m.billed / total) * 100
        var label = m.provider ? m.provider + ' · ' + m.model : m.model
        return React.createElement('div', {
          className: 'dshus-donut-row',
          key: m.key,
          onMouseMove: function (e) { showTip(e, m.key) },
          onMouseLeave: hideTip,
          onClick: m.key !== '__rest__' && onSelect ? function () { onSelect(m.key) } : undefined,
        },
          React.createElement('span', { className: 'dshus-donut-dot', style: { background: colorOf ? colorOf(m.key) : DONUT_COLORS[idx % DONUT_COLORS.length] } }),
          React.createElement('span', { className: 'dshus-donut-name' }, label),
          React.createElement('span', { className: 'dshus-donut-pct' }, formatPct(pct)),
          React.createElement('span', { className: 'dshus-donut-val' }, fmt(m.billed)),
        )
      })

      return React.createElement('div', { className: 'dshus-donut' },
        React.createElement('div', { className: 'dshus-donut-wrap', style: { width: SIZE, height: SIZE } },
          React.createElement('svg', { width: SIZE, height: SIZE, viewBox: '0 0 ' + SIZE + ' ' + SIZE }, arcs),
          React.createElement('div', { className: 'dshus-donut-center' },
            React.createElement('div', { className: 'v' }, fmt(total)),
            React.createElement('div', { className: 'k' }, 'tokens'),
          ),
        ),
        React.createElement('div', { className: 'dshus-donut-legend' }, legend),
        tipEl,
      )
    }

    function refreshIconButton(onClick, loading, label, alignEnd) {
      return React.createElement('button', {
        type: 'button',
        className: 'dshus-btn dshus-icon-btn' + (alignEnd ? ' dshus-heading-refresh' : ''),
        onClick: onClick,
        disabled: loading,
        title: label,
        'aria-label': label,
      }, loading
        ? React.createElement('span', { className: 'dshus-spin', 'aria-hidden': 'true' })
        : React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          React.createElement('path', { d: 'M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7M18.5 15A7 7 0 0 1 6 17' }),
        ))
    }

    // Keep the last successful response during refreshes and transient failures.
    // Request generations prevent a late background read from replacing a newer snapshot.
    function quotaFailed(body) { return !body || body.ok === false || body.status === 'error' }

    function useQuotaData(loader, props) {
      var state = React.useState(null)
      var data = state[0]
      var setData = state[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)
      var busyRef = React.useRef(false)
      var loaderRef = React.useRef(loader)
      var pausedRef = React.useRef(false)
      loaderRef.current = loader
      pausedRef.current = props.active === false || props.refreshing === true
      function load(fresh) {
        if (busyRef.current || pausedRef.current) return
        var request = ++requestRef.current
        busyRef.current = true
        setLoading(true)
        setError('')
        return loaderRef.current(fresh).then(function (body) {
          if (request !== requestRef.current) return
          if (quotaFailed(body)) throw new Error(body && body.error || '操作失败，请稍后重试。')
          setData(body)
        }).catch(function (err) {
          if (request === requestRef.current) setError(String(err && err.message || err))
        }).finally(function () {
          if (request !== requestRef.current) return
          busyRef.current = false
          setLoading(false)
        })
      }
      React.useEffect(function () {
        if (props.active === false) return
        load(false)
        var timer = typeof setInterval === 'function' ? setInterval(function () { load(false) }, 30000) : null
        return function () {
          requestRef.current++
          busyRef.current = false
          if (timer !== null) clearInterval(timer)
        }
      }, [props.active, props.revision])
      React.useEffect(function () {
        if (props.snapshot === undefined) return
        requestRef.current++
        busyRef.current = false
        if (quotaFailed(props.snapshot)) {
          setError(String(props.snapshot && props.snapshot.error || '操作失败，请稍后重试。'))
          setLoading(false)
          return
        }
        setData(props.snapshot)
        setLoading(false)
        setError('')
      }, [props.snapshot])
      return { data: data, loading: loading || props.refreshing === true, error: error, load: load }
    }

    function ProviderQuotasPanel(props) {
      var resource = useQuotaData(function (fresh) { return props.api.providerQuotas({ fresh: fresh }) }, props)
      var data = resource.data, loading = resource.loading, load = resource.load
      var quotas = data && data.ok === true && Array.isArray(data.quotas) ? data.quotas : []
      if (!quotas.length) return resource.error ? React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)) : null

      function isBalanceOnly(quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        return metrics.length ? metrics.every(function (metric) { return metric.kind === 'amount' }) : quota.kind === 'balance'
      }
      // Partition a copy so refreshing keeps each group's original provider order.
      quotas = quotas.filter(isBalanceOnly).concat(quotas.filter(function (quota) { return !isBalanceOnly(quota) }))
      return React.createElement('div', { className: 'dshus-provider-panels' }, resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)), quotas.map(function (quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        // 上次获取时间：同一张配额卡片内，所有指标共享同一个获取时刻。
        var fetchedLine = React.createElement('div', { className: 'dshus-fetched' },
          t('上次获取时间：{time}', { time: fmtFetched(quota.syncedAt) }))
        if (!metrics.length) {
          if (quota.status !== 'unqueried' && quota.status !== 'unavailable') return null
          var statusLabel = quota.status === 'unqueried' ? t('未查询') : t('未获取')
          return React.createElement('div', { key: quota.provider, className: 'dshus-module dshus-balance-module' },
            React.createElement('div', { className: 'dshus-balance-title' },
              React.createElement('h3', null, t(quota.name)),
              refreshIconButton(function () { load(true) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
            ),
            React.createElement('div', { className: 'dshus-balance-side' },
              React.createElement('div', {
                className: 'dshus-balance-value dshus-balance-status',
                'aria-label': t('{name} 配额{status}', { name: t(quota.name), status: statusLabel }),
                title: quota.status === 'unqueried' ? t('已在模型设置中配置，尚未查询配额。') : t('尚未获取到有效配额，可刷新重试。'),
              }, statusLabel),
              fetchedLine,
            ),
          )
        }
        var cards = []
        var windowRows = []
        metrics.forEach(function (metric, index) {
          var isWindow = metric.kind === 'window'
          var pct = isWindow ? Math.max(0, Math.min(100, Number(metric.remainingPercent))) : null
          var total = Number(metric.total)
          var remaining = Number(metric.remaining)
          var hasRatio = isWindow || (Number.isFinite(total) && total > 0 && Number.isFinite(remaining))
          if (!isWindow && hasRatio) pct = Math.max(0, Math.min(100, remaining / total * 100))
          var color = pct === null || pct >= 30 ? '#22c55e' : pct >= 10 ? '#f59e0b' : '#ef4444'
          var symbol = metric.currency === 'CNY' ? '¥' : metric.currency === 'USD' ? '$' : ''
          var value = isWindow ? Math.round(pct) + '%' : symbol + remaining.toFixed(2)
          var detail = isWindow && Number.isFinite(total) && total > 0 && Number.isFinite(remaining)
            ? fmtExact(remaining) + ' / ' + fmtExact(total)
            : !isWindow && Number.isFinite(total) && total > 0 ? t('上限 {amount}', { amount: symbol + total.toFixed(2) }) : ''
          if (isWindow) {
            var reset = metric.resetAt ? fmtReset(metric.resetAt) : ''
            windowRows.push(React.createElement('div', { key: metric.label + '-' + index, className: 'dshus-quota-row' },
              React.createElement('div', { className: 'dshus-quota-name' },
                React.createElement('span', { className: 'dshus-quota-label' }, quotaLabel(metric.label, quota.custom)),
                detail && React.createElement('span', { className: 'dshus-quota-detail' }, detail),
              ),
              React.createElement('div', {
                className: 'dshus-go-track',
                role: 'progressbar',
                'aria-label': quotaLabel(metric.label, quota.custom),
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': pct,
                'aria-valuetext': t('剩余 {value}', { value: value }) + (detail ? '，' + detail : '') + (reset ? '，' + reset : ''),
              }, React.createElement('div', { className: 'dshus-go-fill', style: { width: pct + '%', background: color } })),
              React.createElement('span', { className: 'dshus-quota-pct', style: { color: color }, title: t('剩余 {value}', { value: formatPct(pct) }) }, value),
              React.createElement('span', { className: 'dshus-quota-reset', title: metric.resetAt ? t('重置时间：{time}', { time: fmtFetched(metric.resetAt) }) : undefined }, reset),
            ))
            return
          }
          // 余额的多值分栏保留数值、上限和比例。
          cards.push(React.createElement('div', { key: metric.label + '-' + index, className: 'dshus-stat' },
            React.createElement('div', { className: 'v', style: { color: isWindow ? color : undefined } }, value),
            React.createElement('div', { className: 'k' }, quotaLabel(metric.label, quota.custom)),
            hasRatio && React.createElement('div', { className: 'dshus-go-track' },
              React.createElement('div', { className: 'dshus-go-fill', style: { width: pct + '%', background: color } }),
            ),
            (detail || metric.resetAt) && React.createElement('div', { className: 'dshus-go-foot' },
              React.createElement('span', null, detail),
              React.createElement('span', { className: 'dshus-go-reset' }, metric.resetAt ? fmtReset(metric.resetAt) : ''),
            ),
          ))
        })
        var balance = metrics.length === 1 && metrics[0].kind === 'amount' && metrics[0].total == null
          ? metrics[0] : null
        if (balance) {
          var refreshBtn = refreshIconButton(function () { load(true) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false)
          var balanceSymbol = balance.currency === 'CNY' ? '¥' : balance.currency === 'USD' ? '$' : ''
          return React.createElement('div', { key: quota.provider, className: 'dshus-module dshus-balance-module' },
            React.createElement('div', { className: 'dshus-balance-title' },
              React.createElement('h3', null, t(quota.name)),
              refreshBtn,
            ),
            React.createElement('div', { className: 'dshus-balance-side' },
              React.createElement('div', { className: 'dshus-balance-value', 'aria-label': quotaLabel(balance.label, quota.custom) + ' ' + balanceSymbol + Number(balance.remaining).toFixed(2) },
                balanceSymbol + Number(balance.remaining).toFixed(2)),
              fetchedLine,
            ),
          )
        }
        return React.createElement('div', { key: quota.provider, className: 'dshus-module' },
          React.createElement('div', { className: 'dshus-quota-heading' },
            React.createElement('h3', null, t(quota.name)),
            fetchedLine,
            refreshIconButton(function () { load(true) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
          ),
          cards.length > 0 && React.createElement('div', { className: 'dshus-statbar dshus-quota-bar' }, cards),
          windowRows.length > 0 && React.createElement('div', { className: 'dshus-quota-rows' }, windowRows),
        )
      }))
    }

    /* ------------------------------------------------------------------ */
    /* WorkBuddy quota panel (data from the dsh-workbuddy-connect plugin)  */
    /* ------------------------------------------------------------------ */

    /**
     * WorkBuddy and WorkBuddy AI account and credit boards. All data
     * comes from the dsh-workbuddy-connect plugin's own status routes,
     * which read the matching WorkBuddy
     * desktop sign-in and the live billing packages. Credit bars follow the
     * official quota-card convention: the lit part of the bar is the REMAINING
     * quota. Only a successful signed-in credit response is rendered.
     */
    function WorkBuddyPanel(props) {
      var api = props.api
      var source = props.source || 'workbuddy'
      var name = source === 'workbuddy-ai' ? 'WorkBuddy AI' : 'WorkBuddy'

      // All hooks are declared unconditionally at the top (before any early
      // return below) so React's hook order never breaks.
      var resource = useQuotaData(function (fresh) { return api.workbuddyStatus({ fresh: fresh === true, source: source }) }, props)
      var wbData = resource.data, wbLoading = resource.loading, load = resource.load
      // Collapsed by default: only the in-use package (+ the next richest one)
      // is shown; the rest hide behind a toggle so a dozen small packages
      // don't stack the board.
      var wbExpandedState = React.useState(false)
      var wbExpanded = wbExpandedState[0]
      var setWbExpanded = wbExpandedState[1]

      var connected = wbData !== null && wbData.ok !== false && wbData.status === 'signed-in' &&
        wbData.credits && Number.isFinite(Number(wbData.credits.total))
      if (!connected) {
        if (!wbData || wbData.available !== true) return resource.error ? React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)) : null
        var statusLabel = wbData.status === 'unqueried' ? t('未查询') : wbData.status === 'signed-out' ? t('未登录') : t('未获取')
        return React.createElement('div', { className: 'dshus-module dshus-balance-module' },
          resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
          React.createElement('div', { className: 'dshus-balance-title' },
            React.createElement('h3', null, name),
            refreshIconButton(function () { load(true) }, wbLoading, t('刷新 {name} 账号与积分', { name: name }), false)),
          React.createElement('div', { className: 'dshus-balance-side' },
            React.createElement('div', { className: 'dshus-balance-value dshus-balance-status' }, statusLabel),
            React.createElement('div', { className: 'dshus-fetched' }, t('上次获取时间：{time}', { time: fmtFetched(wbData.syncedAt) }))))
      }

      var refreshBtn = refreshIconButton(function () { load(true) }, wbLoading, t('刷新 {name} 账号与积分', { name: name }), false)

      var contentEl
      {
        var cards = []

        // Card 1: aggregated remaining credit over all billing packages.
        var credits = wbData.credits || null
        var accounts = credits && Array.isArray(credits.accounts) ? credits.accounts : []
        var active = accounts.filter(function (a) { return a && a.remain > 0 })
        if (credits) {
          cards.push(React.createElement('div', {
            key: '__total__',
            className: 'dshus-card dshus-go-card dshus-go-last',
          },
            React.createElement('div', { className: 'dshus-go-head' },
              React.createElement('div', { className: 'k' }, t('剩余积分合计')),
              React.createElement('div', { className: 'dshus-go-pct dshus-wb-total-value', style: { color: 'var(--dsw-alias-label-primary, #1f2430)' } },
                fmtExact(credits.total)),
            ),
            React.createElement('div', { className: 'dshus-go-foot' },
              React.createElement('span', null, t('有效套餐 {active} / {total} 个', { active: active.length, total: accounts.length })),
            ),
          ))
        }
        // One card per funded billing package: the lit part of the bar is the
        // REMAINING quota (official quota-card convention). Ordering: a
        // partially-consumed package (the one being used right now — billing
        // draws it down first) leads, then the richest untouched package;
        // duplicate package names stay separate. Only the first two are
        // rendered until the user expands the rest.
        function isPartlyUsed(a) {
          var s = Number(a.size) || 0
          var r = Number(a.remain) || 0
          return s > 0 && r > 0 && r < s
        }
        var sorted = active.slice().sort(function (a, b) {
          var au = isPartlyUsed(a) ? 0 : 1
          var bu = isPartlyUsed(b) ? 0 : 1
          if (au !== bu) return au - bu
          if (au === 0) return (Number(a.remain) || 0) - (Number(b.remain) || 0)
          return (Number(b.remain) || 0) - (Number(a.remain) || 0)
        })
        var visible = wbExpanded ? sorted : sorted.slice(0, 2)
        for (var ai = 0; ai < visible.length; ai++) {
          var acc = visible[ai]
          var size = Number(acc.size) || 0
          var remain = Number(acc.remain) || 0
          var remPct = size > 0 ? Math.max(0, Math.min(100, Math.round(remain / size * 100))) : 100
          var barColor = remPct >= 30 ? '#22c55e' : remPct >= 10 ? '#f59e0b' : '#ef4444'
          cards.push(React.createElement('div', {
            key: (acc.packageName || 'package') + '-' + ai,
            role: 'graphics-symbol',
            'aria-label': t('{name} 剩余 {percent}%', { name: acc.packageName || t('套餐'), percent: remPct }),
            className: 'dshus-card dshus-go-card',
          },
            React.createElement('div', { className: 'dshus-go-head' },
              React.createElement('div', { className: 'k dshus-wb-name' }, acc.packageName || t('计费套餐')),
              isPartlyUsed(acc) ? React.createElement('span', { className: 'dshus-wb-inuse' }, t('使用中')) : null,
              React.createElement('div', { className: 'dshus-go-pct', style: { color: barColor } }, remPct + '%'),
            ),
            React.createElement('div', { className: 'dshus-go-track' },
              React.createElement('div', { className: 'dshus-go-fill', style: { width: remPct + '%', background: barColor } }),
            ),
            React.createElement('div', { className: 'dshus-go-foot' },
              React.createElement('span', null, size > 0
                ? t('{value} 积分', { value: fmtExact(remain) + ' / ' + fmtExact(size) })
                : t('{value} 积分', { value: fmtExact(remain) })),
            ),
          ))
        }

        var body = []
        if (cards.length > 0) {
          body.push(React.createElement('div', { className: 'dshus-go-cards', key: '__cards__' }, cards))
          if (sorted.length > 2) {
            body.push(React.createElement('div', { style: { textAlign: 'center', marginTop: 10 }, key: '__wb-toggle__' },
              React.createElement('button', {
                type: 'button',
                className: 'dshus-btn',
                onClick: function () { setWbExpanded(!wbExpanded) },
                style: { fontSize: 12, height: 28, padding: '0 16px', margin: '0 auto' },
              }, wbExpanded ? t('收起其余套餐') : t('展开其余 {count} 个套餐', { count: sorted.length - 2 })),
            ))
          }
        }
        // Model offers (free / promo-priced), same catalog the plugin card shows.
        var offers = Array.isArray(wbData.models) ? wbData.models.filter(function (m) {
          return m && (m.free === true || (Array.isArray(m.badges) && m.badges.length > 0))
        }) : []
        if (offers.length > 0) {
          var chips = offers.map(function (m) {
            var tags = []
            if (m.free === true) tags.push(t('免费'))
            if (Array.isArray(m.badges)) tags = tags.concat(m.badges.map(function (badge) { return t(badge) }))
            return React.createElement('span', { className: 'dshus-wb-chip', key: m.id || m.name },
              React.createElement('span', null, m.name || m.id),
              m.credits !== undefined ? React.createElement('span', { className: 'rate' }, t('{value} 积分/次', { value: m.credits })) : null,
              tags.map(function (tg) { return React.createElement('span', { className: 'tag', key: tg }, tg) }),
            )
          })
          body.push(React.createElement('div', { className: 'dshus-wb-chips', key: '__models__' },
            React.createElement('span', { className: 'dshus-wb-chips-label' }, t('模型优惠')),
            chips,
          ))
        }
        contentEl = React.createElement(React.Fragment, null, body)
      }

      return React.createElement('div', { className: 'dshus-module dshus-wb-module' },
        resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
        React.createElement('div', { className: 'dshus-quota-heading' },
          React.createElement('h3', null, name),
          React.createElement('div', { className: 'dshus-fetched' }, t('上次获取时间：{time}', { time: fmtFetched(wbData.syncedAt) })),
          refreshBtn,
        ),
        contentEl,
      )
    }

    /** Select-only combobox: real status dots, with focus kept on the trigger. */
    function ProviderPicker(props) {
      var openState = React.useState(false)
      var open = openState[0], setOpen = openState[1]
      var activeState = React.useState(0)
      var active = activeState[0], setActive = activeState[1]
      var placementState = React.useState({ above: false, height: 260 })
      var placement = placementState[0], setPlacement = placementState[1]
      var rootRef = React.useRef(null)
      var listRef = React.useRef(null)
      var searchRef = React.useRef({ text: '', at: 0 })
      var options = props.options
      var selected = options.find(function (item) { return item.value === props.value }) || options[0]
      var activeIndex = Math.max(0, Math.min(active, options.length - 1))
      var listId = props.id + '-list'

      function show(index) {
        if (props.disabled) return
        var root = rootRef.current
        if (root) {
          var rect = root.getBoundingClientRect()
          var top = 0, bottom = window.innerHeight
          for (var parent = root.parentElement; parent; parent = parent.parentElement) {
            if (/(auto|scroll|hidden|clip)/.test(window.getComputedStyle(parent).overflowY)) {
              var bounds = parent.getBoundingClientRect()
              top = Math.max(top, bounds.top)
              bottom = Math.min(bottom, bounds.bottom)
            }
          }
          var page = root.closest('.dshus-page')
          var toolbar = page && page.querySelector('.dshus-toolbar')
          if (toolbar) top = Math.max(top, toolbar.getBoundingClientRect().bottom)
          var below = bottom - rect.bottom - 8
          var above = rect.top - top - 8
          var flip = below < 200 && above > below
          setPlacement({ above: flip, height: Math.max(34, Math.min(260, flip ? above : below)) })
        }
        setActive(index == null ? Math.max(0, options.indexOf(selected)) : index)
        searchRef.current = { text: '', at: 0 }
        setOpen(true)
      }
      function choose(index) {
        if (props.disabled) return
        setOpen(false)
        props.onChange(options[index].value)
      }
      function onKeyDown(event) {
        if (props.disabled) return
        var key = event.key
        if (key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
        } else if (key === 'Tab') setOpen(false)
        else if (key === 'Enter' || key === ' ') {
          event.preventDefault()
          if (open) choose(activeIndex)
          else show()
        } else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
          event.preventDefault()
          var index = key === 'Home' ? 0 : key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, activeIndex + (key === 'ArrowDown' ? 1 : -1)))
          if (open) setActive(index)
          else show(key === 'Home' || key === 'End' ? index : null)
        } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          var now = Date.now()
          var search = open && now - searchRef.current.at < 700 ? searchRef.current.text + key.toLowerCase() : key.toLowerCase()
          if (search.split('').every(function (char) { return char === search[0] })) search = search[0]
          searchRef.current = { text: search, at: now }
          var start = search.length > 1 ? activeIndex : activeIndex + 1
          for (var offset = 0; offset < options.length; offset++) {
            var match = (start + offset) % options.length
            if (options[match].name.toLowerCase().startsWith(search)) {
              if (open) setActive(match)
              else { show(match); searchRef.current = { text: search, at: now } }
              break
            }
          }
        }
      }
      React.useEffect(function () {
        if (!open) return
        function outside(event) { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false) }
        function scroll(event) { if (listRef.current && !listRef.current.contains(event.target)) setOpen(false) }
        function close() { setOpen(false) }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('scroll', scroll, true)
        window.addEventListener('resize', close)
        return function () {
          document.removeEventListener('pointerdown', outside)
          document.removeEventListener('scroll', scroll, true)
          window.removeEventListener('resize', close)
        }
      }, [open])
      React.useEffect(function () {
        // Scroll only the menu. scrollIntoView() can also move the settings pane.
        var list = listRef.current
        var item = list && list.children[activeIndex]
        if (!open || !item) return
        if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
        else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
      }, [open, activeIndex])
      React.useEffect(function () { if (props.disabled) setOpen(false) }, [props.disabled])

      function dot(source) { return source ? React.createElement('span', { className: 'dshus-provider-dot', 'aria-hidden': 'true' }) : null }
      return React.createElement('div', { className: 'dshus-provider-picker', ref: rootRef },
        React.createElement('button', { id: props.id, type: 'button', role: 'combobox', className: 'dshus-field dshus-query-select', disabled: props.disabled, 'aria-labelledby': props.labelId + ' ' + props.id + '-value', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? listId : undefined, 'aria-activedescendant': open ? listId + '-' + activeIndex : undefined, onClick: function () { if (open) setOpen(false); else show() }, onKeyDown: onKeyDown },
          React.createElement('span', { id: props.id + '-value', className: 'dshus-provider-name' }, selected.name),
          dot(selected.source),
          React.createElement('svg', { className: 'dshus-provider-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
        open && React.createElement('div', { id: listId, role: 'listbox', 'aria-labelledby': props.labelId, className: 'dshus-provider-list' + (placement.above ? ' above' : ''), style: { maxHeight: placement.height }, ref: listRef },
          options.map(function (item, index) {
            // A stationary cursor must not override keyboard navigation as rows scroll past it.
            return React.createElement('div', { key: item.value, id: listId + '-' + index, role: 'option', 'data-value': item.value, 'aria-selected': item.value === props.value, 'aria-label': item.name + (item.source ? '，' + item.source : ''), title: item.source || undefined, className: 'dshus-provider-option' + (index === activeIndex ? ' active' : ''), onMouseMove: function () { setActive(index) }, onMouseDown: function (event) { event.preventDefault() }, onClick: function () { choose(index) } },
              React.createElement('span', { className: 'dshus-provider-name' }, item.name), dot(item.source))
          })),
      )
    }

    /**
     * The template schema, written as an instruction an assistant can act on.
     * Kept as a plain string so the whole thing can go to the clipboard verbatim:
     * pasting it into any chat assistant should produce a paste-ready template
     * without the user having to explain the schema themselves.
     */
    function buildTemplatePrompt(context) {
      var name = (context && context.name) || t('该供应商')
      var key = (context && context.provider) || ''
      var existing = (context && context.template) || null
      return [
        t('请帮我为「{name}」写一份 DSH 用量统计插件的余额查询模板（JSON）。', { name: name }),
        '',
        t('【输出要求】'),
        t('只输出一个 JSON 对象，不要解释、不要 markdown 代码块围栏。'),
        '',
        t('【获取接口信息的方式】'),
        t('请先自己联网搜索「{name}」的余额 / 用量查询接口文档，不要一上来就找我要资料。', { name: name }),
        t('优先按下面的顺序查：官方 API 文档 → 余额或 billing / usage 接口说明 → 社区示例或 SDK 源码。'),
        t('如果能查到明确的接口地址与返回字段，直接据此写出模板。'),
        t('只有在确实查不到、或查到多个互相冲突的结果时，才向我提问；提问要具体，一次只问最关键的一点。'),
        t('如果你搜索到的是猜测而非确定的字段路径，请在回答里简要注明依据，方便我核对。'),
        '',
        t('【字段说明】'),
        t('url：查询地址，必须与下面 auth 所用凭据同源。'),
        t('method：GET 或 POST。'),
        t('auth："provider" 表示复用该供应商已保存的凭据；"none" 表示不需要认证。'),
        t('headers：可选，附加请求头对象。'),
        t('body：可选，POST 时发送的请求体对象。'),
        t('response.rows：可选。当余额在数组里时填写该数组的字段路径，例如 "data.list"。'),
        t('response.metrics：指标数组，每项包含：'),
        t('  label：界面显示的名称，例如 "账户可用余额"。'),
        t('  kind："amount" 表示金额，"window" 表示带重置时间的额度窗口。'),
        t('  remaining：金额型指标在响应中的字段路径，例如 "data.balance"。'),
        t('  usedPercent / remainingPercent：额度窗口型指标使用，取值为百分比字段路径。'),
        t('  currency：可选，金额单位，如 "CNY" 或 "USD"。'),
        '',
        t('【取值规则】'),
        t('字段路径用点号表示层级，例如 data.balance_infos.0.total_balance。'),
        t('数字字符串也要能直接使用，不要额外包装。'),
        '',
        t('【参考格式】'),
        '{',
        '  "url": "https://api.example.com/user/balance",',
        '  "method": "GET",',
        '  "auth": "provider",',
        '  "response": {',
        '    "metrics": [',
        '      { "label": ' + JSON.stringify(t('账户可用余额')) + ', "kind": "amount", "remaining": "data.balance", "currency": "CNY" }',
        '    ]',
        '  }',
        '}',
        '',
        t('【当前情况】'),
        t('供应商 ID：{provider}', { provider: key || t('（未指定）') }),
        existing
          ? t('现有模板（可在此基础上修正）：\n') + JSON.stringify(existing, null, 2)
          : t('该供应商目前没有模板，请从零编写。'),
      ].join('\n')
    }

    /** Settings use the host store so timers also work while this page is closed. */
    function ControlsPanel(props) {
      var control = props.control
      var settings = control.settings
      // Opt-in: a host that predates the setting has no key at all.
      var advancedModelSelect = settings.advancedModelSelect === true
      var providersState = React.useState([])
      var providers = providersState[0], setProviders = providersState[1]
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var templateState = React.useState('')
      var templateText = templateState[0], setTemplateText = templateState[1]
      var confirmState = React.useState(false)
      var confirmAuto = confirmState[0], setConfirmAuto = confirmState[1]
      var savingState = React.useState(false)
      var saving = savingState[0], setSaving = savingState[1]
      var testingState = React.useState(false)
      var testing = testingState[0], setTesting = testingState[1]
      var previewState = React.useState(null)
      var preview = previewState[0], setPreview = previewState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var statusState = React.useState('')
      var status = statusState[0], setStatus = statusState[1]
      var providerLoadingState = React.useState(true)
      var providerLoading = providerLoadingState[0], setProviderLoading = providerLoadingState[1]
      var copiedState = React.useState('')
      var copied = copiedState[0], setCopied = copiedState[1]
      var testRef = React.useRef(0)

      function loadProviders() {
        setProviderLoading(true)
        props.api.quotaProviders().then(function (body) {
          setProviders(body.providers || [])
          setProviderLoading(false)
        }).catch(function (err) { setError(String(err.message || err)); setProviderLoading(false) })
      }
      React.useEffect(function () { loadProviders(); return function () { testRef.current++ } }, [])

      function save(patch, message) {
        setSaving(true)
        setError('')
        setStatus('')
        return props.onSave(patch).then(function () {
          setSaving(false)
          setStatus(message || '设置已保存')
          if (patch.autoQuota !== undefined) setConfirmAuto(false)
        }).catch(function (err) { setSaving(false); setError(String(err.message || err)) })
      }
      function editTemplate(text) {
        testRef.current++
        setTemplateText(text)
        setPreview(null)
        setTesting(false)
        setStatus('')
        setError('')
      }
      function selectProvider(id) {
        setProvider(id)
        var saved = settings.customQueries.find(function (query) { return query.provider === id })
        var item = providers.find(function (entry) { return entry.provider === id })
        editTemplate(item && item.queryType === 'adapter' ? '' : saved || item ? JSON.stringify(saved ? saved.template : item.template, null, 2) : '')
      }
      /**
       * Copy the ready-made prompt. The clipboard API needs a secure context and
       * permission, so a rejection falls back to a hidden textarea + execCommand
       * and, if that also fails, tells the user to select the text by hand rather
       * than silently doing nothing.
       */
      function copyPrompt() {
        var text = buildTemplatePrompt({ provider: provider, name: promptProviderName, template: promptTemplate })
        function done() { setCopied('已复制，粘贴到任意 AI 对话即可'); setTimeout(function () { setCopied('') }, 4000) }
        function failed() { setCopied('复制失败，请手动选中下方提示词'); setTimeout(function () { setCopied('') }, 4000) }
        function fallback() {
          try {
            var area = document.createElement('textarea')
            area.value = text
            area.setAttribute('readonly', '')
            area.style.position = 'fixed'
            area.style.top = '-1000px'
            document.body.appendChild(area)
            area.select()
            var ok = document.execCommand('copy')
            document.body.removeChild(area)
            if (ok) done(); else failed()
          } catch (e) { failed() }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(fallback)
        } else fallback()
      }
      function refreshAdapter() {
        var item = providers.find(function (entry) { return entry.provider === provider })
        if (!item || item.queryType !== 'adapter') return
        var current = ++testRef.current
        setTesting(true)
        setError('')
        setStatus('')
        props.api.quotaSource(item.source, { fresh: true }).then(function (body) {
          if (current !== testRef.current) return
          setTesting(false)
          setStatus(body.status === 'signed-in' ? '查询已更新，可在配额页查看。' : body.status === 'signed-out' ? '请先在 WorkBuddy 中登录。' : '尚未获取到配额，请检查扩展是否启用后重试。')
        }).catch(function (err) {
          if (current !== testRef.current) return
          setTesting(false)
          setError(String(err.message || err))
        })
      }
      function testTemplate() {
        var template
        try { template = JSON.parse(templateText) } catch (e) { setError('模板不是有效 JSON，请检查引号、逗号和括号。'); return }
        var current = ++testRef.current
        setTesting(true)
        setPreview(null)
        setError('')
        setStatus('')
        props.api.testQuota(provider, template).then(function (body) {
          if (current !== testRef.current) return
          setTesting(false)
          setPreview({ result: body, text: templateText, provider: provider })
        }).catch(function (err) {
          if (current !== testRef.current) return
          setTesting(false)
          setError(String(err.message || err))
        })
      }
      function switchButton(label, checked, callback) {
        return React.createElement('button', { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked, className: 'dshus-switch' + (checked ? ' on' : ''), disabled: saving || !props.ready, onClick: callback })
      }
      // Kept next to the option list it describes: the status line below the
      // select reads the same value the selected <option> shows.
      function intervalLabel(minutes) {
        switch (Number(minutes)) {
          case 10: return t('10 分钟')
          case 300: return t('5 小时')
          case 1440: return t('每天')
          default: return t('1 小时')
        }
      }
      var validPreview = preview && preview.text === templateText && preview.provider === provider
      var selected = providers.find(function (entry) { return entry.provider === provider })
      // The prompt describes the provider the user is looking at, so it borrows
      // the live template when one is loaded and stays generic otherwise.
      var promptProviderName = selected ? selected.name : provider
      var promptTemplate = null
      if (templateText.trim()) {
        try { promptTemplate = JSON.parse(templateText) } catch (e) { promptTemplate = null }
      }
      return React.createElement('div', null,
        // The settings-load failure is not about one query, so it stays above both
        // modules; a query failure is reported inside the query module instead.
        props.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(props.error),
          React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: props.onReload }, t('重试'))),
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('div', { className: 'dshus-setting-row' },
            React.createElement('div', null,
              React.createElement('span', { className: 'dshus-setting-label' }, t('自动获取剩余余额'))),
            switchButton(t('自动获取剩余余额'), settings.autoQuota, function () { if (settings.autoQuota) save({ autoQuota: false }); else setConfirmAuto(true) }),
          ),
          confirmAuto && React.createElement('div', { className: 'dshus-confirm', role: 'alert', 'aria-label': t('自动查询费用提醒') },
            React.createElement('p', null, t('自动查询可能会消耗少量余额，具体取决于供应商的计费规则。确认开启后，将立即获取一次，之后按所选间隔更新。')),
            React.createElement('div', { className: 'dshus-control-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ autoQuota: true, acknowledgeCost: true }) } }, t('确认开启')),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { setConfirmAuto(false) } }, t('取消'))),
          ),
          React.createElement('div', { className: 'dshus-setting-row' },
            React.createElement('label', { id: 'dshus-auto-interval-label', htmlFor: 'dshus-auto-interval' },
              React.createElement('span', { className: 'dshus-setting-label' }, t('自动获取间隔'))),
            React.createElement('select', { id: 'dshus-auto-interval', className: 'dshus-field dshus-select', value: settings.intervalMinutes, disabled: saving || !props.ready, 'aria-labelledby': 'dshus-auto-interval-label', onChange: function (event) { save({ intervalMinutes: Number(event.target.value) }) } },
              [[10, t('10 分钟')], [60, t('1 小时')], [300, t('5 小时')], [1440, t('每天')]].map(function (option) { return React.createElement('option', { key: option[0], value: option[0] }, option[1]) })),
          ),
          // The select no longer carries a help line, so the row is followed by a
          // single status line: it names the next run once automatic fetching is
          // armed, and reads back the chosen interval otherwise.
          control.nextRefreshAt
            ? React.createElement('p', { className: 'dshus-control-status', role: 'status' }, t('下次获取：{time} · 当前设置：{interval}', { time: fmtInTz(control.nextRefreshAt, LOCAL_TZ), interval: intervalLabel(settings.intervalMinutes) }))
            : React.createElement('p', { className: 'dshus-control-status', role: 'status' }, t('当前设置：{interval}', { interval: intervalLabel(settings.intervalMinutes) })),
          React.createElement('div', { className: 'dshus-setting-row' },
            React.createElement('div', null,
              React.createElement('span', { className: 'dshus-setting-label' }, t('模型明细与分布'))),
            switchButton(t('模型明细与分布'), settings.showModelDetails, function () { save({ showModelDetails: !settings.showModelDetails }) }),
          ),
          React.createElement('div', { className: 'dshus-setting-row' },
            React.createElement('div', null,
              React.createElement('span', { className: 'dshus-setting-label' }, t('高级模型选择器'))),
            switchButton(t('高级模型选择器'), advancedModelSelect, function () {
              save({ advancedModelSelect: !advancedModelSelect }, advancedModelSelect ? '已关闭，已恢复官方模型选择器' : '已开启高级模型选择器')
            }),
          ),
        ),
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null, t('配额查询'), refreshIconButton(loadProviders, providerLoading, t('刷新供应商列表'), true)),
          React.createElement('label', { id: 'dshus-query-provider-label', className: 'dshus-setting-label', htmlFor: 'dshus-query-provider' }, t('查询来源')),
          React.createElement(ProviderPicker, { id: 'dshus-query-provider', labelId: 'dshus-query-provider-label', value: provider, disabled: saving || providerLoading || !props.ready, onChange: selectProvider, options: [{ value: '', name: providerLoading ? t('正在加载供应商…') : t('选择已有供应商') }].concat(providers.map(function (item) {
              var custom = settings.customQueries.some(function (query) { return query.provider === item.provider })
              var source = custom ? t('已保存自定义查询') : item.hasBuiltinQuery === true ? item.queryType === 'adapter' ? t('内置扩展查询') : t('内置供应商查询') : ''
              return { value: item.provider, name: t(item.name), source: source }
            })) }),
          !providerLoading && !providers.length && React.createElement('p', { className: 'dshus-setting-help' }, t('尚无可选来源，请先添加模型供应商或启用支持的扩展。')),
          // With no provider chosen there is still a failure worth showing here,
          // e.g. loading the provider list itself.
          !provider && error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          selected && selected.queryType === 'adapter' && React.createElement('div', { className: 'dshus-control-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing, onClick: refreshAdapter }, testing ? t('正在查询…') : t('查询配额')),
            error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error))),
          provider && (!selected || selected.queryType !== 'adapter') && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'dshus-control-actions' },
              React.createElement('label', { className: 'dshus-setting-label', htmlFor: 'dshus-query-template' }, t('查询模板（JSON）')),
              selected && React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { editTemplate(JSON.stringify(selected.template, null, 2)) } }, t('重置模板'))),
            React.createElement('textarea', { id: 'dshus-query-template', className: 'dshus-field dshus-query-editor', value: templateText, spellCheck: false, disabled: saving, onChange: function (event) { editTemplate(event.target.value) } }),
            // The old one-line schema description told the user what to write but
            // still left them to write it. This hands them a prompt to paste into
            // an AI instead, with the provider and current template already filled
            // in, and the text is selectable when the clipboard is unavailable.
            React.createElement('div', { className: 'dshus-prompt' },
              React.createElement('div', { className: 'dshus-prompt-head' },
                React.createElement('span', { className: 'dshus-prompt-title' }, t('用 AI 生成模板')),
                React.createElement('button', { type: 'button', className: 'dshus-btn dshus-prompt-copy', onClick: copyPrompt }, t('复制提示词'))),
              React.createElement('pre', { className: 'dshus-prompt-body', tabIndex: 0, 'aria-label': t('可复制的模板生成提示词') }, buildTemplatePrompt({ provider: provider, name: promptProviderName, template: promptTemplate })),
              copied && React.createElement('p', { className: 'dshus-prompt-note', role: 'status' }, t(copied))),
            React.createElement('div', { className: 'dshus-control-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing || !templateText.trim(), onClick: testTemplate }, testing ? t('正在测试…') : t('测试查询')),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing || !validPreview, onClick: function () { save({ action: 'save-query', provider: provider, template: JSON.parse(templateText), testId: preview.result.testId }, '已保存，可在配额页查看此供应商。') } }, saving ? t('正在保存…') : t('确认并显示'))),
            // The cost warning stays last, directly under the buttons that can
            // spend balance, so it is read right before the user acts.
            React.createElement('p', { className: 'dshus-cost-note' }, t('测试会发起一次请求，可能消耗少量余额。')),
            // A failed query belongs with the controls that produced it, so the
            // message sits inside this module rather than at the top of the page.
            error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
            validPreview && React.createElement('div', { className: 'dshus-query-preview', role: 'status' },
              React.createElement('strong', null, t('测试成功 · {name}', { name: t(preview.result.quota.name) })),
              preview.result.quota.metrics.map(function (metric, index) { return React.createElement('div', { key: index }, metric.label + '：' + (metric.kind === 'window' ? Math.round(metric.remainingPercent * 100) / 100 + '%' : (metric.currency === 'CNY' ? '¥' : metric.currency === 'USD' ? '$' : '') + fmtExact(metric.remaining))) })),
          ),
          settings.customQueries.length > 0 && React.createElement('div', { className: 'dshus-query-preview' },
            React.createElement('strong', null, t('已启用的自定义查询')),
            settings.customQueries.map(function (query) {
              var item = providers.find(function (entry) { return entry.provider === query.provider })
              return React.createElement('div', { key: query.provider, className: 'dshus-saved-query' },
                React.createElement('span', null, item ? item.name : query.provider),
                React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { selectProvider(query.provider) } }, t('编辑')),
                React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ action: 'remove-query', provider: query.provider }, '已移除自定义查询，恢复内置配额查询。') } }, t('移除')))
            })),
        ),
        React.createElement('div', { className: 'dshus-control-status', role: 'status' }, !props.ready && !props.error ? t('正在读取设置…') : t(status)),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Settings section page                                               */
    /* ------------------------------------------------------------------ */

    function UsageStatsSection(props) {
      useLocaleRevision()
      var api = props.api
      var intl = props.intl
      var modelState = React.useState('')
      var model = modelState[0]
      var setModel = modelState[1]

      var heatModeState = React.useState('daily')
      var heatMode = heatModeState[0]
      var setHeatMode = heatModeState[1]

      // Heatmap paging is owned here rather than inside Heatmap: the arrows sit
      // in the card header, so the header needs the page count and the current
      // range that only the heatmap layout math can compute. Heatmap publishes
      // them through onPageInfo and consumes the resulting index back.
      var heatNavState = React.useState({ mode: null, index: 0 })
      var heatNav = heatNavState[0]
      var setHeatNav = heatNavState[1]
      var heatInfoState = React.useState(null)
      var heatInfo = heatInfoState[0]
      var setHeatInfo = heatInfoState[1]
      // Stable identity (ref-backed) so the heatmap's reporting effect does not
      // re-fire on every render; the setter itself is already stable.
      var reportHeatInfoRef = React.useRef(null)
      if (reportHeatInfoRef.current === null) {
        reportHeatInfoRef.current = function (next) {
          setHeatInfo(function (previous) {
            if (previous && previous.page === next.page && previous.pageCount === next.pageCount &&
              previous.first === next.first && previous.last === next.last) return previous
            return next
          })
        }
      }
      var reportHeatInfo = reportHeatInfoRef.current
      // Paging resets whenever the mode changes, so a weekly page index can
      // never leak into the daily grid (their week counts differ).
      var stepHeatPage = function (delta) {
        setHeatNav(function (previous) {
          var base = previous.mode === heatMode ? previous.index : 0
          var next = base + delta
          if (heatInfo && (next < 0 || next > heatInfo.pageCount - 1)) return previous
          return { mode: heatMode, index: next }
        })
      }
      var heatPageIndex = heatNav.mode === heatMode ? heatNav.index : 0

      var trendPeriodState = React.useState('week')
      var trendPeriod = trendPeriodState[0]
      var setTrendPeriod = trendPeriodState[1]

      var tableExpandedState = React.useState(false)
      var tableExpanded = tableExpandedState[0]
      var setTableExpanded = tableExpandedState[1]

      // "按模型" view: merge the same model name across providers.
      var groupModelState = React.useState(true)
      var groupByModel = groupModelState[0]
      var setGroupByModel = groupModelState[1]

      var chartGroupState = React.useState(true)
      var chartGroupByModel = chartGroupState[0]
      var setChartGroupByModel = chartGroupState[1]

      var dataState = React.useState(null)
      var data = dataState[0]
      var setData = dataState[1]

      var loadingState = React.useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]

      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]

      var staleState = React.useState(false)
      var stale = staleState[0]
      var setStale = staleState[1]

      var searchState = React.useState('')
      var searchQuery = searchState[0]
      var setSearchQuery = searchState[1]

      var tabState = React.useState('usage')
      var tab = tabState[0]
      var setTab = tabState[1]

      var controlState = React.useState({ settings: { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: false, customQueries: [] } })
      var control = controlState[0], setControl = controlState[1]
      var controlReadyState = React.useState(false)
      var controlReady = controlReadyState[0], setControlReady = controlReadyState[1]
      var controlErrorState = React.useState('')
      var controlError = controlErrorState[0], setControlError = controlErrorState[1]
      var quotaRevisionState = React.useState(0)
      var quotaRevision = quotaRevisionState[0], setQuotaRevision = quotaRevisionState[1]
      var quotaVisitedState = React.useState(false)
      var quotaVisited = quotaVisitedState[0], setQuotaVisited = quotaVisitedState[1]
      var quotaSnapshotsState = React.useState({})
      var quotaSnapshots = quotaSnapshotsState[0], setQuotaSnapshots = quotaSnapshotsState[1]
      var quotaLoadingState = React.useState(false)
      var quotaLoading = quotaLoadingState[0], setQuotaLoading = quotaLoadingState[1]
      var quotaErrorState = React.useState('')
      var quotaError = quotaErrorState[0], setQuotaError = quotaErrorState[1]

      function changeTab(next) {
        if (next === tab) return
        // A short tab must not inherit the long usage page's scroll position.
        if (scrollPortRef.current) scrollPortRef.current.scrollTop = 0
        if (next === 'quota') setQuotaVisited(true)
        setTab(next)
      }
      function onTabKeyDown(event) {
        var names = ['usage', 'quota', 'control']
        var index = names.indexOf(tab)
        var next = event.key === 'ArrowRight' ? names[(index + 1) % names.length] : event.key === 'ArrowLeft' ? names[(index + names.length - 1) % names.length] : event.key === 'Home' ? 'usage' : event.key === 'End' ? 'control' : null
        if (next === null) return
        event.preventDefault()
        changeTab(next)
        var tabs = event.currentTarget.parentElement.querySelectorAll('[role="tab"]')
        tabs[names.indexOf(next)].focus({ preventScroll: true })
      }

      var tz = LOCAL_TZ
      var requestRef = React.useRef(0)
      var retryTimerRef = React.useRef(null)
      var successfulQueryRef = React.useRef({ model: '' })
      var pageRef = React.useRef(null)
      var scrollPortRef = React.useRef(null)

      function load(opts) {
        var optModel = opts && opts.model !== undefined ? opts.model : model
        var fresh = opts && opts.fresh === true
        var request = ++requestRef.current
        var attempt = 0
        if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
        function pull(isFresh) {
          attempt++
          setLoading(true)
          setError(null)
          api.stats({ days: 0, model: optModel, fresh: isFresh })
            .then(function (body) {
              if (request !== requestRef.current) return
              setData(body)
              successfulQueryRef.current = { model: optModel }
              setLoading(false)
              setStale(!!body.stale)
              if (body.stale && attempt < 40) retryTimerRef.current = setTimeout(function () { pull(false) }, 2500)
            })
            .catch(function (err) {
              if (request !== requestRef.current) return
              setError(String(err && err.message || err))
              setLoading(false)
              setStale(true)
              setModel(successfulQueryRef.current.model)
            })
        }
        pull(fresh)
      }

      React.useEffect(function () {
        load({ model: model })
        return function () {
          requestRef.current++
          if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      function loadControls() {
        setControlError('')
        api.controls().then(function (body) { setControl(body); syncModelSeatFromControls(body); setControlReady(true) }).catch(function (err) { setControlError(String(err.message || err)); setControlReady(false) })
      }
      React.useEffect(function () { loadControls() }, [])
      React.useEffect(function () {
        var page = pageRef.current
        if (!page) return
        var port = page.parentElement
        while (port && !/(auto|scroll)/.test(window.getComputedStyle(port).overflowY)) port = port.parentElement
        if (!port) return
        scrollPortRef.current = port
        var previous = port.style.scrollbarGutter
        port.style.scrollbarGutter = 'stable'
        return function () {
          if (port.style.scrollbarGutter === 'stable') port.style.scrollbarGutter = previous
          scrollPortRef.current = null
        }
      }, [])
      React.useEffect(function () {
        if (tab === 'usage' || typeof setInterval !== 'function') return
        var timer = setInterval(loadControls, 30000)
        return function () { clearInterval(timer) }
      }, [tab])
      function saveControls(patch) {
        return api.controls(patch).then(function (body) {
          setControl(body); syncModelSeatFromControls(body); setControlReady(true)
          if (patch.action === 'save-query' || patch.action === 'remove-query') setQuotaRevision(function (value) { return value + 1 })
          return body
        })
      }
      function refreshQuotas() {
        setQuotaLoading(true)
        setQuotaError('')
        Promise.allSettled([api.providerQuotas({ fresh: true }), api.workbuddyStatus({ fresh: true }), api.workbuddyStatus({ fresh: true, source: 'workbuddy-ai' })]).then(function (results) {
          if (results.some(function (result) { return result.status === 'rejected' || quotaFailed(result.value) })) setQuotaError('部分配额未能更新，请稍后刷新重试。')
          setQuotaSnapshots(function (previous) {
            var next = Object.assign({}, previous)
            ;['providers', 'workbuddy', 'workbuddy-ai'].forEach(function (key, index) { if (results[index].status === 'fulfilled' && !quotaFailed(results[index].value)) next[key] = results[index].value })
            return next
          })
          setQuotaLoading(false)
        }).catch(function (err) { setQuotaLoading(false); setQuotaError(String(err.message || err)) })
      }

      var changeModel = function (m) {
        setModel(m)
        load({ model: m })
      }
      var refresh = function () {
        load({ model: model, fresh: true })
      }

      var totals = data && data.totals
      var byModel = data ? data.byModel : []
      var displayedModel = data && Object.prototype.hasOwnProperty.call(data, 'model') ? (data.model || '') : model
      var dayMap = new Map()
      var dayModelMap = new Map()
      if (data) {
        for (var i = 0; i < data.byDay.length; i++) dayMap.set(data.byDay[i].date, data.byDay[i])
        for (var j = 0; j < (data.byDayModels || []).length; j++) dayModelMap.set(data.byDayModels[j].date, data.byDayModels[j].models)
      }
      // A running host can still serve the previous response shape until it
      // reloads. For that version, subtract adjacent cumulative model ranges
      // on hover to recover the exact per-day breakdown without a full rescan.
      var loadDayModels = data && !Array.isArray(data.byDayModels) ? function (date) {
        var today = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10)
        var span = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000) + 1
        if (!(span >= 1 && span <= 3650)) return Promise.resolve([])
        return Promise.all([
          api.stats({ days: span, model: displayedModel }),
          span > 1 ? api.stats({ days: span - 1, model: displayedModel }) : Promise.resolve({ byModel: [] }),
        ]).then(function (results) {
          var later = new Map()
          var models = []
          for (var li = 0; li < (results[1].byModel || []).length; li++) later.set(results[1].byModel[li].key, results[1].byModel[li])
          for (var mi = 0; mi < (results[0].byModel || []).length; mi++) {
            var current = results[0].byModel[mi]
            var following = later.get(current.key)
            var billed = Math.max(0, (current.billed || 0) - (following && following.billed || 0))
            var calls = Math.max(0, (current.calls || 0) - (following && following.calls || 0))
            if (billed > 0 || calls > 0) models.push({ key: current.key, provider: current.provider, model: current.model, billed: billed, calls: calls })
          }
          models.sort(function (a, b) { return b.billed - a.billed })
          return models
        })
      } : null
      // Fixed colour per model, persisted in localStorage: the first time a
      // model is seen it is assigned the next unused colour from a
      // golden-angle palette and keeps it forever — never tied to the usage
      // ranking, so the most-used model is not always the same colour. The
      // donut and the 24-hour bars agree because they share this map.
      var STORAGE_KEY = 'dshus.modelColors.v1'
      var modelColor = {}
      try {
        var storedColors = window.localStorage.getItem(STORAGE_KEY)
        if (storedColors) {
          var parsedColors = JSON.parse(storedColors)
          if (parsedColors && typeof parsedColors === 'object') {
            for (var pk in parsedColors) modelColor[pk] = parsedColors[pk]
          }
        }
      } catch (e) { /* storage unavailable — fall back to ephemeral colours */ }
      var usedColors = {}
      for (var uk in modelColor) usedColors[modelColor[uk]] = true
      for (var ci = 0; ci < byModel.length; ci++) {
        var key = byModel[ci].key
        if (modelColor[key]) continue
        var hue = 0
        for (var hc = 0; hc < 360; hc++) {
          hue = Math.round((hc * 137.508) % 360)
          if (!usedColors['hsl(' + hue + ', 70%, 55%)']) break
        }
        modelColor[key] = 'hsl(' + hue + ', 70%, 55%)'
        usedColors[modelColor[key]] = true
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modelColor))
      } catch (e) { /* ignore quota / private-mode errors */ }
      modelColor['__rest__'] = '#94a3b8'
      modelColor['__all__'] = 'var(--dsw-alias-brand-primary, #3b82f6)'
      var colorOf = function (key) { return modelColor[key] || '#94a3b8' }
      // "按模型" view: fold the provider/model entries into one entry per
      // model name (provider ignored), sorted by usage. The merge key is the
      // model display name's basename (after last '/') lowercased, so
      // "GLM-4.7" vs "glm-4.7" and "stealth/ox-alpha" vs "OX-ALPHA" land in
      // one bucket; the displayed name keeps the casing of the variant that
      // carries the most usage (ties keep the first-seen spelling).
      var normModelKey = sharedNormModelKey
      // Display name for a merged group: the basename of the winning
      // variant (text after the last '/', original casing). Model ids on
      // OpenRouter-style gateways carry a namespace prefix ("z-ai/glm-
      // 5.3-flash" on cline-gw); showing the full id in the merged view
      // makes the group look like a provider leaked in ("z-ai/…"), so the
      // merged label always drops the prefix — the same rule the merge key
      // (normModelKey) already uses, only case-preserving.
      var modelDisplayName = sharedModelDisplayName
      var donutModels = byModel
      if (groupByModel && byModel.length > 0) {
        var mergedMap = {}
        var mergedOrder = []
        for (var gmI = 0; gmI < byModel.length; gmI++) {
          var gmItem = byModel[gmI]
          var gmName = gmItem.model || gmItem.key
          var gmKey = normModelKey(gmName)
          var gmCur = mergedMap[gmKey]
          var canonical = gmKey === 'glm-5.3-flash' ? 'glm-5.3-flash' : null
          if (gmCur === undefined) {
            gmCur = { key: 'by-model:' + gmKey, provider: '', model: canonical || modelDisplayName(gmName), lastTime: gmItem.lastTime || 0, billed: gmItem.billed || 0, _topBilled: gmItem.billed || 0 }
            mergedMap[gmKey] = gmCur
            mergedOrder.push(gmCur)
          } else {
            gmCur.billed += gmItem.billed || 0
            if ((gmItem.lastTime || 0) > gmCur.lastTime) gmCur.lastTime = gmItem.lastTime || 0
            if (canonical === null && (gmItem.billed || 0) > (gmCur._topBilled || 0)) {
              gmCur.model = modelDisplayName(gmName)
              gmCur._topBilled = gmItem.billed || 0
            } else if ((gmItem.billed || 0) > (gmCur._topBilled || 0)) {
              gmCur._topBilled = gmItem.billed || 0
            }
          }
        }
        mergedOrder.sort(function (a, b) { return b.billed - a.billed })
        donutModels = mergedOrder
      }
      // Merged "by-model:*" keys have no persisted colour — give them a stable
      // palette colour by current rank; everything else keeps its own colour.
      var donutColorFor = function (key) {
        if (groupByModel && key.indexOf('by-model:') === 0) {
          for (var di = 0; di < donutModels.length; di++) {
            if (donutModels[di].key === key) return DONUT_COLORS[di % DONUT_COLORS.length]
          }
        }
        return colorOf(key)
      }
      // Per-model hour breakdown for the stacked 24h bars. Older hosts (before
      // this feature) do not serve byHourModels: fall back to the aggregated
      // byHour series as a single "全部" segment so the chart still renders.
      var hourModels = []
      if (data) {
        if (data.byHourModels && data.byHourModels.length > 0) {
          hourModels = data.byHourModels
        } else {
          hourModels = data.byHour.map(function (h) {
            return { hour: h.hour, models: [{ key: '__all__', provider: '', model: t('全部'), billed: h.billed }] }
          })
        }
        // The chart has its own grouping control, independent of the donut.
        // When "按模型" is on, fold hourModels by the same basename
        // lowercased key so case variants like "stealth/ox-alpha" vs
        // "STEALTH/OX-ALPHA" share one stack segment per hour, consistent
        // with the donut.
        if (chartGroupByModel && hourModels.length > 0) {
          var mergedHourModels = []
          for (var hi = 0; hi < hourModels.length; hi++) {
            var hm = hourModels[hi]
            var ms = hm.models || []
            // Do not reuse a single raw provider/model segment here. Even a
            // one-segment hour must pass through the merged-model projection
            // so its provider is cleared and namespaced model ids are reduced
            // to the same display name used by the donut.
            if (ms.length === 0) { mergedHourModels.push(hm); continue }
            var hMap = {}
            var hOrder = []
            for (var mi = 0; mi < ms.length; mi++) {
              var mm = ms[mi]
              var mmName = mm.model || mm.key
              var mmKey = normModelKey(mmName)
              var canonicalH = mmKey === 'glm-5.3-flash' ? 'glm-5.3-flash' : null
              var cur = hMap[mmKey]
              if (cur === undefined) {
                cur = { key: 'by-model:' + mmKey, provider: '', model: canonicalH || modelDisplayName(mm.model), billed: mm.billed || 0, _topBilled: mm.billed || 0 }
                hMap[mmKey] = cur
                hOrder.push(cur)
              } else {
                cur.billed += mm.billed || 0
                if (canonicalH === null && (mm.billed || 0) > (cur._topBilled || 0)) { cur.model = modelDisplayName(mmName); cur._topBilled = mm.billed || 0 }
                else if ((mm.billed || 0) > (cur._topBilled || 0)) cur._topBilled = mm.billed || 0
              }
            }
            mergedHourModels.push({ hour: hm.hour, models: hOrder })
          }
          hourModels = mergedHourModels
        }
      }
      var chartColorFor = function (key) {
        if (!chartGroupByModel || key.indexOf('by-model:') !== 0) return colorOf(key)
        return sharedModelColor(key.slice('by-model:'.length))
      }

      var tools = React.createElement('div', { className: 'dshus-tools' },
        tab === 'usage' && refreshIconButton(refresh, loading, t('刷新用量统计'), false),
        tab === 'quota' && refreshIconButton(refreshQuotas, quotaLoading, t('刷新全部配额'), false),
      )

      var cards
      if (totals) {
        var overview = data.overview || {
          todayBilled: (data.byHour || []).reduce(function (sum, h) { return sum + (h.billed || 0) }, 0),
          usedDays: (data.byDay || []).filter(function (d) { return d.calls > 0 }).length,
          totalBilled: totals.billed,
        }
        // 概览指标在同一行内展示，相邻两项之间以竖线分割（不再拆成小卡片）。
        var stat = function (v, k, opts) {
          opts = opts || {}
          var display = typeof v === 'number' ? (opts.exact ? fmtExact(v) : fmt(v)) : v
          return React.createElement('div', { className: 'dshus-stat' + (opts.cls ? ' ' + opts.cls : '') },
            React.createElement('div', { className: 'v' }, display),
            React.createElement('div', { className: 'k' }, k),
          )
        }
        cards = React.createElement('div', { className: 'dshus-statbar dshus-overview-bar', role: 'group', 'aria-label': t('概览指标') },
          stat(overview.todayBilled, t('今日tokens数')),
          stat(overview.usedDays, t('使用天数'), { exact: true }),
          stat(overview.totalBilled, t('累计tokens数')),
        )
      } else {
        cards = React.createElement('div', { className: 'dshus-muted' }, t('暂无数据'))
      }

      // Filter models for the breakdown table
      var filterText = searchQuery.trim().toLowerCase()
      var tableModels = donutModels.filter(function (m) {
        if (!filterText) return true
        var name = (m.model || m.key || '').toLowerCase()
        var prov = (m.provider || '').toLowerCase()
        return name.indexOf(filterText) !== -1 || prov.indexOf(filterText) !== -1
      })

      // Show only the top model until the list is expanded or searched.
      var tableVisibleModels = (!filterText && !tableExpanded) ? tableModels.slice(0, 1) : tableModels

      // Breakdown table element
      var totalDonutBilled = 0
      for (var tdi = 0; tdi < donutModels.length; tdi++) totalDonutBilled += donutModels[tdi].billed || 0

      var tableRows = tableVisibleModels.map(function (m, idx) {
        var pct = totalDonutBilled > 0 ? ((m.billed || 0) / totalDonutBilled) * 100 : 0
        var mColor = donutColorFor(m.key)
        var label = m.provider ? m.provider + ' · ' + m.model : m.model
        var isRest = m.key === '__rest__'
        return React.createElement('tr', { key: m.key || idx },
          React.createElement('td', null,
            React.createElement('div', { className: 'dshus-table-model-cell' },
              React.createElement('span', { className: 'dshus-donut-dot', style: { background: mColor } }),
              React.createElement('span', null, label),
            ),
          ),
          React.createElement('td', { style: { textAlign: 'right', fontWeight: 600 } }, fmt(m.billed || 0)),
          React.createElement('td', { style: { textAlign: 'right' } }, formatPct(pct)),
          React.createElement('td', { className: 'dshus-table-bar-cell' },
            React.createElement('div', { className: 'dshus-table-bar-bg' },
              React.createElement('div', { className: 'dshus-table-bar-fill', style: { width: Math.min(100, Math.max(1, pct)) + '%', background: mColor } }),
            ),
          ),
          React.createElement('td', { style: { textAlign: 'right', color: 'var(--dsw-alias-label-caption, #9ca3af)', fontSize: 11.5 } },
            m.lastTime ? fmtInTz(m.lastTime, tz) : (isRest ? '—' : t('近期调用')),
          ),
        )
      })

      return React.createElement('div', { className: 'dshus-page', ref: pageRef },
        React.createElement('div', { className: 'dshus-toolbar' },
        React.createElement('div', { className: 'dshus-head' },
          React.createElement('div', { className: 'dshus-brand' },
            React.createElement('span', { className: 'dshus-brand-icon', 'aria-hidden': 'true' }),
            React.createElement('h2', { className: 'dshus-title' }, t('用量统计')),
            React.createElement('a', { className: 'dshus-brand-meta dshus-brand-link', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer', title: t('在 GitHub 查看 dsh-usage-stats') }, 'dsh-usage-stats'),
            PLUGIN_VERSION !== '__DSH_USAGE_STATS_VERSION__' && React.createElement('span', { className: 'dshus-brand-meta' }, 'v' + PLUGIN_VERSION),
          ),
          tools,
        ),
        React.createElement('div', { className: 'dshus-tabs', role: 'tablist', 'aria-label': t('用量统计页面') },
          React.createElement('button', { id: 'dshus-tab-usage', type: 'button', role: 'tab', 'aria-selected': tab === 'usage', 'aria-controls': 'dshus-usage-panel', tabIndex: tab === 'usage' ? 0 : -1, className: 'dshus-tab' + (tab === 'usage' ? ' on' : ''), onClick: function () { changeTab('usage') }, onKeyDown: onTabKeyDown }, t('用量')),
          React.createElement('button', { id: 'dshus-tab-quota', type: 'button', role: 'tab', 'aria-selected': tab === 'quota', 'aria-controls': 'dshus-quota-panel', tabIndex: tab === 'quota' ? 0 : -1, className: 'dshus-tab' + (tab === 'quota' ? ' on' : ''), onClick: function () { changeTab('quota') }, onKeyDown: onTabKeyDown }, t('配额')),
          React.createElement('button', { id: 'dshus-tab-control', type: 'button', role: 'tab', 'aria-selected': tab === 'control', 'aria-controls': 'dshus-control-panel', tabIndex: tab === 'control' ? 0 : -1, className: 'dshus-tab' + (tab === 'control' ? ' on' : ''), onClick: function () { changeTab('control') }, onKeyDown: onTabKeyDown }, t('控制')),
        ),
        ),
        // The size container wraps only the panels, so the sticky header above it
        // is not inside a containment context.
        React.createElement('div', { className: 'dshus-panels' },
        tab === 'usage' && React.createElement('div', { id: 'dshus-usage-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-usage', tabIndex: 0 },
          error !== null && React.createElement('div', { className: 'dshus-error' }, uiError(error)),
          stale && data && data.partial && React.createElement('div', { className: 'dshus-error' }, t('部分会话读取失败')),

        /* Area 1: 概览指标 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null, t('概览指标')),
          cards,
        ),

        /* Area 2: 今日Token用量 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('今日Token用量'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' }, 'aria-label': t('今日Token用量统计模式') },
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (!chartGroupByModel ? ' on' : ''), onClick: function () { setChartGroupByModel(false) } }, t('供应商·模型')),
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (chartGroupByModel ? ' on' : ''), onClick: function () { setChartGroupByModel(true) } }, t('按模型')),
            ),
          ),
          React.createElement(Bars, { hourModels: hourModels, byHour: data ? data.byHour : [], colorOf: chartColorFor }),
        ),

        /* Area 3: 使用量热力图 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('使用量热力图'),
            React.createElement('div', { className: 'dshus-head-tools' },
              React.createElement(HeatPager, {
                info: heatInfo,
                onStep: stepHeatPage,
              }),
              React.createElement('div', { className: 'dshus-range dshus-heat-modes', 'aria-label': t('热力图时长') },
                React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (heatMode === 'daily' ? ' on' : ''), onClick: function () { setHeatNav({ mode: 'daily', index: 0 }); setHeatInfo(null); setHeatMode('daily') } }, t('每日')),
                React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (heatMode === 'weekly' ? ' on' : ''), onClick: function () { setHeatNav({ mode: 'weekly', index: 0 }); setHeatInfo(null); setHeatMode('weekly') } }, t('每周')),
              ),
            ),
          ),
          React.createElement(Heatmap, { dayMap: dayMap, dayModelMap: dayModelMap, days: 0, mode: heatMode, tz: tz, colorOf: colorOf, modelKey: displayedModel, syncedAt: data && data.syncedAt, loadDayModels: loadDayModels, pageIndex: heatPageIndex, onPageInfo: reportHeatInfo }),
        ),

        /* Area 4: 每日Token趋势图 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('每日Token趋势图'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' }, 'aria-label': t('每日Token趋势时长') },
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (trendPeriod === 'week' ? ' on' : ''), onClick: function () { setTrendPeriod('week') } }, t('7天')),
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (trendPeriod === 'month' ? ' on' : ''), onClick: function () { setTrendPeriod('month') } }, t('30天')),
            ),
          ),
          React.createElement(DailyTrend, { dayMap: dayMap, dayModelMap: dayModelMap, colorOf: colorOf, tz: tz, period: trendPeriod }),
        ),

        /* Area 5: 模型明细 */
        control.settings.showModelDetails && React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('模型明细与分布'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' } },
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (!groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(false); setTableExpanded(false) },
                title: t('每个供应商 · 模型组合单独统计'),
              }, t('供应商·模型')),
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(true); setTableExpanded(false) },
                title: t('合并同名模型，不区分供应商'),
              }, t('按模型')),
            ),
          ),
          React.createElement(Donut, {
            byModel: donutModels,
            colorOf: donutColorFor,
            onSelect: groupByModel ? undefined : function (key) { changeModel(key === model ? '' : key) },
          }),
          React.createElement('div', { className: 'dshus-model-toolbar' },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 400, color: 'var(--dsw-alias-label-secondary, #4b5563)' } },
              t('模型用量清单 ({count})', { count: tableModels.length }),
            ),
            React.createElement('input', {
              type: 'text',
              className: 'dshus-search-input',
              placeholder: t('搜索模型或供应商名称…'),
              value: searchQuery,
              onChange: function (e) { setSearchQuery(e.target.value) },
            }),
          ),
          React.createElement('div', { className: 'dshus-table-wrap' },
            React.createElement('table', { className: 'dshus-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, t('模型名称')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('用量 Tokens')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('占比')),
                  React.createElement('th', { className: 'dshus-table-bar-cell' }, t('分布条')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('最后活跃时间')),
                ),
              ),
              React.createElement('tbody', null,
                tableRows.length > 0 ? tableRows : React.createElement('tr', null,
                  React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('没有找到匹配的模型')),
                ),
              ),
            ),
          ),
          (!filterText && tableModels.length > 1) && React.createElement('div', { style: { textAlign: 'center', marginTop: 10 } },
            React.createElement('button', {
              type: 'button',
              className: 'dshus-btn',
              onClick: function () { setTableExpanded(!tableExpanded) },
              style: { fontSize: 12, height: 28, padding: '0 16px', margin: '0 auto' }
            }, tableExpanded ? t('收起清单') : t('展开其余 {count} 个模型', { count: tableModels.length - 1 }))
          ),
        ),

        ),
        quotaVisited && React.createElement('div', { id: 'dshus-quota-panel', className: 'dshus-quota-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-quota', tabIndex: 0, hidden: tab !== 'quota', 'data-empty-label': t('连接模型服务后，可读取的配额会显示在这里') },
          quotaError && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(quotaError)),
          React.createElement(ProviderQuotasPanel, { api: api, key: 'providers', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.providers }),
          React.createElement(WorkBuddyPanel, { api: api, key: 'workbuddy', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.workbuddy }),
          React.createElement(WorkBuddyPanel, { api: api, source: 'workbuddy-ai', key: 'workbuddy-ai', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots['workbuddy-ai'] }),
        ),
        tab === 'control' && React.createElement('div', { id: 'dshus-control-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-control', tabIndex: 0 },
          React.createElement(ControlsPanel, { api: api, control: control, ready: controlReady, error: controlError, onReload: loadControls, onSave: saveControls }),
        ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Plugin entry                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * Required services.
     *
     * `slots` registers the settings section (and the optional seat).
     *
     * The trailing four exist only for the 高级模型选择器 seat, and every
     * ctx.<name> the seat touches MUST be declared: the cordis guard denies
     * undeclared access on this plugin's fiber, and a denial raised inside a
     * render/effect crashes the slot entry, which then silently ABDICATES to
     * the official seat — the plugin still reports "running" and only the
     * console shows 'slot entry crashed'. Two such traps (ported from
     * dsh-model-selection-seat):
     *   - 'remote' / 'remote.session': the official modelDirectories service
     *     reaches into ctx.remote.session inside directoryFor(), and the slot
     *     definition's inject(sessionId) runs on THIS plugin's fiber;
     *   - 'timer': the effort-preview clear uses ctx.timeout — without
     *     declaring it, the very first slider tap crashed the entry.
     * Registering the seat is guarded by typeof checks, so a host that
     * provides none of these still runs the usage page normally.
     */
    var inject = ['slots', 'locale', 'modelDirectories', 'sessions', 'remote', 'remote.session', 'timer']

    /* ------------------------------------------------------------------ */
    /* Advanced model selector — optional rs2 slider seat (高级模型选择器)  */
    /* ------------------------------------------------------------------ */

    /**
     * Optional seat (ported from dsh-model-selection-seat, itself the
     * dpnows-model-selection-custom slider seat). Slot resolution picks the
     * entry with the lowest allocated priority, and bundle-client
     * registrations get NO automatic shadowing priority — the official
     * @deepseek-ai/dsh-client-ui-model-selection ModelSelect registers with
     * priority unset, so the explicit -1 below is what shadows it. The
     * official plugin stays loaded: its /model command, its
     * ctx.modelDirectories service and its `model` locale dictionaries are
     * reused untouched (the registration carries locale: 'model').
     *
     * Off (the default) the seat is not registered at all, so the official
     * selector keeps the input; toggled off at runtime the disposer below
     * unregisters it and the official selector returns.
     */
    var SEAT_STYLE_ID = 'dsh-usage-stats-seat-styles'
    /** localStorage key of the seat's own "高级" preference (ported as-is). */
    var SEAT_ADV_KEY = 'dsh-rs2-adv'
    /** Startup hint; the host controls endpoint remains the source of truth. */
    var SEAT_ENABLED_KEY = 'dsh-usage-stats-advanced-model-select'

    /**
     * The seat's stylesheet (rs2 CSS, ported from the seat plugin).
     *
     * Color note — do NOT use `--dsw-alias-brand-primary` as an accent here.
     * In this host that alias is a *monochrome foreground* token:
     *   light: --dsw-alias-brand-primary: var(--dsw-static-neutral-bluish-1000)  (#0f1115)
     *   dark:  --dsw-alias-brand-primary: var(--dsw-static-neutral-bluish-50)    (#f9fafb)
     * It is defined in BOTH themes, so a var() with a blue fallback never falls
     * back — it silently resolves to near-black or near-white. Painting the
     * slider fill with it produced the reported bug: the filled region rendered
     * 8/255 lighter than the unfilled chrome (#6e7174 vs #61666b) and read as
     * "the slider has no progress color / the colors are wrong".
     *
     * The real accent is `--dsw-alias-brand-primary-new-colorprimary-new-color`
     * (#4176e6 light / --dsw-static-deepseek-450 #5686fe dark). It is only
     * defined by the current host, so every use carries a literal blue fallback
     * for older builds: an undefined var() would invalidate the whole gradient
     * and drop the track to transparent.
     */
    var SEAT_ACCENT = 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)'
    var SEAT_BLUE = 'color-mix(in srgb, ' + SEAT_ACCENT + ' 20%, #0068c8)'
    var SEAT_MAX_ACCENT = '#a46cff'
    /** Neutral rail in both themes, close to the host's own input chrome. */
    var SEAT_TRACK_REST = 'color-mix(in srgb, var(--dsw-alias-label-primary, #f9fafb) 12%, var(--dsw-alias-bg-layer-2, #2c2c2e))'
    /**
     * Popover surface.
     *
     * `--dsw-alias-bg-overlay` reads like the obvious "popover background", but
     * in this host it is NOT: dark resolves it to --dsw-static-neutral-bluish-700
     * = #61666b, a MID-GREY, and the host stylesheet spends it on exactly one
     * 20x20 badge (`.mAtvLq_number`) and never on a menu. Painting the menu with
     * it produced the reported flat-grey slab (measured #61666b across the whole
     * panel in the screenshot).
     *
     * The layer tokens are the theme-correct elevated surfaces, and they match
     * what the host's own popovers render as:
     *   dark  --dsw-alias-bg-layer-2 = --dsw-static-neutral-bluish-850 = #2c2c2e
     *   light --dsw-alias-bg-layer-2 = --dsw-static-neutral-bluish-00  = #ffffff
     * #2c2c2e is exactly the surface the official model popover showed, so the
     * seat now matches the selector it shadows.
     *
     * The sticky group header reuses this same token rather than the host's
     * `--dsw-alias-menu-group-header-fill`: that name only exists inside the
     * Electron bundle and is NOT declared by the installed
     * @deepseek-ai/dsh-client-ui-theme, so referencing it would fall back to the
     * dark literal in the light theme. It must also stay opaque — a translucent
     * header would let scrolled rows show through it.
     */
    var SEAT_SURFACE = 'var(--dsw-alias-bg-layer-2, #2c2c2e)'

    /**
     * The host's frosted-menu material, copied from how the official popovers
     * paint themselves (`.wq12jW_menu` + its `._material_` child):
     *
     *   ._material_ { position:absolute; inset:0; z-index:-1;
     *                 border-radius:inherit;
     *                 background: var(--dsw-menu-surface-fill);
     *                 backdrop-filter: var(--dsw-menu-backdrop-filter) }
     *
     * Measured in the screenshot the user supplied: the official panel is a
     * 45%-alpha fill (#43454a73 dark) over a 40px/saturate(150%) backdrop blur,
     * so its colour drifts with whatever sits behind it (#3b3c40 over the dark
     * page, #6a6b6d over light text behind it). That drift IS the translucency.
     *
     * The fill is translucent, so it MUST NOT be paired with an opaque surface:
     * the earlier opaque `--dsw-alias-bg-layer-2` panel is kept only as the
     * no-backdrop-filter fallback below, where the blur cannot frost anything.
     */
    var SEAT_MATERIAL = 'var(--dsw-menu-surface-fill, rgba(67,69,74,.45))'
    var SEAT_MATERIAL_BLUR = 'var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%))'
    /** The host's own popover shadow; it also draws the 0.5px hairline stroke. */
    var SEAT_ELEVATION = 'var(--dsw-elevation-prominent, 0 0 0 .5px rgba(128,128,128,.28), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05))'

    /**
     * Narrow-screen layout: the composer row measures its own children and, when
     * they cannot share a line, sets `data-model-compact` on the row, which
     * toggles these two inherited custom properties. The official model seat
     * consumes exactly this pair, so reading the same variables makes our seat
     * collapse to the icon at precisely the same moment the official one would —
     * no viewport breakpoint can guess that, because the row also shrinks when
     * the sidebar is open.
     */
    var SEAT_ICON_DISPLAY = 'var(--dsh-composer-model-icon-display, none)'
    var SEAT_TEXT_DISPLAY = 'var(--dsh-composer-model-text-display, block)'

    var SEAT_CSS = [
      '.rs2-root{display:inline-block;width:max-content;min-width:0;position:relative;flex:none}',
      // min-width keeps a usable hit target when the label collapses away and
      // only the 16px icon remains.
      '.rs2-trigger{display:inline-flex;align-items:center;gap:2px;width:max-content;min-width:28px;padding:0 4px 0 8px;height:28px;border:none;border-radius:24px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer;outline:none}',
      '.rs2-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-trigger-icon{display:' + SEAT_ICON_DISPLAY + ';flex:none}',
      '.rs2-trigger-icon svg{display:block;width:16px;height:16px}',
      '.rs2-trigger-name{display:' + SEAT_TEXT_DISPLAY + ';flex:none;white-space:nowrap}',
      '.rs2-trigger-effort{display:' + SEAT_TEXT_DISPLAY + ';flex:none;color:var(--dsw-alias-label-caption)}',
      '.rs2-chev{flex:none;display:flex;color:var(--dsw-alias-label-caption);transition:transform .12s}',
      '.rs2-chev-open{transform:rotate(180deg)}',
      '.rs2-menu{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:30;box-sizing:border-box;display:flex;flex-direction:column;width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(380px,100vh - 96px);padding:6px;border:0;border-radius:12px;color:var(--dsw-alias-label-primary);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:' + SEAT_ELEVATION + ';overflow:hidden}',
      // The frosted pane. z-index:-1 is contained because .rs2-menu already
      // builds a stacking context (position:absolute + z-index:30), so the layer
      // paints behind the rows but never escapes behind the page. The host's own
      // MenuSurface also sets isolation:isolate here; it is redundant for us
      // (verified in a real engine: the 40px blur diffuses a 6px stripe backdrop
      // identically with and without it), so it is left out.
      '.rs2-menu::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:' + SEAT_MATERIAL + ';-webkit-backdrop-filter:' + SEAT_MATERIAL_BLUR + ';backdrop-filter:' + SEAT_MATERIAL_BLUR + ';pointer-events:none}',
      // Without backdrop support a 45%-alpha pane is just washed out, so fall
      // back to the opaque theme surface.
      '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.rs2-menu::before{background:' + SEAT_SURFACE + '}}',
      '.rs2-cell{display:flex;align-items:center;gap:8px;width:100%;height:40px;padding:0 10px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;text-align:left;cursor:pointer}',
      '.rs2-cell:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-cell-label{flex:none;white-space:nowrap}',
      '.rs2-cell-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-caption)}',
      '.rs2-back{display:flex;align-items:center;gap:6px;width:100%;height:34px;padding:0 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;cursor:pointer;text-align:left}',
      '.rs2-back:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-list{min-height:0;overflow-y:auto}',
      // The sticky group title must stay legible while rows scroll under it, so
      // it repeats the surface at ~94% alpha — the same opacity the host's own
      // menu header uses (#303136f0 dark). Fully opaque would look pasted onto
      // the frosted pane; fully transparent would let rows bleed through.
      '.rs2-grouptitle{position:sticky;top:0;z-index:2;padding:5px 8px 3px;background:color-mix(in srgb, ' + SEAT_SURFACE + ' 94%, transparent);color:var(--dsw-alias-label-caption);font-size:12px;font-weight:500;line-height:18px}',
      '.rs2-option{display:flex;align-items:center;gap:8px;width:auto;min-width:100%;min-height:38px;padding:6px 8px;border:none;border-radius:10px;background:transparent;color:inherit;font-size:14px;text-align:left;cursor:pointer}',
      '.rs2-option:hover,.rs2-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-optname{overflow-wrap:anywhere;white-space:normal}',
      '.rs2-check{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}',
      '.rs2-advrow{display:flex;justify-content:flex-end;padding:4px 6px 0}',
      '.rs2-advtoggle{display:flex;align-items:center;gap:3px;height:24px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-caption);font-size:12px;font-weight:500;cursor:pointer}',
      '.rs2-advtoggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.rs2-advhead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 0}',
      '.rs2-modeljump{display:flex;align-items:center;gap:2px;flex:1;min-width:0;min-height:26px;padding:0 6px 0 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px;cursor:pointer}',
      '.rs2-modeljump:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-modeljump-name{overflow-wrap:anywhere;white-space:normal}',
      '.rs2-curlevel{flex:none;font-size:12px;font-weight:600;line-height:18px;color:' + SEAT_ACCENT + ';padding-right:4px;pointer-events:none;white-space:nowrap}',
      '.rs2-curlevel-max{color:color-mix(in srgb, ' + SEAT_MAX_ACCENT + ' 80%, var(--dsw-alias-label-primary))}',
      '.rs2-sliderbox{padding:8px 4px 2px}',
      '.rs2-track{position:relative;height:28px;margin:4px 0 0;outline:none;cursor:pointer;touch-action:none}',
      '.rs2-rail{position:absolute;inset:2px 0;border-radius:999px;background:' + SEAT_TRACK_REST + ';overflow:hidden;pointer-events:none}',
      '.rs2-fill{position:absolute;inset:0 auto 0 0;width:calc(14px + (100% - 28px) * var(--rs2-p,0));border-radius:999px;background:' + SEAT_BLUE + ';transition:width .18s ease;overflow:hidden}',
      '.rs2-max .rs2-fill{width:100%;background:linear-gradient(100deg,' + SEAT_BLUE + ' 0%,#6569ef 48%,' + SEAT_MAX_ACCENT + ' 100%)}',
      '.rs2-dot{position:absolute;top:0;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;z-index:3;left:calc((100% - 28px) * var(--rs2-p,0));transition:left .18s ease}',
      '.rs2-tick-shell{position:absolute;inset:0;z-index:2;pointer-events:none}',
      '.rs2-tick{position:absolute;top:50%;width:4px;height:4px;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 55%,#fff);opacity:.72;transform:translate(-50%,-50%);left:calc(14px + (100% - 28px) * var(--rs2-p,0))}',
      '.rs2-tick-on{opacity:.9;box-shadow:0 0 4px 1px rgba(255,255,255,.38)}',
      '.rs2-max .rs2-tick-shell{animation:rs2-tick-flight 3.6s linear forwards;animation-delay:var(--rs2-delay,0s);will-change:transform}',
      '.rs2-max .rs2-tick{background:#fff}',
      '@keyframes rs2-tick-flight{from{transform:translate3d(0,0,0)}to{transform:translate3d(-100%,0,0)}}',
      '.rs2-stream{position:absolute;inset:0;z-index:1;pointer-events:none;animation:rs2-stream-flight var(--rs2-duration) linear infinite;animation-delay:var(--rs2-delay);will-change:transform}',
      '.rs2-stream-dot{position:absolute;right:0;top:var(--rs2-y);width:var(--rs2-size);height:var(--rs2-size);border-radius:50%;background:#f4f7ff;opacity:.8}',
      '@keyframes rs2-stream-flight{from{transform:translate3d(0,0,0)}to{transform:translate3d(-100%,0,0)}}',
      '.rs2-max .rs2-dot{box-shadow:0 0 5px 1px color-mix(in srgb, ' + SEAT_MAX_ACCENT + ' 25%, transparent),0 1px 4px rgba(0,0,0,.35)}',
      '@media(prefers-reduced-motion:reduce){.rs2-max .rs2-tick-shell{animation:none;visibility:hidden}.rs2-stream{animation:none;display:none}.rs2-fill,.rs2-dot{transition:none}}',
    ].join('\n')

    /** Find one provider/model entry in a modelDirectories group list. */
    function seatFindEntry(groups, provider, model) {
      if (!groups) return undefined
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i]
        if (group.id !== provider) continue
        for (var j = 0; j < group.models.length; j++) {
          if (group.models[j].id === model) return group.models[j]
        }
      }
      return undefined
    }

    /**
     * Pure viewport-clamp math for the popover, split out of the effect so it can
     * be tested without a DOM.
     *
     * The menu is centered on the trigger and opens upward. On a narrow
     * composer it can still extend past a viewport edge; nudge the measured
     * box inward without changing its default centered anchor.
     *
     * @param rect - measured box, in viewport coordinates
     * @param vw - viewport width; @param vh - viewport height
     * @param margin - minimum gap to keep from every edge
     * @returns `{ shift, maxHeight }`; shift is 0 and maxHeight null when the box
     *   already fits, so the caller can leave both styles unset.
     */
    function seatClamp(rect, vw, vh, margin) {
      var gap = typeof margin === 'number' ? margin : 12
      if (!rect || !(vw > 0) || !(vh > 0) || !(rect.width > 0)) return { shift: 0, maxHeight: null }
      // Horizontal. When the box is wider than the usable width no shift can
      // satisfy both edges, so pin the left edge and let CSS clamp the width.
      var shift = 0
      var usable = vw - gap * 2
      if (rect.width > usable) shift = gap - rect.left
      else if (rect.left < gap) shift = gap - rect.left
      else if (rect.right > vw - gap) shift = (vw - gap) - rect.right
      // Vertical. The box grows upward, so only its TOP can escape the window;
      // cap the height by exactly the overflow so nothing is lost.
      var maxHeight = null
      if (rect.top < gap) maxHeight = Math.max(120, Math.round(rect.height - (gap - rect.top)))
      return { shift: Math.round(shift), maxHeight: maxHeight }
    }

    /**
     * The official model seat's compact-mode glyph (IconDataOutlineRegular from
     * @deepseek-ai/dsh-client-ui-primitives), traced byte-for-byte so our
     * collapsed trigger is indistinguishable from the host's own. Two paths: a
     * filled cylinder body plus a stroked "edit" badge, 16x16, strokeWidth 1.
     */
    function SeatDataIcon() {
      return React.createElement('svg', {
        viewBox: '0 0 16 16', width: '16', height: '16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, strokeWidth: 1,
      },
        React.createElement('path', {
          d: 'M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z',
          fill: 'currentColor',
        }),
        React.createElement('path', {
          d: 'M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z',
          stroke: 'currentColor',
          strokeMiterlimit: '10',
        }))
    }

    function SeatChevron(props) {
      return React.createElement('span', { className: 'rs2-chev' + (props.open ? ' rs2-chev-open' : ''), 'aria-hidden': true },
        React.createElement('svg', { viewBox: '0 0 16 16', width: '12', height: '12' },
          React.createElement('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' })))
    }

    function SeatArrow(props) {
      return React.createElement('span', { className: 'rs2-chev', 'aria-hidden': true, style: props.up ? { transform: 'rotate(180deg)' } : undefined },
        React.createElement('svg', { viewBox: '0 0 16 16', width: '11', height: '11' },
          React.createElement('path', { d: 'M4 10l4-4 4 4', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' })))
    }

    function SeatCheckIcon() {
      return React.createElement('svg', { viewBox: '0 0 16 16', width: '14', height: '14', 'aria-hidden': true },
        React.createElement('path', { d: 'M3.5 8.5l3 3 6-7', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
    }

    function seatReadAdvPref() {
      try { return localStorage.getItem(SEAT_ADV_KEY) === '1' } catch (error) { return false }
    }

    function seatWriteAdvPref(value) {
      try { localStorage.setItem(SEAT_ADV_KEY, value ? '1' : '0') } catch (error) { /* preference is best-effort */ }
    }

    function seatReadEnabledPref() {
      try { return localStorage.getItem(SEAT_ENABLED_KEY) === '1' } catch (error) { return false }
    }

    function seatWriteEnabledPref(value) {
      try { localStorage.setItem(SEAT_ENABLED_KEY, value ? '1' : '0') } catch (error) { /* startup hint is best-effort */ }
    }

    /** Chinese labels for the reasoning-effort ids the model directory exposes. */
    var SEAT_EFFORT_ZH = { auto: '自动', default: '默认', none: '关', minimal: '极简', low: '低', medium: '中', high: '高', xhigh: '极高', max: '极致' }

    function seatEffortZh(id, name) {
      if (id !== undefined) {
        var key = String(id).toLowerCase()
        if (SEAT_EFFORT_ZH[key]) return t(SEAT_EFFORT_ZH[key])
      }
      if (name) {
        var key2 = String(name).toLowerCase()
        if (SEAT_EFFORT_ZH[key2]) return t(SEAT_EFFORT_ZH[key2])
      }
      return name ? String(name) : (id === undefined ? t('自动') : String(id))
    }

    function seatEffortStops(reasoning) {
      var stops = []
      // Keep the selectable unspecified effort even when an adapter reports
      // the current selection as a concrete effort.
      if (reasoning.defaultEffort === undefined) {
        stops.push({ id: undefined, label: t('自动') })
      }
      for (var i = 0; i < reasoning.efforts.length; i++) {
        stops.push({ id: reasoning.efforts[i].id, label: seatEffortZh(reasoning.efforts[i].id, reasoning.efforts[i].name) })
      }
      return stops
    }

    /** Deterministic pseudo-random [0,1) — stable particle paths per index. */
    function seatPrand(i, salt) {
      var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
      return x - Math.floor(x)
    }

    /** Rounded reasoning slider with motion only at the highest effort. */
    function SeatSlider(props) {
      var count = props.count
      var value = props.value
      var trackRef = React.useRef(null)
      var dragRectRef = React.useRef(null)
      var draggingRef = React.useRef(false)
      var valueRef = React.useRef(value)
      valueRef.current = value
      var max = Math.max(count - 1, 1)
      var isMax = count > 1 && value === count - 1
      function posToIndex(clientX) {
        var el = trackRef.current
        if (!el) return valueRef.current
        var rect = dragRectRef.current || el.getBoundingClientRect()
        var ratio = Math.min(1, Math.max(0, (clientX - rect.left - 14) / Math.max(rect.width - 28, 1)))
        return Math.round(ratio * max)
      }
      function previewIndex(index) {
        if (index === valueRef.current) return
        valueRef.current = index
        props.onPreview(index)
      }
      var tickEls = []
      for (var i = 0; i < count; i++) {
        tickEls.push(React.createElement('span', {
          key: 't' + i,
          className: 'rs2-tick-shell',
          style: { '--rs2-p': String(i / max), '--rs2-delay': (i * 0.07).toFixed(2) + 's' },
        }, React.createElement('span', {
          className: 'rs2-tick' + (i <= value ? ' rs2-tick-on' : ''),
        })))
      }
      var streamEls = []
      if (isMax) {
        for (var s = 0; s < 18; s++) {
          var duration = 3.6 + seatPrand(s, 6) * 1.8
          streamEls.push(React.createElement('span', {
            key: 's' + s,
            className: 'rs2-stream',
            style: {
              '--rs2-y': (15 + seatPrand(s, 2) * 70).toFixed(1) + '%',
              '--rs2-size': (seatPrand(s, 3) < 0.7 ? 1.5 : 2) + 'px',
              '--rs2-duration': duration.toFixed(2) + 's',
              '--rs2-delay': (-seatPrand(s, 7) * duration).toFixed(2) + 's',
            },
          }, React.createElement('span', { className: 'rs2-stream-dot' })))
        }
      }
      var p = String(max === 0 ? 0 : value / max)
      var kids = [React.createElement('div', { key: 'rail', className: 'rs2-rail' },
        React.createElement('div', { className: 'rs2-fill' }),
        tickEls,
        streamEls)]
      kids.push(React.createElement('div', { key: 'thumb', className: 'rs2-dot' }))
      return React.createElement('div', {
        ref: trackRef,
        className: 'rs2-track' + (isMax ? ' rs2-max' : ''),
        role: 'slider',
        'aria-label': t('推理强度'),
        'aria-valuemin': 0,
        'aria-valuemax': max,
        'aria-valuenow': value,
        style: { '--rs2-p': p },
        onPointerDown: function (event) {
          event.preventDefault()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* capture is best-effort */ }
          dragRectRef.current = trackRef.current ? trackRef.current.getBoundingClientRect() : null
          draggingRef.current = true
          previewIndex(posToIndex(event.clientX))
        },
        onPointerMove: function (event) {
          if (!draggingRef.current) return
          previewIndex(posToIndex(event.clientX))
        },
        onPointerUp: function (event) {
          if (!draggingRef.current) return
          draggingRef.current = false
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch (error) { /* capture is best-effort */ }
          var index = posToIndex(event.clientX)
          dragRectRef.current = null
          props.onCommit(index)
        },
        onLostPointerCapture: function () { draggingRef.current = false; dragRectRef.current = null },
      }, kids)
    }

    /**
     * The seat component. `props` come from the slot definition's inject():
     * { available, store, load, select }.
     */
    function ModelSeat(props) {
      useLocaleRevision()
      var store = props.store
      var state = React.useSyncExternalStore(
        function (onChange) { return store ? store.subscribe(onChange) : function () {} },
        function () { return store ? store.getSnapshot() : null },
      )
      React.useEffect(function () {
        if (props.available && store) props.load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [props.available, !!store])
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var modeState = React.useState('advanced')
      var mode = modeState[0]
      var setMode = modeState[1]
      var optState = React.useState(null)
      var opt = optState[0]
      var setOpt = optState[1]
      var rootRef = React.useRef(null)
      var selectingRef = React.useRef(false)
      var listRef = React.useRef(null)
      React.useEffect(function () {
        if (!open || mode !== 'models') return
        var list = listRef.current
        if (!list || typeof list.querySelector !== 'function') return
        var selected = list.querySelector('[data-selected="1"]')
        if (!selected) return
        try {
          var listRect = list.getBoundingClientRect()
          var selectedRect = selected.getBoundingClientRect()
          list.scrollTop = list.scrollTop + (selectedRect.top - listRect.top) - list.clientHeight / 2 + selected.clientHeight / 2
        } catch (error) { /* scrolling is cosmetic */ }
      }, [open, mode])
      /**
       * Keep the popover inside the viewport on narrow screens.
       *
       * The menu's CSS anchor follows the trigger center. Re-measure when it
       * opens or the model directory changes, then shift only if that centered
       * box crosses a viewport edge. Height is capped on short windows.
       */
      React.useEffect(function () {
        if (!open) return undefined
        var root = rootRef.current
        if (!root || typeof root.querySelector !== 'function') return undefined
        var win = (typeof window !== 'undefined' ? window : undefined)
        if (!win || typeof win.addEventListener !== 'function') return undefined
        var apply = function () {
          var menu = root.querySelector('.rs2-menu')
          if (!menu || typeof menu.getBoundingClientRect !== 'function' || !menu.style) return
          // Reset first so the measurement reflects the centered CSS anchor,
          // not a previous clamp (the effect re-runs on resize).
          menu.style.transform = ''
          menu.style.maxHeight = ''
          try {
            var rect = menu.getBoundingClientRect()
            var fix = seatClamp(rect, win.innerWidth, win.innerHeight)
            if (fix.shift) menu.style.transform = 'translateX(calc(-50% + ' + fix.shift + 'px))'
            if (fix.maxHeight) menu.style.maxHeight = fix.maxHeight + 'px'
          } catch (error) { /* clamping is cosmetic */ }
        }
        apply()
        win.addEventListener('resize', apply)
        return function () { win.removeEventListener('resize', apply) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open, mode, state])
      React.useEffect(function () {
        if (!open) return undefined
        var onDown = function (event) {
          if (rootRef.current && !rootRef.current.contains(event.target)) {
            setOpen(false)
            setMode('advanced')
          }
        }
        if (typeof document === 'undefined') return undefined
        document.addEventListener('mousedown', onDown)
        return function () { document.removeEventListener('mousedown', onDown) }
      }, [open])
      React.useEffect(function () {
        if (!opt) return undefined
        return props.scheduleClear(function () {
          setOpt(function (current) { return current === opt ? null : current })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [opt])
      if (!props.available || !store || !state) return null
      var current = state.current || null
      var groups = state.groups || []
      var model = current ? seatFindEntry(groups, current.provider, current.model) : undefined
      var displayName = current ? ((model && model.name) || current.model) : ''
      var reasoning = (current && model) ? model.reasoning : undefined
      var effLabel
      if (reasoning) {
        var eff = current.reasoningEffort !== undefined ? current.reasoningEffort : reasoning.defaultEffort
        effLabel = eff === undefined ? t('自动') : seatEffortZh(eff, (reasoning.efforts.find(function (x) { return x.id === eff }) || {}).name || eff)
      }
      function commitSelection(selection) {
        selectingRef.current = true
        return Promise.resolve(props.select(selection)).finally(function () {
          selectingRef.current = false
          setOpt(null)
        })
      }
      var stops = []
      var value = 0
      var committedIdx = 0
      if (mode === 'advanced' && current && reasoning && reasoning.efforts.length > 0) {
        stops = seatEffortStops(reasoning)
        var idx = -1
        for (var si = 0; si < stops.length; si++) { if (stops[si].id === current.reasoningEffort) { idx = si; break } }
        if (idx === -1) for (var sj = 0; sj < stops.length; sj++) { if (stops[sj].id === undefined) { idx = sj; break } }
        if (idx === -1) idx = 0
        committedIdx = idx
        value = opt && opt.provider === current.provider && opt.model === current.model && opt.value !== idx ? opt.value : idx
      }
      function commitStop(i) {
        if (!current || selectingRef.current) { setOpt(null); return }
        var stop = stops[i]
        if (!stop || i === committedIdx) { setOpt(null); return }
        var selection = { provider: current.provider, model: current.model }
        if (stop.id !== undefined) selection.reasoningEffort = stop.id
        commitSelection(selection)
      }
      function pickModel(group, entry) {
        setOpt(null)
        var selection = { provider: group.id, model: entry.id }
        if (entry.reasoning && entry.reasoning.defaultEffort !== undefined) selection.reasoningEffort = entry.reasoning.defaultEffort
        commitSelection(selection)
        setMode('advanced')
      }
      function pickEffort(id) {
        if (!current) return
        setOpt(null)
        var selection = { provider: current.provider, model: current.model }
        if (id !== undefined) selection.reasoningEffort = id
        commitSelection(selection)
        setOpen(false)
        setMode('advanced')
      }
      var body
      if (mode === 'models') {
        body = React.createElement(React.Fragment, null,
          React.createElement('button', { type: 'button', className: 'rs2-back', onClick: function () { setMode('advanced') } }, t('‹ 模型')),
          React.createElement('div', { className: 'rs2-list', ref: listRef },
            groups.length === 0 ? React.createElement('div', { className: 'rs2-grouptitle' }, state.status === 'error' ? t('模型目录加载失败') : t('加载中…')) : null,
            groups.map(function (group) {
              return React.createElement('div', { key: group.id },
                React.createElement('div', { className: 'rs2-grouptitle' }, group.name || group.id),
                group.models.map(function (entry) {
                  var isSelected = !!current && current.provider === group.id && current.model === entry.id
                  return React.createElement('button', {
                    key: entry.id,
                    type: 'button',
                    className: 'rs2-option',
                    'data-selected': isSelected ? '1' : '0',
                    onClick: function () { pickModel(group, entry) },
                  },
                    React.createElement('span', { className: 'rs2-optname' }, entry.name || entry.id),
                    React.createElement('span', { style: { flex: 1 } }),
                    isSelected ? React.createElement('span', { className: 'rs2-check' }, React.createElement(SeatCheckIcon, null)) : null)
                })
              )
            })
          )
        )
      } else {
        body = React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'rs2-advhead' },
            React.createElement('button', { type: 'button', className: 'rs2-modeljump', onClick: function () { setMode('models') } },
              React.createElement('span', { className: 'rs2-modeljump-name' }, current ? displayName : t('选择模型')),
              React.createElement(SeatChevron, { open: false })),
            React.createElement('div', { className: 'rs2-curlevel' + (stops.length > 1 && value === stops.length - 1 ? ' rs2-curlevel-max' : '') }, (stops[value] || {}).label || effLabel)),
          React.createElement('div', { className: 'rs2-sliderbox' },
            React.createElement(SeatSlider, {
              count: stops.length,
              value: value,
              onPreview: function (i) { if (current) setOpt({ provider: current.provider, model: current.model, value: i }) },
              onCommit: function (i) { commitStop(i) },
            })))
      }
      return React.createElement('div', { className: 'rs2-root', ref: rootRef },
        React.createElement('button', {
          type: 'button',
          className: 'rs2-trigger',
          'aria-expanded': open,
          disabled: props.locked === true,
          onClick: function () {
            setOpt(null)
            if (props.available) props.load()
            setOpen(function (v) {
              var next = !v
              if (next) setMode('advanced')
              return next
            })
          },
        },
          // Compact-mode glyph first, exactly like the official seat: the host
          // row toggles the two display variables defined above, so this icon
          // appears only when the composer cannot fit the text.
          React.createElement('span', { className: 'rs2-trigger-icon', 'aria-hidden': true }, React.createElement(SeatDataIcon, null)),
          React.createElement('span', { className: 'rs2-trigger-name' }, current ? displayName : t('选择模型')),
          reasoning ? React.createElement('span', { className: 'rs2-trigger-effort' }, effLabel) : null,
          React.createElement(SeatChevron, { open: open })),
        open && React.createElement('div', { className: 'rs2-menu' }, body))
    }

    /**
     * Dispose handle of the seat registration synchronously: the returned
     * disposer first detaches the entry, and only then does the deferred
     * `slots.inject` callback update the live registration — the two orderings
     * cover both a live and a not-yet-run slots.inject.
     */
    function seatDisposer() {
      var state = { disposed: false, disposer: undefined, scope: undefined }
      function dispose() {
        if (state.disposed) return
        state.disposed = true
        if (typeof state.disposer === 'function') state.disposer()
        if (state.scope && typeof state.scope.dispose === 'function') state.scope.dispose()
      }
      return {
        state: state,
        dispose: dispose,
      }
    }

    /**
     * Register the seat once the slots service is up. Returns null (with a
     * warning) when the host has no slots service.
     */
    function registerModelSeat(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) {
        console.warn('[dsh-usage-stats] 高级模型选择器: slots service unavailable')
        return null
      }
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      if (models === undefined || typeof models.directoryFor !== 'function' || sessions === undefined || typeof sessions.subagentAddress !== 'function') {
        console.warn('[dsh-usage-stats] 高级模型选择器: modelDirectories/sessions service unavailable')
        return null
      }
      var handle = seatDisposer()
      // The effort-preview clear cancels its 2s timer when the component
      // unmounts, so every timer created inside the seat is owned by it.
      var timers = new Set()
      function scheduleClear(fn) {
        var fire = function () {
          timers.delete(fire)
          fn()
        }
        var stop = ctx.timeout(fire, 2000)
        timers.add(fire)
        return function () {
          if (!timers.has(fire)) return
          timers.delete(fire)
          if (typeof stop === 'function') stop()
        }
      }
      handle.state.scope = slots.inject('conversation.input.model', function () {
        if (handle.state.disposed) return undefined
        var disposer = slots.register({
          name: 'conversation.input.model',
          // Bundle-client registrations get NO automatic shadowing priority:
          // the official seat registers with priority unset, so an unset tie
          // falls back to insertion order and the official selector wins.
          // -1 beats it (same value the old dpnows file patch used).
          priority: -1,
          locale: 'model',
          inject: function (sessionId) {
            // The official modelDirectories service reaches into other
            // services here, on THIS plugin's fiber — see the inject list.
            var directory = models.directoryFor(sessionId)
            var available = sessions.subagentAddress(sessionId) === undefined
            if (!available) return { available: false }
            return {
              available: true,
              store: directory.store,
              load: function () { directory.load().catch(function () {}) },
              select: function (selection) { return directory.select(selection).then(function () { return true }, function () { return false }) },
            }
          },
        }, function (slotProps) {
          return React.createElement(ModelSeat, Object.assign({}, slotProps, { scheduleClear: scheduleClear }))
        })
        if (handle.state.disposed) {
          if (typeof disposer === 'function') disposer()
          return undefined
        }
        handle.state.disposer = disposer
        return disposer
      })
      return handle
    }

    // Seat registration + its stylesheet, held per plugin instance so a
    // runtime toggle can dispose and re-register.
    var seatRegistration = null

    // Both startup and the settings page use the same host-controlled switch.
    var modelSeatSync = null
    var modelSeatSyncRevision = 0

    function setModelSeatSync(fn) {
      modelSeatSync = fn
    }

    /** Re-evaluate the seat from a controls payload; never throws. */
    function syncModelSeatFromControls(control) {
      if (typeof modelSeatSync !== 'function') return false
      try {
        // Absent (older host) reads as false: the switch is opt-in.
        var enabled = !!(control && control.settings && control.settings.advancedModelSelect)
        modelSeatSyncRevision++
        seatWriteEnabledPref(enabled)
        return modelSeatSync(enabled)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 sync failed:', error)
        return false
      }
    }

    /** Load the saved host switch independently of the settings page. */
    function bootModelSeat(ctx, api) {
      var disposed = false
      var stopRetry = null
      var retries = 0
      function retry() {
        if (disposed || retries >= 10 || typeof ctx.timeout !== 'function') return
        var delay = Math.min(400 * Math.pow(2, retries++), 4000)
        stopRetry = ctx.timeout(load, delay)
      }
      function load() {
        stopRetry = null
        var revision = modelSeatSyncRevision
        var request
        try { request = api.controls() } catch (error) { retry(); return }
        request.then(function (body) {
          // A settings-page read/save made after this request takes precedence.
          if (disposed || revision !== modelSeatSyncRevision) return
          var enabled = !!(body && body.settings && body.settings.advancedModelSelect)
          if (!syncModelSeatFromControls(body) && enabled) retry()
        }).catch(function () {
          if (!disposed && revision === modelSeatSyncRevision) retry()
        })
      }
      load()
      return function () {
        disposed = true
        if (typeof stopRetry === 'function') stopRetry()
      }
    }

    /** Idempotent: syncModelSeat(true) twice registers exactly one entry. */
    function syncModelSeat(ctx, enabled) {
      if (enabled !== true) {
        if (seatRegistration) {
          var stale = seatRegistration
          seatRegistration = null
          try { stale.dispose() } catch (error) {
            console.warn('[dsh-usage-stats] 高级模型选择器 unmount failed:', error)
          }
          var seatStyle = document.getElementById(SEAT_STYLE_ID)
          if (seatStyle && typeof seatStyle.remove === 'function') seatStyle.remove()
        }
        return false
      }
      if (seatRegistration) return true
      var handle
      try {
        handle = registerModelSeat(ctx)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 mount failed:', error)
        return false
      }
      if (handle === null) return false
      seatRegistration = handle
      try {
        injectSeatStyles(ctx)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 styles failed:', error)
      }
      return true
    }

    /** The seat stylesheet, removable on dispose and refreshable in place. */
    function injectSeatStyles(ctx) {
      var dispose = function () {
        var style = document.getElementById(SEAT_STYLE_ID)
        if (style && typeof style.remove === 'function') style.remove()
      }
      return ctx.effect(function () {
        // Always refresh the content, mirroring injectStyles(): an older
        // in-page load may have injected a stale revision of these rules.
        var style = document.getElementById(SEAT_STYLE_ID)
        if (!style) {
          style = document.createElement('style')
          style.id = SEAT_STYLE_ID
          style.dataset.plugin = 'dsh-model-selection-seat'
          style.dataset.pluginCss = 'dsh-model-selection-seat/seat'
          document.head.appendChild(style)
        }
        style.textContent = SEAT_CSS
        return dispose
      }, 'dsh-usage-stats: model seat stylesheet')
    }

    /**
     * Mount the 用量统计 settings section.
     * @param ctx - client root context (slots service).
     */
    function apply(ctx) {
      // The product bridge is exposed only in the desktop app's main renderer.
      // A browser opened against its local host must not mount desktop features.
      if (!window.dshDesktop || typeof window.dshDesktop.deviceInfo !== 'function') return

      var slots = ctx.get('slots')
      if (slots === undefined) {
        console.warn('[dsh-usage-stats] slots service unavailable')
        return
      }
      var hostLocale = ctx.get('locale')
      if (hostLocale && typeof hostLocale.register === 'function' && typeof hostLocale.bind === 'function') {
        var dictionaries = { zh: {}, en: {}, ja: {} }
        Object.keys(messages).forEach(function (key) {
          dictionaries.zh[key] = key
          dictionaries.en[key] = messages[key][0]
          dictionaries.ja[key] = messages[key][1]
        })
        ctx.effect(function () { return hostLocale.register(SECTION_ID, dictionaries) }, 'dsh-usage-stats: translations')
        localeService = hostLocale
        translate = hostLocale.bind(SECTION_ID)
      }
      var api = new UsageApi()
      setModelSeatSync(function (enabled) { return syncModelSeat(ctx, enabled) })
      // A cached true avoids showing the official seat while the controls
      // request is in flight. The host response always confirms or corrects it.
      if (seatReadEnabledPref()) syncModelSeat(ctx, true)
      try {
        injectStyles()
        ctx.effect(watchUsageNavIcon, 'dsh-usage-stats: sidebar icon')
        ctx.effect(function () { return bootModelSeat(ctx, api) }, 'dsh-usage-stats: model seat startup')
        ctx.effect(function () {
          return slots.inject('settings.section', function () {
            return slots.register(
              {
                name: 'settings.section',
                id: SECTION_ID,
                order: 32,
                locale: SECTION_ID,
                label: function () { return t('用量统计') },
              },
              function (slotProps) {
                return React.createElement(UsageStatsSection, { api: api, intl: (slotProps && slotProps.intl !== undefined) ? slotProps.intl : true })
              },
            )
          })
        }, 'dsh-usage-stats: settings section')
      } catch (error) {
        console.warn('[dsh-usage-stats] mount failed:', error)
      }
      ctx.effect(function () {
        return function () {
          syncModelSeat(ctx, false)
          setModelSeatSync(null)
        }
      }, 'dsh-usage-stats: model seat cleanup')
    }

    exports.inject = inject
    exports.apply = apply
    // Structural hooks for the offline layout check (scripts/render-heatmap-check.mjs).
    // Not consumed by the host: the bundle's real entry points stay inject/apply.
    exports.__components = { Heatmap: Heatmap, HeatPager: HeatPager, buildHeatmap: buildHeatmap }
    return module.exports
  },
})
