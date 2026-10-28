/** DSH Desktop usage statistics renderer. */
window.__ModuleLoader__.load({ id: "@sligqoer/dsh-usage-stats", factory: (require) => {
'use strict'
var module = { exports: {} }, exports = module.exports
var React = require('react')

var SECTION_ID = 'usage-stats'

var STYLE_ID = 'dsh-usage-stats-styles'

var PLUGIN_VERSION = "0.2.6"

var localeService = null

var translate = null

/** Renderer translation table: Chinese source string -> [English, Japanese]. */
function createClientMessages() {
var messages = {
      "单次输出上限": ["Output limit per request", "1回の出力上限"],
      "单次输出上限应为 1,024–16,384 的整数。": ["Output limit per request must be an integer from 1,024 to 16,384.", "1回の出力上限は1,024〜16,384の整数で指定してください。"],
      "每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token": ["Up to {maxTokens} tokens per request · Up to {maxOutputTokens} output tokens across all requests", "1回最大 {maxTokens} Token・全リクエストの出力は最大 {maxOutputTokens} Token"],
      "输出上限限制每次响应；总预算在每次请求结束后检查，达到后停止后续请求。": ["The output limit applies to each response. The total budget is checked after each request; reaching it stops further calls.", "出力上限は各応答に適用されます。総予算は各リクエスト終了後に確認し、到達すると後続の呼び出しを停止します。"],
      "随机数输出被截断；请提高单次输出上限，重新查看预算后检测。": ["Random-number output was truncated. Increase the output limit per request, preview the budget, then start a new test.", "乱数出力が途中で切れました。1回の出力上限を増やし、予算を確認して再検査してください。"],
      "仅基于 {count} 个有效样本展示排名；3 个有效样本才显示库内置信度。": ["Rankings use {count} valid samples. Reference-set confidence requires 3 valid samples.", "有効サンプル {count} 個による順位です。参照集合内の信頼度には3個の有効サンプルが必要です。"],
      "置信度不足，候选仅供比较。": ["Low confidence; compare the candidates with caution.", "信頼度が不足しています。候補は比較の参考にしてください。"],
      "置信度不足（低于 75%）": ["Low confidence (below 75%)", "信頼度不足（75%未満）"],
      "候选排名": ["Candidate rankings", "候補の順位"],
      "首选候选": ["Top candidate", "最上位候補"],
      "仅排序": ["Ranking only", "順位のみ"],
      "采样状态": ["Sample status", "サンプルの状態"],
      "采样 {number}": ["Sample {number}", "サンプル {number}"],
      "有效样本 {valid} / {total}": ["Valid samples {valid} / {total}", "有効サンプル {valid} / {total}"],
      "有效数字 / 要求数量": ["Valid numbers / Requested count", "有効な数値 / 要求数"],
      "有效": ["Valid", "有効"],
      "输出截断": ["Output truncated", "出力が途中で切れました"],
      "格式无效": ["Invalid format", "形式が無効"],
      "请求失败": ["Request failed", "リクエスト失敗"],
      "采样中": ["Sampling", "サンプル取得中"],
      "未采样": ["Not sampled", "未取得"],
      "已达单次输出上限": ["Per-request output limit reached", "1回の出力上限に到達"],
      "检测供应商": ["Detection provider", "検出プロバイダー"],
      "检测模型": ["Detection model", "検出モデル"],
      "选择检测模型": ["Choose a detection model", "検出モデルを選択"],
      "没有已配置的供应商": ["No configured providers", "設定済みプロバイダーはありません"],
      "没有可用模型": ["No available models", "利用可能なモデルはありません"],
      "可选择任意已配置模型；检测选择不会更改会话模型。": ["Choose any configured model. Detection selection does not change the conversation model.", "設定済みの任意のモデルを選択できます。検出の選択は会話のモデルを変更しません。"],
      "查看检测预算": ["Preview detection budget", "検出予算を確認"],
      "取消检测": ["Cancel detection", "検出をキャンセル"],
      "检测运行中": ["Detection running", "検出実行中"],
      "待配置": ["Needs setup", "設定待ち"],
      "待开始": ["Ready to start", "開始待ち"],
      "未完成": ["Incomplete", "未完了"],
      "参考库": ["Reference set", "参照集合"],
      "检查更新": ["Check for updates", "更新を確認"],
      "{count} 个模型": ["{count} models", "{count} モデル"],
      "低置信度": ["Low confidence", "信頼度不足"],
      "检测预算": ["Detection budget", "検出予算"],
      "请求次数": ["Requests", "リクエスト数"],
      "Token 预算": ["Token budget", "Token 予算"],
      "输入预估": ["Est. input", "推定入力"],
      "输出上限": ["Output limit", "出力上限"],
      "部分检测用量尚未上报，可能已产生费用。": ["Some detection usage is not yet reported; charges may have been incurred.", "一部の検出使用量は未報告で、費用が発生している可能性があります。"],
      "尚未取得足够指纹数据，无法判定。": ["Insufficient fingerprint data to reach a conclusion.", "指紋データが不足しているため、判定できません。"],
      "当前宿主不支持读取模型列表，请更新 DSH。": ["The host cannot read model catalogs. Update DSH.", "ホストはモデル一覧を取得できません。DSHを更新してください。"],
      "请选择已配置的供应商。": ["Choose a configured provider.", "設定済みプロバイダーを選択してください。"],
      "模型列表无法读取，请检查供应商配置后重试。": ["Cannot read the model catalog. Check the provider configuration and retry.", "モデル一覧を取得できません。プロバイダーの設定を確認し、再試行してください。"],
      "请选择供应商与检测模型。": ["Choose a provider and detection model.", "プロバイダーと検出モデルを選択してください。"],
      "请确认检测会消耗 Token 后再开始。": ["Confirm token usage before starting detection.", "検出によるToken消費を確認してから開始してください。"],
      "检测预算已过期，请刷新预算后开始。": ["Detection budget expired. Refresh it before starting.", "検出予算の有効期限が切れました。予算を更新してから開始してください。"],
      "已有检测正在运行，请先等待或取消。": ["Detection is running. Wait or cancel it first.", "検出が実行中です。完了を待つかキャンセルしてください。"],
      "检测记录已过期。": ["Detection record expired.", "検出記録の有効期限が切れました。"],
      "检测操作无效。": ["Invalid detection action.", "検出操作が無効です。"],
      "随机数指纹检测": ["Random-number fingerprint", "乱数指紋検査"],
      "使用 LM Fingerprint 官方随机数指纹，默认 3 次请求；不发送会话内容。": ["Uses the official LM Fingerprint random-number engine with 3 requests by default. Conversation content is excluded.", "公式 LM Fingerprint の乱数指紋を使用。標準は3回のリクエストで、会話内容は送信しません。"],
      "采样次数": ["Samples", "サンプル数"],
      "标准检测（3 次）": ["Standard test (3 requests)", "標準検査（3回）"],
      "低耗初筛（1 次，仅排序）": ["Quick screening (1 request, ranking only)", "簡易検査（1回、順位のみ）"],
      "候选模型": ["Candidate model", "候補モデル"],
      "指纹得分": ["Fingerprint score", "指紋スコア"],
      "库内置信度": ["Reference-set confidence", "参照集合内の信頼度"],
      "首选候选与请求模型一致": ["Top candidate matches the requested model", "最上位候補が要求モデルと一致"],
      "首选候选与请求模型不同": ["Top candidate differs from the requested model", "最上位候補が要求モデルと相違"],
      "候选排序": ["Candidate ranking", "候補順位"],
      "仅为参考库内排名，不证明模型身份，也不衡量能力降级。": ["Ranking within the reference set does not prove model identity or measure capability downgrades.", "参照集合内の順位です。モデルの同一性や能力低下を証明するものではありません。"],
      "初筛只展示候选排序；3 次有效采样才显示库内置信度。": ["Quick screening shows rankings only. Reference-set confidence requires 3 valid samples.", "簡易検査は順位のみ。参照集合内の信頼度には3回の有効サンプルが必要です。"],
      "请求模型不在参考库中，候选仅供比较。": ["The requested model is absent from the reference set; candidates are for comparison.", "要求モデルが参照集合にないため、候補は比較用です。"],
      "参考库将这些型号合并为同一类，无法区分具体型号。": ["The reference set combines these variants into one class and cannot distinguish them.", "参照集合ではこれらを同じクラスに統合しており、個別の型番は区別できません。"],
      "有效随机数不足，已停止后续请求。": ["Too few valid random numbers; further requests stopped.", "有効な乱数が不足し、後続のリクエストを停止しました。"],
      "随机数分布异常，本次结果无法判定。": ["The number distribution is abnormal; this result is inconclusive.", "乱数の分布が異常なため、今回は判定できません。"],
      "指纹引擎与参考库": ["Fingerprint engine and reference set", "指紋エンジンと参照集合"],
      "{count} 个参考模型": ["{count} reference models", "参照モデル {count} 件"],
      "每日检查上游更新，校验成功后启用；更新失败继续使用本地版本。": ["Check upstream daily and activate verified updates. Keep the local version if an update fails.", "上流の更新を毎日確認し、検証後に適用します。失敗時はローカル版を使用します。"],
      "检查上游更新": ["Check upstream updates", "上流の更新を確認"],
      "正在检查更新…": ["Checking for updates…", "更新を確認中…"],
      "官方文档": ["Official documentation", "公式ドキュメント"],
      "上游更新暂不可用，继续使用已验证的指纹引擎。": ["Upstream updates are unavailable; using the verified fingerprint engine.", "上流の更新を取得できないため、検証済みエンジンを使用します。"],
      "缓存引擎校验失败，已保留内置版本。": ["Cached engine verification failed; keeping the bundled version.", "キャッシュの検証が失敗したため、内蔵版を使用します。"],
      "内置指纹引擎不可用，请重新安装插件。": ["Bundled fingerprint engine is unavailable. Reinstall the plugin.", "内蔵エンジンを利用できません。プラグインを再インストールしてください。"],
      "指纹引擎不可用，请检查更新状态。": ["Fingerprint engine unavailable. Check its update status.", "指紋エンジンを利用できません。更新状態を確認してください。"],
      "指纹检测未完成，请检查通道或引擎状态。": ["Fingerprint test incomplete. Check the channel or engine status.", "指紋検査は未完了です。接続先またはエンジンの状態を確認してください。"],
      "请选择 1 次初筛或 3 次标准检测。": ["Choose 1 screening request or 3 standard requests.", "簡易検査1回または標準検査3回を選択してください。"],
      "Token 预算应为 1,024–50,000 的整数。": ["Token budget must be an integer from 1,024 to 50,000.", "Token 予算は1,024〜50,000の整数で指定してください。"],
      "请选择更新指纹引擎。": ["Select fingerprint engine update.", "指紋エンジンの更新を選択してください。"],
      "关闭推理": ["Reasoning off","推論オフ"],
      "已上报 Token 预算": ["Reported-token budget","報告済みトークンの予算"],
      "开始检测（会消耗 Token）": ["Start detection (uses tokens)","検証開始（トークンを消費）"],
      "请求最多 {requests} 次 · 输入约 {estimatedInputTokens} Token · 输出上限 {maxOutputTokens} Token": ["Up to {requests} calls · About {estimatedInputTokens} input tokens · Output limit {maxOutputTokens} tokens","最大 {requests} 回 · 入力約 {estimatedInputTokens} トークン · 出力上限 {maxOutputTokens} トークン"],
      "预算按已上报用量检查；推理、未上报用量及供应商重试按通道规则计费。": ["The budget uses reported usage. Reasoning, unreported usage and provider retries follow the channel's billing rules.","予算は報告済み使用量で確認します。推論・未報告使用量・再試行の料金は接続先の規則に従います。"],
      "已完成 {progress} 次请求，上限 {requests} 次": ["Finished {progress} calls; limit {requests}","完了 {progress} 回、上限 {requests} 回"],
      "检测结果": ["Detection result","検証結果"],
      "上次检测结果": ["Previous detection result","前回の検証結果"],
      "检测详情": ["Detection details","検証の詳細"],
      "本次消耗 {tokens} Token · 已计入统计": ["{tokens} tokens used · Included in statistics","使用量 {tokens} Token · 統計に計上済み"],
      "本次已上报消耗 {tokens} Token": ["Reported usage: {tokens} tokens","報告済み使用量 {tokens} Token"],
      "缓存命中率": ["Cache hit rate","キャッシュヒット率"],
      "Token 使用峰值": ["Peak daily tokens","1日の最大 Token 使用量"],
      "最长任务时长": ["Longest task","最長タスク時間"],
      "当前连续天数": ["Current streak","現在の連続利用日数"],
      "最长使用天数": ["Longest streak","最長連続利用日数"],
      "最近常使用模型": ["Recent favorite model","最近よく使うモデル"],
      "缓存读取占全部输入的比例": ["Cache reads as a share of all input","全入力に占めるキャッシュ読み取りの割合"],
      "有完整起止记录的已结束单轮任务，包含工具调用和等待。": ["Ended processing rounds with complete timestamps, including tools and waits.","開始・終了時刻がある終了済みの1ラウンド。ツール実行と待機を含みます。"],
      "今日尚未使用时，延续至昨日的连续记录。": ["If unused today, continue the streak ending yesterday.","本日未利用の場合は昨日までの連続記録を表示します。"],
      "历史最长连续使用天数": ["Longest consecutive usage streak across history","履歴中の最長連続利用日数"],
      "近 7 天调用 {calls} 次 · {providers}": ["{calls} calls in the last 7 days · {providers}","直近7日間 {calls} 回 · {providers}"],
      "{days} 天": ["{days} days","{days} 日"],
      "{days}天 {hours}小时": ["{days}d {hours}h","{days}日 {hours}時間"],
      "{hours}小时 {minutes}分": ["{hours}h {minutes}m","{hours}時間 {minutes}分"],
      "{minutes}分 {seconds}秒": ["{minutes}m {seconds}s","{minutes}分 {seconds}秒"],
      "{seconds}秒": ["{seconds}s","{seconds}秒"],
      "历史结果，仅对应下方列出的模型和参数。": ["This saved result applies to the model and settings listed below.","この保存済み結果は、下記のモデルと設定にのみ対応します。"],
      "无法判定": ["Inconclusive","判定できません"],
      "请求超时，检测未完成。": ["A request timed out; the detection is incomplete.","リクエストがタイムアウトし、検証は未完了です。"],
      "通道请求失败，检测未完成。": ["A channel request failed; the detection is incomplete.","接続先へのリクエストが失敗し、検証は未完了です。"],
      "检测已取消，已发生的用量仍会统计。": ["Detection cancelled; incurred usage is still counted.","検証をキャンセルしました。発生した使用量は集計されます。"],
      "宿主重启时检测尚未完成，请重新检测。": ["The detection was unfinished when the host restarted. Run it again.","ホスト再起動時に検証が未完了でした。再実行してください。"],
      "已达到 Token 预算，检测未完成。": ["The token budget was reached; the detection is incomplete.","トークン予算に達し、検証は未完了です。"],
      "检测用量保存失败，已停止后续请求；请检查本地存储。": ["Detection usage could not be saved; further calls stopped. Check local storage.","検証使用量を保存できず、後続の呼び出しを停止しました。ローカル保存先を確認してください。"],
      "检测记录无法读取，请检查本地记录后重新加载插件。": ["Detection history could not be read. Check local records and reload the plugin.","検証履歴を読めません。ローカル記録を確認し、プラグインを再読み込みしてください。"],
      "本次通道表现": ["Channel performance this run","今回の接続性能"],
      "模型信息无法读取，请检查供应商配置后重试。": ["Model information is unavailable. Check provider settings and retry.","モデル情報を読み取れません。設定を確認して再試行してください。"],
      '用量统计': ['Usage statistics', '利用状況'],
      '用量统计页面': ['Usage statistics tabs', '利用状況のタブ'],
      '模型接入': ['Model access', 'モデル接続'],
      '免费模型': ['Free models', '無料モデル'],
      'OpenCode Zen 免费模型': ['OpenCode Zen free models', 'OpenCode Zen 無料モデル'],
      'Kilo 免费模型': ['Kilo free models', 'Kilo 無料モデル'],
      'WorkBuddy 国内版': ['WorkBuddy China', 'WorkBuddy 中国版'],
      'WorkBuddy 国际版': ['WorkBuddy international', 'WorkBuddy 国際版'],
      '账号渠道': ['Account channels', 'アカウント接続先'],
      '搜索渠道或账号…': ['Search channels or accounts…', '接続先またはアカウントを検索…'],
      '搜索渠道或账号': ['Search channels or accounts', '接続先またはアカウントを検索'],
      '已添加 {count} 个账号': ['{count} accounts added', '追加済みアカウント {count} 件'],
      '{count} 个账号': ['{count} accounts', 'アカウント {count} 件'],
      '没有匹配的渠道或账号。': ['No matching channels or accounts.', '一致する接続先またはアカウントはありません。'],
      '账号使用说明': ['Account help', 'アカウントの使い方'],
      '管理': ['Manage', '管理'],
      '不限额': ['Unlimited', '上限なし'],
      '余额仅供展示': ['Balance for display only', '残高は表示専用'],
      '按渠道设置自动行为': ['Automation by channel', '接続先ごとの自動化設定'],
      '额度与设置': ['Quota and settings', '利用枠と設定'],
      '搜索模型或来源…': ['Search models or sources…', 'モデルまたは接続元を検索…'],
      '搜索模型或来源': ['Search models or sources', 'モデルまたは接続元を検索'],
      '共 {count} 个模型': ['{count} models', 'モデル {count} 件'],
      '可用 {usable}/{total}': ['Available {usable}/{total}', '利用可能 {usable}/{total}'],
      '已测试 {done}/{total}': ['Tested {done}/{total}', 'テスト済み {done}/{total}'],
      '可用模型 / 模型总数': ['Usable models / total models', '利用可能なモデル / 総モデル数'],
      '一键测试全部': ['Test all free', '一括テスト'],
      '对目录中所有可测试的免费模型依次执行一次有界调用测试。': ['Runs one bounded test after another for every testable free model in the catalog.', 'カタログ内のテスト可能な無料モデルを順に一度ずつ有界テストします。'],
      '账号模型选择': ['Account model sources', 'アカウントモデルの接続元'],
      '账号自动行为': ['Account automation', 'アカウントの自動動作'],
      '自定义网关': ['Custom gateways', 'カスタムゲートウェイ'],
      '已启用 {enabled}/{total}': ['{enabled}/{total} enabled', '{enabled}/{total} 件有効'],
      '展开渠道开关': ['Show channel switches', '接続先スイッチを開く'],
      '可登录并调用': ['Sign-in and inference', 'ログインと推論が可能'],
      '仅登录与额度': ['Sign-in and quota only', 'ログインと利用枠のみ'],
      '输入类型': ['Input types', '入力タイプ'],
      '设置 {model} 的推理强度': ['Reasoning effort for {model}', '{model} の推論強度'],
      '详情': ['Details', '詳細'],
      '可用': ['Available', '利用可能'],
      '待测试': ['Test needed', 'テスト待ち'],
      '已关闭': ['Off', '無効'],
      '上游限制': ['Upstream restriction', '接続先の制限'],
      '接入模型 ({count})': ['Connected models ({count})', '接続モデル ({count})'],
      '暂无模型，请刷新目录。': ['No models yet. Refresh the catalog.', 'モデルがありません。一覧を更新してください。'],
      '启用 {channel}': ['Enable {channel}', '{channel} を有効化'],
      '刷新模型目录': ['Refresh catalog', 'モデル一覧を更新'],
      '目录刷新只读取模型列表，不会发起推理请求。': ['Refreshing the catalog only reads the model list; it never starts an inference request.', '一覧の更新はモデル一覧を読むだけで、推論リクエストは送信しません。'],
      '正在读取模型目录…': ['Reading the model catalog…', 'モデル一覧を読み込み中…'],
      '目录为空，请点击刷新模型目录。': ['The catalog is empty. Use Refresh catalog.', '一覧が空です。「モデル一覧を更新」を実行してください。'],
      '没有匹配的模型。': ['No matching models.', '一致するモデルがありません。'],
      '测试调用': ['Test call', 'テスト呼び出し'],
      '正在测试 {model}…': ['Testing {model}…', '{model} をテスト中…'],
      '测试已取消。': ['The test was cancelled.', 'テストを中止しました。'],
      '测试失败。': ['The test failed.', 'テストに失敗しました。'],
      '测试完成：{model} · 用时 {ms} 毫秒 · {usage}': ['Test complete: {model} · {ms} ms · {usage}', 'テスト完了：{model} · {ms} ミリ秒 · {usage}'],
      '已上报用量': ['usage reported', '使用量を報告'],
      '未上报用量': ['usage not reported', '使用量の報告なし'],
      '协议': ['Protocol', 'プロトコル'],
      '文本': ['Text', 'テキスト'],
      '图像': ['Image', '画像'],
      '工具': ['Tools', 'ツール'],
      '上下文窗口': ['Context window', 'コンテキスト長'],
      '输出长度上限': ['Output token limit', '出力トークン上限'],
      '支持': ['Supported', '対応'],
      '不支持': ['Not supported', '非対応'],
      '未知': ['Unknown', '不明'],
      '免费证据': ['Free evidence', '無料の根拠'],
      '证据版本': ['Evidence version', '根拠のバージョン'],
      '证据时间': ['Evidence time', '根拠の取得時刻'],
      '不可调用原因': ['Not callable because', '呼び出せない理由'],
      '该模型当前不可调用。': ['This model is not callable right now.', 'このモデルは現在呼び出せません。'],
      '可改用以下来源：': ['You can switch to: ', '切り替え可能な接続元：'],
      '上游自动路由': ['Upstream auto-routed', '上流の自動ルーティング'],
      '该条目由上游自动路由，实际模型可能改变；本插件不会替你切换模型。': ['This entry is routed upstream, so the underlying model may change. This plugin never switches models for you.', 'この項目は上流で自動ルーティングされるため、実際のモデルは変わる可能性があります。本プラグインが代わりに切り替えることはありません。'],
      '启用 {model}': ['Enable {model}', '{model} を有効化'],
      '查看请求记录': ['View request journal', 'リクエスト記録を表示'],
      '请求记录只保存标识、耗时与错误分类，不含提问或回答正文。': ['The journal keeps identifiers, timings and error classes only — never prompts or completions.', '記録には識別子・所要時間・エラー分類のみを保存し、質問や回答の本文は含みません。'],
      '读取请求记录': ['Load request journal', 'リクエスト記録を読み込む'],
      '暂无记录。': ['No entries.', '記録はありません。'],
      '正在处理…': ['Working…', '処理中…'],
      '操作失败。': ['The operation failed.', '操作に失敗しました。'],
      '未通过宿主认证，请重新登录宿主。': ['Host authentication failed. Sign in to the host again.', 'ホスト認証に失敗しました。ホストへ再ログインしてください。'],
      '无法连接本地接口，请确认插件仍在运行。': ['Cannot reach the local endpoint. Check that the plugin is still running.', 'ローカル接続に失敗しました。プラグインが動作中か確認してください。'],
      '接口返回了无法解析的响应。': ['The endpoint returned an unreadable response.', '解釈できない応答が返されました。'],
      '重新读取': ['Reload', '再読み込み'],
      '添加账号': ['Add account', 'アカウントを追加'],
      '导入本机登录': ['Import local sign-in', 'ローカルのログインを取り込む'],
      '读取本机登录': ['Read local sign-in', 'ローカルのログインを読み込む'],
      '先在对应的 WorkBuddy 应用中登录，再导入本机登录状态。无需安装其他插件。': ['Sign in to the matching WorkBuddy app, then import its local sign-in. No extra plugin is required.', '対応するWorkBuddyアプリにログインし、ローカルのログイン状態を取り込んでください。追加プラグインは不要です。'],
      '浏览器授权登录': ['Sign in with browser', 'ブラウザーで認証'],
      '设备码授权登录': ['Sign in with device code', 'デバイスコードで認証'],
      '微信扫码登录': ['Sign in with WeChat QR code', 'WeChatのQRコードでログイン'],
      '短信验证码登录': ['Sign in with SMS code', 'SMSコードでログイン'],
      '授权登录': ['Authorize sign-in', '認証してログイン'],
      '尚未添加账号。': ['No account added yet.', 'アカウントは未追加です。'],
      '本版本不可用': ['Not available in this build', 'このビルドでは利用できません'],
      '该渠道可以登录并查看额度，但推理调用在当前版本不可用。': ['This channel supports sign-in and quota display, but inference calls are unavailable in the current build.', 'この接続先はログインと利用枠の表示に対応しますが、現行ビルドでは推論呼び出しを利用できません。'],
      '该渠道未声明可用的登录方式。': ['This channel declares no usable sign-in method.', 'この接続先は利用可能なログイン方法を宣言していません。'],
      '新登录的账号不会自动替换当前选中的账号。': ['A newly signed-in account never replaces the currently selected account.', '新しくログインしたアカウントが現在の選択を自動で置き換えることはありません。'],
      '选为当前账号': ['Use as current account', '現在のアカウントに設定'],
      '已选中': ['Selected', '選択済み'],
      '当前账号': ['Current account', '現在のアカウント'],
      '凭据已过期': ['Credentials expired', '認証情報の有効期限が切れています'],
      '启用': ['Enable', '有効化'],
      '停用': ['Disable', '無効化'],
      '删除账号': ['Delete account', 'アカウントを削除'],
      '刷新凭据': ['Refresh credential', '認証情報を更新'],
      '上次续期': ['Last renewal', '前回の更新'],
      '凭据版本 {version}': ['Credential version {version}', '認証情報バージョン {version}'],
      '共 {count} 个可用账号，默认只使用选定的账号。': ['{count} usable accounts; by default only the selected one is used.', '利用可能なアカウント {count} 件。既定では選択した1件のみを使用します。'],
      '登录 {channel}': ['Sign in to {channel}', '{channel} にログイン'],
      '取消登录': ['Cancel sign-in', 'ログインを中止'],
      '等待授权': ['Waiting for authorization', '認証待ち'],
      '需要你完成授权': ['Complete authorization', '認証を完了してください'],
      '登录成功': ['Signed in', 'ログイン成功'],
      '登录失败': ['Sign-in failed', 'ログイン失敗'],
      '登录已取消': ['Sign-in cancelled', 'ログイン中止'],
      '登录已过期': ['Sign-in expired', 'ログイン期限切れ'],
      '打开授权页面': ['Open authorization page', '認証ページを開く'],
      '请在默认浏览器中完成登录。': ['Complete sign-in in your default browser.', '既定のブラウザーでログインを完了してください。'],
      '在浏览器中登录': ['Sign in in browser', 'ブラウザーでログイン'],
      '额度已刷新。': ['Quota refreshed.', '利用枠を更新しました。'],
      '未能打开默认浏览器，请检查系统浏览器设置。': ['Could not open your default browser. Check your browser settings.', '既定のブラウザーを開けませんでした。ブラウザーの設定を確認してください。'],
      '登录二维码': ['Sign-in QR code', 'ログイン用QRコード'],
      '打开扫码授权入口': ['Open QR authorization', 'QR認証を開く'],
      '设备码': ['Device code', 'デバイスコード'],
      '查询登录状态': ['Check sign-in status', 'ログイン状態を確認'],
      '登录状态的响应无法解析。': ['Unreadable sign-in response.', 'ログイン応答を解析できません。'],
      '提交': ['Submit', '送信'],
      '该步骤需要在你自己的登录页面完成，页内不会收集密码或密钥。': ['Complete this step on the provider\u2019s own page; this page never collects passwords or keys.', 'この手順は提供元のページで完了してください。本ページはパスワードや鍵を収集しません。'],
      '模拟登录': ['Simulated sign-in', '模擬ログイン'],
      '未通过认证': ['Not authenticated', '未認証'],
      'pending': ['Waiting', '待機中'],
      'running': ['Running', '実行中'],
      'waiting-user': ['Needs your input', '入力待ち'],
      'done': ['Done', '完了'],
      'cancelled': ['Cancelled', '中止'],
      'expired': ['Expired', '期限切れ'],
      'error': ['Error', 'エラー'],
      'ready': ['Ready', '準備完了'],
      'unknown': ['Unknown', '不明'],
      'unverified': ['Unverified', '未検証'],
      'cooldown': ['Cooling down', 'クールダウン中'],
      'unavailable': ['Unavailable', '利用不可'],
      'region-limited': ['Region limited', '地域制限'],
      'anonymous-free': ['Anonymous free', '匿名の無料枠'],
      'account-included': ['Included with account', 'アカウント内'],
      'paid': ['Paid', '有料'],
      '付费模型': ['Paid model', '有料モデル'],
      '免费权益未核实': ['Free entitlement unverified', '無料枠を確認できません'],
      '免费权益未核实，已暂停调用。': ['Free entitlement unverified; calling is paused.', '無料枠を確認できないため呼び出しを停止しています。'],
      '已验证': ['Verified', '検証済み'],
      '调用验证时间': ['Call verified at', '呼び出し検証日時'],
      '重新测试': ['Test again', '再テスト'],
      '未验证': ['Unverified', '未検証'],
      '限流冷却中': ['Rate limited', 'レート制限中'],
      '当前网络出口不可用': ['Unavailable from this region', 'この地域からは利用不可'],
      '已下架或不可用': ['Withdrawn or unavailable', '提供終了または利用不可'],
      '一键领取': ['Claim all', '一括受け取り'],
      '没有可领取的已启用账号。': ['No enabled account is eligible to claim.', '受け取り対象の有効なアカウントがありません。'],
      '刷新额度': ['Refresh quota', '利用枠を更新'],
      '尚未读取额度。点击刷新额度后显示；未知额度不会显示为 0。': ['No quota read yet. Use Refresh quota; an unknown quota is never shown as 0.', '利用枠は未取得です。「利用枠を更新」を実行してください。不明な値を 0 として表示しません。'],
      '额度快照': ['Quota snapshot', '利用枠スナップショット'],
      '账号总余额': ['Account total balance', 'アカウント総残高'],
      '剩余 {count}%': ['{count}% remaining', '残り {count}%'],
      '已使用 {count}%': ['{count}% used', '{count}% 使用済み'],
      '到期时间': ['Expires at', '有効期限'],
      '重置时间': ['Resets at', 'リセット時刻'],
      '额度读取失败': ['Quota query failed', '利用枠の取得に失敗'],
      '账号套餐': ['Account plan', 'アカウントプラン'],
      '适用模型': ['Eligible models', '対象モデル'],
      '赠送额度': ['Gift credit', '付与クレジット'],
      '套餐内': ['Included in plan', 'プラン内'],
      '付费余额': ['Paid balance', '有料残高'],
      '额度类型不明': ['Entitlement type unknown', '種別不明の利用枠'],
      '该渠道不提供额度查询': ['This channel offers no quota query', 'この接続先は利用枠の照会に対応していません'],
      '收起额度明细': ['Collapse quota details', '利用枠の明細を閉じる'],
      '剩余积分': ['Remaining credits', '残りポイント'],
      '展开其余 {count} 项明细': ['Show {count} more quota details', '残り {count} 件の明細を開く'],
      '读取时间': ['Read at', '取得時刻'],
      '已暂停调用': ['Calling paused', '呼び出し停止中'],
      '免费权益无法核实，登录与管理仍可使用。': ['The free entitlement cannot be verified. Sign-in and management remain available.', '無料枠を確認できません。ログインと管理は引き続き利用できます。'],
      '领取结果按账号分别显示。': ['Claim results are listed per account.', '受け取り結果はアカウントごとに表示します。'],
      '已领取': ['Claimed', '受け取り済み'],
      '今日已领取': ['Already claimed today', '本日は受け取り済み'],
      '该渠道不支持领取': ['This channel does not support claiming', 'この接続先は受け取りに対応していません'],
      '需要你手动完成': ['Needs your action', '手動での操作が必要'],
      '领取失败': ['Claim failed', '受け取りに失敗'],
      '结果未知': ['Result unknown', '結果不明'],
      '查询状态': ['Check status', '状態を確認'],
      '自动行为': ['Automatic behaviour', '自動動作'],
      '启用渠道': ['Enable channel', '接続先を有効化'],
      '启用渠道 {channel}': ['Enable channel {channel}', '接続先 {channel} を有効化'],
      '自动选择账号': ['Select accounts automatically', 'アカウントを自動選択'],
      '为 {channel} 自动选择账号': ['Select accounts automatically for {channel}', '{channel} でアカウントを自動選択'],
      '每日自动领取': ['Daily automatic claim', '毎日の自動受け取り'],
      '为 {channel} 开启每日自动领取': ['Enable daily automatic claim for {channel}', '{channel} で毎日の自動受け取りを有効化'],
      '每日自动领取已开启': ['Daily automatic claim is on', '毎日の自動受け取り：オン'],
      '每日自动领取已关闭': ['Daily automatic claim is off', '毎日の自動受け取り：オフ'],
      '自动选择账号已开启': ['Automatic account selection is on', 'アカウントの自動選択：オン'],
      '固定账号': ['Fixed account', '固定アカウント'],
      '匿名免费来源': ['Anonymous free source', '匿名の無料接続元'],
      '当前状态': ['Current state', '現在の状態'],
      '接入设置': ['Access settings', '接続設定'],
      '不可调用': ['Not callable', '呼び出せません'],
      '已在模型选择器可见': ['Visible in the model picker', 'モデル選択に表示'],
      '尚未通过调用验证': ['Not yet verified by a call', '呼び出しで未検証'],
      '该模型尚未通过匿名调用验证；一次成功的测试会把它加入模型选择器。': ['This model has not been verified by an anonymous call yet. One successful test adds it to the model picker.', 'このモデルは匿名呼び出しで未検証です。1回成功するとモデル選択に追加されます。'],
      '该渠道在当前离线宿主中不可用。': ['This channel is unavailable on the current host.', 'この接続先は現在のホストでは利用できません。'],
      '用量': ['Usage', '使用量'],
      '配额': ['Quota', '利用枠'],
      '控制': ['Controls', '設定'],
      '检测': ['Detection', '検出'],
      '日志': ['Logs', 'ログ'],
      '成本': ['Costs', 'コスト'],
      '时间': ['Time', '時刻'],
      '应用': ['App', 'アプリ'],
      '模型': ['Model', 'モデル'],
      '新增输入': ['New input', '新規入力'],
      '缓存命中': ['Cache hit', 'キャッシュヒット'],
      '速度': ['Speed', '速度'],
      '首字': ['First token', '初回トークン'],
      '全部供应商': ['All providers', 'すべてのプロバイダー'],
      '全部模型': ['All models', 'すべてのモデル'],
      '请求日志': ['Request log', 'リクエストログ'],
      '总请求数': ['Total requests', '総リクエスト数'],
      '真实消耗 Tokens': ['Tokens used', '実消費トークン'],
      '时间范围': ['Time range', '期間'],
      '当天': ['Today', '当日'],
      '近 7 天': ['Last 7 days', '過去 7 日間'],
      '近 30 天': ['Last 30 days', '過去 30 日間'],
      '成本 · 按小时': ['Cost · hourly', 'コスト · 時間別'],
      '成本 · 按天': ['Cost · daily', 'コスト · 日別'],
      'Token · 按小时': ['Tokens · hourly', 'トークン · 時間別'],
      'Token · 按天': ['Tokens · daily', 'トークン · 日別'],
      '刚刚同步': ['Synced just now', 'たった今同期しました'],
      '同步于 {time}': ['Synced {time}', '{time} に同期'],
      '{time} · {cost} · {calls} 次': ['{time} · {cost} · {calls} calls', '{time} · {cost} · {calls} 回'],
      '近 24 小时': ['Last 24 hours', '過去 24 時間'],
      '近 14 天': ['Last 14 days', '過去 14 日間'],
      '开始时间': ['Start time', '開始時刻'],
      '结束时间': ['End time', '終了時刻'],
      '支持日期与时间': ['Date and time supported', '日付と時刻に対応'],
      '结束时间跟随当前时刻': ['End time follows the current time', '終了時刻は現在時刻に追従'],
      '确定': ['Apply', '確定'],
      '时间范围无效。': ['Invalid time range.', '期間が無効です。'],
      '周一': ['Mon', '月'],
      '周二': ['Tue', '火'],
      '周三': ['Wed', '水'],
      '周四': ['Thu', '木'],
      '周五': ['Fri', '金'],
      '周六': ['Sat', '土'],
      '周日': ['Sun', '日'],
      '日': ['S', '日'],
      '一': ['M', '月'],
      '二': ['T', '火'],
      '三': ['W', '水'],
      '四': ['T', '木'],
      '五': ['F', '金'],
      '六': ['S', '土'],
      '{year}年{month}月': ['{year}/{month}', '{year}年{month}月'],
      '{month}月': ['{month}', '{month}月'],
      '按小时': ['hourly', '時間別'],
      '按天': ['daily', '日別'],
      '按月': ['monthly', '月別'],
      '请求数': ['Requests', 'リクエスト数'],
      'Tokens': ['Tokens', 'トークン'],
      '{time} · {value}': ['{time} · {value}', '{time} · {value}'],
      '用量热力图': ['Usage heatmap', '利用ヒートマップ'],
      '{tokens} Token · {calls} 次请求 · {cost}': ['{tokens} tokens · {calls} requests · {cost}', '{tokens} トークン · {calls} リクエスト · {cost}'],
      '关闭用量统计': ['Close usage statistics', '利用状況を閉じる'],
      '共 {count} 条': ['{count} entries', '{count} 件'],
      '暂无请求记录': ['No requests recorded', 'リクエスト記録はありません'],
      '上一页': ['Previous', '前へ'],
      '下一页': ['Next', '次へ'],
      '第 {page} / {pages} 页': ['Page {page} of {pages}', '{page} / {pages} ページ'],
      '每页行数': ['Rows per page', 'ページあたりの行数'],
      '{count} 条/页': ['{count} per page', '{count} 件/ページ'],
      '刷新请求日志': ['Refresh request log', 'リクエストログを更新'],
      '刷新成本统计': ['Refresh costs', 'コストを更新'],
      '总成本': ['Total cost', '総コスト'],
      '区间成本': ['Range cost', '期間コスト'],
      '区间 Tokens': ['Range tokens', '期間トークン'],
      '开始日期': ['Start date', '開始日'],
      '结束日期': ['End date', '終了日'],
      '价格表': ['Price table', '価格表'],
      '已收录 {priced} / 共 {total} 个模型': ['{priced} of {total} models priced', '価格登録済み {priced} / 全 {total} モデル'],
      '美元 / 百万 Tokens': ['USD per million tokens', '米ドル / 100万トークン'],
      '保存': ['Save', '保存'],
      '请输入有效价格。': ['Enter a valid price.', '有効な価格を入力してください。'],
      '暂无成本数据': ['No cost data', 'コストデータはありません'],
      '日期范围无效。': ['Invalid date range.', '日付範囲が無効です。'],
      '规则': ['Rules', 'ルール'],
      '新增规则': ['Add rule', 'ルールを追加'],
      '已有规则': ['Existing rules', '既存のルール'],
      '归一名称': ['Merged name', '統合後の名前'],
      '例如 Claude Sonnet 4.5': ['e.g. Claude Sonnet 4.5', '例：Claude Sonnet 4.5'],
      '原始模型': ['Raw models', '元のモデル'],
      '输入模型名称，回车添加': ['Type a model name and press Enter', 'モデル名を入力して Enter で追加'],
      '搜索模型名称': ['Search model names', 'モデル名を検索'],
      '还没有模型使用记录': ['No models recorded yet', 'モデルの使用記録はまだありません'],
      '没有匹配的模型': ['No matching models', '一致するモデルはありません'],
      '没有可添加的模型': ['No models left to add', '追加できるモデルはありません'],
      '添加': ['Add', '追加'],
      '移除 {name}': ['Remove {name}', '{name} を削除'],
      '{count} 个原始模型': ['{count} raw models', '元のモデル {count} 件'],
      '移除规则': ['Remove rule', 'ルールを削除'],
      '移除“{name}”规则？这些原始模型会恢复各自独立的名称。': ['Remove the "{name}" rule? Its raw models go back to their own names.', '「{name}」のルールを削除しますか？元のモデルはそれぞれの名前で集計されます。'],
      '移除中…': ['Removing…', '削除中…'],
      '刷新规则': ['Refresh rules', 'ルールを更新'],
      '还没有模型规则。': ['No model rules yet.', 'モデルルールはまだありません。'],
      '输入': ['Input', '入力'],
      '输出': ['Output', '出力'],
      '缓存读取': ['Cache read', 'キャッシュ読み取り'],
      '缓存写入': ['Cache write', 'キャッシュ書き込み'],
      '推理': ['Reasoning', '推論'],
      '模型检测': ['Model detection', 'モデル検出'],
      '检测服务已停止。': ['The detection service has stopped.', '検出サービスは停止しています。'],
      '供应商': ['Provider', 'プロバイダー'],
      '请求模型': ['Requested model', 'リクエストしたモデル'],
      '供应商默认': ['Provider default', 'プロバイダーの既定値'],
      '未上报': ['Not reported', '未報告'],
      '取消测试': ['Cancel test', 'テストをキャンセル'],
      '正在取消…': ['Cancelling…', 'キャンセル中…'],
      '测试完成': ['Test complete', 'テスト完了'],
      '测试已取消': ['Test cancelled', 'テストをキャンセルしました'],
      '通过': ['Passed', '成功'],
      '答案或格式不符': ['Answer or format differed', '回答または形式が不一致'],
      '达到输出上限，结果不完整': ['Output limit reached; incomplete', '出力上限に達したため不完全です'],
      '超时': ['Timed out', 'タイムアウト'],
      '已取消': ['Cancelled', 'キャンセル済み'],
      '通道暂时不可用': ['Channel temporarily unavailable', '接続を一時的に利用できません'],
      '测试结果反映这次通道表现，不构成模型身份认证。测试用量单列，不加入会话汇总。': ['Results describe this channel run and do not authenticate model identity. Test usage is shown separately from session totals.', '結果は今回の接続の動作を示すもので、モデルの身元を認証するものではありません。テスト使用量はセッション集計と分けて表示します。'],
      '刷新用量统计': ['Refresh usage statistics', '利用状況を更新'],
      '刷新全部配额': ['Refresh all quotas', 'すべての利用枠を更新'],
      '部分配额未能更新，请稍后刷新重试。': ['Some quotas could not be updated. Try refreshing again later.', '一部の利用枠を更新できませんでした。しばらくしてから再試行してください。'],
      '部分会话读取失败': ['Some sessions could not be read', '一部のセッションを読み込めませんでした'],
      '草稿已保留，测试并确认后生效。': ['Draft retained. Test and confirm to apply it.', '下書きを保持しています。テストして確定すると有効になります。'],
      '恢复已保存模板': ['Restore saved template', '保存済みテンプレートを復元'],
      '本地会话统计': ['Local session statistics', 'ローカルセッションの統計'],
      '上次同步：{time}': ['Last synced: {time}', '前回の同期：{time}'],
      '后台同步中，当前显示上次数据。': ['Syncing in the background; showing the previous data.', 'バックグラウンドで同期中です。前回のデータを表示しています。'],
      '当前模型筛选：{model}': ['Model filter: {model}', '現在のモデルフィルター：{model}'],
      '清除筛选': ['Clear filter', 'フィルターを解除'],
      '概览为全部历史；图表按当前模型筛选。': ['Overview covers all history; charts follow the model filter.', '概要は全履歴です。グラフにはモデルフィルターを適用します。'],
      '保留上次成功数据': ['Showing the last successful data', '前回取得したデータを表示しています'],
      '凭据无效或已过期，请在模型设置中重新登录。': ['Credentials are invalid or expired. Sign in again in model settings.', '認証情報が無効か期限切れです。モデル設定で再ログインしてください。'],
      '账户没有配额查询权限。': ['This account cannot read quota information.', 'このアカウントには利用枠を照会する権限がありません。'],
      '查询受到限流，请稍后重试。': ['The query was rate limited. Try again later.', '照会回数が制限されています。後で再試行してください。'],
      '查询超时，请检查网络后重试。': ['The query timed out. Check your connection and retry.', '照会がタイムアウトしました。接続を確認して再試行してください。'],
      '供应商服务暂时不可用。': ['The provider service is temporarily unavailable.', 'プロバイダーのサービスを一時的に利用できません。'],
      '响应无法解析，请检查查询字段映射。': ['The response could not be parsed. Check the field mapping.', '応答を解析できません。フィールドの対応を確認してください。'],
      '查询失败，请检查地址和网络。': ['The query failed. Check the URL and your connection.', '照会に失敗しました。URLと接続を確認してください。'],
      '配额查询暂时不可用，请稍后重试。': ['Quota queries are temporarily unavailable. Try again later.', '利用枠の照会を一時的に利用できません。後で再試行してください。'],
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
      'token输出速度': ['Token output speed', 'トークン出力速度'],
      '暂无速度数据': ['No speed data yet', '速度データはまだありません'],
      '平均首 Token 耗时': ['Average time to first token', '最初のトークンまでの平均時間'],
      '暂无 TTFT 数据': ['No TTFT data yet', 'TTFT データはまだありません'],
      '{tokens} 个输出 Token · {seconds} 秒': ['{tokens} output tokens · {seconds} seconds', '{tokens} 出力トークン · {seconds} 秒'],
      '展开全部速度排名（{count}）': ['Show all speed rankings ({count})', 'すべての速度順位を表示（{count}）'],
      '收起速度排名': ['Show fewer speed rankings', '速度順位を折りたたむ'],
      '每个供应商 · 模型组合单独统计': ['Count each provider and model combination separately', 'プロバイダーとモデルの組み合わせごとに集計'],
      '合并同名模型，不区分供应商': ['Combine matching model names across providers', '同名モデルをプロバイダーを問わず合算'],
      '模型用量清单 ({count})': ['Model usage ({count})', 'モデル使用量一覧（{count}）'],
      '搜索模型或供应商名称…': ['Search models or providers…', 'モデル名・プロバイダー名で検索…'],
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
      '模型功能': ['Model features', 'モデル機能'],
      '用量展示': ['Usage display', '使用量表示'],
      '模型推理强度': ['Model reasoning settings', 'モデル推論強度'],
      '10 分钟': ['10 minutes', '10分'],
      '1 小时': ['1 hour', '1時間'],
      '5 小时': ['5 hours', '5時間'],
      '每天': ['Daily', '毎日'],
      '高级模型选择器': ['Advanced model selector', '詳細モデル選択'],
      '已关闭，已恢复官方模型选择器': ['Disabled; the default model selector is restored', '無効にしました。標準のモデル選択に戻りました'],
      '已开启高级模型选择器': ['Advanced model selector enabled', '詳細モデル選択を有効にしました'],
      '主题色': ['Theme color', 'テーマカラー'],
      '红色': ['Red', 'レッド'],
      '绿色': ['Green', 'グリーン'],
      '黄色': ['Yellow', 'イエロー'],
      '蓝色': ['Blue', 'ブルー'],
      '紫色': ['Purple', 'パープル'],
      '已更新主题色': ['Theme color updated', 'テーマカラーを更新しました'],
      '配额查询': ['Quota queries', '利用枠の照会'],
      '刷新供应商列表': ['Refresh provider list', 'プロバイダー一覧を更新'],
      '查询来源': ['Query source', '照会元'],
      '正在加载供应商…': ['Loading providers…', 'プロバイダーを読み込み中…'],
      '选择已有供应商': ['Select a provider', 'プロバイダーを選択'],
      '已保存自定义查询': ['Saved custom query', '保存済みのカスタム照会'],
      '内置扩展查询': ['Built-in extension query', '拡張機能の標準照会'],
      '内置供应商查询': ['Built-in provider query', 'プロバイダーの標準照会'],
      '尚无可用查询来源，请先添加模型供应商。': ['No query sources available. Add a model provider first.', '照会元がありません。先にモデルプロバイダーを追加してください。'],
      '账号配额暂不可用，请稍后重试。': ['Account quotas are temporarily unavailable. Try again later.', 'アカウントの利用枠を取得できません。しばらくしてから再試行してください。'],
      '用量统计暂不可用，请稍后重试。': ['Usage statistics are temporarily unavailable. Try again later.', '利用統計を取得できません。しばらくしてから再試行してください。'],
      '补充用量暂时不可用，保留上次成功记录。': ['Supplemental usage is temporarily unavailable. Showing the last saved data.', '追加の使用量を取得できません。前回のデータを表示しています。'],
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
      '编辑查询': ['Edit query', '照会を編集'],
      '关闭窗口': ['Close window', 'ウィンドウを閉じる'],
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
      '切换模型失败': ['Could not switch the model', 'モデルの切り替えに失敗しました'],
      '新会话默认模型，创建后生效': ['New-session default model, applied once the session exists', '新しいセッションの既定モデル（作成後に反映されます）'],
      '默认模型未能写入配置': ['The default model was not saved to the configuration', '既定モデルを設定に書き込めませんでした'],
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
      '模型检测开关值无效。': ['Invalid model detection switch value.', 'モデル検出スイッチの値が無効です。'],
      '日志开关值无效。': ['Invalid logs switch value.', 'ログスイッチの値が無効です。'],
      '成本开关值无效。': ['Invalid costs switch value.', 'コストスイッチの値が無効です。'],
      '价格设置应为 JSON 对象。': ['Price settings must be a JSON object.', '価格設定はJSONオブジェクトにしてください。'],
      '模型名称无效。': ['Invalid model name.', 'モデル名が無効です。'],
      '价格必须是非负数字。': ['Prices must be non-negative numbers.', '価格は0以上の数値で指定してください。'],
      '价格表最多支持 1000 个模型。': ['The price table supports up to 1,000 models.', '価格表は最大1000モデルまで対応しています。'],
      '价格表保存失败，请检查存储目录权限。': ['Failed to save the price table. Check storage directory permissions.', '価格表を保存できませんでした。保存先フォルダーの権限を確認してください。'],
      '规则设置应为 JSON 对象。': ['Rule settings must be a JSON object.', 'ルール設定はJSONオブジェクトにしてください。'],
      '未知规则操作。': ['Unknown rule action.', 'ルールの操作が不明です。'],
      '请填写归一名称和至少一个原始模型。': ['Enter a merged name and at least one raw model.', '統合後の名前と元のモデルを1つ以上入力してください。'],
      '同一个原始模型不能同时归入两个不同的归一名称。': ['A raw model cannot belong to two different merged names.', '同じ元のモデルを別々の統合名に所属させることはできません。'],
      '模型规则最多支持 1000 条。': ['Model rules support up to 1,000 entries.', 'モデルルールは最大1000件まで対応しています。'],
      '名称规则形成了循环，请调整后保存。': ['The name rules form a loop. Adjust them and save again.', '名前のルールが循環しています。調整してから保存してください。'],
      '模型规则保存失败，请检查存储目录权限。': ['Failed to save model rules. Check storage directory permissions.', 'モデルルールを保存できませんでした。保存先フォルダーの権限を確認してください。'],
      '规则开关值无效。': ['Invalid rules switch value.', 'ルールスイッチの値が無効です。'],
      '要移除的规则不存在。': ['The rule to remove no longer exists.', '削除するルールが見つかりません。'],
      'Token 输出速度开关值无效。': ['Invalid token output speed switch value.', 'トークン出力速度スイッチの値が無効です。'],
      '高级模型选择器开关值无效。': ['Invalid advanced model selector switch value.', '詳細モデル選択のスイッチ値が無効です。'],
      '主题色无效，请选择红、绿、黄、蓝或紫。': ['Invalid theme color. Choose red, green, yellow, blue or purple.', 'テーマカラーが無効です。赤、緑、黄、青、紫から選択してください。'],
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

Object.assign(messages, {
      '关闭': ['Off', 'オフ'],
      '极低': ['Minimal', '最小'],
      '最大': ['Maximum', '最大'],
      '模型默认': ['Model default', 'モデルの既定値'],
      '无强度选择': ['No effort selector', '強度の選択なし'],
      '配置无效': ['Invalid configuration', '無効な設定'],
      '待选择': ['Select levels', 'レベルを選択'],
      '按模型配置可用档位': ['Configure supported levels per model', 'モデルごとに対応レベルを設定'],
      '正在读取模型设置…': ['Loading model settings…', 'モデル設定を読み込み中…'],
      '请先在模型目录添加模型并保存，再配置推理强度。': ['Add and save models in the model catalog before configuring reasoning effort.', 'モデル一覧にモデルを追加して保存してから、推論の強度を設定してください。'],
      '配置模型 {model} 的推理强度': ['Configure reasoning effort for {model}', '{model} の推論強度を設定'],
      '允许选择推理强度': ['Enable reasoning effort selection', '推論強度の選択を有効化'],
      '恢复模型默认': ['Restore model default', 'モデルの既定値に戻す'],
      '可用档位': ['Supported levels', '対応レベル'],
      '可用推理档位': ['Supported reasoning levels', '対応する推論レベル'],
      '在聊天输入区选择实际强度；接口需支持所选档位。': ['Choose the actual effort in the chat input. The API must support the selected levels.', '実際の強度はチャット入力欄で選択します。APIが選択したレベルに対応している必要があります。'],
      '高级设置：参数取值': ['Advanced: parameter values', '詳細設定：パラメーター値'],
      '{level}档参数取值': ['Parameter value for {level}', '{level} レベルのパラメーター値'],
      '不发送强度参数': ['Omit the effort parameter', '強度パラメーターを送信しない'],
      '关闭档留空表示不发送强度参数；是否关闭推理由接口决定。': ['An empty Off value omits the effort parameter. The API determines whether reasoning is disabled.', 'オフの値を空にすると強度パラメーターを送信しません。推論を無効化するかどうかはAPIによって決まります。'],
      '沿用模型目录的默认能力。': ['Use the default capabilities from the model catalog.', 'モデル一覧の既定の機能を使用します。'],
      '聊天输入区将隐藏强度选择。': ['Hide the effort selector in the chat input.', 'チャット入力欄の強度選択を非表示にします。'],
      '模型设置已更新，未保存的更改已保留。请取消更改后重新编辑。': ['Model settings changed. Unsaved edits are preserved. Cancel your edits and edit again.', 'モデル設定が変更されました。未保存の編集内容は保持されています。編集をキャンセルしてから再編集してください。'],
      '无法读取模型设置，请重试。': ['Unable to read model settings. Retry.', 'モデル設定を読み込めません。再試行してください。'],
      '保存推理设置失败，请重试。': ['Unable to save reasoning settings. Retry.', '推論設定を保存できません。再試行してください。'],
      '模型设置只读': ['Model settings are read-only', 'モデル設定は読み取り専用です'],
      '请检查模型 {model} 的推理配置': ['Check reasoning settings for {model}', '{model} の推論設定を確認してください'],
      '有未保存的更改': ['Unsaved changes', '未保存の変更があります'],
      '推理设置已保存': ['Reasoning settings saved', '推論設定を保存しました'],
      '保存中…': ['Saving…', '保存中…'],
      '保存推理设置': ['Save reasoning settings', '推論設定を保存'],
      '推理档位配置无效，请恢复模型默认后重新配置。': ['Invalid reasoning levels. Restore the model default and configure them again.', '推論レベルが無効です。モデルの既定値に戻してから再設定してください。'],
      '至少选择一个非关闭档位，或取消启用推理强度。': ['Select at least one level other than Off, or disable effort selection.', 'オフ以外のレベルを1つ以上選択するか、強度の選択を無効にしてください。'],
      '请在高级设置中填写该档位的参数取值。': ['Enter the parameter value for this level in Advanced settings.', '詳細設定でこのレベルのパラメーター値を入力してください。'],
      '推理强度扩展区已被其他插件占用，请停用其中一个模型配置插件。': ['Another plugin occupies the reasoning settings area. Disable one of the model configuration plugins.', '別のプラグインが推論設定の拡張領域を使用しています。モデル設定プラグインのいずれかを無効にしてください。'],
      '管理插件功能、免费模型与账号。': ['Manage plugin options, free models and accounts.', 'プラグイン機能、無料モデル、アカウントを管理します。'],
      '管理模型功能、用量展示、账号行为与网关。': ['Manage model features, usage display, account behavior and gateways.', 'モデル機能、使用量の表示、アカウント動作、ゲートウェイを管理します。'],
      '管理模型功能、用量展示、账号渠道与网关。': ['Manage model features, usage display, account sources and gateways.', 'モデル機能、使用量の表示、アカウントの接続元、ゲートウェイを管理します。'],
      '模型名称': ['Model name', 'モデル名'],
      '保存模型配置': ['Save model settings', 'モデル設定を保存'],
      '恢复上游默认值': ['Restore upstream defaults', '提供元の既定値に戻す'],
      '启用推理强度': ['Enable reasoning effort', '推論強度を有効にする'],
      '可选推理档位': ['Available reasoning levels', '選択可能な推論レベル'],
      '允许付费': ['Allow paid use', '有料利用を許可'],
      '允许付费使用 {model}': ['Allow paid use of {model}', '{model} の有料利用を許可'],
      '请填写模型名称、有效的 Token 数，并至少选择一种输入类型。': ['Enter a model name, valid token limits and at least one input type.', 'モデル名、有効なトークン数、入力形式を1つ以上指定してください。'],
      '请选择可用推理档位，并使默认档位位于所选范围内。': ['Select reasoning levels and a default within the selected range.', '推論レベルを選択し、その範囲内の既定値を指定してください。'],
      '管理已登录账号，查看积分、余额与可用模型。': ['Manage signed-in accounts and view credits, balances and available models.', 'ログイン済みアカウントを管理し、ポイント、残高、利用可能なモデルを確認します。'],
      '账号模型': ['Account models', 'アカウントモデル'],
      '账号余额': ['Account balance', 'アカウント残高'],
      '请在控制面板中开启账号渠道。': ['Enable account sources in Controls.', '設定でアカウントの接続元を有効にしてください。'],
      '请先开启账号渠道。': ['Enable an account source first.', '先にアカウントの接続元を有効にしてください。'],
      '选择渠道或模型': ['Select a source or model', '接続元またはモデルを選択'],
      '渠道网关': ['Source routes', '接続元の経路'],
      '模型网关': ['Model routes', 'モデルの経路'],
      '保存后可测试新网关。': ['You can test the new gateway after saving.', '保存後に新しいゲートウェイをテストできます。'],
      '自动领取时间': ['Daily claim time', '自動取得の時刻'],
      '额度未读取': ['Balance not loaded', '残高は未取得です'],
      '积分': ['credits', 'クレジット'],
      '次': ['requests', '回'],
      '剩余额度': ['Available balance', '利用可能な残高'],
      '刷新详情': ['Refresh details', '詳細を更新'],
      '额度明细 ({count})': ['Balance details ({count})', '残高の内訳 ({count})'],
      '额度明细': ['Balance details', '残高の内訳'],
      '余额仅供展示；模型是否免费以当前倍率和权益为准。': ['Balance is informational; free access depends on current pricing and entitlements.', '残高は参考情報です。無料利用は現在の倍率と利用権限によって決まります。'],
      '请输入 HTTP / HTTPS 代理地址，例如 http://127.0.0.1:7890。': ['Enter an HTTP / HTTPS proxy URL, such as http://127.0.0.1:7890.', 'HTTP / HTTPS プロキシURLを入力してください。例：http://127.0.0.1:7890'],
      '保存失败': ['Save failed', '保存に失敗しました'],
      '请求出口': ['Network route', '接続経路'],
      '跟随渠道网络': ['Use channel route', 'チャンネルの接続経路を使用'],
      '跟随 DSH 默认网络': ['Use DSH default route', 'DSH の既定の接続経路を使用'],
      '直连': ['Direct connection', '直接接続'],
      '独立 HTTP / HTTPS 代理': ['Dedicated HTTP / HTTPS proxy', '専用 HTTP / HTTPS プロキシ'],
      '代理地址': ['Proxy URL', 'プロキシURL'],
      '保存网关': ['Save route', '接続経路を保存'],
      '当前出口': ['Current route', '現在の接続経路'],
      '倍率未上报': ['Rate not reported', '倍率は未報告です'],
      '模型倍率': ['Model rate', 'モデルの倍率'],
      '独立网关': ['Dedicated route', '専用の接続経路'],
      '仅用于此模型的调用与测试；保存后请重新测试。': ['Applies to this model’s calls and tests. Test again after saving.', 'このモデルの呼び出しとテストに適用します。保存後に再テストしてください。'],
      '请先选为当前账号，再测试模型。': ['Select this account before testing its models.', 'このアカウントを選択してからモデルをテストしてください。'],
      '成功': ['Success', '成功'],
      '失败': ['Failed', '失敗'],
      '启用账号 {account}': ['Enable account {account}', 'アカウント {account} を有効化'],
      '赠送': ['Gift credits', '付与クレジット'],
      '类型不明': ['Unknown type', '種類が不明'],
      '按渠道配置网关': ['Configure routes by channel', 'チャンネルごとの接続経路'],
      '渠道网关用于登录、模型目录、额度与调用；单个模型可在详情中覆盖调用出口。': ['Channel routes cover login, catalogs, balances and calls. Model details can override the call route.', 'チャンネルの経路はログイン・一覧・残高・呼び出しに適用されます。モデル詳細で呼び出し経路を変更できます。'],
      '代理只改变网络出口，不能保证解除账号地区或模型权限限制。直连仍可能经过系统 TUN。': ['A proxy changes network egress; account regions and model permissions remain provider-controlled. Direct connections may still use the system TUN.', 'プロキシは接続経路を変更します。アカウントの地域とモデル権限は提供元が管理します。直接接続もシステムTUNを通る場合があります。'],
      '确认预算': ['Confirm budget', '予算を確認'],
      '检测步骤': ['Detection steps', '検出の手順'],
      '尚未选择模型': ['No model selected yet', 'モデルが未選択です'],
      '检测会在参考库中排序候选模型；结果为参考排名，不证明模型身份。': ['The detection ranks candidate models in the reference set. Rankings do not prove model identity.', '検出は参照集合内で候補モデルを順位付けします。順位はモデルの身元を証明するものではありません。'],
      '尚未检测本模型': ['This model has not been detected yet', 'このモデルは未検出です'],
      '检测进行中': ['Detection in progress', '検出を実行中です'],
      '{count} 次 · 单次 {tokens} Token': ['{count} calls · {tokens} tokens each', '{count} 回・1回 {tokens} Token'],
      '先查看检测预算，确认后再开始。': ['Preview the detection budget, then confirm to start.', '検出予算を確認してから開始してください。'],
      '等待检测结果': ['Awaiting detection results', '検出結果を待っています'],
      '确认预算并开始后，这里会显示采样进度与候选排名。': ['After you confirm the budget and start, sample progress and candidate rankings appear here.', '予算を確認して開始すると、サンプルの進捗と候補順位がここに表示されます。'],
      '检测进度': ['Detection progress', '検出の進捗'],
      '正在分析指纹…': ['Analyzing fingerprints…', '指紋を分析中…'],
      '本次检测参数': ['Parameters for this test', '今回の検出パラメーター'],
      '已确认预算，可开始检测。': ['Budget confirmed. Ready to start detection.', '予算を確認しました。検出を開始できます。'],
      '更改模型或参数后，需要重新查看检测预算。': ['Preview the budget again after changing the model or parameters.', 'モデルやパラメーターを変更したら、予算を再確認してください。'],
      '检测已结束': ['Detection finished', '検出が終了しました'],
      '请使用 JSON 请求。': ['Send a JSON request.', 'JSONリクエストを送信してください。'],
      '请求内容超过 32 KB。': ['Request body exceeds 32 KB.', 'リクエスト本文が32KBを超えています。'],
      '请求内容不是有效 JSON。': ['Request body is not valid JSON.', 'リクエスト本文が有効なJSONではありません。'],
      '模型推理强度开关值无效。': ['Invalid reasoning-effort toggle value.', '推論強度スイッチの値が無効です。'],
      '当前宿主不支持模型参数校验，请更新 DSH。': ['This host cannot validate model parameters. Update DSH.', '現在のホストはモデルパラメーターを検証できません。DSHを更新してください。'],
      '模型推理参数不受支持。': ['The model does not support this reasoning parameter.', 'このモデルは指定された推論パラメーターに対応していません。'],
      '当前会话已变化，请重新生成预算。': ['The session changed. Generate a new budget.', 'セッションが変更されました。予算を再作成してください。'],
      '用量展示设置无效。': ['Invalid usage display setting.', '使用量表示の設定が無効です。'],
      '检测用量记录无法读取，统计可能不完整。': ['Detection usage records could not be read; totals may be incomplete.', '検出使用量の記録を読み込めませんでした。集計が不完全な可能性があります。'],
      '本月密钥额度': ['Monthly key quota', '今月のキー枠'],
      '席位': ['Seat', 'シート'],
      '支持这个插件': ['Support this plugin', 'このプラグインを応援'],
      '如果 dsh-usage-stats 帮到了你，请在 GitHub 点个 Star': ['If dsh-usage-stats helps you, give it a star on GitHub.', 'dsh-usage-stats が役に立ったら、GitHub でスターをお願いします。'],
      '去点 Star': ['Star on GitHub', 'GitHub でスター'],
      '快速上手': ['Quick start', 'クイックスタート'],
      '问题反馈': ['Send feedback', 'フィードバック'],
      '刷新数据': ['Refresh data', 'データを更新'],
      '右上角的圆形箭头按钮用来重新读取数据：停在「用量」页时它是刷新用量统计，停在「配额」页时它会变成刷新全部配额。': ['The round arrow button in the top-right corner reloads data: on the Usage tab it refreshes usage statistics, and on the Quota tab it refreshes all quotas.', '右上の丸い矢印ボタンでデータを読み込み直します。「使用量」タブでは利用状況を、「利用枠」タブではすべての利用枠を更新します。'],
      '顶部三个数字分别是今日 Tokens、使用天数和累计 Tokens，点旁边的小箭头可以展开缓存命中率、使用峰值、最长任务和连续使用天数等细节。今天的用量按小时画成柱状图，鼠标移到柱子上能看到该小时每个模型的用量，右侧可以在「供应商·模型」和「按模型」两种口径之间切换。': ["The three numbers at the top are today's tokens, active days and total tokens; click the small arrow beside them to expand the cache hit rate, peak usage, longest task and usage streaks. Today's usage is charted by hour — hover a bar to see each model's usage — and the switch on the right toggles between provider · model and per-model views.", '上部の3つの数字は今日のトークン数・利用日数・累計トークン数です。横の小さな矢印を押すと、キャッシュヒット率・使用ピーク・最長タスク・連続利用日数などの詳細が開きます。今日の使用量は時間別の棒グラフで表示され、棒にカーソルを合わせると各モデルの使用量が確認できます。右側で「プロバイダー・モデル」と「モデル別」を切り替えられます。'],
      '热力图与趋势图': ['Heatmap and trend chart', 'ヒートマップと推移グラフ'],
      '热力图一天一格，颜色越深表示当天用量越大；可以切换「每日 / 每周」，并用左右箭头翻看更早的时段。趋势图展示最近 7 天或 30 天的每日总量，右侧同样可以按「供应商·模型」或「按模型」查看，用来观察用量的起伏。': ['Each heatmap cell is one day; darker cells mean more usage. Switch between daily and weekly and use the arrows to page back. The trend chart shows daily totals for the last 7 or 30 days, also switchable between provider · model and per-model views, so you can spot usage swings.', 'ヒートマップは1日1マスで、色が濃いほど使用量が多い日です。「日別 / 週別」を切り替え、左右の矢印で過去にさかのぼれます。推移グラフは直近7日または30日の日別合計を表示し、こちらも「プロバイダー・モデル」と「モデル別」を切り替えられるので、使用量の変化を把握できます。'],
      '环形图显示各模型的用量占比，下面的表格列出用量、占比和最后活跃时间。可以按模型名搜索或用供应商名筛选，点表格下方的按钮可以展开完整清单。': ["The donut shows each model's share of usage; the table below lists usage, share and last active time. Search by model name or filter by provider, and use the button under the table to expand the full list.", 'ドーナツグラフはモデルごとの使用割合を示し、下の表には使用量・割合・最終利用時刻が並びます。モデル名で検索したりプロバイダーで絞り込んだりでき、表の下のボタンで一覧全体を展開できます。'],
      '按输出速度给模型排名：TPS 是每秒输出的 Token 数，TTFT 是发出请求到出现第一个 Token 的等待时间。TPS 越大、TTFT 越小，用起来越流畅。': ['Ranks models by output speed: TPS is tokens generated per second and TTFT is the wait until the first token appears. Higher TPS and lower TTFT mean a smoother experience.', 'モデルを出力速度でランキングします。TPS は1秒あたりの出力トークン数、TTFT はリクエストから最初のトークンが出るまでの待ち時間です。TPS が大きく TTFT が小さいほど快適です。'],
      '按时间倒序列出每一次请求，包含时间、应用、供应商、模型、成本、输入和输出 Token、缓存命中、速度与首字耗时。顶部可以按供应商、模型筛选，并调整每页行数，适合核对某一次调用具体用了多少。': ['Lists every request in reverse chronological order with time, app, provider, model, cost, input/output tokens, cache hits, speed and time to first token. Filter by provider or model and change rows per page at the top — useful for checking what a single call actually used.', '各リクエストを新しい順に一覧表示します。時刻・アプリ・プロバイダー・モデル・コスト・入力/出力トークン・キャッシュヒット・速度・初回トークン時間が並びます。上部でプロバイダーやモデルで絞り込み、1ページの行数も変更できるので、特定の呼び出しの内訳確認に便利です。'],
      '点日期范围按钮可以选择当天、近 7/14/30 天或本月，也可以直接在日历上选择起止日期；再选供应商，页面就会按价格表把 Tokens 折算成金额。顶部是总成本、区间成本和区间 Tokens，下方按模型列出花费与占比；如果模型显示未定价，点「价格表」补上单价即可。': ['Use the date-range button to pick today, the last 7/14/30 days or this month, or choose start and end dates on the calendar. Then pick a provider and the page converts tokens into money using the price table. The top shows total cost, range cost and range tokens; below, each model\'s spending and share are listed. If a model is unpriced, open Price table and add its rate.', '期間ボタンで今日・直近7/14/30日・今月を選ぶか、カレンダーで開始日と終了日を指定します。プロバイダーを選ぶと、価格表に基づいてトークンが金額に換算されます。上部に総コスト・期間コスト・期間トークンが並び、下にはモデル別の費用と割合が表示されます。未設定のモデルがあれば「価格表」で単価を追加してください。'],
      '把同一个模型的不同原始名称（例如不同供应商给出的别名）归并成一个名称。新增时填一个归一名称，再把相关的原始模型都选进去；保存后用量、日志和成本都会按新名称统计。已有规则可以随时编辑或移除。': ['Merge different raw names of the same model (for example aliases used by different providers) into one name. Enter a merged name, add the related raw models, and save; usage, logs and costs will then be counted under the new name. Existing rules can be edited or removed at any time.', '同じモデルの異なる元の名前（プロバイダーごとの別名など）を1つにまとめます。統合後の名前を入力し、関連する元のモデルを追加して保存すると、使用量・ログ・コストがすべて新しい名前で集計されます。既存のルールはいつでも編集・削除できます。'],
      '这里显示各供应商和账号的剩余额度、已用比例与重置时间，数据直接向供应商查询。想让它在后台定时更新，可以在「控制」页打开「自动获取剩余余额」并设置间隔；也可以随时点右上角的刷新按钮。': ['Shows remaining quota, used share and reset time for each provider and account, queried directly from the provider. To update it on a schedule, turn on automatic balance checks on the Controls tab and set an interval; you can also refresh at any time from the top-right button.', 'プロバイダーとアカウントごとの残り利用枠・使用割合・リセット時刻を、プロバイダーへの問い合わせ結果から表示します。定期的に更新するには「設定」タブで残高の自動取得をオンにして間隔を設定してください。右上のボタンからいつでも更新できます。'],
      '先选供应商和模型，再决定采样次数（标准 3 次，或只做排序的 1 次低耗初筛）和 Token 预算上限，点「查看检测预算」确认大约会消耗多少 Token，再点「开始检测」。完成后会给出首选候选、候选排名和每次采样的结果；结果只是参考排名，不构成模型身份认证。': ['Choose a provider and model, then set the sample count (3 standard runs, or 1 low-cost run for ranking only) and the token budget. Click Preview budget to see roughly how many tokens it will spend, then Start detection. Results include the top candidate, candidate ranking and each sample; rankings are for reference and do not authenticate model identity.', 'プロバイダーとモデルを選び、サンプル回数（標準3回、または順位付けのみの低コスト1回）とトークン予算を決めます。「予算を確認」でおおよその消費トークンを確認してから「検出を開始」を押します。完了すると最有力候補・候補順位・各サンプルの結果が表示されます。順位は参考情報であり、モデルの身元を証明するものではありません。'],
      '这里是总开关：可以关掉不需要的标签页和模块，开启「高级模型选择器」并挑选主题色，设置「自动获取剩余余额」的刷新间隔，还能为供应商自定义配额查询。改动会立即保存，无需额外确认。': ["This is the master switchboard: hide tabs and modules you don't need, enable the advanced model picker and choose its accent color, set the automatic balance-check interval, and define custom quota queries per provider. Changes save immediately.", 'ここは全体の設定です。不要なタブやモジュールを非表示にし、高機能モデル選択のオン/オフとテーマカラー、残高自動取得の間隔、プロバイダーごとのカスタム利用枠照会を設定できます。変更はすぐに保存されます。'],
      '右上角的发送图标会打开 GitHub Issues 页面，可以提交问题、使用疑问或功能建议。附上截图和复现步骤，会更容易定位问题。': ['The send icon in the top-right corner opens GitHub Issues, where you can report a problem, ask a question or suggest a feature. Screenshots and reproduction steps help us find the issue faster.', '右上の送信アイコンを押すと GitHub Issues が開き、問題・質問・提案を送信できます。スクリーンショットと再現手順があると原因を特定しやすくなります。'],
      '本月': ['This month', '今月'],
      '选择起止日期，包含当天': ['Pick start and end dates, inclusive.', '開始日と終了日を選択してください（両端を含む）。'],
    })
  return messages
}

var messages = createClientMessages()

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
      // Provider parsers build labels such as `MiniMax · 5 小时剩余` or
      // `席位 积分剩余`; translate the descriptive prefix too so a Chinese
      // model/seat name does not leak into the English or Japanese UI.
      var localizePrefix = function (value) {
        var parts = String(value).split(' · ')
        return parts.map(function (part, index) {
          var lead = /^\s*/.exec(part)[0], trail = /\s*$/.exec(part)[0]
          var core = part.trim()
          return (index === 0 ? lead : '') + t(core) + (index === parts.length - 1 ? trail : '')
        }).join(' · ')
      }
      var hours = /^(.*?)(\d+(?:\.\d+)?) 小时剩余$/.exec(label)
      if (hours) return localizePrefix(hours[1]) + t('{hours} 小时剩余', { hours: hours[2] })
      var period = /^(.*?)(周剩余|月剩余|窗口剩余)$/.exec(label)
      if (period) return localizePrefix(period[1]) + t(period[2])
      var credits = /^(.*?) 积分剩余$/.exec(label)
      if (credits) return localizePrefix(credits[1]) + ' ' + t('积分剩余')
      var window = /^配额窗口 (\d+)$/.exec(label)
      return window ? t('配额窗口 {index}', { index: window[1] }) : t(label)
    }

function uiError(error) {
      var http = /^查询返回 HTTP (\d+)，请检查地址和供应商凭据。$/.exec(error)
      return http ? t('查询返回 HTTP {status}，请检查地址和供应商凭据。', { status: http[1] }) : t(error)
    }

/* One modern popup replaces every native title bubble. Elements opt in with
   data-dshus-tip; the node lives inside the open dialog (top layer) so it is
   visible above modal chrome. */
var hoverTipNode = null
var hoverTipTarget = null
var hoverTipSequence = 0
var hoverTipPoint = null
var hoverTipFramePending = false

function hoverTipRoot() {
      if (typeof document === 'undefined') return null
      var dialogs = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('dialog[open]') : null
      return dialogs && dialogs.length ? dialogs[dialogs.length - 1] : document.body || null
    }

function hideHoverTip() {
      hoverTipTarget = null
      hoverTipPoint = null
      hoverTipSequence++
      if (hoverTipNode) hoverTipNode.classList.remove('on')
    }

// Reading the tooltip box right after writing it would force a synchronous
// layout of the whole dialog on every hover target. Position it after paint
// instead, so moving across dense charts stays responsive.
function placeHoverTip(target, sequence) {
      if (sequence !== hoverTipSequence || hoverTipTarget !== target || !hoverTipNode) return
      var x, y
      if (hoverTipPoint) {
        x = hoverTipPoint.x
        y = hoverTipPoint.y
      } else {
        var rect = target.getBoundingClientRect()
        x = rect.left + rect.width / 2
        y = rect.top
      }
      var width = hoverTipNode.offsetWidth || 0
      var height = hoverTipNode.offsetHeight || 0
      var viewportWidth = window.innerWidth || 0
      var viewportHeight = window.innerHeight || 0
      var margin = 8
      var left = x + 14
      if (left + width > viewportWidth - margin) left = x - width - 14
      left = Math.max(margin, left)
      var top = y + 16
      if (top + height > viewportHeight - margin) top = y - height - 12
      top = Math.max(margin, top)
      hoverTipNode.style.left = Math.round(left) + 'px'
      hoverTipNode.style.top = Math.round(top) + 'px'
      hoverTipNode.classList.add('on')
    }

function scheduleHoverTipPlacement() {
      if (hoverTipFramePending || !hoverTipTarget) return
      var schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame
        : function (callback) { return setTimeout(callback, 16) }
      hoverTipFramePending = true
      schedule(function () {
        hoverTipFramePending = false
        placeHoverTip(hoverTipTarget, hoverTipSequence)
      })
    }

function showHoverTip(target, point) {
      if (typeof document === 'undefined' || typeof window === 'undefined' || !target || typeof target.getBoundingClientRect !== 'function') return
      var text = target.getAttribute('data-dshus-tip')
      if (!text) { hideHoverTip(); return }
      var root = hoverTipRoot()
      if (!root) return
      if (!hoverTipNode) {
        hoverTipNode = document.createElement('div')
        hoverTipNode.className = 'dshus-tip dshus-hover-tip'
        hoverTipNode.setAttribute('role', 'tooltip')
      }
      if (hoverTipNode.parentNode !== root) root.appendChild(hoverTipNode)
      hoverTipTarget = target
      hoverTipPoint = point ? { x: point.x, y: point.y } : null
      hoverTipNode.classList.remove('on')
      hoverTipNode.textContent = text
      hoverTipSequence++
      scheduleHoverTipPlacement()
    }

function bindHoverTips() {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function' || !document.body) return undefined
      var nearest = function (node) { return node && typeof node.closest === 'function' ? node.closest('[data-dshus-tip]') : null }
      var over = function (event) {
        var target = nearest(event.target)
        if (target && target !== hoverTipTarget) showHoverTip(target, { x: event.clientX, y: event.clientY })
      }
      var move = function (event) {
        if (!hoverTipTarget || nearest(event.target) !== hoverTipTarget) return
        hoverTipPoint = { x: event.clientX, y: event.clientY }
        scheduleHoverTipPlacement()
      }
      var out = function (event) {
        var target = nearest(event.target)
        if (!target || target !== hoverTipTarget) return
        if (event.relatedTarget && target.contains && target.contains(event.relatedTarget)) return
        hideHoverTip()
      }
      var focusIn = function (event) { var target = nearest(event.target); if (target) showHoverTip(target, null) }
      var focusOut = function (event) { var target = nearest(event.target); if (target && target === hoverTipTarget) hideHoverTip() }
      var dismiss = function () { hideHoverTip() }
      document.addEventListener('pointerover', over, true)
      document.addEventListener('pointermove', move, { capture: true, passive: true })
      document.addEventListener('pointerout', out, true)
      document.addEventListener('focusin', focusIn, true)
      document.addEventListener('focusout', focusOut, true)
      document.addEventListener('pointerdown', dismiss, true)
      document.addEventListener('scroll', dismiss, true)
      return function () {
        document.removeEventListener('pointerover', over, true)
        document.removeEventListener('pointermove', move, { capture: true, passive: true })
        document.removeEventListener('pointerout', out, true)
        document.removeEventListener('focusin', focusIn, true)
        document.removeEventListener('focusout', focusOut, true)
        document.removeEventListener('pointerdown', dismiss, true)
        document.removeEventListener('scroll', dismiss, true)
        hideHoverTip()
        if (hoverTipNode && hoverTipNode.parentNode) hoverTipNode.parentNode.removeChild(hoverTipNode)
        hoverTipNode = null
      }
    }

/** Locale-aware number/date formatting shared by every panel. */
function createClientFormat() {
function fmt(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
      if (Math.abs(n) >= 1e9) return Number((n / 1e9).toFixed(2)) + 'B'
      if (Math.abs(n) >= 1e6) return Number((n / 1e6).toFixed(2)) + 'M'
      if (Math.abs(n) >= 1e3) return Number((n / 1e3).toFixed(2)) + 'k'
      return String(Math.round(n))
    }

function fmtExact(n) {
      return Number(n || 0).toLocaleString(currentLanguage() === 'zh' ? 'zh-CN' : currentLanguage() === 'ja' ? 'ja-JP' : 'en-US')
    }

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

function fmtFetched(value) {
      if (value === null || value === undefined || value === '') return '—'
      var ms = typeof value === 'number' ? value : new Date(value).getTime()
      if (!Number.isFinite(ms) || ms <= 0) return '—'
      var d = new Date(ms)
      if (Number.isNaN(d.getTime())) return '—'
      var p = function (n) { return String(n).padStart(2, '0') }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

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

function fmtCost(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value === 0) return '$0'
      var digits = value >= 1 ? 2 : value >= 0.01 ? 3 : value >= 0.0001 ? 4 : 6
      return '$' + value.toFixed(digits)
    }

function readJson(response) {
      return response.json().then(function (body) {
        if (!response.ok || (body && body.ok === false)) throw new Error((body && body.error) || ('HTTP ' + response.status))
        return body
      })
    }

  return { fmt, fmtExact, fmtReset, fmtInTz, fmtFetched, fmtCost, formatPct, monthShort, readJson }
}

var LOCAL_TZ = (function () {
      try { return new Date().getTimezoneOffset() } catch (e) { return 0 }
    })()
var clientFormat = createClientFormat()
var fmt = clientFormat.fmt
var fmtExact = clientFormat.fmtExact
var fmtReset = clientFormat.fmtReset
var fmtInTz = clientFormat.fmtInTz
var fmtFetched = clientFormat.fmtFetched
var fmtCost = clientFormat.fmtCost
var formatPct = clientFormat.formatPct
var monthShort = clientFormat.monthShort
var readJson = clientFormat.readJson

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
      UsageApi.prototype.logs = function (opts) {
        var search = new URLSearchParams()
        if (opts.provider) search.set('provider', opts.provider)
        if (opts.model) search.set('model', opts.model)
        if (opts.page > 1) search.set('page', String(opts.page))
        if (opts.pageSize) search.set('pageSize', String(opts.pageSize))
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/logs?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.costs = function (opts) {
        var search = new URLSearchParams()
        if (opts.from) search.set('from', opts.from)
        if (opts.to) search.set('to', opts.to)
        if (opts.provider) search.set('provider', opts.provider)
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/costs?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.dashboard = function (opts) {
        var search = new URLSearchParams()
        if (opts.all) search.set('all', '1')
        else if (opts.from && opts.to) { search.set('from', opts.from); search.set('to', opts.to) }
        if (opts.provider) search.set('provider', opts.provider)
        if (opts.model) search.set('model', opts.model)
        if (opts.page > 1) search.set('page', String(opts.page))
        if (opts.pageSize) search.set('pageSize', String(opts.pageSize))
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/dashboard?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.savePrice = function (body) {
        return fetch('/api/dsh-usage-stats/prices', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
      }
      UsageApi.prototype.rules = function () {
        return fetch('/api/dsh-usage-stats/rules', { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.saveRules = function (body) {
        return fetch('/api/dsh-usage-stats/rules', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
      }
      UsageApi.prototype.providerQuotas = function (opts) {
        var search = new URLSearchParams()
        if (opts && opts.fresh) search.set('fresh', '1')
        if (opts && opts.provider) search.set('provider', opts.provider)
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/provider-quotas' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      /** Read stored account quotas; upstream queries are explicit and limited to enabled accounts. */
      UsageApi.prototype.accountQuotas = async function (opts) {
        var previous = this.accountQuotaCache
        var read = function () {
          return fetch('/api/dsh-usage-stats/account-quotas', { headers: { accept: 'application/json' }, credentials: 'same-origin' }).then(readJson)
        }
        var view = await read()
        var failures = []
        if (opts && opts.fresh) {
          var channels = (view.channels || []).filter(function (channel) {
            return channel.kind === 'account' && channel.enabled === true && channel.supportsQuota === true && (!opts.channelId || channel.id === opts.channelId)
          })
          var targets = (view.accounts || []).filter(function (account) {
            return account.enabled !== false && channels.some(function (channel) { return channel.id === account.channelId }) && (!opts.accountId || account.id === opts.accountId)
          })
          var results = await Promise.allSettled(targets.map(function (account) {
            return fetch('/api/dsh-usage-stats/account-quotas/refresh', {
              method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ channelId: account.channelId, accountId: account.id }),
            }).then(readJson)
          }))
          results.forEach(function (result, index) {
            var account = targets[index]
            var row = result.status === 'fulfilled' && (result.value.results || []).find(function (quota) { return quota.channelId === account.channelId && quota.accountId === account.id })
            if (result.status === 'rejected' || !row || row.error) failures.push({
              channelId: account.channelId, accountId: account.id, version: account.version,
              error: row && row.error || { message: result.status === 'rejected' ? String(result.reason.message || result.reason) : t('额度读取失败') },
            })
          })
          // Re-read account selection and versions after slow queries; removed or changed accounts cannot reappear.
          if (targets.length) view = await read()
          failures = failures.filter(function (failure) { return (view.accounts || []).some(function (account) {
            return account.id === failure.accountId && account.channelId === failure.channelId && account.version === failure.version && account.enabled !== false
          }) })
        }
        var quotas = Array.isArray(view.quotas) ? view.quotas.slice() : []
        failures.forEach(function (failure) {
          var index = quotas.findIndex(function (quota) { return quota.channelId === failure.channelId && quota.accountId === failure.accountId })
          var row = Object.assign({}, index < 0 ? {} : quotas[index], { channelId: failure.channelId, accountId: failure.accountId, error: failure.error })
          if (index < 0) quotas.push(row); else quotas[index] = row
        })
        view.quotas = quotas.map(function (quota) {
          if (!quota.error || !previous) return quota
          var account = (view.accounts || []).find(function (row) { return row.id === quota.accountId && row.channelId === quota.channelId })
          var oldAccount = (previous.accounts || []).find(function (row) { return row.id === quota.accountId && row.channelId === quota.channelId })
          var oldQuota = (previous.quotas || []).find(function (row) { return row.accountId === quota.accountId && row.channelId === quota.channelId })
          return account && oldAccount && account.version === oldAccount.version && account.credentialVersion === oldAccount.credentialVersion && oldQuota
            ? Object.assign({}, oldQuota, { error: quota.error, stale: true }) : quota
        })
        view.refreshErrors = failures
        this.accountQuotaCache = view
        return view
      }
      /**
       * WorkBuddy's display-only document through our host cache. Only an
       * explicit refresh or the enabled host timer calls the plugin upstream.
       * Shape:
       * { status: 'signed-in'|'signed-out', nickname?, expiresAt?, models?,
       *   credits?: { total, accounts: [{ packageName, remain, size }] },
       *   creditsError? }.
       */
      UsageApi.prototype.controls = function (patch) {
        return fetch('/api/dsh-usage-stats/controls', patch === undefined ? { headers: { accept: 'application/json' } } : {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(patch),
        }).then(readJson)
      }
      UsageApi.prototype.quotaSource = function (source, opts) {
        return fetch('/api/dsh-usage-stats/' + encodeURIComponent(source) + (opts && opts.fresh ? '?fresh=1' : ''), {
          headers: { accept: 'application/json' }, credentials: 'same-origin',
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
      UsageApi.prototype.modelDetectionStatus = function (opts) {
        var search = new URLSearchParams()
        Object.keys(opts || {}).forEach(function (key) { if (opts[key]) search.set(key, opts[key]) })
        return fetch('/api/dsh-usage-stats/model-detection?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.modelDetection = function (body) {
        return fetch('/api/dsh-usage-stats/model-detection', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }).then(readJson)
      }
      UsageApi.prototype.modelDetectionModels = function (provider) {
        return fetch('/api/dsh-usage-stats/model-detection-models?' + new URLSearchParams(provider ? { provider: provider } : {}).toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.modelFingerprintEngine = function (body) {
        return fetch('/api/dsh-usage-stats/model-fingerprint-engine', body === undefined ? { headers: { accept: 'application/json' } } : {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
      }
      return UsageApi
    })()

/** Static stylesheets for the settings page and the model-seat popover. */
function createClientStyles() {
var navIconMask = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5h11M4 11.5v-3M8 11.5v-5M12 11.5v-8"/></svg>')

var styles = [
      '.dshus-ma-control-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:stretch; }',
      '.dshus-ma-control-cell { min-width:0; }',
      '@container (max-width:720px) { .dshus-ma-control-grid { grid-template-columns:minmax(0,1fr); } }',
      '[data-dshus-nav-icon] > svg { display: none; }',
      '[data-dshus-nav-icon]::before { content: ""; width: 16px; height: 16px; flex: none; background: currentColor; -webkit-mask: url("' + navIconMask + '") center / contain no-repeat; mask: url("' + navIconMask + '") center / contain no-repeat; }',
      // Keep the toolbar outside the panels' size-containment context.
      '.dshus-page { font-family: var(--dsw-font-family, ui-sans-serif, system-ui, sans-serif); color: var(--dsw-alias-label-primary, #1f2430); box-sizing: border-box; min-height: 100%; overflow-anchor: none; --dshus-heat: #22c55e; }',
      '.dshus-page * { box-sizing: border-box; }',
      '.dshus-panels { container-type: inline-size; }',
      '.dshus-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); }',
      '.dshus-setting-row:last-child { border-bottom: 0; padding-bottom: 0; }',
      '.dshus-setting-label { display: block; font-size: 14px; font-weight: 500; line-height: 22px; }',
      '.dshus-controls { display: flex; flex-direction: column; gap: 16px; min-width: 0; }',
      '.dshus-control-section { min-width: 0; padding: 14px 16px; border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, #d4d4d9)); border-radius: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, #ffffff)); }',
      '.dshus-control-heading { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-control-query { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2, #d4d4d9); }',
      '.dshus-control-query-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }',
      '.dshus-controls .dshus-setting-row { min-height: 44px; padding: 10px 0; }',
      '.dshus-controls .dshus-setting-row:last-child { padding-bottom: 10px; }',
      '.dshus-controls .dshus-setting-label { font-weight: 400; }',
      // Keep the automatic-balance interval beside its switch.
      '.dshus-setting-tail { display: flex; align-items: center; gap: 10px; min-width: 0; }',
      // Theme swatches for the advanced model selector. The swatch color is
      // passed inline so the palette stays defined in one place (SEAT_PALETTES).
      '.dshus-seat-colors { display: inline-flex; align-items: center; gap: 6px; }',
      '.dshus-seat-color { flex: none; width: 16px; height: 16px; padding: 0; border: 1px solid rgba(0,0,0,.14); border-radius: 50%; background: var(--dshus-seat-swatch); cursor: pointer; }',
      '.dshus-seat-color:hover:not(:disabled) { transform: scale(1.12); }',
      '.dshus-seat-color[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, #fff)), 0 0 0 3px var(--dshus-seat-swatch); }',
      '.dshus-seat-color:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; }',
      '.dshus-seat-color:disabled { opacity: .55; cursor: wait; }',
      // Arrange feature cards in two columns.
      '.dshus-control-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 16px; min-width: 0; }',
      '.dshus-control-row > .dshus-control-section { display: flex; flex-direction: column; }',
      // Control cards share a responsive grid with equal row heights.
      '.dshus-ma-control-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 16px; min-width: 0; }',
      '.dshus-ma-control-grid > .dshus-ma-control-cell { display: flex; flex-direction: column; min-width: 0; }',
      '.dshus-ma-control-grid > .dshus-ma-control-cell > * { flex: 1 1 auto; min-width: 0; }',
      '.dshus-ma-control-grid > .dshus-ma-control-cell > section { display: flex; flex-direction: column; }',
      '@container (max-width: 720px) { .dshus-ma-control-grid { grid-template-columns: minmax(0, 1fr); } }',
      '@supports not (container-type: inline-size) { .dshus-ma-control-grid { grid-template-columns: minmax(0, 1fr); } }',
      // The query card provides its own outer spacing and border.
      '.dshus-control-query-section > .dshus-control-query { margin-top: 0; padding-top: 0; border-top: 0; }',
      '.dshus-control-query-head .dshus-control-heading { margin: 0; font-weight: 400; }',
      '.dshus-saved-queries-toggle { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; margin-top: 12px; padding: 10px 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l2, #414144); background: transparent; color: inherit; font: inherit; font-size: 13px; font-weight: 400; text-align: start; cursor: pointer; }',
      '.dshus-saved-queries-toggle .dshus-provider-chevron { margin-left: auto; }',
      '.dshus-control-dialog { position: fixed; inset: 0; width: min(680px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); margin: auto; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #414144); border-radius: 16px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-weight: 400; box-shadow: 0 12px 40px rgba(0,0,0,.24); }',
      '.dshus-control-dialog[open] { display: flex; flex-direction: column; }',
      '.dshus-control-dialog::backdrop { background: rgba(0,0,0,.35); }',
      '.dshus-control-dialog-head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); }',
      '.dshus-control-dialog-head h3 { margin: 0; font-size: 14px; font-weight: 400; line-height: 22px; overflow-wrap: anywhere; }',
      '.dshus-control-dialog-body { min-height: 0; padding: 4px 16px 16px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }',
      '.dshus-control-dialog .dshus-setting-label, .dshus-control-dialog .dshus-prompt-title, .dshus-control-dialog strong { font-weight: 400; }',
      '.dshus-control-dialog .dshus-query-editor { min-height: 200px; max-height: 45dvh; }',
      '.dshus-control-dialog .dshus-saved-query { min-height: 44px; }',
      '.dshus-saved-queries-toggle:focus-visible, .dshus-control-dialog:focus-visible { outline: 2px solid var(--dsh-alias-brand-primary, #3b82f6); outline-offset: 3px; }',
      '.dshus-setting-help { margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }',
      // Explicit on/off colors keep the switch states distinct in either theme.
      '.dshus-switch { flex: none; position: relative; width: 38px; height: 22px; padding: 0; border: 1px solid transparent; border-radius: 11px; background: var(--dshus-switch-off, #b8bcc4); cursor: pointer; transition: background-color .15s ease; }',
      '.dshus-switch.on, .dshus-switch[aria-checked="true"] { background: var(--dshus-switch-on, #2563eb); }',
      '.dshus-switch::after { content: ""; position: absolute; top: 50%; left: 2px; width: 16px; height: 16px; margin-top: -8px; border-radius: 50%; background: var(--dshus-switch-knob, #f9fafb); box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease; }',
      '.dshus-switch.on::after, .dshus-switch[aria-checked="true"]::after { transform: translateX(16px); }',
      '.dshus-switch:disabled { opacity: .55; cursor: wait; }',
      '.dshus-switch:focus-visible, .dshus-field:focus-visible { outline: 2px solid var(--dsh-alias-brand-primary, #3b82f6); outline-offset: 3px; }',
      '.dshus-field { min-width: 0; max-width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l2, #414144); border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 13px; color-scheme: inherit; }',
      '.dshus-field:disabled { opacity: .6; }',
      '.dshus-field::placeholder { color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      // Custom dropdown replacing native <select> widgets everywhere.
      '.dshus-dropdown { position: relative; width: 148px; min-width: 0; max-width: 100%; }',
      '.dshus-dropdown-block { width: 100%; }',
      '.dshus-dropdown-inline { width: auto; min-width: 96px; }',
      '.dshus-dropdown-trigger { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 0 10px 0 12px; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease; }',
      '.dshus-dropdown-trigger:hover:not(:disabled) { border-color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      '.dshus-dropdown-trigger[aria-expanded="true"] { border-color: var(--dsw-alias-state-business-primary, #3b82f6); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 16%, transparent); }',
      '.dshus-dropdown-trigger:disabled { cursor: default; }',
      '.dshus-dropdown-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-dropdown-chevron { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary, #6b7280); transition: transform .16s ease; }',
      '.dshus-dropdown-trigger[aria-expanded="true"] .dshus-dropdown-chevron { transform: rotate(180deg); }',
      '.dshus-dropdown-menu { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; min-width: 100%; max-width: min(340px, calc(100vw - 32px)); padding: 4px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); box-shadow: 0 16px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08); }',
      '.dshus-dropdown-menu.above { top: auto; bottom: calc(100% + 6px); }',
      '.dshus-dropdown-option { display: flex; align-items: center; gap: 10px; min-height: 30px; padding: 4px 8px; border-radius: 7px; font-size: 13px; line-height: 20px; cursor: pointer; }',
      '.dshus-dropdown-option.active { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.dshus-dropdown-option[aria-selected="true"] { color: var(--dsw-alias-state-business-primary, #2563eb); font-weight: 600; }',
      '.dshus-dropdown-option[aria-selected="true"].active { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 10%, transparent); }',
      '.dshus-dropdown-check { flex: none; width: 14px; height: 14px; margin-left: auto; color: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-provider-picker { position: relative; margin-top: 8px; }',
      '.dshus-query-select { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; text-align: left; cursor: pointer; }',
      '.dshus-query-select:disabled { cursor: default; }',
      '.dshus-provider-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-provider-dot { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #16a34a; }',
      '.dshus-provider-chevron { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary, #6b7280); transition: transform .16s ease; }',
      '.dshus-query-select[aria-expanded="true"] .dshus-provider-chevron { transform: rotate(180deg); }',
      '.dshus-provider-list { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; right: 0; padding: 4px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); box-shadow: 0 16px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08); }',
      '.dshus-provider-list.above { top: auto; bottom: calc(100% + 6px); }',
      '.dshus-provider-option { display: flex; align-items: center; gap: 12px; min-height: 30px; padding: 4px 8px; border-radius: 7px; font-size: 13px; line-height: 20px; cursor: pointer; }',
      '.dshus-provider-option.active { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.dshus-provider-option[aria-selected="true"] { color: var(--dsw-alias-state-business-primary, #2563eb); font-weight: 600; }',
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
      '.dshus-speed-list { list-style: none; margin: 0; padding: 0; }',
      '.dshus-speed-head, .dshus-speed-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 84px 84px; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }',
      '.dshus-speed-head { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; text-align: right; }',
      '.dshus-speed-row { padding: 12px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-speed-row:last-child { border-bottom: 0; }',
      '.dshus-speed-rank { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; text-align: center; }',
      '.dshus-speed-model { min-width: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }',
      '.dshus-speed-meta { margin-top: 4px; font-size: 12px; font-weight: 400; line-height: 1.5; color: var(--dsw-alias-label-secondary, #6b7280); overflow-wrap: anywhere; }',
      '.dshus-speed-value { text-align: right; white-space: nowrap; font-size: 20px; font-weight: 600; }',
      '@container (max-width: 420px) { .dshus-speed-head, .dshus-speed-row { grid-template-columns: 18px minmax(0, 1fr) 64px 60px; gap: 8px; } .dshus-speed-value { font-size: 18px; } }',
      '@container (max-width: 360px) { .dshus-module.dshus-speed-module { padding: 12px; } .dshus-speed-head, .dshus-speed-row { grid-template-columns: 18px minmax(0, 1fr) 58px 54px; gap: 6px; } }',
      '.dshus-detection-panel { min-width: 0; scrollbar-color: var(--dsw-alias-border-l2, #d0d5dd) transparent; accent-color: var(--dsw-alias-state-business-primary, #2563eb); caret-color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-detection-panel ::selection { background: var(--dsw-alias-bg-multi-select, #dbeafe); color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-detection-layout { display: grid; grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }',
      '.dshus-detection-panel > .dshus-module, .dshus-detection-layout > .dshus-module { box-shadow: none; margin: 0; padding: 20px; }',
      '.dshus-detection-panel .dshus-module h3 { color: var(--dsw-alias-label-primary, #1f2430); letter-spacing: normal; margin: 0; font-size: 16px; font-weight: 600; line-height: 1.4; }',
      '.dshus-detection-card-head, .dshus-detection-result-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 16px; }',
      '.dshus-detection-result-head h3 { min-width: 0; overflow-wrap: anywhere; }',
      '.dshus-detection-state { display: inline-flex; align-items: center; flex: none; gap: 6px; padding: 3px 9px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f9fafb); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; font-weight: 600; line-height: 1.5; white-space: nowrap; }',
      '.dshus-detection-state::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .8; }',
      '.dshus-detection-state[data-state="confirm"], .dshus-detection-state[data-state="ready"] { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-detection-state[data-state="running"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #2563eb) 45%, transparent); color: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-detection-state[data-state="running"]::before { animation: dshus-detection-pulse 1.4s ease-in-out infinite; }',
      '.dshus-detection-state[data-state="complete"] { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16794a) 45%, transparent); color: var(--dsw-alias-state-success-primary, #16794a); }',
      '.dshus-detection-state[data-state="failed"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #b42318) 45%, transparent); color: var(--dsw-alias-state-error-primary, #b42318); }',
      '.dshus-detection-state[data-state="cancelled"] { color: var(--dsw-alias-label-secondary, #4b5563); }',
      '@keyframes dshus-detection-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }',
      '.dshus-detection-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin: 0 0 14px; }',
      '.dshus-detection-limits { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }',
      '.dshus-detection-field { display: grid; gap: 6px; min-width: 0; }',
      '.dshus-detection-field .dshus-setting-label { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; font-weight: 500; line-height: 1.4; }',
      '.dshus-detection-field .dshus-field { width: 100%; min-height: 36px; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-panel .dshus-btn { min-height: 34px; height: auto; padding: 7px 12px; line-height: 1.4; white-space: normal; text-align: center; justify-content: center; }',
      '.dshus-detection-panel .dshus-btn-primary { border-color: var(--dsw-alias-label-primary, #1f2430); background: var(--dsw-alias-label-primary, #1f2430); color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 500; }',
      '.dshus-detection-panel .dshus-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-label-secondary, #4b5563); border-color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-detection-panel .dshus-btn:focus-visible, .dshus-detection-panel .dshus-field:focus-visible, .dshus-detection-panel summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 3px; }',
      '.dshus-detection-actions { margin: 16px 0 0; }',
      '.dshus-detection-primary { width: 100%; min-height: 38px; }',
      '.dshus-detection-quote { display: grid; gap: 12px; margin: 16px 0 0; padding: 14px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #f9fafb); }',
      '.dshus-detection-quote-title { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; font-weight: 600; letter-spacing: .04em; }',
      '.dshus-detection-quote-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }',
      '.dshus-detection-quote-metrics > div { display: grid; gap: 2px; min-width: 0; }',
      '.dshus-detection-quote-metrics dt { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-detection-quote-metrics dd { margin: 0; color: var(--dsw-alias-label-primary, #1f2430); font-size: 15px; font-weight: 600; line-height: 1.35; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.dshus-detection-quote-details { font-size: 12.5px; line-height: 1.6; }',
      '.dshus-detection-quote-details > summary { cursor: pointer; color: var(--dsw-alias-label-secondary, #4b5563); line-height: 24px; }',
      '.dshus-detection-quote-details > summary:hover { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-detection-fields { display: grid; gap: 6px; margin: 10px 0; }',
      '.dshus-detection-fields div { display: flex; gap: 12px; align-items: baseline; min-width: 0; }',
      '.dshus-detection-fields dt { flex: 0 0 76px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }',
      '.dshus-detection-fields dd { margin: 0; overflow-wrap: anywhere; font-size: 12.5px; }',
      '.dshus-detection-engine { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-detection-engine-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; }',
      '.dshus-detection-engine-label { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; font-weight: 500; }',
      '.dshus-detection-engine-version { min-width: 0; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 11.5px; line-height: 1.5; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-engine-update { width: 30px; min-width: 30px; min-height: 30px; padding: 0; border-radius: 8px; }',
      '.dshus-detection-engine-error { grid-column: 1 / -1; margin: 6px 0 0; font-size: 12px; line-height: 1.5; }',
      '.dshus-detection-empty-body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 240px; padding: 24px 0; text-align: center; }',
      '.dshus-detection-empty-mark { display: grid; place-items: center; width: 56px; height: 56px; border: 1px dashed var(--dsw-alias-border-l2, #d4d4d9); border-radius: 50%; color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      '.dshus-detection-empty-mark svg { width: 30px; height: 30px; }',
      '.dshus-detection-empty-title { margin: 0; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 13.5px; line-height: 1.5; font-weight: 500; }',
      '.dshus-detection-verdict { display: inline-flex; align-items: center; flex: none; gap: 6px; margin: 0; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f9fafb); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; font-weight: 600; line-height: 1.5; white-space: nowrap; }',
      '.dshus-detection-verdict[data-verdict="candidate-consistent"] { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16794a) 45%, transparent); color: var(--dsw-alias-state-success-primary, #16794a); }',
      '.dshus-detection-verdict[data-verdict="candidate-different"] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-label, #946200) 45%, transparent); color: var(--dsw-alias-state-warn-label, #946200); }',
      '.dshus-detection-verdict[data-verdict="running"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #2563eb) 45%, transparent); color: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-detection-subject { margin: 0 0 12px; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12.5px; line-height: 1.5; overflow-wrap: anywhere; }',
      '.dshus-detection-reason { margin: 0 0 14px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b7791f) 10%, transparent); color: var(--dsw-alias-state-warn-label, #946200); font-size: 12.5px; line-height: 1.5; }',
      '.dshus-detection-reason[data-tone="muted"] { background: var(--dsw-alias-bg-layer-2, #f9fafb); color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-detection-headline { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 16px; margin: 4px 0 18px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #f9fafb); }',
      '.dshus-detection-candidate { display: grid; gap: 2px; min-width: 0; }',
      '.dshus-detection-kicker { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11px; font-weight: 600; letter-spacing: .04em; line-height: 1.4; }',
      '.dshus-detection-candidate h4 { margin: 0; color: var(--dsw-alias-label-primary, #1f2430); font-size: 24px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }',
      '.dshus-detection-family { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }',
      '.dshus-detection-confidence { display: grid; justify-items: end; gap: 2px; text-align: right; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; line-height: 1.4; }',
      '.dshus-detection-confidence strong { color: var(--dsw-alias-label-primary, #1f2430); font-size: 24px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-confidence-tag { margin-top: 2px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b7791f) 12%, transparent); color: var(--dsw-alias-state-warn-label, #946200); font-size: 11px; font-weight: 600; }',
      '.dshus-detection-list-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 20px 0 4px; font-size: 12.5px; }',
      '.dshus-detection-list-title h4 { margin: 0; font-size: 12.5px; font-weight: 600; }',
      '.dshus-detection-list-title > span { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; text-align: right; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-rankings { list-style: none; padding: 0; margin: 0; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-rank { display: grid; grid-template-columns: 20px minmax(0, 1fr) minmax(56px, 22%) 60px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); font-size: 12.5px; }',
      '.dshus-detection-rank:first-child { border-top: 0; }',
      '.dshus-detection-rank[data-unscored] { grid-template-columns: 20px minmax(0, 1fr) 72px; }',
      '.dshus-detection-rank > :first-child { color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 11.5px; }',
      '.dshus-detection-rank-name { min-width: 0; overflow-wrap: anywhere; font-weight: 500; }',
      '.dshus-detection-rank-name small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #4b5563); font-weight: 400; }',
      '.dshus-detection-rank-value { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-bar { height: 5px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-3, #e5e7eb); }',
      '.dshus-detection-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-detection-samples { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; padding: 0; margin: 0; list-style: none; }',
      '.dshus-detection-sample { display: grid; grid-template-columns: 20px minmax(0, 1fr); grid-template-rows: auto auto; align-items: center; gap: 0 6px; min-width: 0; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f9fafb); }',
      '.dshus-detection-sample-index { grid-row: 1 / 3; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--dsw-alias-bg-layer-3, #f3f4f6); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-sample strong { min-width: 0; font-size: 12px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }',
      '.dshus-detection-sample-count { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11px; line-height: 1.4; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.dshus-detection-sample[data-outcome="scored"] strong { color: var(--dsw-alias-state-success-primary, #16794a); }',
      '.dshus-detection-sample[data-outcome="sampling"] strong { color: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-detection-sample[data-outcome="incomplete"] strong, .dshus-detection-sample[data-outcome="unavailable"] strong, .dshus-detection-sample[data-outcome="timeout"] strong, .dshus-detection-sample[data-outcome="unparseable"] strong { color: var(--dsw-alias-state-error-primary, #b42318); }',
      '.dshus-detection-sample[data-outcome="cancelled"] strong, .dshus-detection-sample[data-outcome="pending"] strong { color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-detection-progress { margin: 4px 0 16px; }',
      '.dshus-detection-progress-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }',
      '.dshus-detection-progress-head p { margin: 0; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12.5px; line-height: 1.5; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-progress progress { display: block; width: 100%; height: 5px; overflow: hidden; border: 0; border-radius: 999px; background: var(--dsw-alias-bg-layer-3, #e5e7eb); accent-color: var(--dsw-alias-state-business-primary, #2563eb); }',
      '.dshus-detection-progress progress::-webkit-progress-bar { background: var(--dsw-alias-bg-layer-3, #e5e7eb); border-radius: 999px; }',
      '.dshus-detection-progress progress::-webkit-progress-value { background: var(--dsw-alias-state-business-primary, #2563eb); border-radius: 999px; }',
      '.dshus-detection-progress progress::-moz-progress-bar { background: var(--dsw-alias-state-business-primary, #2563eb); border-radius: 999px; }',
      '.dshus-detection-cost { margin: 16px 0 0; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }',
      '.dshus-detection-cost-alert { margin: 8px 0 0; color: var(--dsw-alias-state-warn-label, #946200); font-size: 12px; line-height: 1.5; }',
      '.dshus-detection-message { margin: 8px 0 0; font-size: 12px; line-height: 1.5; }',
      '.dshus-disclosure { border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); margin-top: 14px; padding-top: 10px; font-size: 12.5px; line-height: 1.6; }',
      '.dshus-disclosure > summary { cursor: pointer; color: var(--dsw-alias-label-secondary, #4b5563); line-height: 24px; }',
      '.dshus-disclosure > summary:hover { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-disclosure > summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 4px; border-radius: 4px; }',
      '.dshus-disclosure p { margin: 6px 0; }',
      '@container (max-width: 780px) { .dshus-detection-layout { grid-template-columns: minmax(0, 1fr); } .dshus-detection-empty-body { min-height: 160px; } }',
      '@container (max-width: 560px) { .dshus-detection-panel > .dshus-module, .dshus-detection-layout > .dshus-module { padding: 16px; } .dshus-detection-quote-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dshus-detection-headline { grid-template-columns: minmax(0, 1fr); align-items: start; gap: 12px; } .dshus-detection-confidence { justify-items: start; text-align: left; } .dshus-detection-candidate h4, .dshus-detection-confidence strong { font-size: 22px; } .dshus-detection-rank { grid-template-columns: 18px minmax(0, 1fr) 60px; row-gap: 6px; } .dshus-detection-rank-name { grid-column: 2; grid-row: 1; } .dshus-detection-rank-value { grid-column: 3; grid-row: 1; } .dshus-detection-bar { grid-column: 2 / 4; grid-row: 2; } .dshus-detection-rank[data-unscored] { grid-template-columns: 18px minmax(0, 1fr) 60px; } }',
      '@container (max-width: 380px) { .dshus-detection-limits { grid-template-columns: minmax(0, 1fr); } .dshus-detection-form { gap: 10px; } .dshus-detection-samples { grid-template-columns: minmax(0, 1fr); } }',
      '@media (prefers-reduced-motion: reduce) { .dshus-detection-panel .dshus-spin { animation: none; } .dshus-detection-state[data-state="running"]::before { animation: none; } }',
      '@container (max-width: 420px) { .dshus-tab { padding-left: 12px; padding-right: 12px; } }',
      '.dshus-saved-query { display: flex; align-items: center; gap: 8px; padding-top: 10px; font-size: 13px; }',
      '.dshus-saved-query span { flex: 1; min-width: 0; overflow-wrap: anywhere; }',
      '@container (max-width: 420px) { .dshus-setting-row { gap: 10px; } .dshus-dropdown-inline { width: 120px; } }',
      // Below this width the label, the interval dropdown and the switch cannot
      // share one line without the dropdown collapsing, so the row wraps and the
      // dropdown keeps a usable width instead of shrinking to its chevron.
      '@container (max-width: 380px) { .dshus-setting-row:has(.dshus-setting-tail) { flex-wrap: wrap; } .dshus-setting-tail { width: 100%; justify-content: space-between; } .dshus-dropdown-inline { width: 120px; } }',
      // Keep the title and tabs in one sticky toolbar.
      '.dshus-toolbar { position: sticky; top: 0; z-index: 3; margin-bottom: 16px; background: var(--dsw-alias-bg-layer-2, #fff); }',
      '.dshus-config-cards { display: grid; gap: 16px; min-width: 0; }',
      '.dshus-config-card { width: 100%; min-width: 0; color: var(--dsw-alias-label-primary, #1f2430); background: var(--dsw-alias-bg-layer-2, #fff); border: 1px solid var(--dsw-alias-border-l2, #d4d4d9); border-radius: 12px; }',
      '.dshus-config-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 78px; padding: 16px; border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
      '.dshus-config-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.dshus-config-toggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 3px; }',
      '.dshus-config-copy { min-width: 0; }',
      '.dshus-config-name { display: block; font-size: 16px; font-weight: 600; line-height: 24px; }',
      '.dshus-config-description { display: block; margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #6b7280); }',
      '.dshus-config-chevron { width: 16px; height: 16px; flex: none; color: var(--dsw-alias-label-secondary, #6b7280); transition: transform 160ms ease-out; }',
      '.dshus-config-toggle[aria-expanded=true] .dshus-config-chevron { transform: rotate(180deg); }',
      '.dshus-config-body { margin: 0 16px; padding: 16px 0; border-top: 1px solid var(--dsw-alias-border-l2, #d4d4d9); }',
      '.dshus-config-body[hidden] { display: none; }',
      '.dshus-plugin-controls { min-height: 0; width: 100%; }',
      '@media (prefers-reduced-motion: reduce) { .dshus-config-chevron { transition: none; } }',
      '.dshus-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 46px; padding: 4px 4px 12px 0; }',
      '.dshus-brand { display: flex; flex: 1; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; }',
      '.dshus-brand-icon { display: inline-block; width: 17px; height: 17px; flex: none; background: currentColor; -webkit-mask: url("' + navIconMask + '") center / contain no-repeat; mask: url("' + navIconMask + '") center / contain no-repeat; }',
      '.dshus-title { flex: none; font-size: 15px; font-weight: 400; letter-spacing: 0.01em; line-height: 22px; margin: 0; white-space: nowrap; }',
      '.dshus-brand-meta { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; line-height: 20px; white-space: nowrap; }',
      '.dshus-brand-link { min-width: 0; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }',
      '.dshus-brand-link:visited { color: var(--dsw-alias-label-secondary, #6b7280); }',
      '.dshus-brand-link:hover { color: var(--dsw-alias-brand-primary, #3b82f6); text-decoration: underline; }',
      '.dshus-brand-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; border-radius: 2px; }',
      '.dshus-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #414144); overflow-x: auto; scrollbar-width: none; }',
      '.dshus-tabs::-webkit-scrollbar { display: none; }',
      '.dshus-tab { flex: none; margin-bottom: -1px; padding: 9px 18px 11px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary, #9ca3af); font: inherit; font-size: 14px; font-weight: 500; line-height: 20px; cursor: pointer; white-space: nowrap; }',
      '.dshus-tab:hover { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-tab.on { color: var(--dsw-alias-label-primary, #1f2430); border-bottom-color: currentColor; font-weight: 600; }',
      '.dshus-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: -3px; }',
      '.dshus-quota-panel[hidden] { display: none !important; }',
      '.dshus-quota-panel:empty::before, .dshus-provider-panels:empty::before { content: attr(data-empty-label); display: block; padding: 32px 16px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; text-align: center; }',

      '.dshus-tools { display: flex; align-items: center; gap: 8px; flex: none; height: 30px; }',
      // The banner sits above the sticky toolbar and scrolls away with the page.
      '.dshus-star-banner { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 10px 14px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }',
      '.dshus-star-banner-icon { display: flex; flex: none; width: 18px; height: 18px; color: #f2b01e; }',
      '.dshus-star-banner-icon svg { width: 100%; height: 100%; }',
      '.dshus-star-banner-text { flex: 1; min-width: 0; margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-star-banner-action { flex: none; text-decoration: none; }',
      '.dshus-quickstart-dialog { width: min(640px, calc(100vw - 32px)); height: min(460px, calc(100dvh - 48px)); }',
      '.dshus-quickstart-dialog .dshus-control-dialog-body { flex: 1 1 auto; display: flex; padding: 0; overflow: hidden; }',
      '.dshus-quickstart { display: grid; grid-template-columns: 168px minmax(0, 1fr); flex: 1 1 auto; min-height: 0; min-width: 0; }',
      '.dshus-quickstart-nav { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-right: 1px solid var(--dsw-alias-border-l2, #414144); overflow-y: auto; overscroll-behavior: contain; }',
      '.dshus-quickstart-tab { padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }',
      '.dshus-quickstart-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)); }',
      '.dshus-quickstart-tab[aria-selected="true"] { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #1f2430); font-weight: 600; }',
      '.dshus-quickstart-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; }',
      '.dshus-quickstart-panel { min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding: 22px 24px; }',
      '.dshus-quickstart-panel h4 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-quickstart-panel p { margin: 10px 0 0; font-size: 13.5px; line-height: 22px; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '@media (max-width: 560px) { .dshus-quickstart { grid-template-columns: 132px minmax(0, 1fr); } .dshus-quickstart-panel { padding: 16px; } }',
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

      /* 概览指标 / 配额横向条：同一行内以竖线分割 */
      '.dshus-statbar { display: flex; align-items: stretch; flex-wrap: wrap; background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 14px; padding: 14px 6px; }',
      '.dshus-statbar .dshus-stat { position: relative; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 0 10px; text-align: center; }',
      // 竖线用绝对定位画满整行高度：直接给分栏加 border-left 时，分栏自身高度
      // 可能小于行高（内容只有两行文字），竖线就会断掉。
      '.dshus-statbar .dshus-stat + .dshus-stat::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-statbar .dshus-stat .v { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; line-height: 24px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.dshus-statbar .dshus-stat .k { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.dshus-statbar .dshus-stat .sub { font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '@container (max-width: 480px) { .dshus-statbar { padding: 12px 2px; } .dshus-statbar .dshus-stat { padding: 0 6px; } .dshus-statbar .dshus-stat .v { font-size: 16px; line-height: 20px; } }',
      '.dshus-statbar.dshus-overview-bar { padding: 4px 0 0; border: 0; border-radius: 0; background: transparent; }',
      '.dshus-overview-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 24px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-align: left; cursor: pointer; }',
      '.dshus-overview-toggle:hover { color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-overview-toggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 4px; border-radius: 4px; }',
      '.dshus-overview-chevron { flex: none; width: 16px; height: 16px; transition: transform .18s cubic-bezier(.16, 1, .3, 1); }',
      '.dshus-overview-toggle[aria-expanded="true"] .dshus-overview-chevron { transform: rotate(180deg); }',
      '.dshus-overview-details { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-overview-details[hidden] { display: none !important; }',
      '.dshus-overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px 0; margin: 4px 0 20px; text-align: center; font-variant-numeric: tabular-nums; }',
      '.dshus-overview-grid > div { min-width: 0; padding: 0 10px; }',
      '.dshus-overview-grid dt { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-overview-grid dd { margin: 6px 0 0; font-size: 20px; font-weight: 600; line-height: 26px; overflow-wrap: anywhere; }',
      '.dshus-overview-grid .dshus-favorite-model { font-size: 16px; line-height: 24px; }',
      '@container (max-width: 440px) { .dshus-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
      '@media (prefers-reduced-motion: reduce) { .dshus-overview-chevron { transition: none; } }',

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

      '.dshus-go-track { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); overflow: hidden; }',
      '.dshus-go-fill { height: 100%; border-radius: 999px; transition: width 0.35s ease; }',
      '.dshus-go-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 9px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #6b7280); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }',
      '.dshus-go-reset { color: var(--dsw-alias-label-caption, #9ca3af); font-size: 12px; }',


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

      /* Each supplier has one rounded boundary; account balances and pools stay flat inside it. */
      '.dshus-quota-panel .dshus-module { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 16px; box-shadow: none; margin: 0 0 16px; padding: 16px 18px 18px; }',
      '.dshus-quota-panel .dshus-module:last-child { margin-bottom: 0; }',
      '.dshus-quota-panel .dshus-module h3 { color: var(--dsw-alias-label-primary, #1f2430); letter-spacing: normal; }',
      '.dshus-account-quota-row + .dshus-account-quota-row { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-account-quota-summary { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; }',
      '.dshus-account-quota-identity { flex: 1 1 160px; min-width: 0; display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; }',
      '.dshus-account-quota-name { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }',
      '.dshus-account-quota-meta { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; font-weight: 400; line-height: 20px; overflow-wrap: anywhere; }',
      '.dshus-account-quota-balance { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: flex-end; gap: 4px 10px; min-width: 0; }',
      '.dshus-account-quota-value { font-size: 22px; font-weight: 600; line-height: 30px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.dshus-account-quota-value.dshus-account-quota-status { font-size: 14px; font-weight: 400; line-height: 24px; color: var(--dsw-alias-label-secondary, #6b7280); }',
      '.dshus-credit-details { margin: 12px 0 0; display: grid; gap: 8px; }',
      '.dshus-credit-detail { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(130px, 1fr) minmax(64px, .5fr) minmax(130px, 1fr); gap: 4px 16px; align-items: center; font-size: 12px; line-height: 20px; }',
      '.dshus-credit-detail dt { min-width: 0; color: var(--dsw-alias-label-secondary, #6b7280); overflow-wrap: anywhere; }',
      '.dshus-credit-detail dd { min-width: 0; margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.dshus-credit-detail-amount { text-align: right; }',
      '.dshus-credit-detail .dshus-go-track { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); }',
      '.dshus-credit-detail-time { color: var(--dsw-alias-label-secondary, #6b7280); display: flex; flex-wrap: wrap; gap: 4px; }',
      '.dshus-credit-detail-time:empty { display: none; }',
      '.dshus-credit-toggle { margin-top: 12px; min-height: 32px; }',
      '.dshus-account-quota-footer { margin-top: 10px; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 4px 16px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary, #6b7280); font-variant-numeric: tabular-nums; }',
      '@container (max-width: 640px) { .dshus-credit-detail { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 12px; } .dshus-credit-detail-progress { grid-column: 1; } .dshus-credit-detail-time { text-align: right; justify-content: flex-end; } }',
      '@container (max-width: 420px) { .dshus-quota-panel .dshus-module { padding: 14px 12px; border-radius: 14px; } .dshus-account-quota-identity { flex-basis: calc(100% - 48px); } .dshus-account-quota-balance { order: 1; width: 100%; justify-content: space-between; } .dshus-account-quota-value { font-size: 20px; } .dshus-account-quota-footer { justify-content: flex-start; } }',
      '@media (prefers-reduced-motion: reduce) { .dshus-quota-panel .dshus-go-fill { transition: none; } }',

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
      '.dshus-hover-tip { z-index: 10000; max-width: min(320px, calc(100vw - 16px)); white-space: pre-line; font-variant-numeric: tabular-nums; opacity: 0; visibility: hidden; transition: opacity .12s ease; }',
      '.dshus-hover-tip.on { opacity: 1; visibility: visible; }',
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
      '.dshus-table th { padding: 9px 12px; font-weight: 600; color: var(--dsw-alias-label-secondary, #4b5563); background: var(--dsw-alias-bg-layer-2, #f9fafb); border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb); font-size: 12px; white-space: nowrap; text-align: center; }',
      '.dshus-table td { padding: 9px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2, #f2f3f6); color: var(--dsw-alias-label-primary, #1f2430); font-variant-numeric: tabular-nums; }',
      '.dshus-table tr:last-child td { border-bottom: none; }',
      '.dshus-table tr:hover td { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.04)); }',
      '.dshus-table-model-cell { display: flex; align-items: center; gap: 8px; font-weight: 500; }',
      '.dshus-table-bar-cell { width: 140px; }',
      '.dshus-table-bar-bg { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #e5e7eb); overflow: hidden; }',
      '.dshus-table-bar-fill { height: 100%; border-radius: 999px; }',

      /* Request log + cost panels */
      '.dshus-logs-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.dshus-logs-toolbar .dshus-muted { font-size: 12.5px; }',
      '.dshus-logs-toolbar .dshus-icon-btn { margin-left: auto; }',
      '.dshus-logs-table { min-width: 860px; }',
      // Only the request list scrolls: the filters, header row and pager stay put.
      '.dshus-logs-module .dshus-table-wrap { max-height: clamp(280px, calc(100dvh - 460px), 720px); overflow-y: auto; overscroll-behavior: contain; }',
      '.dshus-logs-module .dshus-table th { position: sticky; top: 0; z-index: 1; }',
      '.dshus-log-time { white-space: nowrap; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-log-app { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-log-model { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-log-num { text-align: right; }',
      '.dshus-log-cost { font-weight: 600; }',
      '.dshus-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }',
      '.dshus-pager .dshus-muted { font-size: 12px; }',
      '.dshus-price-table { min-width: 720px; }',
      '.dshus-price-table-wrap { max-height: calc(100dvh - 190px); overflow-y: auto; }',
      '.dshus-price-table thead th { position: sticky; top: 0; z-index: 1; }',
      '.dshus-price-input { width: 100px; height: 28px; min-height: 28px; padding: 0 8px; font-size: 12.5px; }',
      '#dshus-price-dialog { width: min(920px, calc(100vw - 32px)); }',
      '@container (max-width: 560px) { #dshus-costs-panel .dshus-module h3 { flex-wrap: wrap; } #dshus-costs-panel .dshus-head-tools { width: 100%; justify-content: space-between; flex-wrap: wrap; } }',

      /* Model name rules */
      '.dshus-rule-editor { display: grid; gap: 14px; min-width: 0; }',
      '.dshus-rule-field { display: grid; gap: 6px; min-width: 0; position: relative; }',
      '.dshus-rule-field .dshus-field { width: 100%; }',
      '.dshus-rule-chips { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.dshus-rule-chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; height: 26px; padding: 0 4px 0 10px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); color: var(--dsw-alias-label-primary, #1f2430); font-size: 12px; line-height: 24px; }',
      '.dshus-rule-chip > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-rule-chip-remove { display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280); font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }',
      '.dshus-rule-chip-remove:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-rule-add { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.dshus-rule-add .dshus-field { flex: 1 1 220px; min-width: 0; }',
      '.dshus-rule-picker { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f9fafb); }',
      '.dshus-rule-picker .dshus-setting-help { margin: 0; }',
      '.dshus-rule-suggest { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; padding: 4px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f9fafb); box-shadow: 0 4px 12px rgba(0,0,0,.16); }',
      '.dshus-rule-suggest .dshus-rule-options { grid-template-columns: minmax(0, 1fr); gap: 0; overscroll-behavior: contain; scrollbar-gutter: stable; }',
      '.dshus-rule-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 4px; max-height: 220px; overflow-y: auto; margin: 0; padding: 0; list-style: none; }',
      '.dshus-rule-option { display: block; width: 100%; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12px; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-rule-option:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }',
      '.dshus-rule-chip-remove:focus-visible, .dshus-rule-option:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 1px; }',
      '.dshus-rule-editor-actions { display: flex; align-items: center; gap: 8px; }',
      '.dshus-rule-list { display: block; }',
      '.dshus-rule-card { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 0; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-rule-list > .dshus-rule-card:first-child { border-top: 0; padding-top: 0; }',
      '.dshus-rule-card-editing { display: block; padding: 2px 0 14px; }',
      '.dshus-rule-main { flex: 1 1 auto; min-width: 0; display: grid; gap: 3px; }',
      '.dshus-rule-name { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }',
      '.dshus-rule-originals { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-rule-count { flex: none; color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.dshus-rule-actions { flex: none; display: flex; align-items: center; gap: 6px; }',
      '@container (max-width: 480px) { .dshus-rule-card { flex-wrap: wrap; } .dshus-rule-main { flex-basis: 100%; } .dshus-rule-count { margin-right: auto; } .dshus-rule-originals { white-space: normal; } .dshus-rule-options { grid-template-columns: minmax(0, 1fr); } }',

      /* Sidebar dashboard shortcut and floating dashboard */
      '.dshus-footer-action { box-sizing: border-box; flex: 1 1 0; min-width: 0; height: 40px; margin: 0 0 4px; padding: 0 10px 0 8px; border: 0; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; }',
      '.dshus-footer-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)); }',
      '.dshus-footer-action:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3b82f6); outline-offset: -2px; }',
      '.dshus-footer-action svg { flex: none; }',
      '.dshus-footer-action-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-footer-action-rail { flex: none; justify-content: center; gap: 0; width: 36px; height: 36px; padding: 0; }',
      '.dshus-dash-dialog { position: fixed; inset: 0; width: min(1200px, calc(100vw - 48px)); height: min(1180px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px)))); max-width: none; max-height: none; margin: auto; padding: 0; border: 0; border-radius: 16px; background: var(--dsw-alias-bg-layer-2, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; box-shadow: 0 24px 80px rgba(0,0,0,.4); overflow: hidden; pointer-events: auto; }',
      '.dshus-dash-dialog[open] { display: flex; flex-direction: column; }',
      // The overlay mounts outside .dshus-page, so it needs its own border-box
      // reset or padded rows (dropdown options) grow past their min-height.
      '.dshus-dash-dialog, .dshus-dash-dialog *, .dshus-dash-dialog *::before, .dshus-dash-dialog *::after { box-sizing: border-box; }',
      '.dshus-dash-dialog::backdrop { background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.35)); backdrop-filter: var(--dsw-mask-blur, none); }',
      '.dshus-dash-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px 10px; }',
      '.dshus-dash-title { display: flex; align-items: center; gap: 10px; min-width: 0; }',
      '.dshus-dash-title h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }',
      '.dshus-dash-head-actions { display: flex; align-items: center; gap: 8px; }',
      '.dshus-dash-sync { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; white-space: nowrap; }',
      '.dshus-dash-sync::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #3b82f6); }',
      '.dshus-dash-close { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }',
      '.dshus-dash-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)); }',
      '.dshus-dash-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 0 20px 16px; overflow: hidden; }',
      '.dshus-dash-toolbar { flex: none; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.dshus-range-wrap { position: relative; flex: none; }',
      '.dshus-range-trigger { box-sizing: border-box; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 13px; cursor: pointer; }',
      '.dshus-range-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.08)); }',
      '.dshus-range-trigger span { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-range-trigger svg { flex: none; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-range-popover { position: absolute; z-index: 30; top: calc(100% + 8px); left: 0; box-sizing: border-box; width: min(600px, calc(100vw - 72px)); padding: 14px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-2, #fff); box-shadow: 0 22px 60px rgba(0,0,0,.35); }',
      // The costs panel lives inside the settings pane, whose width is narrower
      // than the window; cap the popover to that pane and keep it compact enough
      // to sit beside the trigger without sliding under the sidebar.
      '#dshus-costs-panel .dshus-range-popover { width: min(500px, calc(100cqw - 40px)); }',
      '@container (max-width: 560px) { #dshus-costs-panel .dshus-range-body { grid-template-columns: minmax(0, 1fr); } #dshus-costs-panel .dshus-range-calendar { max-width: 320px; } }',
      '.dshus-range-popover .dshus-btn-primary { border-color: var(--dsw-alias-state-business-primary, #3b82f6); background: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-label-primary-inverted, #fff); }',
      '.dshus-range-popover .dshus-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 86%, #000); border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 86%, #000); }',
      '.dshus-range-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }',
      '.dshus-range-preset { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12.5px; cursor: pointer; }',
      '.dshus-range-preset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.08)); }',
      '.dshus-range-preset[data-active] { border-color: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-state-business-primary, #3b82f6); }',
      '.dshus-range-body { display: grid; grid-template-columns: minmax(0, 232px) minmax(0, 1fr); gap: 12px; align-items: start; }',
      '.dshus-range-fields { display: flex; flex-direction: column; gap: 8px; min-width: 0; }',
      '.dshus-range-hint { margin: 0 0 2px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 12px; }',
      '.dshus-range-field { display: grid; gap: 6px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); cursor: pointer; }',
      '.dshus-range-field[data-active] { border-color: var(--dsw-alias-state-business-primary, #3b82f6); }',
      '.dshus-range-field[data-disabled] { opacity: .55; cursor: default; }',
      '.dshus-range-label { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; }',
      '.dshus-range-inputs { display: flex; align-items: center; gap: 6px; min-width: 0; }',
      '.dshus-range-inputs .dshus-field { min-height: 30px; padding: 4px 8px; border-color: transparent; background: transparent; font-size: 12.5px; font-variant-numeric: tabular-nums; }',
      '.dshus-range-date { flex: 1 1 130px; min-width: 0; }',
      '.dshus-range-time { flex: 0 0 92px; min-width: 0; }',
      '.dshus-range-follow { display: flex; align-items: center; gap: 8px; margin-top: 2px; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12.5px; cursor: pointer; }',
      '.dshus-range-calendar { min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }',
      '.dshus-range-cal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }',
      '.dshus-range-cal-nav { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); font: inherit; font-size: 16px; line-height: 1; cursor: pointer; }',
      '.dshus-range-cal-nav:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)); }',
      '.dshus-range-cal-title { font-size: 13px; font-weight: 600; }',
      '.dshus-range-cal-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin-bottom: 2px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 11.5px; text-align: center; }',
      '.dshus-range-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }',
      '.dshus-range-cal-day { height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12.5px; font-variant-numeric: tabular-nums; cursor: pointer; }',
      '.dshus-range-cal-day:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)); }',
      '.dshus-range-cal-day[data-muted] { color: var(--dsw-alias-label-tertiary, #9ca3af); }',
      '.dshus-range-cal-day[data-selected] { background: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 600; }',
      '.dshus-range-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-range-summary { min-width: 0; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dshus-range-actions { flex: none; display: flex; align-items: center; gap: 8px; }',
      '.dshus-dash-dialog .dshus-btn-primary { border-color: var(--dsw-alias-state-business-primary, #3b82f6); background: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-label-primary-inverted, #fff); }',
      '.dshus-dash-dialog .dshus-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 86%, #000); border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 86%, #000); }',
      '.dshus-dash-close:focus-visible, .dshus-dash-dialog .dshus-btn:focus-visible, .dshus-range-trigger:focus-visible, .dshus-range-preset:focus-visible, .dshus-range-cal-nav:focus-visible, .dshus-range-cal-day:focus-visible, .dshus-dash-stat:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #3b82f6); outline-offset: 2px; }',
      '.dshus-dash-stats { flex: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px 12px 0 0; background: var(--dsw-alias-bg-layer-1, #fff); overflow: hidden; }',
      '.dshus-dash-stat { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 16px 11px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
      '.dshus-dash-stat + .dshus-dash-stat { border-left: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-dash-stat:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.06)); }',
      '.dshus-dash-stat[data-active] { border-bottom-color: var(--dsw-alias-state-business-primary, #3b82f6); }',
      '.dshus-dash-stat-label { color: var(--dsw-alias-label-secondary, #4b5563); font-size: 12px; }',
      '.dshus-dash-stat-value { font-size: 22px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      '.dshus-dash-chart { flex: 1 1 0; min-height: 210px; display: flex; flex-direction: column; padding: 12px 14px 10px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }',
      '.dshus-dash-stats + .dshus-dash-chart { margin-top: -12px; border-top: 0; border-radius: 0 0 12px 12px; }',
      '.dshus-dash-heatmap { flex: 0 0 auto; min-height: 0; }',
      '.dshus-dash-chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }',
      '.dshus-dash-chart-head h3 { margin: 0; font-size: 13px; font-weight: 600; }',
      '.dshus-dash-plot { flex: 1; min-height: 0; display: flex; gap: 8px; }',
      '.dshus-dash-yaxis { flex: none; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 20px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }',
      '.dshus-dash-plot-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }',
      '.dshus-dash-chart-bars { flex: 1; min-height: 120px; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(2px, 1fr); align-items: end; gap: 2px; border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-dash-bar { display: flex; align-items: flex-end; height: 100%; min-width: 0; }',
      '.dshus-dash-bar-fill { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--dsw-alias-state-business-primary, #3b82f6); }',
      '.dshus-dash-bar[data-empty] .dshus-dash-bar-fill { background: var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-dash-bar:hover .dshus-dash-bar-fill { background: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-dash-axis { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(2px, 1fr); gap: 2px; height: 16px; margin-top: 4px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 10px; font-variant-numeric: tabular-nums; }',
      '.dshus-dash-axis span { min-width: 0; overflow: hidden; text-align: center; white-space: nowrap; }',
      '.dshus-dash-heatmap-summary { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 12px; font-size: 12.5px; font-variant-numeric: tabular-nums; }',
      '.dshus-dash-heatmap-range { font-weight: 600; }',
      '.dshus-heatmap-wrap { --dshus-heat-size: clamp(8px, calc((100vw - 154px) / 53 - 3px), 16px); display: flex; flex-direction: column; gap: 4px; overflow-x: auto; overscroll-behavior: contain; padding-bottom: 2px; }',
      '.dshus-heatmap-months { display: flex; gap: 3px; padding-left: 34px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 10.5px; }',
      '.dshus-heatmap-months span { flex: none; width: var(--dshus-heat-size); white-space: nowrap; }',
      '.dshus-heatmap-body { display: flex; gap: 8px; }',
      '.dshus-heatmap-weekdays { flex: none; display: grid; grid-template-rows: repeat(7, var(--dshus-heat-size)); gap: 3px; align-items: center; width: 26px; color: var(--dsw-alias-label-tertiary, #9ca3af); font-size: 10.5px; }',
      '.dshus-heatmap-weeks { flex: none; display: flex; gap: 3px; }',
      '.dshus-heatmap-week { flex: none; display: grid; grid-template-rows: repeat(7, var(--dshus-heat-size)); gap: 3px; width: var(--dshus-heat-size); }',
      '.dshus-heatmap-cell { width: var(--dshus-heat-size); height: var(--dshus-heat-size); border-radius: 4px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); }',
      '.dshus-heatmap-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 24%, transparent); }',
      '.dshus-heatmap-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 44%, transparent); }',
      '.dshus-heatmap-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 66%, transparent); }',
      '.dshus-heatmap-cell[data-level="4"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 92%, transparent); }',
      '.dshus-heatmap-cell[data-future] { visibility: hidden; }',
      '.dshus-heatmap-cell:not([data-future]):hover { outline: 1px solid var(--dsw-alias-label-primary, #1f2430); outline-offset: 1px; }',
      '.dshus-dash-logs { flex: 1 1 0; min-height: 220px; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); overflow: hidden; }',
      '.dshus-dash-logs-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-dash-logs-head h3 { margin: 0; font-size: 13px; font-weight: 600; }',
      '.dshus-dash-page-size { display: flex; align-items: center; gap: 8px; margin-left: auto; }',
      '.dshus-dash-page-size .dshus-dropdown-trigger { min-height: 30px; height: 30px; padding: 0 8px 0 10px; font-size: 12px; }',
      '.dshus-dash-logs-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }',
      '.dshus-dash-logs .dshus-table-wrap { margin: 0; border: 0; border-radius: 0; overflow: visible; }',
      '.dshus-dash-logs .dshus-table th { position: sticky; top: 0; z-index: 1; }',
      '.dshus-dash-logs .dshus-table td { text-align: center; }',
      '.dshus-dash-pager { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); }',
      '.dshus-dash-pager .dshus-muted { margin-right: auto; }',
      '@media (max-width: 900px) { .dshus-dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dshus-dash-stat:nth-child(3) { border-left: 0; } .dshus-dash-stat:nth-child(n+3) { border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb); } .dshus-range-body { grid-template-columns: minmax(0, 1fr); } .dshus-range-calendar { max-width: 320px; } }',

      '.dshus-muted { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12.5px; }',
      '.dshus-error { color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 13px; margin: 8px 0; white-space: pre-wrap; }',

    ].join('\n')

var SEAT_ACCENT = 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)'

var SEAT_BLUE = 'color-mix(in srgb, ' + SEAT_ACCENT + ' 20%, #0068c8)'

var SEAT_MAX_ACCENT = '#a46cff'

var SEAT_TRACK_REST = 'color-mix(in srgb, var(--dsw-alias-label-primary, #f9fafb) 12%, var(--dsw-alias-bg-layer-2, #2c2c2e))'

var SEAT_SURFACE = 'var(--dsw-alias-bg-layer-2, #2c2c2e)'

var SEAT_MATERIAL = 'var(--dsw-menu-surface-fill, rgba(67,69,74,.45))'

var SEAT_MATERIAL_BLUR = 'var(--dsw-menu-backdrop-filter, blur(40px) saturate(150%))'

var SEAT_ELEVATION = 'var(--dsw-elevation-prominent, 0 0 0 .5px rgba(128,128,128,.28), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05))'

var SEAT_ICON_DISPLAY = 'var(--dsh-composer-model-icon-display, none)'

var SEAT_TEXT_DISPLAY = 'var(--dsh-composer-model-text-display, block)'

// Theme palettes for the advanced selector. `swatch` is the settings-page dot;
// `accent` tints the trigger icon, level label and selected check; `fill`/`mid`/
// `max` drive the slider and its full-strength flourish. The blue entry keeps
// the original host-brand accent untouched.
var SEAT_PALETTES = {
  red: { swatch: '#e5484d', accent: '#e5484d', fill: 'color-mix(in srgb, #e5484d 20%, #c81e1e)', mid: '#f2555a', max: '#fb7185' },
  green: { swatch: '#30a46c', accent: '#30a46c', fill: 'color-mix(in srgb, #30a46c 20%, #15803d)', mid: '#4ade80', max: '#86efac' },
  yellow: { swatch: '#d4a106', accent: '#d4a106', fill: 'color-mix(in srgb, #d4a106 20%, #a16207)', mid: '#eab308', max: '#fde047' },
  blue: { swatch: '#4176e6', accent: SEAT_ACCENT, fill: SEAT_BLUE, mid: '#6569ef', max: SEAT_MAX_ACCENT },
  purple: { swatch: '#8e4ec6', accent: '#8e4ec6', fill: 'color-mix(in srgb, #8e4ec6 20%, #6d28d9)', mid: '#a78bfa', max: '#d8b4fe' },
}

var SEAT_COLOR_NAMES = ['red', 'green', 'yellow', 'blue', 'purple']

// The seat lives in the page (not a shadow root), so one attribute on <html>
// retints every mounted selector without a React re-render of the composer.
var SEAT_THEME_CSS = SEAT_COLOR_NAMES.map(function (name) {
  var palette = SEAT_PALETTES[name]
  return ':root[data-dshus-seat-color="' + name + '"] .rs2-root{--rs2-accent:' + palette.accent + ';--rs2-fill:' + palette.fill + ';--rs2-fill-mid:' + palette.mid + ';--rs2-max:' + palette.max + '}'
}).join('\n')

var SEAT_CSS = [
      '.rs2-root{--rs2-accent:' + SEAT_ACCENT + ';--rs2-fill:' + SEAT_BLUE + ';--rs2-fill-mid:#6569ef;--rs2-max:' + SEAT_MAX_ACCENT + ';display:inline-block;width:max-content;min-width:0;position:relative;flex:none}',
      // min-width keeps a usable hit target when the label collapses away and
      // only the 16px icon remains.
      '.rs2-trigger{display:inline-flex;align-items:center;gap:2px;width:max-content;min-width:28px;padding:0 4px 0 8px;height:28px;border:none;border-radius:24px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer;outline:none}',
      '.rs2-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-trigger-icon{display:' + SEAT_ICON_DISPLAY + ';flex:none;color:var(--rs2-accent,' + SEAT_ACCENT + ')}',
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
      // A rejected switch is shown in place: the menu stays open and this row
      // carries the host's own error text, so a failure never looks like a
      // selector that ignored the click.
      '.rs2-error{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:2px 2px 4px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:17px}',
      '.rs2-error-text{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.rs2-retry{flex:none;padding:0;border:none;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}',
      // A brand-new session has no model directory yet, so this seat drives the
      // deployment default instead. The hint explains the scope of a pick there.
      '.rs2-hint{margin:2px 2px 4px;padding:0 2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px}',
      '.rs2-list{min-height:0;overflow-y:auto}',
      // The sticky group title must stay legible while rows scroll under it, so
      // it repeats the surface at ~94% alpha — the same opacity the host's own
      // menu header uses (#303136f0 dark). Fully opaque would look pasted onto
      // the frosted pane; fully transparent would let rows bleed through.
      '.rs2-grouptitle{position:sticky;top:0;z-index:2;padding:5px 8px 3px;background:color-mix(in srgb, ' + SEAT_SURFACE + ' 94%, transparent);color:var(--dsw-alias-label-caption);font-size:12px;font-weight:500;line-height:18px}',
      '.rs2-option{display:flex;align-items:center;gap:8px;width:auto;min-width:100%;min-height:38px;padding:6px 8px;border:none;border-radius:10px;background:transparent;color:inherit;font-size:14px;text-align:left;cursor:pointer}',
      '.rs2-option:hover,.rs2-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-optname{overflow-wrap:anywhere;white-space:normal}',
      '.rs2-check{display:grid;place-items:center;flex:0 0 18px;color:var(--rs2-accent,' + SEAT_ACCENT + ')}',
      '.rs2-advrow{display:flex;justify-content:flex-end;padding:4px 6px 0}',
      '.rs2-advtoggle{display:flex;align-items:center;gap:3px;height:24px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-caption);font-size:12px;font-weight:500;cursor:pointer}',
      '.rs2-advtoggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.rs2-advhead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 0}',
      '.rs2-modeljump{display:flex;align-items:center;gap:2px;flex:1;min-width:0;min-height:26px;padding:0 6px 0 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px;cursor:pointer}',
      '.rs2-modeljump:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs2-modeljump-name{overflow-wrap:anywhere;white-space:normal}',
      '.rs2-curlevel{flex:none;font-size:12px;font-weight:600;line-height:18px;color:var(--rs2-accent,' + SEAT_ACCENT + ');padding-right:4px;pointer-events:none;white-space:nowrap}',
      '.rs2-curlevel-max{color:color-mix(in srgb, var(--rs2-max,' + SEAT_MAX_ACCENT + ') 80%, var(--dsw-alias-label-primary))}',
      '.rs2-sliderbox{padding:8px 4px 2px}',
      '.rs2-track{position:relative;height:28px;margin:4px 0 0;outline:none;cursor:pointer;touch-action:none}',
      '.rs2-rail{position:absolute;inset:2px 0;border-radius:999px;background:' + SEAT_TRACK_REST + ';overflow:hidden;pointer-events:none}',
      '.rs2-fill{position:absolute;inset:0 auto 0 0;width:calc(14px + (100% - 28px) * var(--rs2-p,0));border-radius:999px;background:var(--rs2-fill,' + SEAT_BLUE + ');transition:width .18s ease;overflow:hidden}',
      '.rs2-max .rs2-fill{width:100%;background:linear-gradient(100deg,var(--rs2-fill,' + SEAT_BLUE + ') 0%,var(--rs2-fill-mid,#6569ef) 48%,var(--rs2-max,' + SEAT_MAX_ACCENT + ') 100%)}',
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
      '.rs2-max .rs2-dot{box-shadow:0 0 5px 1px color-mix(in srgb, var(--rs2-max,' + SEAT_MAX_ACCENT + ') 25%, transparent),0 1px 4px rgba(0,0,0,.35)}',
      '@media(prefers-reduced-motion:reduce){.rs2-max .rs2-tick-shell{animation:none;visibility:hidden}.rs2-stream{animation:none;display:none}.rs2-fill,.rs2-dot{transition:none}}',
    ].join('\n') + '\n' + SEAT_THEME_CSS

  return {
    styles: styles,
    seatCss: SEAT_CSS,
    seatColors: SEAT_COLOR_NAMES.map(function (name) { return { name: name, swatch: SEAT_PALETTES[name].swatch } }),
  }
}

var clientStyles = createClientStyles()
var styles = clientStyles.styles
var SEAT_CSS = clientStyles.seatCss
var SEAT_COLOR_CHOICES = clientStyles.seatColors || []

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
      // Attribution is written to the element, not into the CSS text: another
      // plugin that claims an unattributed injected <style> and deletes it on
      // unload would otherwise take this stylesheet with it.
      if (style.dataset) {
        style.dataset.plugin = 'dsh-usage-stats'
        style.dataset.pluginCss = 'dsh-usage-stats/client'
        style.dataset.dshPlugin = 'usage-stats'
      }
      style.textContent = styles + (accountQuotasClient ? '\n' + accountQuotasClient.css : '')
    }

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
      // Reserve space at both edges so the grid fits the pane and clears its pager.
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
            React.createElement('span', { 'data-dshus-tip': m.model }, m.model),
            React.createElement('strong', { 'data-dshus-tip': fmtExact(m.billed) + ' tokens' }, fmt(m.billed)),
          )
        })
        tipEl = React.createElement('div', {
          className: 'dshus-tip dshus-heat-tip',
          ref: tipRef,
          style: { left: tip.x, top: tip.y },
          onMouseEnter: clearHideTimer,
          onMouseLeave: hideTip,
        },
          React.createElement('div', { className: 'dshus-tip-name', 'data-dshus-tip': bucket ? fmtExact(tipValue) + ' tokens' : undefined }, weekly ? weekDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, function (_match, year, month, day) { return t('{year}年{month}月{day}日起的一周', { year: year, month: month, day: day }) }) : tip.cell.date),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-val', 'data-dshus-tip': bucket ? fmtExact(tipValue) + ' tokens' : undefined }, bucket ? fmt(tipValue) + ' tokens' : t('无记录')),
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
        // The legend maps colour intensity to usage volume.
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
        React.createElement('span', { className: 'dshus-heat-nav-label', 'data-dshus-tip': t('当前显示的日期范围') }, range),
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

function sharedModelDisplayName(name) {
      var s = String(name || '').trim()
      var slash = s.lastIndexOf('/')
      return slash !== -1 ? s.slice(slash + 1) : s
    }

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

var sharedModelColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

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
      // Keep each hourly bar and its label in the same flex column.
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

var DONUT_COLORS = sharedModelColors

function Donut(props) {
      var byModel = props.byModel || []
      var onSelect = props.onSelect
      var colorOf = props.colorOf

      // ALL hooks run unconditionally, before any early return, so the hook
      // count stays identical across empty/non-empty renders.
      // The hover tooltip follows the cursor and shows model, tokens and share.
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
        return React.createElement(m.key !== '__rest__' && onSelect ? 'button' : 'div', {
          className: 'dshus-donut-row',
          key: m.key,
          type: m.key !== '__rest__' && onSelect ? 'button' : undefined,
          'data-dshus-tip': fmtExact(m.billed) + ' tokens',
          style: m.key !== '__rest__' && onSelect ? { border: 0, padding: 0, width: '100%', background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' } : undefined,
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

function refreshIconButton(onClick, loading, label, alignEnd, disabled) {
      return React.createElement('button', {
        type: 'button',
        className: 'dshus-btn dshus-icon-btn' + (alignEnd ? ' dshus-heading-refresh' : ''),
        onClick: onClick,
        disabled: loading || !!disabled,
        'aria-busy': !!loading,
        'data-dshus-tip': label,
        'aria-label': label,
      }, loading
        ? React.createElement('span', { className: 'dshus-spin', 'aria-hidden': 'true' })
        : React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          React.createElement('path', { d: 'M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7M18.5 15A7 7 0 0 1 6 17' }),
        ))
    }

function quotaFailed(body) { return !body || body.ok === false || body.status === 'error' }

function quotaNotice(body) {
      if (!body || !body.refreshError) return null
      var reasons = {
        authentication: '凭据无效或已过期，请在模型设置中重新登录。',
        forbidden: '账户没有配额查询权限。',
        'rate-limit': '查询受到限流，请稍后重试。',
        timeout: '查询超时，请检查网络后重试。',
        service: '供应商服务暂时不可用。',
        parse: '响应无法解析，请检查查询字段映射。',
        invalid: '响应无法解析，请检查查询字段映射。',
      }
      return React.createElement('div', { className: 'dshus-error', role: 'status' },
        body.stale ? t('保留上次成功数据') + ' · ' : '',
        t(reasons[body.refreshError.code] || '查询失败，请检查地址和网络。'),
        Number.isInteger(body.refreshError.httpStatus) ? ' (HTTP ' + body.refreshError.httpStatus + ')' : '')
    }

function useQuotaData(loader, props, mergeTarget) {
      var state = React.useState(null)
      var data = state[0]
      var setData = state[1]
      var pendingState = React.useState(new Set())
      var pending = pendingState[0], setPending = pendingState[1]
      var errorState = React.useState(new Map())
      var errors = errorState[0], setErrors = errorState[1]
      var requestRef = React.useRef(0)
      var pendingRef = React.useRef(new Map())
      var dataRef = React.useRef(null)
      var loaderRef = React.useRef(loader)
      var pausedRef = React.useRef(false)
      loaderRef.current = loader
      pausedRef.current = props.active === false || props.refreshing === true
      function invalidate() {
        requestRef.current++
        pendingRef.current.clear()
        setPending(new Set())
      }
      function load(fresh, provider) {
        var targeted = fresh === true && typeof provider === 'string' && typeof mergeTarget === 'function'
        var key = targeted ? provider : ''
        if (pausedRef.current || pendingRef.current.has(key) || pendingRef.current.has('') || !targeted && pendingRef.current.size) return
        var request = requestRef.current, token = {}
        pendingRef.current.set(key, token)
        setPending(new Set(pendingRef.current.keys()))
        setErrors(function (previous) { var next = new Map(previous); next.delete(key); next.delete(''); return next })
        function current() { return request === requestRef.current && pendingRef.current.get(key) === token }
        var operation
        try { operation = loaderRef.current(fresh, provider) } catch (err) { operation = Promise.reject(err) }
        return Promise.resolve(operation).then(function (body) {
          if (!current()) return
          if (quotaFailed(body)) throw new Error(body && body.error || '操作失败，请稍后重试。')
          if (targeted) body = mergeTarget(dataRef.current, body, provider)
          dataRef.current = body
          setData(body)
        }).catch(function (err) {
          if (current()) setErrors(function (previous) { var next = new Map(previous); next.set(key, String(err && err.message || err)); return next })
        }).finally(function () {
          if (!current()) return
          pendingRef.current.delete(key)
          setPending(new Set(pendingRef.current.keys()))
        })
      }
      React.useEffect(function () {
        if (props.active === false) return
        load(false)
        var timer = typeof setInterval === 'function' ? setInterval(function () { load(false) }, 30000) : null
        return function () {
          invalidate()
          if (timer !== null) clearInterval(timer)
        }
      }, [props.active, props.revision])
      React.useEffect(function () {
        if (props.refreshing === true) invalidate()
      }, [props.refreshing])
      React.useEffect(function () {
        if (props.snapshot === undefined) return
        invalidate()
        if (quotaFailed(props.snapshot)) {
          setErrors(new Map([['', String(props.snapshot && props.snapshot.error || '操作失败，请稍后重试。')]]))
          return
        }
        dataRef.current = props.snapshot
        setData(props.snapshot)
        setErrors(new Map())
      }, [props.snapshot])
      return { data: data, loading: pending.size > 0 || props.refreshing === true, error: errors.get('') || '', load: load,
        isLoading: function (provider) { return props.refreshing === true || pending.has('') || pending.has(provider) },
        errorFor: function (provider) { return errors.get(provider) || '' } }
    }

function mergeProviderQuota(previous, body, provider) {
      if (!previous || !Array.isArray(previous.quotas)) return body
      // A single-provider response includes cached rows for other providers.
      // Merge only its target so parallel refreshes cannot undo each other.
      var incoming = Array.isArray(body.quotas) ? body.quotas : []
      var present = new Set(incoming.map(function (quota) { return quota.provider }))
      var quotas = previous.quotas.filter(function (quota) { return present.has(quota.provider) })
      var update = incoming.find(function (quota) { return quota.provider === provider })
      var index = quotas.findIndex(function (quota) { return quota.provider === provider })
      // A target removed by a newer list must not return from a late response.
      if (index >= 0 && update) quotas[index] = update
      return Object.assign({}, previous, body, { quotas: quotas })
    }

function ProviderQuotasPanel(props) {
      var resource = useQuotaData(function (fresh, provider) { return props.api.providerQuotas({ fresh: fresh, provider: provider }) }, props, mergeProviderQuota)
      var data = resource.data, load = resource.load
      var quotas = data && data.ok === true && Array.isArray(data.quotas) ? data.quotas : []
      if (!quotas.length && !props.children) return resource.error ? React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)) : null

      function isBalanceOnly(quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        return metrics.length ? metrics.every(function (metric) { return metric.kind === 'amount' }) : quota.kind === 'balance'
      }
      function isDeepSeek(quota) { return quota.provider === 'deepseek' || quota.provider === 'deepseek-official' }
      // DeepSeek leads, then enabled account channels, then the remaining providers in their original groups.
      var others = quotas.filter(function (quota) { return !isDeepSeek(quota) })
      others = others.filter(isBalanceOnly).concat(others.filter(function (quota) { return !isBalanceOnly(quota) }))
      function renderQuota(quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        var loading = resource.isLoading(quota.provider)
        var error = resource.errorFor(quota.provider)
        // 上次获取时间：同一张配额卡片内，所有指标共享同一个获取时刻。
        var fetchedLine = React.createElement(React.Fragment, null,
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          quotaNotice(quota),
          React.createElement('div', { className: 'dshus-fetched' }, t('上次获取时间：{time}', { time: fmtFetched(quota.syncedAt) })))
        if (!metrics.length) {
          if (quota.status !== 'unqueried' && quota.status !== 'unavailable') return null
          var statusLabel = quota.status === 'unqueried' ? t('未查询') : t('未获取')
          return React.createElement('div', { key: quota.provider, className: 'dshus-module dshus-balance-module' },
            React.createElement('div', { className: 'dshus-balance-title' },
              React.createElement('h3', null, t(quota.name)),
              refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
            ),
            React.createElement('div', { className: 'dshus-balance-side' },
              React.createElement('div', {
                className: 'dshus-balance-value dshus-balance-status',
                'aria-label': t('{name} 配额{status}', { name: t(quota.name), status: statusLabel }),
                'data-dshus-tip': quota.status === 'unqueried' ? t('已在模型设置中配置，尚未查询配额。') : t('尚未获取到有效配额，可刷新重试。'),
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
              React.createElement('span', { className: 'dshus-quota-pct', style: { color: color }, 'data-dshus-tip': t('剩余 {value}', { value: formatPct(pct) }) }, value),
              React.createElement('span', { className: 'dshus-quota-reset', 'data-dshus-tip': metric.resetAt ? t('重置时间：{time}', { time: fmtFetched(metric.resetAt) }) : undefined }, reset),
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
          var refreshBtn = refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false)
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
            refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
          ),
          cards.length > 0 && React.createElement('div', { className: 'dshus-statbar dshus-quota-bar' }, cards),
          windowRows.length > 0 && React.createElement('div', { className: 'dshus-quota-rows' }, windowRows),
        )
      }
      return React.createElement('div', { className: 'dshus-provider-panels', 'data-empty-label': t('已配置供应商的可读取配额会显示在这里') },
        resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
        quotas.filter(isDeepSeek).map(renderQuota), props.children, others.map(renderQuota))
    }

function AccountQuotasPanel(props) {
      var resource = useQuotaData(function (fresh, target) {
        return props.api.accountQuotas(Object.assign({ fresh: fresh === true }, target))
      }, props)
      return React.createElement(React.Fragment, null,
        resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
        accountQuotasClient && resource.data && React.createElement(accountQuotasClient.QuotaPanel, {
          data: resource.data, loading: resource.loading, onRefresh: function (target) { return resource.load(true, target) },
          refreshButton: refreshIconButton, formatTime: fmtFetched, formatReset: fmtReset,
        }))
    }



function SelectField(props) {
  var openState = React.useState(false)
  var open = openState[0], setOpen = openState[1]
  var activeState = React.useState(0)
  var active = activeState[0], setActive = activeState[1]
  var placementState = React.useState({ above: false, height: 260 })
  var placement = placementState[0], setPlacement = placementState[1]
  var rootRef = React.useRef(null)
  var listRef = React.useRef(null)
  var searchRef = React.useRef({ text: '', at: 0 })
  var options = props.options || []
  var selected = options.find(function (item) { return item.value === props.value }) || options[0] || { value: '', name: '' }
  var activeIndex = Math.max(0, Math.min(active, options.length - 1))
  var listId = props.id + '-list'
  var field = props.variant === 'field'
  var rootClass = field
    ? 'dshus-dropdown' + (props.block ? ' dshus-dropdown-block' : props.inline ? ' dshus-dropdown-inline' : '')
    : 'dshus-provider-picker'
  var triggerClass = field ? 'dshus-field dshus-dropdown-trigger' : 'dshus-field dshus-query-select'
  var menuClass = field ? 'dshus-dropdown-menu' : 'dshus-provider-list'
  var optionClass = field ? 'dshus-dropdown-option' : 'dshus-provider-option'
  var nameClass = field ? 'dshus-dropdown-label' : 'dshus-provider-name'
  var chevronClass = field ? 'dshus-dropdown-chevron' : 'dshus-provider-chevron'

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
        if (String(options[match].name).toLowerCase().startsWith(search)) {
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
  function check(item) {
    return item.value === props.value
      ? React.createElement('svg', { className: 'dshus-dropdown-check', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, React.createElement('path', { d: 'm3.5 8.5 3 3 6-7' }))
      : null
  }
  var labelProps = props.labelId
    ? { 'aria-labelledby': props.labelId + ' ' + props.id + '-value' }
    : { 'aria-label': props['aria-label'] }
  return React.createElement('div', { className: rootClass, ref: rootRef },
    React.createElement('button', { id: props.id, type: 'button', role: 'combobox', className: triggerClass, disabled: props.disabled, ...labelProps, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? listId : undefined, 'aria-activedescendant': open ? listId + '-' + activeIndex : undefined, onClick: function () { if (open) setOpen(false); else show() }, onKeyDown: onKeyDown },
      React.createElement('span', { id: props.id + '-value', className: nameClass }, selected.name),
      dot(selected.source),
      React.createElement('svg', { className: chevronClass, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
    open && React.createElement('div', { id: listId, role: 'listbox', 'aria-labelledby': props.labelId, 'aria-label': props.labelId ? undefined : props['aria-label'], className: menuClass + (placement.above ? ' above' : ''), style: { maxHeight: placement.height }, ref: listRef },
      options.map(function (item, index) {
        // A stationary cursor must not override keyboard navigation as rows scroll past it.
        return React.createElement('div', { key: item.value, id: listId + '-' + index, role: 'option', 'data-value': item.value, 'aria-selected': item.value === props.value, 'aria-label': item.name + (item.source ? '，' + item.source : ''), 'data-dshus-tip': item.source || undefined, className: optionClass + (index === activeIndex ? ' active' : ''), onMouseMove: function () { setActive(index) }, onMouseDown: function (event) { event.preventDefault() }, onClick: function (event) { event.stopPropagation(); choose(index) } },
          React.createElement('span', { className: nameClass }, item.name), dot(item.source), check(item))
      })),
  )
}

function ProviderPicker(props) {
  // Called as a function, not an element, so the picker's own hooks stay in one
  // component while the settings tests still resolve its field markup directly.
  return SelectField(props)
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

/** Native top-layer dialogs keep editors out of the control grid's layout. */
function ControlDialog(props) {
  var dialogRef = React.useRef(null)
  React.useEffect(function () {
    var dialog = dialogRef.current
    if (!dialog) return
    var active = document.activeElement
    if (!dialog.open) dialog.showModal()
    return function () {
      if (dialog.open) dialog.close()
      var target = active && active.isConnected ? active : document.getElementById(props.returnFocusId)
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true })
    }
  }, [])
  return React.createElement('dialog', { id: props.id, className: 'dshus-control-dialog' + (props.className ? ' ' + props.className : ''), ref: dialogRef, 'aria-labelledby': props.id + '-title',
    onCancel: function (event) { event.preventDefault(); props.onClose() },
    onClick: function (event) {
      if (event.target !== dialogRef.current) return
      var rect = event.target.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.onClose()
    } },
    React.createElement('div', { className: 'dshus-control-dialog-head' },
      React.createElement('h3', { id: props.id + '-title' }, props.title),
      React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: props.onClose }, t('关闭窗口'))),
    React.createElement('div', { className: 'dshus-control-dialog-body' }, props.children))
}

/** Plain-language tour of every visible section, opened from the header. */
function QuickStartDialog(props) {
  var entries = [
    [t('刷新数据'), t('右上角的圆形箭头按钮用来重新读取数据：停在「用量」页时它是刷新用量统计，停在「配额」页时它会变成刷新全部配额。')],
    [t('用量'), t('顶部三个数字分别是今日 Tokens、使用天数和累计 Tokens，点旁边的小箭头可以展开缓存命中率、使用峰值、最长任务和连续使用天数等细节。今天的用量按小时画成柱状图，鼠标移到柱子上能看到该小时每个模型的用量，右侧可以在「供应商·模型」和「按模型」两种口径之间切换。')],
    [t('热力图与趋势图'), t('热力图一天一格，颜色越深表示当天用量越大；可以切换「每日 / 每周」，并用左右箭头翻看更早的时段。趋势图展示最近 7 天或 30 天的每日总量，右侧同样可以按「供应商·模型」或「按模型」查看，用来观察用量的起伏。')],
  ]
  if (props.showModelDetails) entries.push([t('模型明细与分布'), t('环形图显示各模型的用量占比，下面的表格列出用量、占比和最后活跃时间。可以按模型名搜索或用供应商名筛选，点表格下方的按钮可以展开完整清单。')])
  if (props.showTokenSpeed) entries.push([t('token输出速度'), t('按输出速度给模型排名：TPS 是每秒输出的 Token 数，TTFT 是发出请求到出现第一个 Token 的等待时间。TPS 越大、TTFT 越小，用起来越流畅。')])
  if (props.showLogs) entries.push([t('日志'), t('按时间倒序列出每一次请求，包含时间、应用、供应商、模型、成本、输入和输出 Token、缓存命中、速度与首字耗时。顶部可以按供应商、模型筛选，并调整每页行数，适合核对某一次调用具体用了多少。')])
  if (props.showCosts) entries.push([t('成本'), t('点日期范围按钮可以选择当天、近 7/14/30 天或本月，也可以直接在日历上选择起止日期；再选供应商，页面就会按价格表把 Tokens 折算成金额。顶部是总成本、区间成本和区间 Tokens，下方按模型列出花费与占比；如果模型显示未定价，点「价格表」补上单价即可。')])
  if (props.showRules) entries.push([t('规则'), t('把同一个模型的不同原始名称（例如不同供应商给出的别名）归并成一个名称。新增时填一个归一名称，再把相关的原始模型都选进去；保存后用量、日志和成本都会按新名称统计。已有规则可以随时编辑或移除。')])
  entries.push([t('配额'), t('这里显示各供应商和账号的剩余额度、已用比例与重置时间，数据直接向供应商查询。想让它在后台定时更新，可以在「控制」页打开「自动获取剩余余额」并设置间隔；也可以随时点右上角的刷新按钮。')])
  if (props.showModelDetection) entries.push([t('检测'), t('先选供应商和模型，再决定采样次数（标准 3 次，或只做排序的 1 次低耗初筛）和 Token 预算上限，点「查看检测预算」确认大约会消耗多少 Token，再点「开始检测」。完成后会给出首选候选、候选排名和每次采样的结果；结果只是参考排名，不构成模型身份认证。')])
  entries.push([t('控制'), t('这里是总开关：可以关掉不需要的标签页和模块，开启「高级模型选择器」并挑选主题色，设置「自动获取剩余余额」的刷新间隔，还能为供应商自定义配额查询。改动会立即保存，无需额外确认。')])
  entries.push([t('问题反馈'), t('右上角的发送图标会打开 GitHub Issues 页面，可以提交问题、使用疑问或功能建议。附上截图和复现步骤，会更容易定位问题。')])
  var activeState = React.useState(0)
  var active = Math.min(activeState[0], entries.length - 1)
  var setActive = activeState[1]
  function onNavKeyDown(event) {
    var delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    var next = (active + delta + entries.length) % entries.length
    setActive(next)
    var tabs = event.currentTarget.querySelectorAll('[role="tab"]')
    if (tabs[next] && typeof tabs[next].focus === 'function') tabs[next].focus()
  }
  return React.createElement(ControlDialog, { id: 'dshus-quickstart-dialog', className: 'dshus-quickstart-dialog', title: t('快速上手'), returnFocusId: 'dshus-quickstart-button', onClose: props.onClose },
    React.createElement('div', { className: 'dshus-quickstart' },
      React.createElement('nav', { className: 'dshus-quickstart-nav', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('快速上手'), onKeyDown: onNavKeyDown }, entries.map(function (entry, index) {
        return React.createElement('button', {
          key: entry[0], id: 'dshus-quickstart-tab-' + index, type: 'button', role: 'tab',
          'aria-selected': index === active, 'aria-controls': 'dshus-quickstart-panel',
          tabIndex: index === active ? 0 : -1, className: 'dshus-quickstart-tab',
          onClick: function () { setActive(index) },
        }, entry[0])
      })),
      React.createElement('div', { className: 'dshus-quickstart-panel', id: 'dshus-quickstart-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-quickstart-tab-' + active },
        React.createElement('h4', null, entries[active][0]),
        React.createElement('p', null, entries[active][1]))))
}

/** Settings use the host store so timers also work while this page is closed. */
function ControlsPanel(props) {
  var control = props.control
  // The controls body may lack its settings block (a degraded endpoint or a
  // proxy error page): the switches degrade, the page never crashes.
  var settings = Object.assign({ customQueries: [] }, (control && control.settings) || {})
  if (!Array.isArray(settings.customQueries)) settings.customQueries = []
  // Read the host setting before enabling the selector.
  var advancedModelSelect = settings.advancedModelSelect === true
  var seatColor = seatNormalizeColor(settings.modelSeatColor)
  var modelReasoning = settings.modelReasoning !== false
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
  var editorOpenState = React.useState(false)
  var editorOpen = editorOpenState[0], setEditorOpen = editorOpenState[1]
  var savedOpenState = React.useState(false)
  var savedOpen = savedOpenState[0], setSavedOpen = savedOpenState[1]
  var testRef = React.useRef(0)
  var drafts = React.useRef(Object.create(null))

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
      if (patch.action === 'remove-query') {
        delete drafts.current[patch.provider]
        if (provider === patch.provider) {
          var entry = providers.find(function (item) { return item.provider === provider })
          editTemplate(entry && entry.template ? JSON.stringify(entry.template, null, 2) : '')
        }
      }
      setSaving(false)
      setStatus(message || '设置已保存')
      if (patch.autoQuota !== undefined) setConfirmAuto(false)
    }).catch(function (err) { setSaving(false); setError(String(err.message || err)) })
  }
  function editTemplate(text, draftProvider) {
    testRef.current++
    var id = draftProvider === undefined ? provider : draftProvider
    if (id) drafts.current[id] = text
    setTemplateText(text)
    setPreview(null)
    setTesting(false)
    setStatus('')
    setError('')
  }
  function selectProvider(id) {
    if (provider) drafts.current[provider] = templateText
    setProvider(id)
    setSavedOpen(false)
    setEditorOpen(!!id)
    var saved = settings.customQueries.find(function (query) { return query.provider === id })
    var item = providers.find(function (entry) { return entry.provider === id })
    var text = item && item.queryType === 'adapter' ? '' : saved || item ? JSON.stringify(saved ? saved.template : item.template, null, 2) : ''
    editTemplate(Object.prototype.hasOwnProperty.call(drafts.current, id) ? drafts.current[id] : text, id)
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
  var validPreview = preview && preview.text === templateText && preview.provider === provider
  var selected = providers.find(function (entry) { return entry.provider === provider })
  // The prompt describes the provider the user is looking at, so it borrows
  // the live template when one is loaded and stays generic otherwise.
  var promptProviderName = selected ? selected.name : provider
  var promptTemplate = null
  if (templateText.trim()) {
    try { promptTemplate = JSON.parse(templateText) } catch (e) { promptTemplate = null }
  }
  // The query module is its own card so the model-access control view can
  // place it in the four-card grid; on its own page it still reads as a
  // normal section of the controls column. The card heading names the group,
  // so the field below it carries no second "查询来源" label.
  var querySection = React.createElement('section', { className: 'dshus-control-section dshus-control-query-section', 'aria-labelledby': 'dshus-control-query-heading' },
    React.createElement('div', { className: 'dshus-control-query-head' },
      React.createElement('h3', { className: 'dshus-control-heading', id: 'dshus-control-query-heading' }, t('查询来源')),
      refreshIconButton(loadProviders, providerLoading, t('刷新供应商列表'), true)),
    React.createElement('div', { className: 'dshus-control-query' },
      React.createElement(ProviderPicker, { id: 'dshus-query-provider', labelId: 'dshus-control-query-heading', value: provider, disabled: saving || providerLoading || !props.ready, onChange: selectProvider, options: [{ value: '', name: providerLoading ? t('正在加载供应商…') : t('选择已有供应商') }].concat(providers.map(function (item) {
        var custom = settings.customQueries.some(function (query) { return query.provider === item.provider })
        var source = custom ? t('已保存自定义查询') : item.hasBuiltinQuery === true ? item.queryType === 'adapter' ? t('内置扩展查询') : t('内置供应商查询') : ''
        return { value: item.provider, name: t(item.name), source: source }
      })) }),
      !providerLoading && !providers.length && React.createElement('p', { className: 'dshus-setting-help' }, t('尚无可用查询来源，请先添加模型供应商。')),
      // With no provider chosen there is still a failure worth showing here,
      // e.g. loading the provider list itself.
      !provider && error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
      React.createElement('div', { className: 'dshus-control-actions' },
        React.createElement('button', { id: 'dshus-query-edit', type: 'button', className: 'dshus-btn', disabled: !provider || saving || providerLoading || !props.ready, 'aria-haspopup': 'dialog', 'aria-expanded': editorOpen, 'aria-controls': editorOpen ? 'dshus-query-dialog' : undefined, onClick: function () { setEditorOpen(true) } }, t('编辑查询'))),
      provider && editorOpen && React.createElement(ControlDialog, { id: 'dshus-query-dialog', title: t(promptProviderName), returnFocusId: 'dshus-query-edit', onClose: function () { setEditorOpen(false) } },
      selected && selected.queryType === 'adapter' && React.createElement('div', { className: 'dshus-control-actions' },
        React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing, onClick: refreshAdapter }, testing ? t('正在查询…') : t('查询配额')),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error))),
      provider && (!selected || selected.queryType !== 'adapter') && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('label', { className: 'dshus-setting-label', htmlFor: 'dshus-query-template' }, t('查询模板（JSON）')),
          selected && React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { editTemplate(JSON.stringify(selected.template, null, 2)) } }, t('重置模板'))),
        React.createElement('textarea', { id: 'dshus-query-template', className: 'dshus-field dshus-query-editor', value: templateText, spellCheck: false, disabled: saving, onChange: function (event) { editTemplate(event.target.value) } }),
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('span', { className: 'dshus-setting-help', role: 'status' }, t('草稿已保留，测试并确认后生效。')),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () {
            var saved = settings.customQueries.find(function (query) { return query.provider === provider })
            editTemplate(JSON.stringify(saved ? saved.template : selected && selected.template, null, 2) || '')
          } }, t('恢复已保存模板'))),
        // Include the provider and current template in a copyable AI prompt.
        // Selectable text supports hosts without clipboard access.
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
      )),
      (settings.customQueries || []).length > 0 && React.createElement('button', { id: 'dshus-saved-queries-toggle', type: 'button', className: 'dshus-saved-queries-toggle', 'aria-haspopup': 'dialog', 'aria-expanded': savedOpen, 'aria-controls': savedOpen ? 'dshus-saved-queries-dialog' : undefined, onClick: function () { setEditorOpen(false); setSavedOpen(true) } },
        React.createElement('span', null, t('已启用的自定义查询')),
        React.createElement('span', { className: 'dshus-setting-help' }, String(settings.customQueries.length)),
        React.createElement('svg', { className: 'dshus-provider-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
      savedOpen && (settings.customQueries || []).length > 0 && React.createElement(ControlDialog, { id: 'dshus-saved-queries-dialog', title: t('已启用的自定义查询'), returnFocusId: 'dshus-saved-queries-toggle', onClose: function () { setSavedOpen(false) } },
        (settings.customQueries || []).map(function (query) {
          var item = providers.find(function (entry) { return entry.provider === query.provider })
          return React.createElement('div', { key: query.provider, className: 'dshus-saved-query' },
            React.createElement('span', null, item ? item.name : query.provider),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { selectProvider(query.provider) } }, t('编辑')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ action: 'remove-query', provider: query.provider }, '已移除自定义查询，恢复内置配额查询。') } }, t('移除')))
        })),
    ))
  // Keep the feature cards mounted with their state and event handlers.
  // Their accessible names identify the groups without visible headings.
  var modelCard = React.createElement('section', { className: 'dshus-control-section', 'aria-label': t('模型功能') },
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型推理强度')),
          switchButton(t('模型推理强度'), modelReasoning, function () { save({ modelReasoning: !modelReasoning }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('高级模型选择器')),
          React.createElement('div', { className: 'dshus-setting-tail' },
            // The palette only matters while the advanced selector is enabled,
            // mirroring how the automatic-balance interval follows its switch.
            advancedModelSelect && React.createElement('div', { className: 'dshus-seat-colors', role: 'group', 'aria-label': t('主题色') },
              SEAT_COLOR_CHOICES.map(function (choice) {
                return React.createElement('button', {
                  key: choice.name,
                  type: 'button',
                  className: 'dshus-seat-color',
                  style: { '--dshus-seat-swatch': choice.swatch },
                  'aria-label': t(SEAT_COLOR_LABELS[choice.name]),
                  'aria-pressed': seatColor === choice.name,
                  'data-dshus-tip': t(SEAT_COLOR_LABELS[choice.name]),
                  disabled: !props.ready || saving,
                  onClick: function () { save({ modelSeatColor: choice.name }, '已更新主题色') },
                })
              })),
            switchButton(t('高级模型选择器'), advancedModelSelect, function () {
              save({ advancedModelSelect: !advancedModelSelect }, advancedModelSelect ? '已关闭，已恢复官方模型选择器' : '已开启高级模型选择器')
            }))),
        // Show the refresh interval beside the automatic-balance switch.
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('自动获取剩余余额')),
          React.createElement('div', { className: 'dshus-setting-tail' },
            settings.autoQuota && React.createElement(SelectField, {
              id: 'dshus-auto-interval', variant: 'field', inline: true,
              'aria-label': t('自动获取间隔'),
              value: settings.intervalMinutes,
              disabled: saving || !props.ready,
              options: [[10, t('10 分钟')], [60, t('1 小时')], [300, t('5 小时')], [1440, t('每天')]].map(function (option) { return { value: option[0], name: option[1] } }),
              onChange: function (value) { save({ intervalMinutes: Number(value) }) },
            }),
            switchButton(t('自动获取剩余余额'), settings.autoQuota, function () { if (settings.autoQuota) save({ autoQuota: false }); else setConfirmAuto(true) }))),
        // The cost warning stays directly under the switch that spends money.
        confirmAuto && React.createElement('div', { className: 'dshus-confirm', role: 'alert', 'aria-label': t('自动查询费用提醒') },
          React.createElement('p', null, t('自动查询可能会消耗少量余额，具体取决于供应商的计费规则。确认开启后，将立即获取一次，之后按所选间隔更新。')),
          React.createElement('div', { className: 'dshus-control-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ autoQuota: true, acknowledgeCost: true }) } }, t('确认开启')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { setConfirmAuto(false) } }, t('取消')))),
  )
  var displayCard = React.createElement('section', { className: 'dshus-control-section', 'aria-label': t('用量展示') },
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型明细与分布')),
          switchButton(t('模型明细与分布'), settings.showModelDetails, function () { save({ showModelDetails: !settings.showModelDetails }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('token输出速度')),
          switchButton(t('token输出速度'), settings.showTokenSpeed !== false, function () { save({ showTokenSpeed: settings.showTokenSpeed === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('日志')),
          switchButton(t('日志'), settings.showLogs !== false, function () { save({ showLogs: settings.showLogs === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('成本')),
          switchButton(t('成本'), settings.showCosts !== false, function () { save({ showCosts: settings.showCosts === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('规则')),
          switchButton(t('规则'), settings.showRules !== false, function () { save({ showRules: settings.showRules === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型检测')),
          switchButton(t('模型检测'), settings.showModelDetection === true, function () { save({ showModelDetection: settings.showModelDetection !== true }) })),
  )
  // The model-access view supplies its gateway cell as a slot. Rendering
  // every card here avoids an effect-based handoff that requires this panel
  // to mount before its parent can display it.
  var hostCards = [modelCard, displayCard, querySection]
  var cardCells = hostCards.map(function (card, index) {
    return React.createElement('div', { key: 'grid-cell-' + index, className: 'dshus-ma-control-cell', 'data-part': 'host-cell' }, card)
  })
  if (props.gatewayCard) cardCells.splice(2, 0, props.gatewayCard)
  return React.createElement('div', { className: 'dshus-controls' },
    // Settings-load failures apply to all sections; query failures stay
    // beside the provider or template that produced them.
    props.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(props.error),
      React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: props.onReload }, t('重试'))),
    React.createElement('div', { className: 'dshus-ma-control-grid', 'data-part': 'control-grid' }, cardCells),
    (!props.ready && !props.error || status) && React.createElement('div', { className: 'dshus-control-status', role: 'status' }, !props.ready && !props.error ? t('正在读取设置…') : t(status)),
  )
}

/* ------------------------------------------------------------------ */
/* Settings section page                                               */
/* ------------------------------------------------------------------ */

var NO_SESSION = Object.freeze({})

function DetectionPanel(props) {
      var currentStore = props.uiSession && props.uiSession.current || props.uiWorkspace && props.uiWorkspace.selection
      var current = React.useSyncExternalStore(function (listener) { return currentStore ? currentStore.subscribe(listener) : function () {} }, function () { return currentStore ? currentStore.getSnapshot() : NO_SESSION })
      var sessionId = current.key || current.sessionId || ''
      var directoryRef = React.useRef({ id: null, value: null })
      if (directoryRef.current.id !== sessionId) {
        var directory = null
        try { if (sessionId && props.modelDirectories) directory = props.modelDirectories.directoryFor(sessionId) } catch (err) {}
        directoryRef.current = { id: sessionId, value: directory }
      }
      var activeDirectory = directoryRef.current.value, directoryStore = activeDirectory && activeDirectory.store
      var modelState = React.useSyncExternalStore(function (listener) { return directoryStore ? directoryStore.subscribe(listener) : function () {} }, function () { return directoryStore ? directoryStore.getSnapshot() : NO_SESSION })
      React.useEffect(function () { if (activeDirectory) Promise.resolve(activeDirectory.load()).catch(function () {}) }, [activeDirectory])
      var suggested = modelState.current || null
      var selectedState = React.useState(suggested || { provider: '', model: '' }), selection = selectedState[0], setSelection = selectedState[1]
      var manualSelection = React.useRef(false)
      var provider = selection && selection.provider || '', model = selection && selection.model || '', effort = selection && selection.reasoningEffort || ''
      var providersState = React.useState([]), providers = providersState[0], setProviders = providersState[1]
      var modelsState = React.useState([]), models = modelsState[0], setModels = modelsState[1]
      var providersLoadingState = React.useState(true), providersLoading = providersLoadingState[0], setProvidersLoading = providersLoadingState[1]
      var modelsLoadingState = React.useState(false), modelsLoading = modelsLoadingState[0], setModelsLoading = modelsLoadingState[1]
      var modelsProviderState = React.useState(''), modelsProvider = modelsProviderState[0], setModelsProvider = modelsProviderState[1]
      var resultKey = [sessionId, provider, model, effort].join('|')
      var jobState = React.useState(null), job = jobState[0], setJob = jobState[1]
      var errorState = React.useState(''), error = errorState[0], setError = errorState[1]
      var busyState = React.useState(false), busy = busyState[0], setBusy = busyState[1]
      var cancellingState = React.useState(false), cancelling = cancellingState[0], setCancelling = cancellingState[1]
      var catalogState = React.useState(null), catalog = catalogState[0], setCatalog = catalogState[1]
      var updatingState = React.useState(false), updating = updatingState[0], setUpdating = updatingState[1]
      var countState = React.useState(3), count = countState[0], setCount = countState[1]
      var budgetState = React.useState(12000), budget = budgetState[0], setBudget = budgetState[1]
      var maxTokensState = React.useState(4096), maxTokens = maxTokensState[0], setMaxTokens = maxTokensState[1]
      var quoteState = React.useState(null), quoted = quoteState[0], setQuoted = quoteState[1]
      var sequence = React.useRef(0), planSequence = React.useRef(0), mounted = React.useRef(true)
      var resultRef = React.useRef(null), notifiedJob = React.useRef('')
      var quoteKey = [resultKey, count, budget, maxTokens].join('|')
      var quote = quoted && quoted.key === quoteKey && quoted.body
      var running = job && job.status === 'running'
      var selectedReady = providers.some(function (item) { return item.provider === provider }) && modelsProvider === provider && models.some(function (item) { return item.id === model }) && !modelsLoading
      var jobIsCurrent = job && job.sessionId === sessionId && job.selection.provider === provider && job.selection.model === model && (job.selection.reasoningEffort || '') === effort
      var savedPlan = job && job.plan || {}, savedOutputLimit = savedPlan.maxTokens || savedPlan.maxOutputTokens && savedPlan.requests && savedPlan.maxOutputTokens / savedPlan.requests
      var resultMatchesSetup = jobIsCurrent && (!savedPlan.requests || savedPlan.requests === count) && (!savedPlan.budgetTokens || savedPlan.budgetTokens === budget) && (!savedOutputLimit || savedOutputLimit === maxTokens)
      React.useEffect(function () {
        if (manualSelection.current || busy || running || !suggested || !suggested.provider || !suggested.model) return
        setSelection(function (previous) { return previous.provider === suggested.provider && previous.model === suggested.model && (previous.reasoningEffort || '') === (suggested.reasoningEffort || '') ? previous : suggested })
      }, [suggested && suggested.provider, suggested && suggested.model, suggested && suggested.reasoningEffort, busy, running])
      React.useEffect(function () {
        if (!props.active) return
        var alive = true
        setProvidersLoading(true)
        props.api.modelDetectionModels().then(function (body) {
          if (!alive) return
          var list = body.providers || []
          setProviders(list); setProvidersLoading(false)
          setSelection(function (previous) { return previous.provider || !list.length ? previous : { provider: list[0].provider, model: '' } })
        }).catch(function (err) { if (alive) { setProvidersLoading(false); setError(String(err.message || err)) } })
        return function () { alive = false }
      }, [props.active])
      React.useEffect(function () {
        if (!props.active || !provider) return
        var alive = true
        setModels([]); setModelsProvider(''); setModelsLoading(true)
        props.api.modelDetectionModels(provider).then(function (body) {
          if (!alive || body.provider !== provider) return
          var list = body.models || []
          setModels(list); setModelsProvider(provider); setModelsLoading(false)
          setSelection(function (previous) {
            if (previous.provider !== provider) return previous
            if (previous.model && list.some(function (item) { return item.id === previous.model })) return previous
            return { provider: provider, model: previous.model ? '' : list.length ? list[0].id : '' }
          })
        }).catch(function (err) { if (alive) { setModelsLoading(false); setError(String(err.message || err)) } })
        return function () { alive = false }
      }, [props.active, provider])
      React.useEffect(function () {
        if (!job || job.status === 'running' || notifiedJob.current === job.id) return
        notifiedJob.current = job.id
        if (resultRef.current && resultRef.current.scrollIntoView) resultRef.current.scrollIntoView({ block: 'start', behavior: 'auto' })
        if (props.onUsageUpdated) props.onUsageUpdated()
      }, [job && job.id, job && job.status])
      React.useEffect(function () { mounted.current = true; return function () { mounted.current = false; planSequence.current++ } }, [])
      function readCatalog() {
        return props.api.modelFingerprintEngine().then(function (body) { if (mounted.current) setCatalog(body) })
      }
      function refresh() {
        var request = ++sequence.current
        props.api.modelDetectionStatus(sessionId ? { session: sessionId } : {}).then(function (body) {
          if (request === sequence.current && mounted.current) setJob(body.job || null)
        }).catch(function (err) { if (request === sequence.current && mounted.current) setError(String(err.message || err)) })
      }
      React.useEffect(function () {
        if (props.active) { refresh(); readCatalog().catch(function (err) { if (mounted.current) setError(String(err.message || err)) }) }
        return function () { sequence.current++ }
      }, [props.active, sessionId])
      React.useEffect(function () { planSequence.current++; setQuoted(null) }, [quoteKey])
      React.useEffect(function () {
        if (!props.active || !catalog || !catalog.updating) return
        var timer = setTimeout(function () { readCatalog().catch(function () {}) }, 2000)
        return function () { clearTimeout(timer) }
      }, [props.active, catalog])
      React.useEffect(function () {
        if (!running) return
        var alive = true, timer
        function poll() {
          props.api.modelDetectionStatus({ job: job.id }).then(function (body) {
            if (!alive) return
            setJob(body.job)
            if (body.job && body.job.status === 'running') timer = setTimeout(poll, 1500)
            else setCancelling(false)
          }).catch(function (err) { if (alive) { setError(String(err.message || err)); timer = setTimeout(poll, 3000) } })
        }
        timer = setTimeout(poll, 500)
        return function () { alive = false; clearTimeout(timer) }
      }, [running, job && job.id])
      function preview() {
        if (busy || running || !selectedReady) return
        var request = ++planSequence.current
        setBusy(true); setError(''); setQuoted(null)
        props.api.modelDetection({ action: 'plan', sessionId: sessionId, selection: { provider: provider, model: model, ...(effort ? { reasoningEffort: effort } : {}) }, sampleCount: count, budgetTokens: budget, maxTokens: maxTokens }).then(function (body) {
          if (!mounted.current) return
          setBusy(false)
          if (request === planSequence.current) setQuoted({ key: quoteKey, body: body.quote })
        }).catch(function (err) { if (mounted.current) { setBusy(false); if (request === planSequence.current) setError(String(err.message || err)) } })
      }
      function start() {
        if (busy || running || !quote) return
        sequence.current++; setBusy(true); setError(''); setCancelling(false)
        props.api.modelDetection({ action: 'start', sessionId: sessionId, planId: quote.id, ackCost: true }).then(function (body) {
          if (mounted.current) { setJob(body.job); setQuoted(null); setBusy(false) }
        }).catch(function (err) { if (mounted.current) { setError(String(err.message || err)); setBusy(false); setQuoted(null) } })
      }
      function cancel() {
        if (!job || cancelling) return
        setCancelling(true); setError('')
        props.api.modelDetection({ action: 'cancel', id: job.id }).then(function (body) { if (mounted.current) { setJob(body.job); if (body.job.status !== 'running') setCancelling(false) } })
          .catch(function (err) { if (mounted.current) { setError(String(err.message || err)); setCancelling(false) } })
      }
      function updateEngine() {
        setUpdating(true); setError('')
        props.api.modelFingerprintEngine({ action: 'update' }).then(function (body) { if (mounted.current) setCatalog(body) })
          .catch(function (err) { if (mounted.current) setError(String(err.message || err)) })
          .finally(function () { if (mounted.current) setUpdating(false) })
      }
      function fields(config) {
        return React.createElement('dl', { className: 'dshus-detection-fields' }, [['供应商', config.provider], ['请求模型', config.model], ['推理强度', config.reasoningEffort || t('供应商默认')]].map(function (entry) {
          return React.createElement('div', { key: entry[0] }, React.createElement('dt', null, t(entry[0])), React.createElement('dd', null, entry[1]))
        }))
      }
      function selectProvider(value) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: value, model: '' })
      }
      function selectModel(value) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: provider, model: value })
      }
      function field(label, element) { return React.createElement('label', { className: 'dshus-detection-field' }, React.createElement('span', { className: 'dshus-setting-label' }, t(label)), element) }
      function probability(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—' }
      function stateBadge() {
        var state = running ? { key: 'running', label: '检测运行中' }
          : job && resultMatchesSetup ? job.status === 'cancelled' ? { key: 'cancelled', label: '已取消' } : job.status === 'failed' ? { key: 'failed', label: '未完成' } : { key: 'complete', label: '检测已结束' }
          : quote ? { key: 'ready', label: '待开始' }
          : selectedReady ? { key: 'confirm', label: '确认预算' }
          : { key: 'setup', label: '待配置' }
        return React.createElement('span', { className: 'dshus-detection-state', 'data-state': state.key, role: 'status' }, t(state.label))
      }
      function engineView() {
        var checking = updating || !!(catalog && catalog.updating)
        return React.createElement('div', { className: 'dshus-detection-engine' },
          React.createElement('div', { className: 'dshus-detection-engine-info' },
            React.createElement('span', { className: 'dshus-detection-engine-label' }, t('参考库')),
            React.createElement('span', { className: 'dshus-detection-engine-version' },
              catalog ? 'lmfpd ' + (catalog.version || '—') + (Number.isFinite(catalog.modelCount) ? ' · ' + t('{count} 个模型', { count: catalog.modelCount }) : '') : '—')),
          React.createElement('button', {
            type: 'button', className: 'dshus-btn dshus-icon-btn dshus-detection-engine-update',
            disabled: checking || running || busy, onClick: updateEngine,
            'aria-label': t(checking ? '正在检查更新…' : '检查更新'), 'data-dshus-tip': t(checking ? '正在检查更新…' : '检查更新'),
          }, checking ? React.createElement('span', { className: 'dshus-spin', 'aria-hidden': true })
            : React.createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              React.createElement('path', { d: 'M13 8a5 5 0 1 1-1.46-3.54M13 2.5V5H10.5' }))),
          // Update failures are transient and the verified local engine remains
          // usable, so only a fatal engine problem is surfaced in the panel.
          catalog && catalog.warning && catalog.warningKind !== 'update' && React.createElement('p', { className: 'dshus-detection-engine-error', role: 'alert' }, uiError(catalog.warning)))
      }
      function samplesView(results, plan, validSamples) {
        var labels = { scored: '有效', incomplete: '输出截断', unparseable: '格式无效', unavailable: '请求失败', timeout: '超时', cancelled: '已取消', sampling: '采样中', pending: '未采样' }
        var total = plan.requests || 3
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshus-detection-list-title' },
            React.createElement('h4', null, t('采样状态')),
            React.createElement('span', null, t('有效样本 {valid} / {total}', { valid: validSamples, total: total }))),
          React.createElement('ol', { className: 'dshus-detection-samples', 'aria-label': t('有效样本 {valid} / {total}', { valid: validSamples, total: total }), 'data-count': total }, Array.from({ length: total }, function (_, index) {
            var item = results[index], outcome = item ? item.outcome : running && index === results.length && job.phase !== 'scoring' ? 'sampling' : 'pending'
            var expected = item ? item.expected : plan.numbers && plan.numbers[index]
            var count = (item ? fmtExact(item.valid || 0) : '—') + ' / ' + (expected ? fmtExact(expected) : '—')
            var label = t(labels[outcome] || '未采样')
            return React.createElement('li', {
              key: index, className: 'dshus-detection-sample', 'data-outcome': outcome,
              'data-dshus-tip': t('采样 {number}', { number: index + 1 }) + ' · ' + label + ' · ' + count,
            },
              React.createElement('span', { className: 'dshus-detection-sample-index', 'aria-hidden': true }, index + 1),
              React.createElement('strong', null, label),
              React.createElement('span', { className: 'dshus-detection-sample-count' }, count))
          })))
      }
      function jobView() {
        var historical = !running && !resultMatchesSetup
        var identity = job.identity, candidates = identity && identity.candidates || []
        var summary = job.conclusion || { verdict: running ? 'running' : 'inconclusive', reason: job.status === 'cancelled' ? 'cancelled' : 'unfinished' }
        var titles = { running: '检测运行中', 'candidate-consistent': '首选候选与请求模型一致', 'candidate-different': '首选候选与请求模型不同', 'ranking-only': '候选排序', inconclusive: '无法判定' }
        var explanations = { 'model-not-enrolled': '请求模型不在参考库中，候选仅供比较。', 'merged-class': '参考库将这些型号合并为同一类，无法区分具体型号。', 'low-confidence': '置信度不足，候选仅供比较。', cancelled: '检测已取消，已发生的用量仍会统计。', interrupted: '宿主重启时检测尚未完成，请重新检测。', budget: '已达到 Token 预算，检测未完成。', timeout: '请求超时，检测未完成。', 'request-failed': '通道请求失败，检测未完成。', truncated: '随机数输出被截断；请提高单次输出上限，重新查看预算后检测。', format: '有效随机数不足，已停止后续请求。', distribution: '随机数分布异常，本次结果无法判定。', unfinished: '尚未取得足够指纹数据，无法判定。' }
        // Only reasons that describe what happened to the run get a visible
        // line. Ranking disclaimers stay in the tooltip and details disclosure.
        var actionable = { cancelled: true, interrupted: true, budget: true, timeout: true, 'request-failed': true, truncated: true, format: true, distribution: true, unfinished: true }
        var calibrated = !!(identity && identity.usedSamples === 3 && !identity.unusualDistribution && Number.isFinite(identity.probability))
        var results = job.results || [], plan = job.plan || {}, validSamples = results.filter(function (item) { return item.outcome === 'scored' }).length
        var totalRequests = plan.requests || 3, progress = Math.max(0, Math.min(totalRequests, job.progress || 0))
        var perRequestLimit = plan.maxTokens || plan.maxOutputTokens && plan.requests && plan.maxOutputTokens / plan.requests
        var providerName = providers.find(function (item) { return item.provider === job.selection.provider })
        var usage = job.usage || {}, jobTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
        var reason = explanations[summary.reason]
        var lowConfidence = calibrated && identity.probability < .75
        var showReason = reason && actionable[summary.reason] && !(running && summary.reason === 'unfinished')
        return React.createElement('section', { className: 'dshus-module dshus-detection-result', role: 'region', 'aria-label': t('检测结果'), ref: resultRef },
          React.createElement('div', { className: 'dshus-detection-result-head' },
            React.createElement('h3', { 'data-dshus-tip': historical ? t('历史结果，仅对应下方列出的模型和参数。') : undefined }, t(historical ? '上次检测结果' : '检测结果')),
            React.createElement('span', { className: 'dshus-detection-verdict', 'data-verdict': summary.verdict, role: 'status', 'data-dshus-tip': reason ? t(reason) : undefined }, t(titles[summary.verdict] || '无法判定'))),
          React.createElement('p', { className: 'dshus-detection-subject' }, job.selection.model, ' · ', providerName ? providerName.name : job.selection.provider),
          showReason && React.createElement('p', { className: 'dshus-detection-reason', 'data-tone': summary.reason === 'cancelled' ? 'muted' : 'warn' }, t(reason)),
          candidates.length > 0 && React.createElement('div', { className: 'dshus-detection-headline' },
            React.createElement('div', { className: 'dshus-detection-candidate' },
              React.createElement('span', { className: 'dshus-detection-kicker' }, t('首选候选')),
              React.createElement('h4', { 'aria-label': t('首选候选') }, candidates[0].name),
              candidates[0].family && React.createElement('span', { className: 'dshus-detection-family' }, candidates[0].family)),
            calibrated && React.createElement('div', { className: 'dshus-detection-confidence', 'data-low': lowConfidence || undefined },
              React.createElement('span', null, t('库内置信度')),
              React.createElement('strong', null, probability(identity.probability)),
              lowConfidence && React.createElement('span', { className: 'dshus-detection-confidence-tag' }, t('低置信度')))),
          running && React.createElement('div', { className: 'dshus-detection-progress' },
            React.createElement('div', { className: 'dshus-detection-progress-head' },
              React.createElement('p', { role: 'status' }, job.phase === 'scoring' ? t('正在分析指纹…') : t('已完成 {progress} 次请求，上限 {requests} 次', { progress: progress, requests: totalRequests })),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: cancelling, onClick: cancel }, t(cancelling ? '正在取消…' : '取消检测'))),
            React.createElement('progress', { max: totalRequests, value: progress, 'aria-label': t('检测进度') })),
          candidates.length > 0 && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'dshus-detection-list-title' }, React.createElement('h4', null, t('候选排名')), React.createElement('span', null, t(calibrated ? '库内置信度' : '指纹得分'))),
            React.createElement('ol', { className: 'dshus-detection-rankings', 'aria-label': t('候选排名') }, candidates.map(function (candidate, index) {
              return React.createElement('li', { key: candidate.id, className: 'dshus-detection-rank', 'data-unscored': calibrated ? undefined : true },
                React.createElement('span', { 'aria-hidden': true }, index + 1),
                React.createElement('span', { className: 'dshus-detection-rank-name' }, candidate.name, candidate.family && React.createElement('small', null, candidate.family)),
                calibrated && React.createElement('div', { className: 'dshus-detection-bar', 'aria-hidden': true }, React.createElement('span', { style: { width: (Number.isFinite(candidate.probability) ? Math.max(0, Math.min(1, candidate.probability)) * 100 : 0) + '%' } })),
                React.createElement('span', { className: 'dshus-detection-rank-value', 'aria-label': t(calibrated ? '库内置信度' : '指纹得分') }, calibrated ? probability(candidate.probability) : Number(candidate.score).toFixed(3)))
            }))),
          samplesView(results, plan, validSamples),
          job.usageReported && React.createElement('p', { className: 'dshus-detection-cost', 'data-dshus-tip': fmtExact(jobTokens) }, t(job.usageSaved ? '本次消耗 {tokens} Token · 已计入统计' : '本次已上报消耗 {tokens} Token', { tokens: fmt(jobTokens) })),
          job.usageIncomplete && React.createElement('p', { className: 'dshus-detection-cost-alert', role: 'status' }, t('部分检测用量尚未上报，可能已产生费用。')),
          job.message && React.createElement('p', { className: 'dshus-detection-message', role: 'alert' }, uiError(job.message)),
          React.createElement('details', { className: 'dshus-disclosure', key: job.id },
            React.createElement('summary', null, t('检测详情')),
            reason && !running && React.createElement('p', null, t(reason)),
            fields(job.testSelection || job.selection),
            React.createElement('p', null, t('已完成 {progress} 次请求，上限 {requests} 次', { progress: job.progress, requests: job.plan.requests })),
            perRequestLimit && React.createElement('p', null, t('每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token', { maxTokens: fmtExact(perRequestLimit), maxOutputTokens: fmtExact(plan.maxOutputTokens) })),
            plan.budgetTokens && React.createElement('p', null, t('已上报 Token 预算'), ' · ', fmtExact(plan.budgetTokens)),
            job.engine && React.createElement('p', { className: 'dshus-setting-help' }, 'lmfpd ', job.engine.version, ' · ', String(job.engine.builtAt || '').slice(0, 10)),
            candidates.length > 0 && React.createElement('div', { className: 'dshus-table-wrap' }, React.createElement('table', { className: 'dshus-table' },
              React.createElement('thead', null, React.createElement('tr', null, ['候选模型', '指纹得分', '库内置信度'].map(function (label) { return React.createElement('th', { key: label, scope: 'col' }, t(label)) }))),
              React.createElement('tbody', null, candidates.map(function (candidate) { return React.createElement('tr', { key: candidate.id }, React.createElement('td', null, candidate.name), React.createElement('td', null, Number(candidate.score).toFixed(3)), React.createElement('td', null, probability(calibrated ? candidate.probability : null))) })))),
            job.channel && React.createElement('p', null, t('本次通道表现'), ' · TPS ', Number.isFinite(job.channel.tps) ? job.channel.tps.toFixed(1) : '—', ' tok/s · TTFT ', Number.isFinite(job.channel.ttftMs) ? (job.channel.ttftMs / 1000).toFixed(2) + ' s' : '—')))
      }
      return React.createElement('div', { className: 'dshus-detection-panel' },
        React.createElement('div', { className: 'dshus-detection-layout' },
          React.createElement('section', { className: 'dshus-module dshus-detection-setup', 'aria-labelledby': 'dshus-detection-setup-heading' },
            React.createElement('div', { className: 'dshus-detection-card-head' },
              React.createElement('h3', { id: 'dshus-detection-setup-heading' }, t('模型检测')),
              stateBadge()),
            React.createElement('div', { className: 'dshus-detection-form' },
              field('检测供应商', React.createElement(SelectField, {
                id: 'dshus-detection-provider', variant: 'field', block: true,
                'aria-label': t('检测供应商'),
                value: provider,
                disabled: busy || running || providersLoading,
                options: [{ value: '', name: t(providersLoading ? '正在加载供应商…' : providers.length ? '选择已有供应商' : '没有已配置的供应商') }]
                  .concat(providers.map(function (item) { return { value: item.provider, name: item.name } })),
                onChange: selectProvider,
              })),
              field('检测模型', React.createElement(SelectField, {
                id: 'dshus-detection-model', variant: 'field', block: true,
                'aria-label': t('检测模型'),
                value: model,
                disabled: busy || running || modelsLoading || !provider,
                options: [{ value: '', name: t(modelsLoading ? '正在加载模型…' : models.length ? '选择检测模型' : '没有可用模型') }]
                  .concat(models.map(function (item) { return { value: item.id, name: item.name } })),
                onChange: selectModel,
              }))),
            React.createElement('div', { className: 'dshus-detection-form dshus-detection-limits' },
              field('采样次数', React.createElement(SelectField, {
                id: 'dshus-detection-samples', variant: 'field', block: true,
                'aria-label': t('采样次数'),
                value: count,
                disabled: busy || running,
                options: [{ value: 3, name: t('标准检测（3 次）') }, { value: 1, name: t('低耗初筛（1 次，仅排序）') }],
                onChange: function (value) { setCount(Number(value)) },
              })),
              field('单次输出上限', React.createElement('input', { id: 'dshus-detection-output-limit', type: 'number', className: 'dshus-field', min: 1024, max: 16384, step: 1, value: maxTokens, disabled: busy || running, onChange: function (event) { setMaxTokens(Number(event.target.value)) } })),
              field('Token 预算', React.createElement('input', { id: 'dshus-detection-budget', type: 'number', className: 'dshus-field', min: 1024, max: 50000, step: 1, value: budget, disabled: busy || running, onChange: function (event) { setBudget(Number(event.target.value)) } }))),
            error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
            !quote && !running && React.createElement('div', { className: 'dshus-detection-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary dshus-detection-primary', onClick: preview, disabled: busy || running || !selectedReady || !catalog }, t(busy ? '正在处理…' : '查看检测预算'))),
            quote && !running && React.createElement('div', { className: 'dshus-detection-quote', role: 'status' },
              React.createElement('span', { className: 'dshus-detection-quote-title' }, t('检测预算')),
              React.createElement('dl', { className: 'dshus-detection-quote-metrics' },
                [['请求次数', quote.plan.requests], ['Token 预算', quote.plan.budgetTokens], ['输入预估', quote.plan.estimatedInputTokens], ['输出上限', quote.plan.maxOutputTokens]].map(function (entry) {
                  return React.createElement('div', { key: entry[0] },
                    React.createElement('dt', null, t(entry[0])),
                    React.createElement('dd', null, Number.isFinite(Number(entry[1])) ? fmtExact(Number(entry[1])) : '—'))
                })),
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary dshus-detection-primary', onClick: start, disabled: busy || !quote }, t('开始检测（会消耗 Token）')),
              React.createElement('details', { className: 'dshus-detection-quote-details', key: quote.id },
                React.createElement('summary', null, t('本次检测参数')),
                fields(quote.testSelection),
                React.createElement('p', null, t('每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token', { maxTokens: fmtExact(quote.plan.maxTokens), maxOutputTokens: fmtExact(quote.plan.maxOutputTokens) })))),
            engineView()),
          job ? jobView() : React.createElement('section', { className: 'dshus-module dshus-detection-result dshus-detection-empty', role: 'region', 'aria-label': t('检测结果') },
            React.createElement('div', { className: 'dshus-detection-result-head' }, React.createElement('h3', null, t('检测结果'))),
            React.createElement('div', { className: 'dshus-detection-empty-body' },
              React.createElement('div', { className: 'dshus-detection-empty-mark', 'aria-hidden': true },
                React.createElement('svg', { viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
                  React.createElement('path', { d: 'M8 24h6M34 24h6M24 8v6M24 34v6' }),
                  React.createElement('circle', { cx: 24, cy: 24, r: 10 }),
                  React.createElement('circle', { cx: 24, cy: 24, r: 2, fill: 'currentColor', stroke: 'none' }))),
              React.createElement('p', { className: 'dshus-detection-empty-title' }, t('尚未检测本模型'))))))
    }

function TokenSpeedRanking(props) {
      var expandedState = React.useState(false)
      var expanded = expandedState[0], setExpanded = expandedState[1]
      var speeds = (props.speeds || []).filter(function (item) { return Number.isFinite(item.tokensPerSecond) && item.tokensPerSecond >= 0 && item.samples > 0 })
        .slice().sort(function (a, b) { return b.tokensPerSecond - a.tokensPerSecond || b.samples - a.samples || String(a.key).localeCompare(String(b.key)) })
      var visible = expanded ? speeds : speeds.slice(0, 8)
      return React.createElement('section', { className: 'dshus-module dshus-speed-module', 'aria-labelledby': 'dshus-speed-heading' },
        React.createElement('h3', { id: 'dshus-speed-heading' }, t('token输出速度')),
        speeds.length > 0 && React.createElement('div', { className: 'dshus-speed-head' },
          React.createElement('span', { style: { gridColumn: 'span 2' }, 'aria-hidden': true }),
          React.createElement('span', null, 'TPS (tok/s)'),
          React.createElement('span', { 'data-dshus-tip': t('平均首 Token 耗时') }, 'TTFT (s)')),
        speeds.length ? React.createElement('ol', { className: 'dshus-speed-list' }, visible.map(function (item, index) {
          var tps = item.tokensPerSecond >= 10 ? String(Math.round(item.tokensPerSecond)) : String(Math.round(item.tokensPerSecond * 10) / 10)
          var ttft = Number.isFinite(item.averageTtftMs) && item.averageTtftMs >= 0 ? (item.averageTtftMs / 1000).toFixed(1) : '—'
          return React.createElement('li', { key: item.key, className: 'dshus-speed-row', 'data-model-key': item.key },
            React.createElement('span', { className: 'dshus-speed-rank', 'aria-hidden': true }, index + 1),
            React.createElement('div', { className: 'dshus-speed-model' }, item.model,
              React.createElement('div', { className: 'dshus-speed-meta' }, item.provider)),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TPS: ' + tps + ' tok/s', 'data-dshus-tip': t('{tokens} 个输出 Token · {seconds} 秒', { tokens: fmtExact(item.outputTokens), seconds: (item.outputMs / 1000).toFixed(3) }) }, tps),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TTFT: ' + ttft + (ttft === '—' ? '' : ' s'), 'data-dshus-tip': t(ttft === '—' ? '暂无 TTFT 数据' : '平均首 Token 耗时') }, ttft))
        })) : React.createElement('p', { className: 'dshus-muted', role: 'status' }, t(props.loading ? '加载中…' : '暂无速度数据')),
        speeds.length > 8 && React.createElement('button', { type: 'button', className: 'dshus-btn', 'aria-expanded': expanded, onClick: function () { setExpanded(!expanded) } }, t(expanded ? '收起速度排名' : '展开全部速度排名（{count}）', { count: speeds.length })))
    }

function fmtTaskDuration(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      var seconds = Math.round(ms / 1000)
      if (seconds >= 86400) return t('{days}天 {hours}小时', { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600) })
      if (seconds >= 3600) return t('{hours}小时 {minutes}分', { hours: Math.floor(seconds / 3600), minutes: Math.floor(seconds % 3600 / 60) })
      if (seconds >= 60) return t('{minutes}分 {seconds}秒', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
      return t('{seconds}秒', { seconds: seconds })
    }

function OverviewDetails(props) {
      var overview = props.overview
      if (!overview) return React.createElement('p', { className: 'dshus-setting-help' }, t('暂无数据'))
      var favorite = overview.recentModel
      var entries = [
        ['缓存命中率', Number.isFinite(overview.cacheHitRate) ? (overview.cacheHitRate * 100).toFixed(1) + '%' : '—', t('缓存读取占全部输入的比例')],
        ['Token 使用峰值', overview.peakDay ? fmt(overview.peakDailyBilled) : '—', overview.peakDay ? overview.peakDay + ' · ' + fmtExact(overview.peakDailyBilled) + ' Token' : t('暂无数据')],
        ['最长任务时长', fmtTaskDuration(overview.longestTaskMs), t('有完整起止记录的已结束单轮任务，包含工具调用和等待。')],
        ['当前连续天数', t('{days} 天', { days: overview.currentStreak || 0 }), t('今日尚未使用时，延续至昨日的连续记录。')],
        ['最长使用天数', t('{days} 天', { days: overview.longestStreak || 0 }), t('历史最长连续使用天数')],
        ['最近常使用模型', favorite ? favorite.model : '—', favorite ? t('近 7 天调用 {calls} 次 · {providers}', { calls: fmtExact(favorite.calls), providers: (favorite.providers || []).join(' · ') }) : t('暂无数据')],
      ]
      return React.createElement('dl', { className: 'dshus-overview-grid' }, entries.map(function (entry, index) {
        return React.createElement('div', { key: entry[0] }, React.createElement('dt', null, t(entry[0])),
          React.createElement('dd', { 'data-dshus-tip': entry[2], className: index === 5 ? 'dshus-favorite-model' : undefined }, entry[1]))
      }))
    }

function logTableHead() {
      return React.createElement('thead', null,
        React.createElement('tr', null,
          ['时间', '应用', '供应商', '模型', '成本', '新增输入', '输出', '缓存命中', '速度', '首字'].map(function (label) {
            return React.createElement('th', { key: label }, t(label))
          }),
        ),
      )
    }

function logRowElement(row, index) {
      var title = row.detection ? t('模型检测') : (row.title || '—')
      var speed = typeof row.tokensPerSecond === 'number' && row.tokensPerSecond > 0 ? '≈' + row.tokensPerSecond.toFixed(1) + ' tok/s' : '—'
      var ttft = typeof row.ttftMs === 'number' ? '≈' + (row.ttftMs / 1000).toFixed(1) + 's' : '—'
      var numCell = function (value, key) {
        return React.createElement('td', { key: key, className: 'dshus-log-num', 'data-dshus-tip': fmtExact(value) }, fmt(value))
      }
      return React.createElement('tr', { key: String(row.time) + '-' + index },
        React.createElement('td', { className: 'dshus-log-time' }, fmtInTz(row.time, LOCAL_TZ)),
        React.createElement('td', { className: 'dshus-log-app', 'data-dshus-tip': title }, title),
        React.createElement('td', null, row.provider),
        React.createElement('td', { className: 'dshus-log-model', 'data-dshus-tip': row.rawModel || row.model }, row.model),
        React.createElement('td', { className: 'dshus-log-num dshus-log-cost' }, fmtCost(row.cost)),
        numCell(row.inputTokens, 'in'),
        numCell(row.outputTokens, 'out'),
        numCell(row.cacheReadTokens, 'cache'),
        React.createElement('td', { className: 'dshus-log-num' }, speed),
        React.createElement('td', { className: 'dshus-log-num' }, ttft),
      )
    }

function LogsPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var modelState = React.useState('')
      var model = modelState[0], setModel = modelState[1]
      var pageState = React.useState(1)
      var page = pageState[0], setPage = pageState[1]
      var pageSizeState = React.useState(10)
      var pageSize = pageSizeState[0], setPageSize = pageSizeState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)

      function load(fresh, nextPage, nextProvider, nextModel, nextPageSize) {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.logs({ provider: nextProvider, model: nextModel, page: nextPage, pageSize: nextPageSize, fresh: fresh })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }
      React.useEffect(function () {
        if (!active) return
        load(false, page, provider, model, pageSize)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, page, provider, model, pageSize])

      var providers = (data && data.providers) || []
      var models = (data && data.models) || []
      var rows = (data && data.rows) || []
      var pages = (data && data.pages) || 1
      var currentPage = (data && data.page) || page
      var rowEls = rows.map(logRowElement)

      return React.createElement('div', { className: 'dshus-module dshus-logs-module' },
        React.createElement('div', { className: 'dshus-logs-toolbar' },
          React.createElement(SelectField, {
            id: 'dshus-logs-provider', variant: 'field',
            'aria-label': t('供应商'),
            value: provider,
            options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
            onChange: function (value) { setPage(1); setProvider(value) },
          }),
          React.createElement(SelectField, {
            id: 'dshus-logs-model', variant: 'field',
            'aria-label': t('模型'),
            value: model,
            options: [{ value: '', name: t('全部模型') }].concat(models.map(function (name) { return { value: name, name: name } })),
            onChange: function (value) { setPage(1); setModel(value) },
          }),
          React.createElement(SelectField, {
            id: 'dshus-logs-page-size', variant: 'field',
            'aria-label': t('每页行数'),
            value: pageSize,
            options: [10, 20, 50, 100].map(function (size) { return { value: size, name: t('{count} 条/页', { count: size }) } }),
            onChange: function (value) { setPage(1); setPageSize(Number(value)) },
          }),
          React.createElement('span', { className: 'dshus-muted' }, t('共 {count} 条', { count: data ? data.total : 0 })),
          refreshIconButton(function () { load(true, page, provider, model, pageSize) }, loading, t('刷新请求日志'), true),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-table-wrap' },
          React.createElement('table', { className: 'dshus-table dshus-logs-table' },
            logTableHead(),
            React.createElement('tbody', null,
              rowEls.length > 0 ? rowEls : data && React.createElement('tr', null,
                React.createElement('td', { colSpan: 10, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无请求记录')),
              ),
            ),
          ),
        ),
        pages > 1 && React.createElement('div', { className: 'dshus-pager' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage <= 1 || loading, onClick: function () { setPage(currentPage - 1) } }, t('上一页')),
          React.createElement('span', { className: 'dshus-muted' }, t('第 {page} / {pages} 页', { page: currentPage, pages: pages })),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage >= pages || loading, onClick: function () { setPage(currentPage + 1) } }, t('下一页')),
        ),
      )
    }

/* ------------------------------------------------------------------ */
/* Sidebar dashboard                                                   */
/* ------------------------------------------------------------------ */

var dashboardOpen = false
var dashboardListeners = new Set()

function setDashboardOpen(open) {
      if (dashboardOpen === open) return
      dashboardOpen = open
      dashboardListeners.forEach(function (listener) { listener(open) })
    }

function useDashboardOpen() {
      var state = React.useState(dashboardOpen)
      React.useEffect(function () {
        var listener = function (value) { state[1](value) }
        dashboardListeners.add(listener)
        return function () { dashboardListeners.delete(listener) }
      }, [])
      return state[0]
    }

function usageChartIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M4 20h16M7 20v-8M12 20V5M17 20v-5' }))
    }

function UsageDashboardTrigger(props) {
      useLocaleRevision()
      var open = useDashboardOpen()
      var wide = props.wide !== false
      return React.createElement('button', {
        type: 'button',
        className: 'dshus-footer-action' + (wide ? '' : ' dshus-footer-action-rail'),
        onClick: function () { setDashboardOpen(true) },
        'data-dshus-tip': t('用量统计'),
        'aria-label': t('用量统计'),
        'aria-haspopup': 'dialog',
        'aria-expanded': open ? 'true' : undefined,
      },
        usageChartIcon(wide ? 16 : 18),
        wide && React.createElement('span', { className: 'dshus-footer-action-label' }, t('用量统计')),
      )
    }

function dashboardSyncLabel(syncedAt) {
      if (!syncedAt) return ''
      var age = Date.now() - Number(syncedAt)
      return age >= 0 && age < 60000 ? t('刚刚同步') : t('同步于 {time}', { time: fmtFetched(syncedAt) })
    }

var DASHBOARD_RANGES = [
      ['today', '当天'],
      ['24h', '近 24 小时'],
      ['7d', '近 7 天'],
      ['14d', '近 14 天'],
      ['30d', '近 30 天'],
      ['all', '全部'],
    ]

var DASHBOARD_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function dashboardPad(value) {
      return String(value).padStart(2, '0')
    }

function dashboardStartOfDay(time) {
      var date = new Date(time)
      date.setHours(0, 0, 0, 0)
      return date.getTime()
    }

function dashboardRange(preset, now) {
      var end = typeof now === 'number' ? now : Date.now()
      if (preset === 'all') return { preset: 'all', from: 0, to: 0 }
      if (preset === '24h') return { preset: preset, from: end - 86400000, to: end }
      var days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 1
      var start = new Date(dashboardStartOfDay(end))
      start.setDate(start.getDate() - (days - 1))
      return { preset: preset, from: start.getTime(), to: end }
    }

function dashboardDateValue(ms) {
      var date = new Date(ms)
      return date.getFullYear() + '-' + dashboardPad(date.getMonth() + 1) + '-' + dashboardPad(date.getDate())
    }

function dashboardTimeValue(ms) {
      var date = new Date(ms)
      return dashboardPad(date.getHours()) + ':' + dashboardPad(date.getMinutes())
    }

function dashboardRangeShort(ms) {
      var date = new Date(ms)
      return dashboardPad(date.getMonth() + 1) + '/' + dashboardPad(date.getDate()) + ' ' + dashboardTimeValue(ms)
    }

function dashboardRangeLabel(range) {
      if (range.preset !== 'custom') {
        for (var i = 0; i < DASHBOARD_RANGES.length; i++) {
          if (DASHBOARD_RANGES[i][0] === range.preset) return t(DASHBOARD_RANGES[i][1])
        }
      }
      return dashboardRangeShort(range.from) + ' — ' + dashboardRangeShort(range.to)
    }

function dashboardCombine(dateValue, timeValue) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return NaN
      var date = String(dateValue).split('-'), time = String(timeValue || '00:00').split(':')
      var combined = new Date(Number(date[0]), Number(date[1]) - 1, Number(date[2]), Number(time[0]) || 0, Number(time[1]) || 0, 0, 0)
      return combined.getTime()
    }

function dashboardDaySpan(from, to) {
      return Math.max(1, Math.round((dashboardStartOfDay(to) - dashboardStartOfDay(from)) / 86400000) + 1)
    }

function dashboardCalendarCells(year, month) {
      var first = new Date(year, month, 1)
      var start = new Date(year, month, 1 - first.getDay())
      var cells = []
      for (var index = 0; index < 42; index++) {
        var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
        cells.push({ key: dashboardDateValue(date.getTime()), date: dashboardDateValue(date.getTime()), day: date.getDate(), current: date.getMonth() === month })
      }
      return cells
    }

function calendarIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 3 }),
        React.createElement('path', { d: 'M8 3v4M16 3v4M3 10h18' }))
    }

function chevronDownIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M6 9l6 6 6-6' }))
    }

var COST_RANGES = [
      ['today', '当天'],
      ['7d', '近 7 天'],
      ['14d', '近 14 天'],
      ['30d', '近 30 天'],
      ['month', '本月'],
    ]

function costPresetRange(preset) {
      var now = new Date()
      var to = dashboardDateValue(now.getTime())
      if (preset === 'month') {
        return { preset: 'month', from: dashboardDateValue(new Date(now.getFullYear(), now.getMonth(), 1).getTime()), to: to }
      }
      var days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 1
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
      return { preset: preset, from: dashboardDateValue(start.getTime()), to: to }
    }

function dayRangeShort(day) {
      return String(day).slice(5, 7) + '/' + String(day).slice(8, 10)
    }

function costRangeLabel(range) {
      for (var i = 0; i < COST_RANGES.length; i++) {
        if (COST_RANGES[i][0] === range.preset) return t(COST_RANGES[i][1])
      }
      return dayRangeShort(range.from) + ' — ' + dayRangeShort(range.to)
    }

function dayRangeSummary(from, to) {
      var span = dashboardDaySpan(dashboardCombine(from, '00:00'), dashboardCombine(to, '00:00'))
      return dayRangeShort(from) + ' — ' + dayRangeShort(to) + ' · ' + t('{days} 天', { days: span })
    }

/** Day-granularity range picker, matching the sidebar dashboard's picker. */
function DayRangePicker(props) {
      var value = props.value
      var idPrefix = props.idPrefix || 'dshus-day-range'
      var openState = React.useState(false)
      var open = openState[0], setOpen = openState[1]
      var draftState = React.useState(null)
      var draft = draftState[0], setDraft = draftState[1]
      var rootRef = React.useRef(null)

      function startDraft(preset, from, to) {
        var startDate = new Date(dashboardCombine(from, '00:00'))
        return { preset: preset, dateFrom: from, dateTo: to, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth() }
      }
      function openPicker() {
        setDraft(startDraft(value.preset, value.from, value.to))
        setOpen(true)
      }
      function choosePreset(preset) {
        var next = costPresetRange(preset)
        setDraft(startDraft(preset, next.from, next.to))
      }
      function editDate(field, next) {
        setDraft(function (previous) {
          if (!previous) return previous
          var updated = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') updated.dateFrom = next
          else updated.dateTo = next
          var parts = String(next).split('-')
          if (parts.length === 3) { updated.year = Number(parts[0]); updated.month = Number(parts[1]) - 1 }
          return updated
        })
      }
      function pickDay(day) {
        setDraft(function (previous) {
          if (!previous) return previous
          var updated = Object.assign({}, previous, { preset: 'custom' })
          if (previous.active === 'to') updated.dateTo = day
          else updated.dateFrom = day
          var parts = day.split('-')
          updated.year = Number(parts[0]); updated.month = Number(parts[1]) - 1
          return updated
        })
      }
      function activateField(field) {
        setDraft(function (previous) {
          if (!previous) return previous
          return Object.assign({}, previous, { active: field })
        })
      }
      function shiftMonth(delta) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = new Date(previous.year, previous.month + delta, 1)
          return Object.assign({}, previous, { year: next.getFullYear(), month: next.getMonth() })
        })
      }
      function confirm() {
        if (!draft) return
        var from = String(draft.dateFrom || ''), to = String(draft.dateTo || '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return
        if (from > to) { var swap = from; from = to; to = swap }
        setOpen(false)
        props.onChange({ preset: draft.preset === 'custom' ? 'custom' : draft.preset, from: from, to: to })
      }
      React.useEffect(function () {
        if (!open) return
        function onPointerDown(event) {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        function onKeyDown(event) {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return function () {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      var cells = draft ? dashboardCalendarCells(draft.year, draft.month) : []
      var selectedDay = draft ? (draft.active === 'to' ? draft.dateTo : draft.dateFrom) : ''
      var validDraft = draft && /^\d{4}-\d{2}-\d{2}$/.test(String(draft.dateFrom)) && /^\d{4}-\d{2}-\d{2}$/.test(String(draft.dateTo))
      var summary = validDraft ? dayRangeSummary(draft.dateFrom, draft.dateTo) : ''

      return React.createElement('div', { className: 'dshus-range-wrap', ref: rootRef },
        React.createElement('button', {
          type: 'button', className: 'dshus-range-trigger', id: props.id,
          onClick: function () { if (open) setOpen(false); else openPicker() },
          'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : undefined,
        }, calendarIcon(15), React.createElement('span', null, costRangeLabel(value)), chevronDownIcon(14)),
        open && draft && React.createElement('div', { className: 'dshus-range-popover', role: 'dialog', 'aria-label': t('时间范围') },
          React.createElement('div', { className: 'dshus-range-presets' }, COST_RANGES.map(function (option) {
            return React.createElement('button', {
              type: 'button', key: option[0], className: 'dshus-range-preset',
              'data-active': draft.preset === option[0] ? '' : undefined,
              onClick: function () { choosePreset(option[0]) },
            }, t(option[1]))
          })),
          React.createElement('div', { className: 'dshus-range-body' },
            React.createElement('div', { className: 'dshus-range-fields' },
              React.createElement('p', { className: 'dshus-range-hint' }, t('选择起止日期，包含当天')),
              React.createElement('div', {
                className: 'dshus-range-field', 'data-active': draft.active === 'from' ? '' : undefined,
                onClick: function () { activateField('from') },
              },
                React.createElement('span', { className: 'dshus-range-label' }, t('开始日期')),
                React.createElement('div', { className: 'dshus-range-inputs' },
                  React.createElement('input', {
                    id: idPrefix + '-from', type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateFrom, 'aria-label': t('开始日期'),
                    onChange: function (event) { editDate('from', event.target.value) },
                  }))),
              React.createElement('div', {
                className: 'dshus-range-field', 'data-active': draft.active === 'to' ? '' : undefined,
                onClick: function () { activateField('to') },
              },
                React.createElement('span', { className: 'dshus-range-label' }, t('结束日期')),
                React.createElement('div', { className: 'dshus-range-inputs' },
                  React.createElement('input', {
                    id: idPrefix + '-to', type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateTo, 'aria-label': t('结束日期'),
                    onChange: function (event) { editDate('to', event.target.value) },
                  })))),
            React.createElement('div', { className: 'dshus-range-calendar' },
              React.createElement('div', { className: 'dshus-range-cal-head' },
                React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(-1) }, 'aria-label': t('上一页') }, '‹'),
                React.createElement('span', { className: 'dshus-range-cal-title' }, t('{year}年{month}月', { year: draft.year, month: draft.month + 1 })),
                React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(1) }, 'aria-label': t('下一页') }, '›')),
              React.createElement('div', { className: 'dshus-range-cal-week' }, ['日', '一', '二', '三', '四', '五', '六'].map(function (label) {
                return React.createElement('span', { key: label }, t(label))
              })),
              React.createElement('div', { className: 'dshus-range-cal-grid' }, cells.map(function (cell) {
                return React.createElement('button', {
                  type: 'button', key: cell.key, className: 'dshus-range-cal-day',
                  'data-muted': cell.current ? undefined : '', 'data-selected': selectedDay === cell.date ? '' : undefined,
                  onClick: function () { pickDay(cell.date) },
                }, cell.day)
              })))),
          React.createElement('div', { className: 'dshus-range-foot' },
            React.createElement('span', { className: 'dshus-range-summary' }, summary),
            React.createElement('div', { className: 'dshus-range-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setOpen(false) } }, t('取消')),
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary', onClick: confirm }, t('确定'))))))
    }

function dashboardMetricValue(point, metric) {
      if (metric === 'calls') return Number(point.calls) || 0
      if (metric === 'billed') return Number(point.billed) || 0
      if (metric === 'cache') return typeof point.cacheHitRate === 'number' ? point.cacheHitRate * 100 : null
      return Number(point.cost) || 0
    }

function dashboardMetricText(point, metric) {
      var value = dashboardMetricValue(point, metric)
      if (value === null) return '—'
      if (metric === 'calls') return fmtExact(value)
      if (metric === 'billed') return fmt(value) + ' Token'
      if (metric === 'cache') return value.toFixed(1) + '%'
      return fmtCost(value)
    }

function dashboardNiceMax(value) {
      if (!(value > 0)) return 0
      var base = Math.pow(10, Math.floor(Math.log10(value))), fraction = value / base
      var steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10]
      for (var index = 0; index < steps.length; index++) if (fraction <= steps[index]) return steps[index] * base
      return 10 * base
    }

function dashboardSeriesLabel(point, granularity) {
      if (granularity === 'hour') return dashboardPad(new Date(Number(point.key)).getHours()) + ':00'
      if (granularity === 'month') return point.key
      return point.key.slice(5)
    }

function dashboardCacheFloor(series) {
      var min = null
      for (var index = 0; index < series.length; index++) {
        var rate = series[index].cacheHitRate
        if (typeof rate !== 'number') continue
        if (min === null || rate < min) min = rate
      }
      if (min === null) return 0
      var pct = min * 100
      if (pct >= 90) return 90
      if (pct >= 75) return 75
      if (pct >= 50) return 50
      return 0
    }

function UsageDashboard(props) {
      useLocaleRevision()
      var api = props.api
      var open = useDashboardOpen()
      var dialogRef = React.useRef(null)
      var rangeAnchorRef = React.useRef(null)
      var rangeState = React.useState(function () { return dashboardRange('today') })
      var range = rangeState[0], setRange = rangeState[1]
      var rangeOpenState = React.useState(false)
      var rangeOpen = rangeOpenState[0], setRangeOpen = rangeOpenState[1]
      var draftState = React.useState(null)
      var draft = draftState[0], setDraft = draftState[1]
      var metricState = React.useState('cost')
      var metric = metricState[0], setMetric = metricState[1]
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var modelState = React.useState('')
      var model = modelState[0], setModel = modelState[1]
      var pageState = React.useState(1)
      var page = pageState[0], setPage = pageState[1]
      var pageSizeState = React.useState(10)
      var pageSize = pageSizeState[0], setPageSize = pageSizeState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)

      function load(fresh) {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.dashboard({
          all: range.preset === 'all',
          from: range.preset === 'all' ? 0 : range.from,
          to: range.preset === 'all' ? 0 : range.to,
          provider: provider, model: model, page: page, pageSize: pageSize, fresh: fresh,
        })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }

      React.useEffect(function () {
        if (!open) return
        load(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open, range.preset, range.from, range.to, provider, model, page, pageSize])

      React.useEffect(function () {
        var dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) {
          if (typeof dialog.showModal === 'function') dialog.showModal()
          else dialog.setAttribute('open', '')
        } else if (!open && dialog.open) dialog.close()
      }, [open])

      if (!open) return null

      function openPicker() {
        var now = Date.now()
        var base = range.preset === 'all'
          ? { preset: 'all', from: (data && data.earliest) || dashboardStartOfDay(now), to: now }
          : range.preset === 'custom' ? range : dashboardRange(range.preset, now)
        var start = base.from || dashboardStartOfDay(now), end = base.to || now
        var startDate = new Date(start)
        setDraft({
          preset: base.preset,
          dateFrom: dashboardDateValue(start), timeFrom: dashboardTimeValue(start),
          dateTo: dashboardDateValue(end), timeTo: dashboardTimeValue(end),
          follow: false, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth(),
        })
        setRangeOpen(true)
      }

      function choosePreset(preset) {
        var now = Date.now()
        var next = preset === 'all'
          ? { from: (data && data.earliest) || dashboardStartOfDay(now), to: now }
          : dashboardRange(preset, now)
        var startDate = new Date(next.from)
        setDraft({
          preset: preset,
          dateFrom: dashboardDateValue(next.from), timeFrom: dashboardTimeValue(next.from),
          dateTo: dashboardDateValue(next.to), timeTo: dashboardTimeValue(next.to),
          follow: false, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth(),
        })
      }

      function activateField(field) {
        setDraft(function (previous) {
          if (!previous) return previous
          var parts = String(field === 'from' ? previous.dateFrom : previous.dateTo).split('-')
          return Object.assign({}, previous, {
            active: field,
            year: parts.length === 3 ? Number(parts[0]) : previous.year,
            month: parts.length === 3 ? Number(parts[1]) - 1 : previous.month,
          })
        })
      }

      function editDate(field, value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') next.dateFrom = value
          else next.dateTo = value
          var parts = value.split('-')
          if (parts.length === 3) { next.year = Number(parts[0]); next.month = Number(parts[1]) - 1 }
          return next
        })
      }

      function editTime(field, value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') next.timeFrom = value
          else next.timeTo = value
          return next
        })
      }

      function toggleFollow(checked) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { follow: checked })
          if (checked) {
            var now = Date.now()
            next.dateTo = dashboardDateValue(now)
            next.timeTo = dashboardTimeValue(now)
            next.active = 'from'
          }
          return next
        })
      }

      function pickDay(value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom' })
          if (previous.active === 'to') next.dateTo = value
          else next.dateFrom = value
          var parts = value.split('-')
          next.year = Number(parts[0]); next.month = Number(parts[1]) - 1
          return next
        })
      }

      function shiftMonth(delta) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = new Date(previous.year, previous.month + delta, 1)
          return Object.assign({}, previous, { year: next.getFullYear(), month: next.getMonth() })
        })
      }

      function confirmRange() {
        if (!draft) return
        if (draft.preset === 'all') {
          setRange({ preset: 'all', from: 0, to: 0 })
          setRangeOpen(false)
          setPage(1)
          return
        }
        var from = dashboardCombine(draft.dateFrom, draft.timeFrom)
        var to = draft.follow ? Date.now() : dashboardCombine(draft.dateTo, draft.timeTo)
        if (!Number.isFinite(from) || !Number.isFinite(to)) { setError(t('时间范围无效。')); return }
        if (from > to) { var swap = from; from = to; to = swap }
        setRange({ preset: draft.preset === 'custom' ? 'custom' : draft.preset, from: from, to: to })
        setRangeOpen(false)
        setPage(1)
      }

      var totals = (data && data.totals) || null
      var series = (data && data.series) || []
      var heatmap = (data && data.heatmap) || null
      var granularity = data ? data.granularity : 'day'
      var rows = (data && data.rows) || []
      var providers = (data && data.providers) || []
      var models = (data && data.models) || []
      var currentPage = (data && data.page) || page
      var pages = (data && data.pages) || 1
      var total = data ? data.total : 0
      var cacheText = totals && typeof totals.cacheHitRate === 'number' ? (totals.cacheHitRate * 100).toFixed(1) + '%' : '—'
      var stats = [
        { key: 'cost', label: t('总成本'), value: totals ? fmtCost(totals.cost) : '—', exact: totals ? '$' + Number(totals.cost).toFixed(6) : '' },
        { key: 'calls', label: t('总请求数'), value: totals ? fmtExact(totals.calls) : '—', exact: totals ? fmtExact(totals.calls) : '' },
        { key: 'billed', label: t('真实消耗 Tokens'), value: totals ? fmt(totals.billed) : '—', exact: totals ? fmtExact(totals.billed) + ' Token' : '' },
        { key: 'cache', label: t('缓存命中率'), value: cacheText, exact: totals && typeof totals.cacheHitRate === 'number' ? (totals.cacheHitRate * 100).toFixed(2) + '%' : t('缓存读取占全部输入的比例') },
      ]

      var metricValues = []
      var metricMax = 0
      for (var valueIndex = 0; valueIndex < series.length; valueIndex++) {
        var metricValue = dashboardMetricValue(series[valueIndex], metric)
        metricValues.push(metricValue)
        if (metricValue !== null && metricValue > metricMax) metricMax = metricValue
      }
      var cacheFloor = metric === 'cache' ? dashboardCacheFloor(series) : 0
      var axisMax = metric === 'cache' ? 100 : dashboardNiceMax(metricMax)
      var axisTicks = metric === 'cache'
        ? [100, Math.round((cacheFloor + 100) / 2), cacheFloor]
        : [axisMax, axisMax / 2, 0]
      var axisText = function (tick) {
        if (metric === 'cache') return Math.round(tick) + '%'
        if (metric === 'calls') return fmtExact(tick)
        if (metric === 'billed') return fmt(tick)
        return fmtCost(tick)
      }
      var labelStep = Math.max(1, Math.ceil(series.length / 31))
      var metricLabel = metric === 'calls' ? t('请求数') : metric === 'billed' ? t('Tokens') : metric === 'cache' ? t('缓存命中率') : t('成本')
      var granularityLabel = granularity === 'hour' ? t('按小时') : granularity === 'month' ? t('按月') : t('按天')

      var draftSummary = ''
      if (draft) {
        if (draft.preset === 'all') draftSummary = t('全部')
        else {
          var draftFrom = dashboardCombine(draft.dateFrom, draft.timeFrom)
          var draftTo = draft.follow ? Date.now() : dashboardCombine(draft.dateTo, draft.timeTo)
          if (Number.isFinite(draftFrom) && Number.isFinite(draftTo)) {
            var draftMin = Math.min(draftFrom, draftTo), draftMax = Math.max(draftFrom, draftTo)
            draftSummary = dashboardRangeShort(draftMin) + ' — ' + dashboardRangeShort(draftMax) + ' · ' + t('{days} 天', { days: dashboardDaySpan(draftMin, draftMax) })
          }
        }
      }
      var calendarCells = draft ? dashboardCalendarCells(draft.year, draft.month) : []

      var rangePopover = rangeOpen && draft && React.createElement('div', { className: 'dshus-range-popover', role: 'dialog', 'aria-label': t('时间范围') },
        React.createElement('div', { className: 'dshus-range-presets' }, DASHBOARD_RANGES.map(function (option) {
          return React.createElement('button', {
            type: 'button', key: option[0], className: 'dshus-range-preset',
            'data-active': draft.preset === option[0] ? '' : undefined,
            onClick: function () { choosePreset(option[0]) },
          }, t(option[1]))
        })),
        React.createElement('div', { className: 'dshus-range-body' },
          React.createElement('div', { className: 'dshus-range-fields' },
            React.createElement('p', { className: 'dshus-range-hint' }, t('支持日期与时间')),
            React.createElement('div', {
              className: 'dshus-range-field', 'data-active': draft.active === 'from' ? '' : undefined,
              onClick: function () { activateField('from') },
            },
              React.createElement('span', { className: 'dshus-range-label' }, t('开始时间')),
              React.createElement('div', { className: 'dshus-range-inputs' },
                React.createElement('input', {
                  type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateFrom, 'aria-label': t('开始时间'),
                  onChange: function (event) { editDate('from', event.target.value) },
                }),
                React.createElement('input', {
                  type: 'time', className: 'dshus-field dshus-range-time', value: draft.timeFrom, 'aria-label': t('开始时间'),
                  onChange: function (event) { editTime('from', event.target.value) },
                }),
              ),
            ),
            React.createElement('div', {
              className: 'dshus-range-field', 'data-active': draft.active === 'to' ? '' : undefined,
              'data-disabled': draft.follow ? '' : undefined,
              onClick: function () { if (!draft.follow) activateField('to') },
            },
              React.createElement('span', { className: 'dshus-range-label' }, t('结束时间')),
              React.createElement('div', { className: 'dshus-range-inputs' },
                React.createElement('input', {
                  type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateTo, disabled: draft.follow, 'aria-label': t('结束时间'),
                  onChange: function (event) { editDate('to', event.target.value) },
                }),
                React.createElement('input', {
                  type: 'time', className: 'dshus-field dshus-range-time', value: draft.timeTo, disabled: draft.follow, 'aria-label': t('结束时间'),
                  onChange: function (event) { editTime('to', event.target.value) },
                }),
              ),
            ),
            React.createElement('label', { className: 'dshus-range-follow' },
              React.createElement('input', { type: 'checkbox', checked: draft.follow, onChange: function (event) { toggleFollow(event.target.checked) } }),
              React.createElement('span', null, t('结束时间跟随当前时刻')),
            ),
          ),
          React.createElement('div', { className: 'dshus-range-calendar' },
            React.createElement('div', { className: 'dshus-range-cal-head' },
              React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(-1) }, 'aria-label': t('上一页') }, '‹'),
              React.createElement('span', { className: 'dshus-range-cal-title' }, t('{year}年{month}月', { year: draft.year, month: draft.month + 1 })),
              React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(1) }, 'aria-label': t('下一页') }, '›'),
            ),
            React.createElement('div', { className: 'dshus-range-cal-week' }, ['日', '一', '二', '三', '四', '五', '六'].map(function (label) {
              return React.createElement('span', { key: label }, t(label))
            })),
            React.createElement('div', { className: 'dshus-range-cal-grid' }, calendarCells.map(function (cell) {
              var selected = (draft.active === 'to' ? draft.dateTo : draft.dateFrom) === cell.date
              return React.createElement('button', {
                type: 'button', key: cell.key, className: 'dshus-range-cal-day',
                'data-muted': cell.current ? undefined : '', 'data-selected': selected ? '' : undefined,
                onClick: function () { pickDay(cell.date) },
              }, cell.day)
            })),
          ),
        ),
        React.createElement('div', { className: 'dshus-range-foot' },
          React.createElement('span', { className: 'dshus-range-summary' }, draftSummary),
          React.createElement('div', { className: 'dshus-range-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setRangeOpen(false) } }, t('取消')),
            React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary', onClick: confirmRange }, t('确定')),
          ),
        ),
      )

      return React.createElement('dialog', {
        className: 'dshus-dash-dialog',
        ref: dialogRef,
        'aria-label': t('用量统计'),
        onCancel: function (event) {
          event.preventDefault()
          if (rangeOpen) setRangeOpen(false)
          else setDashboardOpen(false)
        },
        onClose: function () { setDashboardOpen(false) },
        onClick: function (event) {
          if (rangeOpen && rangeAnchorRef.current && !rangeAnchorRef.current.contains(event.target)) setRangeOpen(false)
          if (event.target !== dialogRef.current) return
          var rect = dialogRef.current.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setDashboardOpen(false)
        },
      },
        React.createElement('header', { className: 'dshus-dash-head' },
          React.createElement('div', { className: 'dshus-dash-title' }, usageChartIcon(18), React.createElement('h2', null, t('用量统计'))),
          React.createElement('div', { className: 'dshus-dash-head-actions' },
            data && React.createElement('span', { className: 'dshus-dash-sync' }, dashboardSyncLabel(data.syncedAt)),
            refreshIconButton(function () { load(true) }, loading, t('刷新用量统计')),
            React.createElement('button', {
              type: 'button', className: 'dshus-dash-close', onClick: function () { setDashboardOpen(false) },
              'data-dshus-tip': t('关闭用量统计'), 'aria-label': t('关闭用量统计'),
            }, React.createElement('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': 'true' },
              React.createElement('path', { d: 'M6 6l12 12M18 6L6 18' }))),
          ),
        ),
        React.createElement('div', { className: 'dshus-dash-body' },
          React.createElement('div', { className: 'dshus-dash-toolbar' },
            React.createElement('div', { className: 'dshus-range-wrap', ref: rangeAnchorRef },
              React.createElement('button', {
                type: 'button', className: 'dshus-range-trigger',
                onClick: function () { if (rangeOpen) setRangeOpen(false); else openPicker() },
                'aria-haspopup': 'dialog', 'aria-expanded': rangeOpen ? 'true' : undefined,
              }, calendarIcon(15), React.createElement('span', null, dashboardRangeLabel(range)), chevronDownIcon(14)),
              rangePopover,
            ),
            React.createElement(SelectField, {
              id: 'dshus-dash-provider', variant: 'field',
              'aria-label': t('供应商'),
              value: provider,
              options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setPage(1); setModel(''); setProvider(value) },
            }),
            React.createElement(SelectField, {
              id: 'dshus-dash-model', variant: 'field',
              'aria-label': t('模型'),
              value: model,
              options: [{ value: '', name: t('全部模型') }].concat(models.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setPage(1); setModel(value) },
            }),
          ),
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          React.createElement('div', { className: 'dshus-dash-stats' }, stats.map(function (entry) {
            return React.createElement('button', {
              type: 'button', key: entry.key, className: 'dshus-dash-stat',
              'data-active': metric === entry.key ? '' : undefined, 'aria-pressed': metric === entry.key,
              'data-dshus-tip': entry.exact || undefined, onClick: function () { setMetric(entry.key) },
            },
              React.createElement('span', { className: 'dshus-dash-stat-label' }, entry.label),
              React.createElement('span', { className: 'dshus-dash-stat-value' }, entry.value),
            )
          })),
          granularity === 'heatmap' && heatmap
            ? dashboardHeatmapElement(heatmap, metric)
            : React.createElement('section', { className: 'dshus-dash-chart' },
              React.createElement('div', { className: 'dshus-dash-chart-head' },
                React.createElement('h3', null, metricLabel + ' · ' + granularityLabel),
              ),
              React.createElement('div', { className: 'dshus-dash-plot' },
                (metric === 'cache' || axisMax > 0) && React.createElement('div', { className: 'dshus-dash-yaxis' }, axisTicks.map(function (tick, tickIndex) {
                  return React.createElement('span', { key: tickIndex }, axisText(tick))
                })),
                React.createElement('div', { className: 'dshus-dash-plot-main' },
                  React.createElement('div', { className: 'dshus-dash-chart-bars' }, series.map(function (point, pointIndex) {
                    var pointValue = metricValues[pointIndex]
                    var label = dashboardSeriesLabel(point, granularity)
                    var height = '2px'
                    if (metric === 'cache') {
                      if (pointValue !== null) height = Math.max(3, (pointValue - cacheFloor) / Math.max(1, 100 - cacheFloor) * 100) + '%'
                    } else if (pointValue > 0 && axisMax > 0) height = Math.max(3, pointValue / axisMax * 100) + '%'
                    return React.createElement('div', {
                      key: point.key, className: 'dshus-dash-bar', 'data-empty': pointValue === null || pointValue <= 0 ? '' : undefined,
                      'data-dshus-tip': t('{time} · {value}', { time: label, value: dashboardMetricText(point, metric) }),
                    }, React.createElement('div', { className: 'dshus-dash-bar-fill', style: { height: height } }))
                  })),
                  React.createElement('div', { className: 'dshus-dash-axis' }, series.map(function (point, pointIndex) {
                    return React.createElement('span', { key: point.key }, pointIndex % labelStep === 0 ? dashboardSeriesLabel(point, granularity) : '')
                  })),
                ),
              ),
            ),
          React.createElement('section', { className: 'dshus-dash-logs' },
            React.createElement('div', { className: 'dshus-dash-logs-head' },
              React.createElement('h3', null, t('请求日志')),
              React.createElement('span', { className: 'dshus-muted' }, t('共 {count} 条', { count: total })),
              React.createElement('label', { className: 'dshus-dash-page-size' },
                React.createElement('span', { className: 'dshus-muted' }, t('每页行数')),
                React.createElement(SelectField, {
                  id: 'dshus-dash-page-size', variant: 'field', inline: true,
                  'aria-label': t('每页行数'),
                  value: pageSize,
                  options: [10, 20, 50, 100].map(function (size) { return { value: size, name: t('{count} 条/页', { count: size }) } }),
                  onChange: function (value) { setPage(1); setPageSize(Number(value)) },
                }),
              ),
            ),
            React.createElement('div', { className: 'dshus-dash-logs-body' },
              React.createElement('div', { className: 'dshus-table-wrap' },
                React.createElement('table', { className: 'dshus-table dshus-logs-table' },
                  logTableHead(),
                  React.createElement('tbody', null,
                    rows.length > 0 ? rows.map(logRowElement) : data && React.createElement('tr', null,
                      React.createElement('td', { colSpan: 10, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无请求记录')),
                    ),
                  ),
                ),
              ),
            ),
            pages > 1 && React.createElement('div', { className: 'dshus-dash-pager' },
              React.createElement('span', { className: 'dshus-muted' }, t('第 {page} / {pages} 页', { page: currentPage, pages: pages })),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage <= 1 || loading, onClick: function () { setPage(currentPage - 1) } }, t('上一页')),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage >= pages || loading, onClick: function () { setPage(currentPage + 1) } }, t('下一页')),
            ),
          ),
        ),
      )
    }

function dashboardHeatmapElement(heatmap, metric) {
      var dayMap = {}
      var days = heatmap.days || []
      for (var index = 0; index < days.length; index++) dayMap[days[index].date] = days[index]
      var startMs = Date.parse(heatmap.start + 'T00:00:00Z')
      var endMs = Date.parse(heatmap.end + 'T00:00:00Z')
      var max = 0
      for (index = 0; index < days.length; index++) {
        var metricValue = dashboardMetricValue(days[index], metric)
        if (metricValue !== null && metricValue > max) max = metricValue
      }
      var weeks = []
      var labels = []
      var previousMonth = ''
      for (var week = 0; week < 53; week++) {
        var cells = []
        for (var day = 0; day < 7; day++) {
          var ms = startMs + (week * 7 + day) * 86400000
          var key = new Date(ms).toISOString().slice(0, 10)
          var entry = dayMap[key] || null
          var future = ms > endMs
          var value = entry ? dashboardMetricValue(entry, metric) : null
          var level = 0
          if (!future && value !== null && value > 0 && max > 0) level = Math.min(4, Math.max(1, Math.ceil(value / max * 4)))
          cells.push({ key: key, entry: entry, future: future, level: level, weekday: DASHBOARD_WEEKDAYS[(new Date(ms).getUTCDay() + 6) % 7] })
        }
        weeks.push(cells)
        var monthKey = cells[0].key.slice(0, 7)
        labels.push(week === 0 || monthKey !== previousMonth ? monthKey : '')
        previousMonth = monthKey
      }
      return React.createElement('section', { className: 'dshus-dash-chart dshus-dash-heatmap' },
        React.createElement('div', { className: 'dshus-dash-chart-head' },
          React.createElement('h3', null, t('用量热力图')),
        ),
        React.createElement('p', { className: 'dshus-dash-heatmap-summary' },
          React.createElement('span', { className: 'dshus-dash-heatmap-range' }, heatmap.start + ' — ' + heatmap.end),
          React.createElement('span', { className: 'dshus-muted' }, t('{tokens} Token · {calls} 次请求 · {cost}', {
            tokens: fmt(heatmap.totals.billed), calls: fmtExact(heatmap.totals.calls), cost: fmtCost(heatmap.totals.cost),
          })),
        ),
        React.createElement('div', { className: 'dshus-heatmap-wrap' },
          React.createElement('div', { className: 'dshus-heatmap-months' }, labels.map(function (label, labelIndex) {
            return React.createElement('span', { key: labelIndex }, label ? t('{month}月', { month: Number(label.slice(5)) }) : '')
          })),
          React.createElement('div', { className: 'dshus-heatmap-body' },
            React.createElement('div', { className: 'dshus-heatmap-weekdays' }, DASHBOARD_WEEKDAYS.map(function (label, weekdayIndex) {
              return React.createElement('span', { key: label }, weekdayIndex % 2 === 0 ? t(label) : '')
            })),
            React.createElement('div', { className: 'dshus-heatmap-weeks' }, weeks.map(function (cells, weekIndex) {
              return React.createElement('div', { key: weekIndex, className: 'dshus-heatmap-week' }, cells.map(function (cell) {
                var title = ''
                if (!cell.future && cell.entry) {
                  title = cell.key + ' ' + t(cell.weekday) + '\n' + t('Tokens') + ' ' + fmtExact(cell.entry.billed)
                    + '\n' + t('请求数') + ' ' + fmtExact(cell.entry.calls)
                    + '\n' + t('成本') + ' ' + fmtCost(cell.entry.cost)
                }
                return React.createElement('span', {
                  key: cell.key, className: 'dshus-heatmap-cell', 'data-level': cell.level,
                  'data-future': cell.future ? '' : undefined, 'data-dshus-tip': title || undefined,
                })
              }))
            })),
          ),
        ),
      )
    }

function localDayString(date) {
      var d = date instanceof Date ? date : new Date(date)
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }

function PriceTableDialog(props) {
      useLocaleRevision()
      var api = props.api
      var models = props.models || []
      var fields = [['input', t('输入')], ['output', t('输出')], ['cacheRead', t('缓存读取')], ['cacheWrite', t('缓存写入')]]
      var draftState = React.useState(function () {
        var drafts = {}
        for (var i = 0; i < models.length; i++) {
          var row = models[i]
          drafts[row.model] = row.price
            ? { input: String(row.price.input), output: String(row.price.output), cacheRead: String(row.price.cacheRead), cacheWrite: String(row.price.cacheWrite) }
            : { input: '', output: '', cacheRead: '', cacheWrite: '' }
        }
        return drafts
      })
      var drafts = draftState[0], setDrafts = draftState[1]
      var savingState = React.useState('')
      var saving = savingState[0], setSaving = savingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]

      function edit(model, field, value) {
        setDrafts(function (previous) {
          var next = Object.assign({}, previous)
          next[model] = Object.assign({}, previous[model])
          next[model][field] = value
          return next
        })
      }
      function save(row) {
        var draft = drafts[row.model] || {}, values = {}
        for (var i = 0; i < fields.length; i++) {
          var field = fields[i][0], raw = String(draft[field] == null ? '' : draft[field]).trim(), value = Number(raw)
          if (raw === '' || !Number.isFinite(value) || value < 0) { setError(t('请输入有效价格。')); return }
          values[field] = value
        }
        setSaving(row.model)
        setError('')
        api.savePrice(Object.assign({ model: row.model }, values)).then(function () {
          setSaving('')
          props.onSaved()
        }).catch(function (err) {
          setSaving('')
          setError(String(err && err.message || err))
        })
      }

      return React.createElement(ControlDialog, { id: 'dshus-price-dialog', title: t('价格表'), onClose: props.onClose, returnFocusId: 'dshus-price-button' },
        React.createElement('p', { className: 'dshus-setting-help' }, t('美元 / 百万 Tokens')),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        models.length === 0
          ? React.createElement('p', { className: 'dshus-setting-help' }, t('暂无数据'))
          : React.createElement('div', { className: 'dshus-table-wrap dshus-price-table-wrap' },
            React.createElement('table', { className: 'dshus-table dshus-price-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, t('模型')),
                  fields.map(function (field) { return React.createElement('th', { key: field[0] }, field[1]) }),
                  React.createElement('th', { 'aria-label': t('保存') }),
                ),
              ),
              React.createElement('tbody', null,
                models.map(function (row) {
                  var draft = drafts[row.model] || {}
                  return React.createElement('tr', { key: row.model },
                    React.createElement('td', { 'data-dshus-tip': (row.providers || []).join(' · ') },
                      React.createElement('div', { className: 'dshus-table-model-cell' }, React.createElement('span', null, row.model)),
                    ),
                    fields.map(function (field) {
                      return React.createElement('td', { key: field[0], style: { textAlign: 'right' } },
                        React.createElement('input', {
                          type: 'number', min: 0, step: 'any', className: 'dshus-field dshus-price-input',
                          'aria-label': row.model + ' ' + field[1],
                          value: draft[field[0]] == null ? '' : draft[field[0]],
                          onChange: function (event) { edit(row.model, field[0], event.target.value) },
                        }))
                    }),
                    React.createElement('td', { style: { textAlign: 'right' } },
                      React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving !== '', onClick: function () { save(row) } },
                        saving === row.model ? t('保存中…') : t('保存'))),
                  )
                }),
              ),
            ),
          ),
      )
    }

/* ------------------------------------------------------------------ */
/* Model name rules                                                    */
/* ------------------------------------------------------------------ */

var RULE_SPLIT = /[,，、;；\n\r]+/

function splitRuleNames(text) {
      var parts = String(text || '').split(RULE_SPLIT), out = [], seen = {}
      for (var i = 0; i < parts.length; i++) {
        var name = parts[i].trim()
        if (!name) continue
        var key = name.toLowerCase()
        if (seen[key]) continue
        seen[key] = true
        out.push(name)
      }
      return out
    }

/** Shared add/edit form: one canonical name and the raw models folded into it. */
function RuleEditor(props) {
      useLocaleRevision()
      var models = props.models || []
      var blocked = props.blocked || {}
      var initial = props.initial || { canonical: '', originals: [] }
      var canonicalState = React.useState(initial.canonical || '')
      var canonical = canonicalState[0], setCanonical = canonicalState[1]
      var suggestState = React.useState(false)
      var suggestOpen = suggestState[0], setSuggestOpen = suggestState[1]
      var suggestRootRef = React.useRef(null)
      var originalState = React.useState(initial.originals || [])
      var originals = originalState[0], setOriginals = originalState[1]
      var draftState = React.useState('')
      var draft = draftState[0], setDraft = draftState[1]
      var pickerState = React.useState(false)
      var pickerOpen = pickerState[0], setPickerOpen = pickerState[1]
      var searchState = React.useState('')
      var search = searchState[0], setSearch = searchState[1]
      var searchRef = React.useRef(null)
      var busyState = React.useState(false)
      var busy = busyState[0], setBusy = busyState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]

      React.useEffect(function () {
        if (!suggestOpen) return
        function outside(event) { if (suggestRootRef.current && !suggestRootRef.current.contains(event.target)) setSuggestOpen(false) }
        document.addEventListener('pointerdown', outside)
        return function () { document.removeEventListener('pointerdown', outside) }
      }, [suggestOpen])

      function addNames(names) {
        setOriginals(function (previous) {
          var next = previous.slice()
          for (var i = 0; i < names.length; i++) {
            var name = String(names[i] || '').trim()
            if (!name) continue
            var key = name.toLowerCase(), exists = false
            for (var j = 0; j < next.length; j++) if (next[j].toLowerCase() === key) { exists = true; break }
            if (!exists) next.push(name)
          }
          return next
        })
      }
      function removeName(name) {
        setOriginals(function (previous) {
          return previous.filter(function (item) { return item.toLowerCase() !== name.toLowerCase() })
        })
      }
      function commitDraft() {
        if (!draft.trim()) return
        addNames(splitRuleNames(draft))
        setDraft('')
      }
      function submit() {
        var name = canonical.trim()
        if (!name || originals.length === 0) { setError('请填写归一名称和至少一个原始模型。'); return }
        setBusy(true)
        setError('')
        var result
        try { result = props.onSubmit(name, originals.slice()) } catch (err) { result = Promise.reject(err) }
        Promise.resolve(result).then(function () {
          setBusy(false)
          props.onDone()
        }).catch(function (err) {
          setBusy(false)
          setError(String(err && err.message || err))
        })
      }

      var suggestions = [], seenNames = {}
      ;(props.suggestions || []).concat(models).forEach(function (name) {
        var key = String(name || '').toLowerCase()
        if (!key || seenNames[key]) return
        seenNames[key] = true
        suggestions.push(name)
      })
      var suggestNeedle = canonical.trim().toLowerCase()
      var suggestMatches = suggestions.filter(function (name) {
        return !suggestNeedle || name.toLowerCase().indexOf(suggestNeedle) !== -1
      })
      var needle = search.trim().toLowerCase()
      var available = []
      for (var mi = 0; mi < models.length; mi++) {
        var modelName = models[mi], modelKey = modelName.toLowerCase()
        if (blocked[modelKey]) continue
        if (originals.some(function (item) { return item.toLowerCase() === modelKey })) continue
        if (needle && modelKey.indexOf(needle) === -1) continue
        available.push(modelName)
      }

      return React.createElement('div', { className: 'dshus-rule-editor' },
        React.createElement('div', { className: 'dshus-rule-field', ref: suggestRootRef },
          React.createElement('span', { className: 'dshus-setting-label' }, t('归一名称')),
          React.createElement('input', {
            type: 'text', className: 'dshus-field', value: canonical,
            placeholder: t('例如 Claude Sonnet 4.5'), autoComplete: 'off', 'aria-label': t('归一名称'),
            onChange: function (event) { setCanonical(event.target.value); setSuggestOpen(true) },
            onFocus: function () { setSuggestOpen(true) },
            onClick: function () { setSuggestOpen(true) },
            onKeyDown: function (event) {
              if (event.key === 'Escape' && suggestOpen) { event.preventDefault(); event.stopPropagation(); setSuggestOpen(false) }
            },
          }),
          suggestOpen && suggestMatches.length > 0 && React.createElement('div', { className: 'dshus-rule-suggest' },
            React.createElement('ul', { className: 'dshus-rule-options' }, suggestMatches.slice(0, 100).map(function (name) {
              return React.createElement('li', { key: name },
                React.createElement('button', {
                  type: 'button', className: 'dshus-rule-option',
                  onMouseDown: function (event) { event.preventDefault() },
                  onClick: function () { setCanonical(name); setSuggestOpen(false) },
                }, name))
            })))),
        React.createElement('div', { className: 'dshus-rule-field' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('原始模型')),
          originals.length > 0 && React.createElement('div', { className: 'dshus-rule-chips' },
            originals.map(function (name) {
              return React.createElement('span', { key: name, className: 'dshus-rule-chip' },
                React.createElement('span', null, name),
                React.createElement('button', {
                  type: 'button', className: 'dshus-rule-chip-remove', 'aria-label': t('移除 {name}', { name: name }),
                  onClick: function () { removeName(name) },
                }, '×'))
            })),
          React.createElement('div', { className: 'dshus-rule-add' },
            React.createElement('input', {
              type: 'text', className: 'dshus-field', value: draft,
              placeholder: t('输入模型名称，回车添加'),
              onChange: function (event) { setDraft(event.target.value) },
              onKeyDown: function (event) {
                if (event.key === 'Enter' || event.key === ',' || event.key === '，') { event.preventDefault(); commitDraft() }
                else if (event.key === 'Backspace' && draft === '' && originals.length > 0) removeName(originals[originals.length - 1])
              },
            }),
            React.createElement('button', {
              type: 'button', className: 'dshus-btn',
              'aria-expanded': pickerOpen, 'aria-controls': pickerOpen ? props.idPrefix + '-picker' : undefined,
              onClick: function () { setPickerOpen(!pickerOpen) },
            }, t('选择模型'))),
          pickerOpen && React.createElement('div', { id: props.idPrefix + '-picker', className: 'dshus-rule-picker' },
            React.createElement('input', {
              type: 'search', className: 'dshus-field', value: search, ref: searchRef,
              placeholder: t('搜索模型名称'), 'aria-label': t('搜索模型名称'),
              onChange: function (event) { setSearch(event.target.value) },
            }),
            available.length > 0
              ? React.createElement('ul', { className: 'dshus-rule-options' }, available.slice(0, 100).map(function (name) {
                return React.createElement('li', { key: name },
                  React.createElement('button', {
                    type: 'button', className: 'dshus-rule-option',
                    onClick: function () {
                      addNames([name])
                      // The search text stays so several matches can be picked
                      // in a row; only the user clears it.
                      if (searchRef.current) searchRef.current.focus()
                    },
                  }, name))
              }))
              : React.createElement('p', { className: 'dshus-setting-help' }, models.length === 0 ? t('还没有模型使用记录') : needle ? t('没有匹配的模型') : t('没有可添加的模型'))),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-rule-editor-actions' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: submit }, busy ? t('保存中…') : props.submitLabel),
          props.onCancel && React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: props.onCancel }, t('取消'))),
      )
    }

function RuleRemoveDialog(props) {
      useLocaleRevision()
      var busyState = React.useState(false)
      var busy = busyState[0], setBusy = busyState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      function confirm() {
        setBusy(true)
        setError('')
        Promise.resolve(props.onConfirm()).then(function () {
          setBusy(false)
          props.onClose()
        }).catch(function (err) {
          setBusy(false)
          setError(String(err && err.message || err))
        })
      }
      return React.createElement(ControlDialog, { id: 'dshus-rule-remove-dialog', title: t('移除规则'), onClose: props.onClose, returnFocusId: props.returnFocusId },
        React.createElement('p', null, t('移除“{name}”规则？这些原始模型会恢复各自独立的名称。', { name: props.canonical })),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: confirm }, busy ? t('移除中…') : t('移除')),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: props.onClose }, t('取消'))),
      )
    }

function RulesPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var editingState = React.useState('')
      var editing = editingState[0], setEditing = editingState[1]
      var removingState = React.useState(null)
      var removing = removingState[0], setRemoving = removingState[1]
      var addRevisionState = React.useState(0)
      var addRevision = addRevisionState[0], setAddRevision = addRevisionState[1]
      var requestRef = React.useRef(0)

      function load() {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.rules().then(function (body) {
          if (request !== requestRef.current) return
          setData(body)
          setLoading(false)
        }).catch(function (err) {
          if (request !== requestRef.current) return
          setError(String(err && err.message || err))
          setLoading(false)
        })
      }
      React.useEffect(function () {
        if (active) load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active])

      function submit(body) {
        var request = ++requestRef.current
        return api.saveRules(body).then(function (result) {
          if (request === requestRef.current) {
            setData(function (previous) {
              return { rules: result.rules || [], models: result.models || (previous && previous.models) || [] }
            })
          }
          return result
        })
      }

      var groups = (data && data.rules) || []
      var models = (data && data.models) || []
      var canonicalNames = groups.map(function (group) { return group.canonical })
      var blockedFor = function (group) {
        var blocked = {}
        groups.forEach(function (item) {
          if (group && item.canonical.toLowerCase() === group.canonical.toLowerCase()) return
          item.originals.forEach(function (name) { blocked[name.toLowerCase()] = true })
        })
        return blocked
      }
      var allBlocked = blockedFor(null)

      var rows = groups.map(function (group) {
        var key = group.canonical.toLowerCase()
        if (editing === key) {
          return React.createElement('div', { key: key, className: 'dshus-rule-card dshus-rule-card-editing' },
            React.createElement(RuleEditor, {
              idPrefix: 'dshus-rule-edit-' + key, initial: group, models: models, suggestions: canonicalNames, blocked: blockedFor(group),
              submitLabel: t('保存'),
              onSubmit: function (canonical, originals) { return submit({ action: 'update', removed: group.originals, canonical: canonical, originals: originals }) },
              onDone: function () { setEditing('') },
              onCancel: function () { setEditing('') },
            }))
        }
        return React.createElement('div', { key: key, className: 'dshus-rule-card' },
          React.createElement('div', { className: 'dshus-rule-main' },
            React.createElement('strong', { className: 'dshus-rule-name' }, group.canonical),
            React.createElement('div', { className: 'dshus-rule-originals', 'data-dshus-tip': group.originals.join(' · ') }, group.originals.join(' · '))),
          React.createElement('span', { className: 'dshus-rule-count' }, t('{count} 个原始模型', { count: group.originals.length })),
          React.createElement('div', { className: 'dshus-rule-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setEditing(key) } }, t('编辑')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setRemoving(group) } }, t('移除'))))
      })

      return React.createElement('div', { className: 'dshus-rules' },
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null, t('新增规则')),
          React.createElement(RuleEditor, {
            key: 'dshus-rule-add-' + addRevision,
            idPrefix: 'dshus-rule-add', models: models, suggestions: canonicalNames, blocked: allBlocked,
            submitLabel: t('添加'),
            onSubmit: function (canonical, originals) { return submit({ action: 'add', canonical: canonical, originals: originals }) },
            onDone: function () { setError(''); setAddRevision(function (value) { return value + 1 }) },
            onCancel: function () { setAddRevision(function (value) { return value + 1 }) },
          }),
        ),
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('已有规则'),
            React.createElement('span', { className: 'dshus-muted' }, String(groups.length)),
            refreshIconButton(load, loading, t('刷新规则'), true)),
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          rows.length > 0 ? React.createElement('div', { className: 'dshus-rule-list' }, rows) : React.createElement('p', { className: 'dshus-setting-help' }, t('还没有模型规则。')),
        ),
        removing && React.createElement(RuleRemoveDialog, {
          canonical: removing.canonical, returnFocusId: 'dshus-tab-rules',
          onConfirm: function () { return submit({ action: 'remove', canonical: removing.canonical }) },
          onClose: function () { setRemoving(null) },
        }),
      )
    }

function CostsPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var rangeState = React.useState(function () { return costPresetRange('month') })
      var range = rangeState[0], setRange = rangeState[1]
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var priceOpenState = React.useState(false)
      var priceOpen = priceOpenState[0], setPriceOpen = priceOpenState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)

      function load(fresh, nextRange, nextProvider) {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.costs({ from: nextRange.from, to: nextRange.to, provider: nextProvider, fresh: fresh })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }
      React.useEffect(function () {
        if (!active) return
        load(false, range, provider)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, range, provider])

      var merged = [], index = Object.create(null)
      var sourceRows = (data && data.rows) || []
      for (var i = 0; i < sourceRows.length; i++) {
        var row = sourceRows[i]
        var modelId = sharedNormModelKey(row.model)
        var group = index[modelId]
        if (group === undefined) {
          group = {
            key: modelId, model: modelId === 'glm-5.3-flash' ? 'glm-5.3-flash' : sharedModelDisplayName(row.model),
            providers: [], rangeCost: null, totalCost: null, rangeTokens: 0, calls: 0,
          }
          index[modelId] = group
          merged.push(group)
        }
        if (row.provider && group.providers.indexOf(row.provider) === -1) group.providers.push(row.provider)
        if (row.rangeCost !== null) group.rangeCost = (group.rangeCost === null ? 0 : group.rangeCost) + row.rangeCost
        if (row.totalCost !== null) group.totalCost = (group.totalCost === null ? 0 : group.totalCost) + row.totalCost
        group.rangeTokens += (row.range && row.range.billed) || 0
        group.calls += (row.total && row.total.calls) || 0
      }
      merged.sort(function (a, b) {
        var av = a.rangeCost === null ? -1 : a.rangeCost
        var bv = b.rangeCost === null ? -1 : b.rangeCost
        return bv - av || b.rangeTokens - a.rangeTokens
      })

      var stat = function (value, label) {
        return React.createElement('div', { className: 'dshus-stat' },
          React.createElement('div', { className: 'v' }, fmtCost(value)),
          React.createElement('div', { className: 'k' }, label),
        )
      }
      var providers = (data && data.providers) || []
      var coverage = data ? (data.pricedModels || 0) + '/' + (data.totalModels || 0) : '—'
      var coverageLabel = data ? t('已收录 {priced} / 共 {total} 个模型', { priced: data.pricedModels || 0, total: data.totalModels || 0 }) : ''

      return React.createElement('div', { className: 'dshus-module' },
        React.createElement('h3', null,
          React.createElement('span', { className: 'dshus-muted', 'data-dshus-tip': coverageLabel || undefined, 'aria-label': coverageLabel || undefined }, coverage),
          React.createElement('div', { className: 'dshus-head-tools' },
            React.createElement(DayRangePicker, {
              id: 'dshus-cost-range', idPrefix: 'dshus-cost-range',
              value: range, onChange: function (next) { setRange(next) },
            }),
            React.createElement(SelectField, {
              id: 'dshus-cost-provider', variant: 'field',
              'aria-label': t('供应商'),
              value: provider,
              options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setProvider(value) },
            }),
            React.createElement('button', { id: 'dshus-price-button', type: 'button', className: 'dshus-btn', disabled: !data, onClick: function () { setPriceOpen(true) } }, t('价格表')),
            refreshIconButton(function () { load(true, range, provider) }, loading, t('刷新成本统计'), true),
          ),
        ),
        React.createElement('div', { className: 'dshus-statbar', role: 'group', 'aria-label': t('成本') },
          stat(data ? data.totalCost : null, t('总成本')),
          stat(data ? data.rangeCost : null, t('区间成本')),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-table-wrap' },
          React.createElement('table', { className: 'dshus-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, t('模型')),
                React.createElement('th', null, t('区间成本')),
                React.createElement('th', null, t('总成本')),
                React.createElement('th', null, t('区间 Tokens')),
                React.createElement('th', null, t('调用次数')),
              ),
            ),
            React.createElement('tbody', null,
              merged.length > 0 ? merged.map(function (group) {
                return React.createElement('tr', { key: group.key },
                  React.createElement('td', { 'data-dshus-tip': group.providers.join(' · ') },
                    React.createElement('div', { className: 'dshus-table-model-cell' }, React.createElement('span', null, group.model)),
                  ),
                  React.createElement('td', { style: { textAlign: 'right', fontWeight: 600 } }, fmtCost(group.rangeCost)),
                  React.createElement('td', { style: { textAlign: 'right' } }, fmtCost(group.totalCost)),
                  React.createElement('td', { style: { textAlign: 'right' }, 'data-dshus-tip': fmtExact(group.rangeTokens) }, fmt(group.rangeTokens)),
                  React.createElement('td', { style: { textAlign: 'right' } }, fmtExact(group.calls)),
                )
              }) : data && React.createElement('tr', null,
                React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无成本数据')),
              ),
            ),
          ),
        ),
        priceOpen && React.createElement(PriceTableDialog, {
          api: api, models: (data && data.priceModels) || [],
          onClose: function () { setPriceOpen(false) },
          onSaved: function () { load(false, range, provider) },
        }),
      )
    }

function UsageStatsSection(props) {
      useLocaleRevision()
      var api = props.api
      var intl = props.intl
      var overviewExpandedState = React.useState(false)
      var overviewExpanded = overviewExpandedState[0]
      var setOverviewExpanded = overviewExpandedState[1]
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

      var tabState = React.useState(props.initialTab || 'usage')
      var tab = tabState[0]
      var setTab = tabState[1]

      var controlState = React.useState({ settings: { autoQuota: false, intervalMinutes: 10, showModelDetails: false, showTokenSpeed: true, showModelDetection: true, showLogs: true, showCosts: true, showRules: true, advancedModelSelect: true, modelSeatColor: 'blue', modelReasoning: true, customQueries: [] } })
      var control = controlState[0], setControl = controlState[1]
      // The controls body comes from the host and may lack its settings block:
      // a degraded endpoint or a proxy error page must degrade the page's
      // switches, not crash the whole settings section during render.
      var controlSettings = (control && control.settings) || {}
      var showModelDetection = controlSettings.showModelDetection === true
      var showLogs = controlSettings.showLogs !== false
      var showCosts = controlSettings.showCosts !== false
      var showRules = controlSettings.showRules !== false
      if (tab === 'detection' && !showModelDetection) tab = 'usage'
      if (tab === 'logs' && !showLogs) tab = 'usage'
      if (tab === 'costs' && !showCosts) tab = 'usage'
      if (tab === 'rules' && !showRules) tab = 'usage'
      var configActive = !props.cardViews || Object.keys(props.cardViews).some(function (view) { return props.cardViews[view] })
      var controlReadyState = React.useState(false)
      var controlReady = controlReadyState[0], setControlReady = controlReadyState[1]
      var controlErrorState = React.useState('')
      var controlError = controlErrorState[0], setControlError = controlErrorState[1]
      var quotaRevisionState = React.useState(0)
      var quotaRevision = quotaRevisionState[0], setQuotaRevision = quotaRevisionState[1]
      var detectionVisitedState = React.useState(props.initialTab === 'detection')
      var detectionVisited = detectionVisitedState[0], setDetectionVisited = detectionVisitedState[1]
      var quotaVisitedState = React.useState(props.initialTab === 'quota')
      var quotaVisited = quotaVisitedState[0], setQuotaVisited = quotaVisitedState[1]
      var logsVisitedState = React.useState(props.initialTab === 'logs')
      var logsVisited = logsVisitedState[0], setLogsVisited = logsVisitedState[1]
      var costsVisitedState = React.useState(props.initialTab === 'costs')
      var costsVisited = costsVisitedState[0], setCostsVisited = costsVisitedState[1]
      var rulesVisitedState = React.useState(props.initialTab === 'rules')
      var rulesVisited = rulesVisitedState[0], setRulesVisited = rulesVisitedState[1]
      var quickStartState = React.useState(false)
      var quickStartOpen = quickStartState[0], setQuickStartOpen = quickStartState[1]
      var quotaSnapshotsState = React.useState({})
      var quotaSnapshots = quotaSnapshotsState[0], setQuotaSnapshots = quotaSnapshotsState[1]
      var quotaLoadingState = React.useState(false)
      var quotaLoading = quotaLoadingState[0], setQuotaLoading = quotaLoadingState[1]
      var quotaErrorState = React.useState('')
      var quotaError = quotaErrorState[0], setQuotaError = quotaErrorState[1]

      function changeTab(next) {
        if (next === 'detection' && !showModelDetection) return
        if (next === 'logs' && !showLogs) return
        if (next === 'costs' && !showCosts) return
        if (next === 'rules' && !showRules) return
        if (next === tab) return
        // A short tab must not inherit the long usage page's scroll position.
        if (scrollPortRef.current) scrollPortRef.current.scrollTop = 0
        if (next === 'quota') setQuotaVisited(true)
        if (next === 'detection') setDetectionVisited(true)
        if (next === 'logs') setLogsVisited(true)
        if (next === 'costs') setCostsVisited(true)
        if (next === 'rules') setRulesVisited(true)
        if (next === 'usage') load()
        setTab(next)
      }
      function onTabKeyDown(event) {
        var names = ['usage']
        if (showLogs) names.push('logs')
        if (showCosts) names.push('costs')
        if (showRules) names.push('rules')
        names.push('quota')
        if (showModelDetection) names.push('detection')
        names.push('control')
        var index = names.indexOf(tab)
        var next = event.key === 'ArrowRight' ? names[(index + 1) % names.length] : event.key === 'ArrowLeft' ? names[(index + names.length - 1) % names.length] : event.key === 'Home' ? 'usage' : event.key === 'End' ? names[names.length - 1] : null
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
      var controlRequestRef = React.useRef(0)
      var controlWritesRef = React.useRef(0)
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
        if (props.embedded) return
        load({ model: model })
        return function () {
          requestRef.current++
          if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      function loadControls() {
        if (controlWritesRef.current > 0) return
        var request = ++controlRequestRef.current
        setControlError('')
        api.controls().then(function (body) {
          if (request === controlRequestRef.current) acceptControls(body)
        }).catch(function (err) {
          if (request === controlRequestRef.current) { setControlError(String(err.message || err)); setControlReady(false) }
        })
      }
      React.useEffect(function () {
        if (!configActive) return
        loadControls()
        return function () { controlRequestRef.current++ }
      }, [configActive])
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
        if (!configActive || tab === 'usage' || typeof setInterval !== 'function') return
        var timer = setInterval(loadControls, 30000)
        return function () { clearInterval(timer) }
      }, [tab, configActive])
      function acceptControls(body) {
        setControl(body); syncModelFeaturesFromControls(body); setControlReady(true)
        if (body.settings?.showModelDetection !== true) { setTab(function (previous) { return previous === 'detection' ? 'usage' : previous }); setDetectionVisited(false) }
        if (body.settings?.showLogs === false) { setTab(function (previous) { return previous === 'logs' ? 'usage' : previous }); setLogsVisited(false) }
        if (body.settings?.showCosts === false) { setTab(function (previous) { return previous === 'costs' ? 'usage' : previous }); setCostsVisited(false) }
        if (body.settings?.showRules === false) { setTab(function (previous) { return previous === 'rules' ? 'usage' : previous }); setRulesVisited(false) }
      }
      function saveControls(patch) {
        var request = ++controlRequestRef.current
        controlWritesRef.current++
        setControlError('')
        return api.controls(patch).then(function (body) {
          if (request === controlRequestRef.current) acceptControls(body)
          if (patch.action === 'save-query' || patch.action === 'remove-query') setQuotaRevision(function (value) { return value + 1 })
          return body
        }).finally(function () { controlWritesRef.current-- })
      }
      function refreshQuotas() {
        setQuotaLoading(true)
        setQuotaError('')
        Promise.allSettled([api.providerQuotas({ fresh: true }), api.accountQuotas({ fresh: true })]).then(function (results) {
          if (results.some(function (result) { return result.status === 'rejected' || quotaFailed(result.value) || result.value.refreshErrors && result.value.refreshErrors.length })) setQuotaError('部分配额未能更新，请稍后刷新重试。')
          setQuotaSnapshots(function (previous) {
            var next = Object.assign({}, previous)
            ;['providers', 'accounts'].forEach(function (key, index) { if (results[index].status === 'fulfilled' && !quotaFailed(results[index].value)) next[key] = results[index].value })
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

      var controlsBody = React.createElement(ControlsPanel, { api: api, control: control, ready: controlReady, error: controlError, onReload: loadControls, onSave: saveControls })
      if (props.embedded) return controlsBody

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
            gmCur = { key: 'by-model:' + gmKey, provider: '', providers: [gmItem.provider || ''], model: canonical || modelDisplayName(gmName), lastTime: gmItem.lastTime || 0, billed: gmItem.billed || 0, _topBilled: gmItem.billed || 0 }
            mergedMap[gmKey] = gmCur
            mergedOrder.push(gmCur)
          } else {
            gmCur.billed += gmItem.billed || 0
            if (gmCur.providers.indexOf(gmItem.provider || '') === -1) gmCur.providers.push(gmItem.provider || '')
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
          return sharedModelColor(key.slice('by-model:'.length))
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
        React.createElement('button', { id: 'dshus-quickstart-button', type: 'button', className: 'dshus-btn', onClick: function () { setQuickStartOpen(true) } }, t('快速上手')),
        React.createElement('a', { className: 'dshus-btn dshus-icon-btn', href: 'https://github.com/Jockjrop/dsh-usage-stats/issues', target: '_blank', rel: 'noopener noreferrer', 'data-dshus-tip': t('问题反馈'), 'aria-label': t('问题反馈') },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            React.createElement('path', { d: 'M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z' }))),
      )

      var cards
      if (totals) {
        var overview = data.overview || {
          todayBilled: (data.byHour || []).reduce(function (sum, h) { return sum + (h.billed || 0) }, 0),
          usedDays: (data.byDay || []).filter(function (d) { return d.calls > 0 }).length,
          totalBilled: totals.billed,
        }
        // 概览指标在同一行内展示，相邻两项之间以竖线分割。
        var stat = function (v, k, opts) {
          opts = opts || {}
          var display = typeof v === 'number' ? (opts.exact ? fmtExact(v) : fmt(v)) : v
          return React.createElement('div', { className: 'dshus-stat' + (opts.cls ? ' ' + opts.cls : '') },
            React.createElement('div', { className: 'v', 'data-dshus-tip': typeof v === 'number' ? fmtExact(v) : undefined }, display),
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
        var prov = ((m.provider || '') + ' ' + (m.providers || []).join(' ')).toLowerCase()
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
          React.createElement('td', { 'data-dshus-tip': fmtExact(m.billed || 0), style: { textAlign: 'right', fontWeight: 600 } }, fmt(m.billed || 0)),
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

      return React.createElement('div', { className: 'dshus-page' + (props.embedded ? ' dshus-plugin-controls' : ''), ref: pageRef, 'data-plugin-controls': props.embedded ? 'usage-stats' : undefined },
        React.createElement('div', { className: 'dshus-toolbar' },
        !props.embedded && React.createElement('div', { className: 'dshus-head' },
          React.createElement('div', { className: 'dshus-brand' },
            React.createElement('span', { className: 'dshus-brand-icon', 'aria-hidden': 'true' }),
            React.createElement('h2', { className: 'dshus-title' }, t('用量统计')),
            React.createElement('a', { className: 'dshus-brand-meta dshus-brand-link', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer', 'data-dshus-tip': t('在 GitHub 查看 dsh-usage-stats') }, 'dsh-usage-stats'),
            PLUGIN_VERSION !== '__DSH_USAGE_STATS_VERSION__' && React.createElement('span', { className: 'dshus-brand-meta' }, 'v' + PLUGIN_VERSION),
          ),
          tools,
        ),
        React.createElement('div', { className: 'dshus-tabs', role: 'tablist', 'aria-label': t('用量统计页面') },
          React.createElement('button', { id: 'dshus-tab-usage', type: 'button', role: 'tab', 'aria-selected': tab === 'usage', 'aria-controls': 'dshus-usage-panel', tabIndex: tab === 'usage' ? 0 : -1, className: 'dshus-tab' + (tab === 'usage' ? ' on' : ''), onClick: function () { changeTab('usage') }, onKeyDown: onTabKeyDown }, t('用量')),
          showLogs && React.createElement('button', { id: 'dshus-tab-logs', type: 'button', role: 'tab', 'aria-selected': tab === 'logs', 'aria-controls': 'dshus-logs-panel', tabIndex: tab === 'logs' ? 0 : -1, className: 'dshus-tab' + (tab === 'logs' ? ' on' : ''), onClick: function () { changeTab('logs') }, onKeyDown: onTabKeyDown }, t('日志')),
          showCosts && React.createElement('button', { id: 'dshus-tab-costs', type: 'button', role: 'tab', 'aria-selected': tab === 'costs', 'aria-controls': 'dshus-costs-panel', tabIndex: tab === 'costs' ? 0 : -1, className: 'dshus-tab' + (tab === 'costs' ? ' on' : ''), onClick: function () { changeTab('costs') }, onKeyDown: onTabKeyDown }, t('成本')),
          showRules && React.createElement('button', { id: 'dshus-tab-rules', type: 'button', role: 'tab', 'aria-selected': tab === 'rules', 'aria-controls': 'dshus-rules-panel', tabIndex: tab === 'rules' ? 0 : -1, className: 'dshus-tab' + (tab === 'rules' ? ' on' : ''), onClick: function () { changeTab('rules') }, onKeyDown: onTabKeyDown }, t('规则')),
          React.createElement('button', { id: 'dshus-tab-quota', type: 'button', role: 'tab', 'aria-selected': tab === 'quota', 'aria-controls': 'dshus-quota-panel', tabIndex: tab === 'quota' ? 0 : -1, className: 'dshus-tab' + (tab === 'quota' ? ' on' : ''), onClick: function () { changeTab('quota') }, onKeyDown: onTabKeyDown }, t('配额')),
          showModelDetection && React.createElement('button', { id: 'dshus-tab-detection', type: 'button', role: 'tab', 'aria-selected': tab === 'detection', 'aria-controls': 'dshus-detection-panel', tabIndex: tab === 'detection' ? 0 : -1, className: 'dshus-tab' + (tab === 'detection' ? ' on' : ''), onClick: function () { changeTab('detection') }, onKeyDown: onTabKeyDown }, t('检测')),
          React.createElement('button', { id: 'dshus-tab-control', type: 'button', role: 'tab', 'aria-selected': tab === 'control', 'aria-controls': 'dshus-control-panel', tabIndex: tab === 'control' ? 0 : -1, className: 'dshus-tab' + (tab === 'control' ? ' on' : ''), onClick: function () { changeTab('control') }, onKeyDown: onTabKeyDown }, t('控制')),
        ),
        ),
        // The size container wraps only the panels, so the sticky header above it
        // is not inside a containment context.
        React.createElement('div', { className: 'dshus-panels' },
        tab === 'usage' && React.createElement('div', { id: 'dshus-usage-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-usage', tabIndex: 0 },
          error !== null && React.createElement('div', { className: 'dshus-error' }, uiError(error)),
          data && data.detectionUsageWarning && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(data.detectionUsageWarning)),
          stale && data && data.partial && React.createElement('div', { className: 'dshus-error' }, t('部分会话读取失败')),
          stale && data && !data.partial && React.createElement('div', { className: 'dshus-muted', role: 'status' }, t('后台同步中，当前显示上次数据。')),
          displayedModel && React.createElement('div', { className: 'dshus-control-actions', role: 'status' },
            React.createElement('span', null, t('当前模型筛选：{model}', { model: displayedModel })),
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { changeModel('') } }, t('清除筛选'))),

        /* Area 1: 概览指标 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            React.createElement('button', { type: 'button', className: 'dshus-overview-toggle', 'aria-expanded': overviewExpanded, 'aria-controls': 'dshus-overview-details', onClick: function () { setOverviewExpanded(!overviewExpanded) } },
              t('概览指标'),
              React.createElement('svg', { className: 'dshus-overview-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
                React.createElement('path', { d: 'M4 6.5 8 10.5 12 6.5' })))),
          cards,
          React.createElement('div', { id: 'dshus-overview-details', className: 'dshus-overview-details', hidden: !overviewExpanded },
            React.createElement(OverviewDetails, { overview: data && data.overview })),
          React.createElement('div', { className: 'dshus-setting-help', role: 'status' }, t('本地会话统计'), ' · ', t('上次同步：{time}', { time: fmtFetched(data && data.syncedAt) })),
          displayedModel && React.createElement('p', { className: 'dshus-setting-help' }, t('概览为全部历史；图表按当前模型筛选。')),
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

        controlSettings.showTokenSpeed !== false && React.createElement(TokenSpeedRanking, { speeds: data && data.tokenSpeeds, loading: loading && !data }),

        /* Area 5: 模型明细 */
        controlSettings.showModelDetails && React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('模型明细与分布'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' } },
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (!groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(false); setTableExpanded(false) },
                'data-dshus-tip': t('每个供应商 · 模型组合单独统计'),
              }, t('供应商·模型')),
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(true); setTableExpanded(false) },
                'data-dshus-tip': t('合并同名模型，不区分供应商'),
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
                  React.createElement('th', null, t('用量 Tokens')),
                  React.createElement('th', null, t('占比')),
                  React.createElement('th', { className: 'dshus-table-bar-cell' }, t('分布条')),
                  React.createElement('th', null, t('最后活跃时间')),
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
        showLogs && logsVisited && React.createElement('div', { id: 'dshus-logs-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-logs', tabIndex: 0, hidden: tab !== 'logs' },
          React.createElement(LogsPanel, { api: api, active: tab === 'logs' }),
        ),
        showCosts && costsVisited && React.createElement('div', { id: 'dshus-costs-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-costs', tabIndex: 0, hidden: tab !== 'costs' },
          React.createElement(CostsPanel, { api: api, active: tab === 'costs' }),
        ),
        showRules && rulesVisited && React.createElement('div', { id: 'dshus-rules-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-rules', tabIndex: 0, hidden: tab !== 'rules' },
          React.createElement(RulesPanel, { api: api, active: tab === 'rules' }),
        ),
        quotaVisited && React.createElement('div', { id: 'dshus-quota-panel', className: 'dshus-quota-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-quota', tabIndex: 0, hidden: tab !== 'quota', 'data-empty-label': t('连接模型服务后，可读取的配额会显示在这里') },
          quotaError && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(quotaError)),
          React.createElement(ProviderQuotasPanel, { api: api, key: 'providers', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.providers },
            React.createElement(AccountQuotasPanel, { api: api, key: 'accounts', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.accounts })),
        ),
        showModelDetection && detectionVisited && React.createElement('div', { id: 'dshus-detection-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-detection', hidden: tab !== 'detection' }, React.createElement(DetectionPanel, { api: api, active: tab === 'detection', onUsageUpdated: load, uiSession: props.uiSession, uiWorkspace: props.uiWorkspace, modelDirectories: props.modelDirectories })),
        tab === 'control' && React.createElement('div', { id: 'dshus-control-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-control' },
          React.createElement('section', { className: 'dshus-star-banner', role: 'note', 'aria-label': t('支持这个插件') },
            React.createElement('span', { className: 'dshus-star-banner-icon', 'aria-hidden': 'true' },
              React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
                React.createElement('path', { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z' }))),
            React.createElement('p', { className: 'dshus-star-banner-text' }, t('如果 dsh-usage-stats 帮到了你，请在 GitHub 点个 Star')),
            React.createElement('a', { className: 'dshus-btn dshus-star-banner-action', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer' }, t('去点 Star'))),
          controlsBody),
        ),
        quickStartOpen && React.createElement(QuickStartDialog, {
          showModelDetails: controlSettings.showModelDetails === true,
          showTokenSpeed: controlSettings.showTokenSpeed !== false,
          showLogs: showLogs, showCosts: showCosts, showRules: showRules, showModelDetection: showModelDetection,
          onClose: function () { setQuickStartOpen(false) },
        }),
      )
    }

/** Read-only account quota presentation. */
/** Brand artwork, bundled locally. See third_party/brand-icons/NOTICE.txt. */
const BRAND_ICONS = Object.freeze({
  "codearts": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAcgUlEQVR4nNV7eZBd1Znf7/vOufe+93pvtYQkJNQWYEALAjeYzSCBM7IAY1xOmj8ydpzMTHDFSVUmU5VKKjU1rU5VJqmKKy6XZ6rG2PGEOJmZSBlj4w0DtiQb8ILbIEDLaBegBbT09vot995zvtR37nutRkIbeKYmR7r93r33vHPPt6+XcHmDBKAxwJQAOgHwYLi87F2mDl7w/NCyi8955/nZ94pxZZTJPuzDgp4F/sDYkB8GPIVt/oaHAKQIwP8HQyCXvE++tAVBWwEjgMHf87EFYh8bGrOXigS6FOApfMye847u7l5K0y7nbVkkivR6DiGLuDWvExE6RdAl+l2SRIAEQNxaJUYad7bOW0esn52znym6Wt+Le86XmITJkpVc8rBvISsSUWbYN5MZmbk53jdJOx9J23sdwQiPYtRfCD57MeDHijlZ+9rLuOKqpNG4GbCr4OkqsO8WEBkxJCTCYXq4kgPkvYjAidfbgIcgAtiARJmP4NkD5CCeC/7yBmACGweICBmCd8zMiDzrol5IJwQEcM5iJsTJ2/VIDoy5JS+D8GqbXIuHNpqRMeBCSLCXQPlsBODhyvwFLnWDhOzDAhkSYBVIlgCuGzAMEp3vFXRVQgJRCDwoLKXgeRDrn7CyXi5wwK2jzYzt+wpg+LGeM8ARg7hQcMreBBZxID8BmLeF+MC0XbDsiVXHFzRq3XsW7i8fu3eMAuFUHM6nGO35gEdBj1y/PdyxcB43848TsF7gV5NgHghdQj5Ruoetk05XPFgQjH4LwBgmCHPYghKOyMCTgSGC120F2EyYEwirnwq4XiOGsHJMBEtRgaiW3Aq4oA5JWcADGcfLalIaylx5nYvx9J7l9b/CAbyu87euhZFt4t4NCfZCSkER8caVS0pTEzPXgXi9BR6swFRUyPQQOO8gTgJrF2u3Mae0DhYp0PzMff2rd/S8uKpX2p/hNwDcnLvF/fAYUXEp9uZJUahPsQxUEqFKUjL9/Q3nBsVnjBLv/i9DMrl8Oap4exYi5Rw5rxUQ5dWCDjrJbV22LJkYH7/W5rgLIjdWwBWdlyoDqzYUYpXSwKRnYPMqvMXTSG2y7lqvzTlwgYM8RA94mT1ERUvOHCweBiliTqVCNSljWmLMKKqtRcPytdMx3VuXfGjHYXSs24ZA/U3DCu87rYN9FwngFunk16dOddk0usmD7iTwwhwIFM/1A15/a0xgTDYGqq7a/xgGJnwW/GAK5UcRhCJ4sq3P4ry4HgOUFAcnED1MqThY3S61IoX4eGV/sUjFoC7WNyVydbZ5Ks7W2dBURL1TxENVkjfyDLsJNKWAPXuggO28CNgI0PAcrujITJfzWA1ShYfuoNZJt5CThze6HZV1/YFV8W3JPc/5Vyg4lec2IhQAC4GdRUSBABs+w8FxgYCApAIp4RwxHCJkiJFLhAYIVfJcJ6DJhBkjdso4mjDcUSW6qsm8FBHKbXjG66ARbKTROWbd4gIjE1cyBgsA7lcb3IQIiyOm3Fj2lAMuA03n4qchvk7iPMMRIWdCLnpAUiFvJTCe2ga1isGhdtAVRC2sJEHiz+wrg0gOsD7RQbhJnssMWPGI0KASTUtHPE2lrirb7owpqjMwZUDjxsu0tdQg6fBBUSvrnX/YszhAdsy9GaeeHGcecKRSqMxDEiy+Maot0CDm/Vb8Sz6XPc75yUBzJxHDOyHvYBRPxqtg65oOXNg/VRPUbFlJpb4BpLVXl+siYO/FW6emyDiKYkOJAwxNU9T5elwZnPDmQznhRlgbVUl4ir1UmSg1QF6oKTU0Z5TeSmB050ZRz+CSOCBnyi3cDMNXhaXPBgToPwpOWKy+i3VIyU/EOf2kfNrsmgZzjnpXDut60ZGfKiPvoC4/jZMEzIef9RYV0EPoxQRwehATy64uAp6JQ4Be6wW6VWLSEg7EYo+Y+aV7va1d9epL9T++5ZZrXuu0n7JCKGcqkvA1JppRviP1qch5kSkQpjyfceIuygE6dmLOSCmFpdMgnLJWBgyhpKpd7RExucSglDCuyUlOcyV9Zt6p+vQAnxb5EGYwVmj1RVNzKHDesQ04/Pg7L03O+U6EZf/El/7p49TQ04/2SATrb6ow39Bocokz5E2CcUadCGU21AA+wuKOghB+o+PAgXP3wmdfmN/SksEZiuOqh3kFTLs5YtdTIlMpgUyCnGKSKCaTROiJLN3EBhtOryrdefAqlGgMGSm3q6U8c9A7D3mX48x19eNHRoRH1opVZj78ODXWrt1iN2yQqylxHyPCLWLQ37CwVYak5J1q5MiwEdHn+53C8mptHDNt07d8+TstwDkcoKYvOOwANg+Dl2+emubOhc910slFFOEjlQjdQiSZ6gSiWP3bGSINc/qF5B+lTVexFFWBbHtYcC0I6yAYDTuQS4vDZq8LNm6kFRvByiA6Gr23LyHKP8uePsU5FmaKYl3YwrDnvP1zT/40IvkFxTO/6pvXUx1eDt68GW7z5kBXuaAIcAsB4wfAt6g6rr51Yu/85GXifEfG6DOGumKFmcBZMTfvYMQl0NIp5+9nw2+/vSzio43+PbTtrRndfPHUkcBtG8Ohiujdx0ZsJIxsxM5R0GYitxNIh4clnkhwJfLsIZ/TpyyZlQHQps/Vh2bWYKTwF3OvCgTb89i/+vT3escDHZSL2kg9a9izL7SMET02duZKT7lxsEn26SZR2TFuLxmUcoF3Hk4Roaivk6hXtMQb/xlnMdDPU/8DoF+2nslYOxpIuzF4ZaPnQwANDwu9DdAC9do2BzHCyXn4ADXy3wbzQ2TMtcGXDN4xCLlG4jCqm3KPKfZ43pP8IKbo8FmQneMGX9AK9IXIruXae0ycMLStTlIxkPkidH0EGFWvOiETOEfIVClWCIM1wQORTSeOrEyiim3soO2YaLOxDo0u1eS+QywKTwFK9faltZ+VkhtsLveT2QMs/EnjzGpFiWv6TJ1Niov9qTFSE52lOGaAHxGb54YOYGp6rdht2+DWrYPfNuf5F80IESCaW9PvY0MgehP1+ch2mYh+yIStmeBw3UM0uLOsFiGEvZFCkxJgDZbaCJ+Obf6vcjb37B9Czyyca2E3rgiIP6MERGjtVhg92ogIm1tUW2nr9Htk6HeQmOskLlwFsWIkErXD6hzCqd0XTDH57R54YekEDo7upPS664pnjI6eK/sX5QBquSpDnYFKRIfRkBuz3eMpnmp4E2toHDEtS4oMiJJTMlEzjKzMKFcslk442cBM9V4TJ8dvobF6R/MobTtjljYNw+xYMSKjRH6bht6tcesfT84rG1rh0/hj3MBDZO016lF7n2scZsgq6sEhr6LuRAMnGXiBSZ7OCfsfC3kAoUWL2hx2/iQpn+9GGwnYFuSwyEu8ghlK8Jyz+Csy2CaQ464dB2jMW+Q7Ir1W90Bi0GsZD5L3ny8Z90hvM1oxS3SA7qoPJRgcjLFp02yuce0XZCCO+KPe8O+jZD+Dkh0MsqK0tGIRkaeYQzihDqWHnxLjX3Am//M0r3/vRz/C6TYXbdyoe79whpgudHPuZrECEXYG+y7yW+g4cQwPQugBEv6IMViaGMRKwuD9qIPPcLFBUrFE00Fc6Oc5uR8a55+eybBv8cuaVT+zt48/eaQycTxagrTzNiJ7P5r+4ShJKjINuGraMBkZOLLkLGl21jcBqfuT0sDP4Phbpg9//exjFNynFcMS79ysHuDF0+N8KQgInLAzsHfBCc9gJvZ41kC+KownPGSPKsSSCfGxgx5MVqHWxEnZgJhlDRN+G0T/0sR8/1Prb+ifg+AodbWbpMv8Y1/yn6ckWs/lpOI06NacYQLrIxHErMEgRH1f+Coifp7If93m+G4beB07V6g4XVptgC5l0pyNMq5BhH2BEzRngFOr7T3euAcJtKFk6Gpr0KGcoDGhC2EdvDWwsQnZMdQdTot3W5js/z04eN3L/+ljf5a9vOyupVGOf9BVzTbYGoYiipBXnff1rIkmLIuN2Nlgb33NZWjiGJoYI2++a3yb8kJrP4tk2+OarAph2yUNezkICEnPFvAthKCP8rG3BVOJoYkc8kDq6c6eiLimAUMhCpFwqCmElIkx3G/T/O5YsoG42dy/ZOrAxO70w/M9oiEytNxo1Ftv6s4YEWwRPbPizvgZgRjZh4ifJue/Y1O8+sws5UnWDUpa+F2XBdPlD+WEvRsQXftUEItgt6sfxpqm5/UAP1AyWEGEBRqaqK1Miw8XIl42pjNvkvOQ431XTGy77uGJn1z7cPlw/8qFtc7FqDmbUy31Ud3ZyFnWxBM5gqv5Ks1k+6lpnmVvvz+wZvO2zY884t4r5d8TB7RHUIRPhTBzFtsd/didnfZTBHvIk9sgQp/sstTvjEEjxDli1EhoFkllAsw00BjvW7f3u90LZo6Zn3/wE3hpyVq83vEBmyaxt67uYyfsDaEx1fRE/CIsvm+8f6Y5ffJAAfx7p/z7QgBaXlyI8oZgsRyeNqMJ4KA8XB4fP1HVFE5cb2Z3lCkb6AQqsIgyZk2iSY3Za8q7I2/w4vEjpjc7hQRNFzfH0XHFHXyk64M0mczDhOOazXDa+vxvIPRdMZWnt/wRhYh9eFjM9ELYp76MbHT08il/WVbgfCPogjHk1PLZw7UnJyf2Lrji+YnO+X/qmb6GFK/ZHGlQAlodsobEMDOJEXVoEqDiGlhz7Of80O5v8MN/83X/oRM/oQ5M0HQFr9cjfKuv/tafLaye+PbN8d797eds3kzutv53cuHfJQfMjpZppC1rYbqqQ/Sdj3fKbaPbTqmBmLwNp3697LqrKsgHe5tT5Z50kjryZsib54bRjGJx1qDsauiuT6I7f4V78tNI2MG4Rr63+8aDb9Lyp578g+U/aMv3yMgWuxPzefPoyvdF+d8YAlpDNq4bQXXxQ6jfNcQoAj9c+9XjUx858MrJG47snvzw3ufm3/zGL+Olk4eK8NEAzlpNsLZKZKHYg4HG23Tb0WcxePqVxnTUO9nMzKl78WwAVFfdiHsxdmxINmHsN1Krp/e9QnA7w//CSQLwz772ta6JJTdd+YvBm271iVm/9PiR2+/c9eOr7ti3LV59ZAxLTu33Xel0yC66iJDaGN6wVsPIwkkkqYa5k2D8Ggm+f7qz7/k3upbuf6Jz+8m5VJcR8LsnW/6uECBCQ2NjtnN6SLbdq9nfYqz++Z7bOe4YTm15LShZjNx39c2criw7sZ9uOvRL3LnvGX/r6z+RpJZp9ZtmKmWw0bKqZ8OeIk2JAw1Y1BDTyYaNfy0xfzMns7X7y9UT4dGbYLCjqF/S6Lmprr9dERAhbAzZYT/WKp1r/u6vNxyYL6V4BeJovTj6ZEdsl8d5hhoEp7oXYKrc42eSbk7LFZN3d+P6t7ZjoHocFdE0uEdmbUibZ1oYMRx3lLmEyPdTwy0O3q/LS41/Hf9y3Pa9SY+8NROy7O+TE+g9IoA3/GBv1FV9OW/b4zVbxgels/FRX5JPmDi+GZ4WGyHDminJNXXE3sH6jmYNffXT9gMTB3DrgR/jvp3fcstPHQQSMc2kLCQ+9yxaVjZJTNp4ULj1jJNNj33E8izF0VPxF6o/C3GXAl90WaTvhRPsZc7XckOg/FMIdh/X7TrRFYe+gfrd3pj7ifBb3NmVSLUG12jWnSJBvE08WKIyu0oFbySV2sly30GTVg8PHfpJHaf2z9OljKVFlikkVnISNEUy8kWmCRENxJ4GcvFlTYXU/10Slbi5g0ahItF4r5zAlwW+CG3Yi2g2a7NFbOzdbYjksy6R30OFP8KVOPG1GkTrp9Acjld29rlWEiML51J1n15rlJPHD105NFKPKxtdxI95a55z4sdVqrVQxBpRKoWJolybCJQRItEU1PUwMszEn6+76AH5He2lme1piDFyeVxNlzxzRNS8zbLYjfv2LciapdWW8DAZs54Sc5328viZpkcjV7/cMNmIrMbCBr6ealH5JGduV+SzZwcax5/4/ro7dulau/9g0cAHTo3fLywfI0NDbORKG1GXFkScppgEOSzUZTDGapsQkHqZ9JAtPqJvSEQ/6/zD2rFZOo2AL1Uc+NKgF1qxcoe2foRx68435/ms9KA19DkwfUIYy2EspKnRv+OQsyNxoo6/NjppsYb9IW/kSWfcFz1H31jSGe1rr379F4+fbLJ9ysF9meC/7kVeTB2cSnaovxtkMMTaIxRicC2TWu4hy/cYQ//CsPzDyX+PebOc0A/NHvxmusRQyHyLwwQ37Tk6P2/kH5GIP8PE91Ep6ZFcU3CSI3deGMzW2lDm1p9mmJS0eQhWk6n5D3fJ5I+walXo5Hr0KyOVR49+F7eOjtXaQtt4NL4ewHoYfiiJsUosLVSKa5VTCzKhryr0WBHHJdL6cQ7IFuflK5WEf0r/dqboB1FF4EPDkrx3DhChtbO9gYI1B8d7swwbYPBpCO6SyPYom3qvLVHeeN0WUaZk40oJkjWbXrLnAXzdOf7zLCo/3wZex6KjaBzYubw5d4cJ0v3e8BPw/k884Zs5yTFNOnLRd5ODKQAfmowMkKhACN1Clj+bOnlQvqhl1VaEsBVaJqP3aAUo/K22PM5r9kiSzbzxQRhejyhaC+J5XnIvmfPeawYKxFFkVUoVI25m5pgXeUmce5LI/GjH6itCIDO8aZN5+9Zbo22Dg9loqwYQNvkIIqyAp1EldOMN+TRON5Kkpi04LpP7bESDSYRE1W8alCO8dh9oSBpF1OcI93hP9XqttEe+0ngJj6KOx0Jp7pxex4tzgGiSWyt/QOf0Vlny+gvliI5f4xLc7SI35DvtPFcxcJyLo5y99eSMZF77MyMLn+dHxbtNgPmyZ/udFasWaM07DPUbtg0OKhfMKqnApiuCR3cmqvxfmJmR5i9M5v7EEH1VIHtDl1mLE5QjtENBgdNGsiiiHohoVml9Viuvxp/O7xhrV7c2FfMukwPAIMo1X3/Nnj19ady8A0wfBWQJU6Z9S144c6QtEOXYiFZl08xJrXnI5vx0Lu5b7Jf+bPcqSndrunuL2Oq60HiZqx9xDr+1tLYMw2BFsVkaxRSQvSZ/WMoaPu9VxrJMHwycwEDTQyvCXn+p3VhsaJEQf9SnbmpGZl6/5TFU8Rggj57bG3QhBFCBrF/NYswZs8jF9fsoSu5kcJfLZnQxFs61aTPnxBpOLFxWPwyirycN+nZWqr2+c1VICocRYoVZhXqBsfldNmqmD6Ij+e/s7XER+ecwtLrVMqgrmiwUNEUbxCpCWJPm5lTsZSuAY2cXes4WBXvOw0ZGCKF4OS3YJOaa+/Z2NBv+es/ZatPT2ZM3UkhW15y7pYrVomTs0My4WjtKkO+BzRPbb7462PcVr22Ky43lMjY0LcA6d1Hg2xstdALLCtDPphDRKOpA84D81/KTaaN5RSMTa2O+OrEUK7ayPIhOrhqILHUy5HpxWDM10nm4C9UJrIRXTpjtsTyvDhAhrFxZ9LFinZu/Ykc5dc1V3s7c4m064Ewd3urRJB81nO/w8P0GOc+85U3jL73P/2eKFw62l9u5clwmhx7na/Z+02DrRm14uXhzts7ZDIaKwvAKvuN3z+gFdE8cFXZ/IRH9pYMcpbLAaFtR0XTazirAM+YL6J44cncB3d14pMVVm4pGwwtzwPD8YoJam2PPV3zsr/fO3SAkiW82HbwPbcsFoXInual6pC81TfydE8tu/lVYQsRs1i4n+lw26+1c4mjZbQXazW3YeW0YMX1ODUC6c+ZLtiweqyDSDUPdRrsVHFh7SUPzmQ39dCsR016U0l8TcDos8mxA7Pn7BIuxZxZDJn49ycksEsMLtcADTVMrlwQrzGqH6uKxXzh/1ZdbD5FN5pcTW7uGjryYjl15Sw1nD6XAeZwTpc7ZjkuI+2fQhY7OSP5NbxV3/G4TT/y36eyk2+7YLIaXNSaiTnWHnApZ6J+lEkXSB6JesLbzt+qxi87lQIsLjNzUlMHUJ+8k0WimaFMvmkEZyLSPrwGYfIDT7L4rpr+wxlUPUy06FL/Z12zOa/yHBkw25Ru1k951vTnZ858nLqQHFPhgrp7o6UGJr4RJF8JSL/qoIxi7ejXFj7+ktbZu009XeC04NAXaRq5d9loQUySG2rEG2IQSXLjzXsPhZmh6Vf8W5IpeJ30rQF2Qws9NiPKrBdkAKL/bFyGgJrpIJM0ochQme7vbkvs/PfiLn06Cxtt6aGRE22ZGtX5/hi3/d08vKny7ZxlmG62BUZ86sEcUuq7DNogRSwmCbngqh7CRIMaCtGmmzWFCws0zffihT/CyEGCdZM6kk2CuhiVjfXshF/GpE+3Gs2Ioph6KbA+1XpTQLu9WoiZ0CytZPE99kMhN28ZrM/Plj35xgkaren/rutApMosA+SE64NyNIGxgoofQzwNh/+ost5gv9K04gOvaoayVJo9cK5DBWsMoiTQ0IdAECZ2KIxPyFmEsv2iPEIW4t30m/fW6n/JHADoCo2VRY8RnXlzTa9ewFnxIfVOvff1zxSv0TrUsTgZWGXX5WsCfTCemD6iHrbPKV54289MVMqvsuG+eY3c3kdzNRP1q/IIPp0u1l2/jN9QZlCgEtpp0kByxvpZAhmuizWv7yGAPKNfUWTGmL6FJCm2PKSQ9Nta8TXYhz7cT5EZjkl4Yb7SVNezAOZFcvOShMUKb/NuWlkJ/v9aIJRfEVIL460RkJVkXEhg6JkrHuePIzJlNJVmnNOh6Iro2vHNRk9CZX/h6LRR4rSoEtlZ30pBGHyqnmlPWtmh1CZ1/iwkvwtJr6OqaEakWynUrvMYG5/cDSEEYVT5W4M0xoMGV5i6R+nMijd2+Pu2DJxuk0msePxWN/gJNlB2UKYIGUkpIYFvSNxtCDcmR07edoll5T5ZW3kkRp2o2eI/qLocXTloN6Pqsojcs7FHC+wRMyEL0qc/RrKBGpplU2WI72L2AeZU9+OGbzXZUqO722VbGnkP/8DJPC9s06k8A1YHq77/mJX7KO09U9TeQMf1g6qLYJMTtfqe56wb/rLB3uYev51URvAyRX5AV7eMLYwFqfuZER8FwukiWTInPXiRDC30uH+aI5iEKXWpK61YPX4tmai9UFFQ/aM7VyTSaOAmSVxzT06aOXXTLsWCGZd35w3463413+O0ybPpPLVnoOpIbrI/uAfnbAbeGI7OArfJdYWmK11zaCFDdk0Gq9VS8vEgsm3xknulP/IF9+HLB2jLC2kaqhAsJzdu0F757iatoLxkPG6bbkaA3LB+p79XCcwhtpEjIT3r9+zpIdjiPMcPup0hkF07UTtAjrbT5u/gX5+eA9mgD/6tHI9Bj2WngCAhHepr/cdy67Lj4/JBPs6Vout6Qwix6fXPR111Ic5m+Cck0VTIOkl9FEZ4+VvrS7uAtzeGwuRSgBxRrU/vr3058KUr0JYK3UcMifaHAU2DywsgEt1dfPkDKIifgcVjl3fjsJdxf294GVrbA0r3IL5QVIlxsnB3ByUhpYCbrEy89xL5sSL3xAo5MVbaaoEjzFcoODXGSZUj9xKL+k2/tpM3peR8zJ1LbMgK77r6B+ch8H+BKMMLq6oaJ+RyyqXLMOUXma4CbRjQzUSCxvfWLp8QubYQEyYhVNxfvZ2wavmBAFN6IUtf3fQz9vVL+UpOilz5+4wv+7Y3LAZ4ub2Wdv4mxY4dZ1gF2g1Pkjna/Yw2zuLvFcm8W5+iWw0Er7nSgzWdC2wsDoI3SFvPBSJYU6590dLR1f3F74oARNN8U1CFYAI8D8BrtXQ7b/z8C90qhMD+bxwAAAABJRU5ErkJggg==",
  "buddy": "data:image/png;base64,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",
  "workbuddy": "data:image/png;base64,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",
  "qoder-cn": "data:image/png;base64,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",
  "qoder": "data:image/png;base64,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",
  "cline": "data:image/png;base64,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",
  "raccoon": "data:image/png;base64,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",
  "cohere": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+Q29oZXJlPC90aXRsZT48cGF0aCBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik04LjEyOCAxNC4wOTljLjU5MiAwIDEuNzctLjAzMyAzLjM5OC0uNzAzIDEuODk3LS43ODEgNS42NzItMi4yIDguMzk1LTMuNjU2IDEuOTA1LTEuMDE4IDIuNzQtMi4zNjYgMi43NC00LjE4QTQuNTYgNC41NiAwIDAwMTguMSAxSDcuNTQ5QTYuNTUgNi41NSAwIDAwMSA3LjU1YzAgMy42MTcgMi43NDUgNi41NDkgNy4xMjggNi41NDl6Ij48L3BhdGg+PHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNOS45MTIgMTguNjFhNC4zODcgNC4zODcgMCAwMTIuNzA1LTQuMDUybDMuMzIzLTEuMzhjMy4zNjEtMS4zOTQgNy4wNiAxLjA3NiA3LjA2IDQuNzE1YTUuMTA0IDUuMTA0IDAgMDEtNS4xMDUgNS4xMDRsLTMuNTk3LS4wMDFhNC4zODYgNC4zODYgMCAwMS00LjM4Ni00LjM4N3oiPjwvcGF0aD48cGF0aCBkPSJNNC43NzYgMTQuOTYyQTMuNzc1IDMuNzc1IDAgMDAxIDE4LjczOHYuNDg5YTMuNzc2IDMuNzc2IDAgMDA3LjU1MSAwdi0uNDlhMy43NzUgMy43NzUgMCAwMC0zLjc3NS0zLjc3NXoiPjwvcGF0aD48L3N2Zz4=",
  "deepseek": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+RGVlcFNlZWs8L3RpdGxlPjxwYXRoIGQ9Ik0yMy43NDggNC40ODJjLS4yNTQtLjEyNC0uMzY0LjExMy0uNTEyLjIzNC0uMDUxLjAzOS0uMDk0LjA5LS4xMzcuMTM2LS4zNzIuMzk3LS44MDYuNjU3LTEuMzczLjYyNi0uODI5LS4wNDYtMS41MzcuMjE0LTIuMTYzLjg0OC0uMTMzLS43ODItLjU3NS0xLjI0OC0xLjI0Ny0xLjU0OC0uMzUyLS4xNTYtLjcwOC0uMzExLS45NTUtLjY1LS4xNzItLjI0MS0uMjE5LS41MS0uMzA1LS43NzQtLjA1NS0uMTYtLjExLS4zMjMtLjI5My0uMzUtLjItLjAzMS0uMjc4LjEzNi0uMzU2LjI3Ni0uMzEzLjU3Mi0uNDM0IDEuMjAyLS40MjIgMS44NC4wMjcgMS40MzYuNjMzIDIuNTggMS44MzggMy4zOTMuMTM3LjA5My4xNzIuMTg3LjEyOS4zMjMtLjA4Mi4yOC0uMTguNTUyLS4yNjYuODMzLS4wNTUuMTc5LS4xMzcuMjE3LS4zMjkuMTRhNS41MjYgNS41MjYgMCAwMS0xLjczNi0xLjE4Yy0uODU3LS44MjgtMS42MzEtMS43NDItMi41OTctMi40NThhMTEuMzY1IDExLjM2NSAwIDAwLS42ODktLjQ3MWMtLjk4NS0uOTU3LjEzLTEuNzQzLjM4OC0xLjgzNi4yNy0uMDk4LjA5My0uNDMyLS43NzktLjQyOC0uODcyLjAwNC0xLjY3LjI5NS0yLjY4Ny42ODRhMy4wNTUgMy4wNTUgMCAwMS0uNDY1LjEzNyA5LjU5NyA5LjU5NyAwIDAwLTIuODgzLS4xMDJjLTEuODg1LjIxLTMuMzkgMS4xMDItNC40OTcgMi42MjNDLjA4MiA4LjYwNi0uMjMxIDEwLjY4NC4xNTIgMTIuODVjLjQwMyAyLjI4NCAxLjU2OSA0LjE3NSAzLjM2IDUuNjUzIDEuODU4IDEuNTMzIDMuOTk3IDIuMjg0IDYuNDM4IDIuMTQgMS40ODItLjA4NSAzLjEzMy0uMjg0IDQuOTk0LTEuODYuNDcuMjM0Ljk2Mi4zMjcgMS43OC4zOTcuNjMuMDU5IDEuMjM2LS4wMyAxLjcwNS0uMTI4LjczNS0uMTU2LjY4NC0uODM3LjQxOS0uOTYxLTIuMTU1LTEuMDA0LTEuNjgyLS41OTUtMi4xMTMtLjkyNiAxLjA5Ni0xLjI5NiAyLjc0Ni0yLjY0MiAzLjM5Mi03LjAwMy4wNS0uMzQ3LjAwNy0uNTY1IDAtLjg0NS0uMDA0LS4xNy4wMzUtLjIzNy4yMy0uMjU2YTQuMTczIDQuMTczIDAgMDAxLjU0NS0uNDc1YzEuMzk2LS43NjMgMS45Ni0yLjAxNSAyLjA5My0zLjUxNy4wMi0uMjMtLjAwNC0uNDY3LS4yNDctLjU4OHpNMTEuNTgxIDE4Yy0yLjA4OS0xLjY0Mi0zLjEwMi0yLjE4My0zLjUyLTIuMTYtLjM5Mi4wMjQtLjMyMS40NzEtLjIzNS43NjMuMDkuMjg4LjIwNy40ODYuMzcxLjczOS4xMTQuMTY3LjE5Mi40MTYtLjExMy42MDMtLjY3My40MTYtMS44NDItLjE0LTEuODk3LS4xNjctMS4zNjEtLjgwMi0yLjUtMS44Ni0zLjMwMS0zLjMwNy0uNzc0LTEuMzkzLTEuMjI0LTIuODg3LTEuMjk4LTQuNDgyLS4wMi0uMzg2LjA5My0uNTIyLjQ3Ny0uNTkyYTQuNjk2IDQuNjk2IDAgMDExLjUyOS0uMDM5YzIuMTMyLjMxMiAzLjk0NiAxLjI2NSA1LjQ2OCAyLjc3NC44NjguODYgMS41MjUgMS44ODcgMi4yMDIgMi44OTEuNzIgMS4wNjYgMS40OTQgMi4wODIgMi40OCAyLjkxNC4zNDguMjkyLjYyNS41MTQuODkxLjY3Ny0uODAyLjA5LTIuMTQuMTEtMy4wNTQtLjYxNHptMS02LjQ0YS4zMDYuMzA2IDAgMDEuNDE1LS4yODcuMzAyLjMwMiAwIDAxLjIuMjg4LjMwNi4zMDYgMCAwMS0uMzEuMzA3LjMwMy4zMDMgMCAwMS0uMzA0LS4zMDh6bTMuMTEgMS41OTZjLS4yLjA4MS0uMzk5LjE1MS0uNTkuMTZhMS4yNDUgMS4yNDUgMCAwMS0uNzk4LS4yNTRjLS4yNzQtLjIzLS40Ny0uMzU4LS41NTItLjc1OGExLjczIDEuNzMgMCAwMS4wMTYtLjU4OGMuMDctLjMyNy0uMDA4LS41MzctLjIzOS0uNzI3LS4xODctLjE1Ni0uNDI2LS4xOTktLjY4OC0uMTk5YS41NTkuNTU5IDAgMDEtLjI1NC0uMDc4Yy0uMTEtLjA1NC0uMi0uMTktLjExNC0uMzU4LjAyOC0uMDU0LjE2LS4xODYuMTkyLS4yMS4zNTYtLjIwMi43NjctLjEzNiAxLjE0Ni4wMTYuMzUyLjE0NC42MTguNDA4IDEuMDAxLjc4Mi4zOTEuNDUxLjQ2Mi41NzYuNjg1LjkxNC4xNzYuMjY1LjMzNi41MzcuNDQ1Ljg0OC4wNjcuMTk1LS4wMTkuMzU0LS4yNS40NTJ6Ij48L3BhdGg+PC9zdmc+",
  "google": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+R29vZ2xlPC90aXRsZT48cGF0aCBkPSJNMjMgMTIuMjQ1YzAtLjkwNS0uMDc1LTEuNTY1LS4yMzYtMi4yNWgtMTAuNTR2NC4wODNoNi4xODZjLS4xMjQgMS4wMTQtLjc5NyAyLjU0Mi0yLjI5NCAzLjU2OWwtLjAyMS4xMzYgMy4zMzIgMi41My4yMy4wMjJDMjEuNzc5IDE4LjQxNyAyMyAxNS41OTMgMjMgMTIuMjQ1eiI+PC9wYXRoPjxwYXRoIGQ9Ik0xMi4yMjUgMjNjMy4wMyAwIDUuNTc0LS45NzggNy40MzMtMi42NjVsLTMuNTQyLTIuNjg4Yy0uOTQ4LjY0OC0yLjIyIDEuMS0zLjg5MSAxLjFhNi43NDUgNi43NDUgMCAwMS02LjM4Ni00LjU3MmwtLjEzMi4wMTEtMy40NjUgMi42MjgtLjA0NS4xMjRDNC4wNDMgMjAuNTMxIDcuODM1IDIzIDEyLjIyNSAyM3oiPjwvcGF0aD48cGF0aCBkPSJNNS44NCAxNC4xNzVBNi42NSA2LjY1IDAgMDE1LjQ2MyAxMmMwLS43NTguMTM4LTEuNDkxLjM2MS0yLjE3NWwtLjAwNi0uMTQ3LTMuNTA4LTIuNjctLjExNS4wNTRBMTAuODMxIDEwLjgzMSAwIDAwMSAxMmMwIDEuNzcyLjQzNiAzLjQ0NyAxLjE5NyA0LjkzOGwzLjY0Mi0yLjc2M3oiPjwvcGF0aD48cGF0aCBkPSJNMTIuMjI1IDUuMjUzYzIuMTA4IDAgMy41MjkuODkyIDQuMzQgMS42MzhsMy4xNjctMy4wMzFDMTcuNzg3IDIuMDg4IDE1LjI1NSAxIDEyLjIyNSAxIDcuODM0IDEgNC4wNDMgMy40NjkgMi4xOTcgNy4wNjJsMy42MyAyLjc2M2E2Ljc3IDYuNzcgMCAwMTYuMzk4LTQuNTcyeiI+PC9wYXRoPjwvc3ZnPg==",
  "meta": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+TWV0YTwvdGl0bGU+PHBhdGggZD0iTTYuODk3IDRjMS45MTUgMCAzLjUxNi45MzIgNS40MyAzLjM3NmwuMjgyLS4zNzNjLjE5LS4yNDYuMzgzLS40ODQuNTgtLjcxbC4zMTMtLjM1QzE0LjU4OCA0Ljc4OCAxNS43OTIgNCAxNy4yMjUgNGMxLjI3MyAwIDIuNDY5LjU1NyAzLjQ5MSAxLjUxNmwuMjE4LjIxM2MxLjczIDEuNzY1IDIuOTE3IDQuNzEgMy4wNTMgOC4wMjZsLjAxMS4zOTIuMDAyLjI1YzAgMS41MDEtLjI4IDIuNzU5LS44MTggMy43bC0uMTQuMjMtLjEwOC4xNTNjLS4zMDEuNDItLjY2NC43NTgtMS4wODYgMS4wMDlsLS4yNjUuMTQyLS4wODcuMDRhMy40OTMgMy40OTMgMCAwMS0uMzAyLjExOCA0LjExNyA0LjExNyAwIDAxLTEuMzMuMjA4Yy0uNTI0IDAtLjk5Ni0uMDY3LTEuNDM4LS4yMTUtLjYxNC0uMjA0LTEuMTYzLS41Ni0xLjcyNi0xLjExNmwtLjIyNy0uMjM1Yy0uNzUzLS44MTItMS41MzQtMS45NzYtMi40OTMtMy41ODZsLTEuNDMtMi40MS0uNTQ0LS44OTUtMS43NjYgMy4xMy0uMzQzLjU5MkM3LjU5NyAxOS4xNTYgNi4yMjcgMjAgNC4zNTYgMjBjLTEuMjEgMC0yLjIwNS0uNDItMi45MzYtMS4xODJsLS4xNjgtLjE4NGMtLjQ4NC0uNTczLS44MzctMS4zMTEtMS4wNDMtMi4xODlsLS4wNjctLjMyYTguNjkgOC42OSAwIDAxLS4xMzYtMS4yODhMMCAxNC40NjhjLjAwMi0uNzQ1LjA2LTEuNDkuMTc0LTIuMjNsLjEtLjU3M2MuMjk4LTEuNTMuODI4LTIuOTU4IDEuNTM2LTQuMTU3bC4yMDktLjM0YzEuMTc3LTEuODMgMi43ODktMy4wNTMgNC42MTUtMy4xNkw2Ljg5NyA0em0tLjAzMyAyLjYxNWwtLjIwMS4wMWMtLjgzLjA4My0xLjYwNi42NzMtMi4yNTIgMS41NzdsLS4xMzguMTk5LS4wMS4wMThjLS42NyAxLjAxNy0xLjE4NSAyLjM3OC0xLjQ1NiAzLjg0NWwtLjAwNC4wMjJhMTIuNTkxIDEyLjU5MSAwIDAwLS4yMDcgMi4yNTRsLjAwMi4xODhjLjAwNC4xOC4wMTcuMzYuMDQuNTRsLjA0My4yOTFjLjA5Mi41MDMuMjU3LjkwOC40ODYgMS4yMDhsLjExNy4xMzdjLjMwMy4zMjMuNjk4LjQ5MiAxLjE3LjQ5MiAxLjEgMCAxLjc5Ni0uNjc2IDMuNjk2LTMuNjQxbDIuMTc1LTMuNC40NTQtLjcwMS0uMTM5LS4xOThDOS4xMSA3LjMgOC4wODQgNi42MTYgNi44NjQgNi42MTZ6bTEwLjE5Ni0uNTUybC0uMTc2LjAwN2MtLjYzNS4wNDgtMS4yMjMuMzU5LTEuODIuOTMzbC0uMTk2LjE5OGMtLjQzOS40NjItLjg4NyAxLjA2NC0xLjM2NyAxLjgwN2wuMjY2LjM5OGMuMTguMjc0LjM2Mi41Ni41NS44NThsLjI5My40NzUgMS4zOTYgMi4zMzUuNjk1IDEuMTE0Yy41ODMuOTI2IDEuMDMgMS42IDEuNDA4IDIuMDgybC4yMTMuMjYyYy4yODIuMzI2LjUyOS41NC43NzcuNjczbC4xMDIuMDVjLjIyNy4xLjQ1Ny4xMzguNzE4LjEzOC4xNzYuMDAyLjM1LS4wMjMuNTE4LS4wNzMuMzM4LS4xMDQuNjEtLjMyLjgxMy0uNjM3bC4wOTUtLjE2My4wNzctLjE2MmMuMTk0LS40NTkuMjktMS4wNi4yOS0xLjc4NWwtLjAwNi0uNDQ5Yy0uMDgtMi44NzEtLjkzOC01LjM3Mi0yLjItNi43OThsLS4xNzYtLjE4OWMtLjY3LS42ODMtMS40NDQtMS4wNzQtMi4yNy0xLjA3NHoiPjwvcGF0aD48L3N2Zz4=",
  "minimax": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+TWluaW1heDwvdGl0bGU+PHBhdGggZD0iTTE2LjI3OCAyYzEuMTU2IDAgMi4wOTMuOTI3IDIuMDkzIDIuMDd2MTIuNTAxYS43NC43NCAwIDAwLjc0NC43MDkuNzQuNzQgMCAwMC43NDMtLjcwOVY5LjA5OWEyLjA2IDIuMDYgMCAwMTIuMDcxLTIuMDQ5QTIuMDYgMi4wNiAwIDAxMjQgOS4xdjYuNTYxYS42NDkuNjQ5IDAgMDEtLjY1Mi42NDUuNjQ5LjY0OSAwIDAxLS42NTMtLjY0NVY5LjFhLjc2Mi43NjIgMCAwMC0uNzY2LS43NTguNzYyLjc2MiAwIDAwLS43NjYuNzU4djcuNDcyYTIuMDM3IDIuMDM3IDAgMDEtMi4wNDggMi4wMjYgMi4wMzcgMi4wMzcgMCAwMS0yLjA0OC0yLjAyNnYtMTIuNWEuNzg1Ljc4NSAwIDAwLS43ODgtLjc1My43ODUuNzg1IDAgMDAtLjc4OS43NTJsLS4wMDEgMTUuOTA0QTIuMDM3IDIuMDM3IDAgMDExMy40NDEgMjJhMi4wMzcgMi4wMzcgMCAwMS0yLjA0OC0yLjAyNlYxOC4wNGMwLS4zNTYuMjkyLS42NDUuNjUyLS42NDUuMzYgMCAuNjUyLjI4OS42NTIuNjQ1djEuOTM0YzAgLjI2My4xNDIuNTA2LjM3Mi42MzguMjMuMTMxLjUxNC4xMzEuNzQ0IDBhLjczNC43MzQgMCAwMC4zNzItLjYzOFY0LjA3YzAtMS4xNDMuOTM3LTIuMDcgMi4wOTMtMi4wN3ptLTUuNjc0IDBjMS4xNTYgMCAyLjA5My45MjcgMi4wOTMgMi4wN3YxMS41MjNhLjY0OC42NDggMCAwMS0uNjUyLjY0NS42NDguNjQ4IDAgMDEtLjY1Mi0uNjQ1VjQuMDdhLjc4NS43ODUgMCAwMC0uNzg5LS43OC43ODUuNzg1IDAgMDAtLjc4OS43OHYxNC4wMTNhMi4wNiAyLjA2IDAgMDEtMi4wNyAyLjA0OCAyLjA2IDIuMDYgMCAwMS0yLjA3MS0yLjA0OFY5LjFhLjc2Mi43NjIgMCAwMC0uNzY2LS43NTguNzYyLjc2MiAwIDAwLS43NjYuNzU4djMuOGEyLjA2IDIuMDYgMCAwMS0yLjA3MSAyLjA0OUEyLjA2IDIuMDYgMCAwMTAgMTIuOXYtMS4zNzhjMC0uMzU3LjI5Mi0uNjQ2LjY1Mi0uNjQ2LjM2IDAgLjY1My4yOS42NTMuNjQ2VjEyLjljMCAuNDE4LjM0My43NTcuNzY2Ljc1N3MuNzY2LS4zMzkuNzY2LS43NTdWOS4wOTlhMi4wNiAyLjA2IDAgMDEyLjA3LTIuMDQ4IDIuMDYgMi4wNiAwIDAxMi4wNzEgMi4wNDh2OC45ODRjMCAuNDE5LjM0My43NTguNzY3Ljc1OC40MjMgMCAuNzY2LS4zMzkuNzY2LS43NThWNC4wN2MwLTEuMTQzLjkzNy0yLjA3IDIuMDkzLTIuMDd6Ij48L3BhdGg+PC9zdmc+",
  "mistral": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+TWlzdHJhbDwvdGl0bGU+PHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMy40MjggMy40aDMuNDI5djMuNDI4aDMuNDI5djMuNDI5aC0uMDAyIDMuNDMxVjYuODI4aDMuNDI3VjMuNGgzLjQzdjEzLjcxNEgyNHYzLjQyOUgxMy43MTR2LTMuNDI4aC0zLjQyOHYtMy40MjloLTMuNDN2My40MjhoMy40M3YzLjQyOUgwdi0zLjQyOWgzLjQyOFYzLjR6bTEwLjI4NiAxMy43MTVoMy40Mjh2LTMuNDI5aC0zLjQyN3YzLjQyOXoiPjwvcGF0aD48L3N2Zz4=",
  "nvidia": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+TnZpZGlhPC90aXRsZT48cGF0aCBkPSJNMTAuMjEyIDguOTc2VjcuNjJjLjEyNy0uMDEuMjU2LS4wMTcuMzg4LS4wMjEgMy41OTYtLjExNyA1Ljk1NyAzLjE4NCA1Ljk1NyAzLjE4NHMtMi41NDggMy42NDctNS4yODIgMy42NDdhMy4yMjcgMy4yMjcgMCAwMS0xLjA2My0uMTc1di00LjEwOWMxLjQuMTc0IDEuNjgxLjgxMiAyLjUyMyAyLjI1OGwxLjg3My0xLjYyN2E0LjkwNSA0LjkwNSAwIDAwLTMuNjctMS44NDYgNi41OTQgNi41OTQgMCAwMC0uNzI5LjA0NG0wLTQuNDc2djIuMDI1Yy4xMy0uMDEuMjU5LS4wMTkuMzg4LS4wMjQgNS4wMDItLjE3NCA4LjI2MSA0LjIyNiA4LjI2MSA0LjIyNnMtMy43NDMgNC42OS03LjY0MyA0LjY5Yy0uMzM4IDAtLjY3NS0uMDMxLTEuMDA3LS4wOTJ2MS4yNWMuMjc4LjAzOC41NTguMDU3LjgzOC4wNTcgMy42MjkgMCA2LjI1My0xLjkxIDguNzk0LTQuMTY5LjQyMS4zNDcgMi4xNDYgMS4xOTMgMi41MDEgMS41NjQtMi40MTYgMi4wODMtOC4wNDggMy43NjMtMTEuMjQgMy43NjMtLjMwOCAwLS42MDMtLjAyLS44OTQtLjA0OFYxOS41SDI0di0xNUgxMC4yMXptMCA5Ljc1NnYxLjA2OGMtMy4zNTYtLjYxNi00LjI4Ny00LjIxLTQuMjg3LTQuMjFhNy4xNzMgNy4xNzMgMCAwMTQuMjg3LTIuMTM4djEuMTcyaC0uMDA1YTMuMTgyIDMuMTgyIDAgMDAtMi41MDIgMS4xNzhzLjYxNSAyLjI3NiAyLjUwNyAyLjkzMW0tNS45NjEtMy4zYzEuNDM2LTEuOTM1IDMuNjA0LTMuMTQ4IDUuOTYxLTMuMzM2VjYuNTIzQzUuODEgNi44ODcgMiAxMC43MjMgMiAxMC43MjNzMi4xNTggNi40MjcgOC4yMSA3LjAxNXYtMS4xNjZDNS43NyAxNiA0LjI1IDEwLjk1OCA0LjI1IDEwLjk1OGgtLjAwMnoiPjwvcGF0aD48L3N2Zz4=",
  "opencode": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+b3BlbmNvZGU8L3RpdGxlPjxwYXRoIGQ9Ik0xNiA2SDh2MTJoOFY2em00IDE2SDRWMmgxNnYyMHoiPjwvcGF0aD48L3N2Zz4=",
  "qwen": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+UXdlbjwvdGl0bGU+PHBhdGggZD0iTTEyLjYwNCAxLjM0Yy4zOTMuNjkuNzg0IDEuMzgyIDEuMTc0IDIuMDc1YS4xOC4xOCAwIDAwLjE1Ny4wOTFoNS41NTJjLjE3NCAwIC4zMjIuMTEuNDQ2LjMyN2wxLjQ1NCAyLjU3Yy4xOS4zMzcuMjQuNDc4LjAyNC44MzctLjI2LjQzLS41MTMuODY0LS43NiAxLjNsLS4zNjcuNjU4Yy0uMTA2LjE5Ni0uMjIzLjI4LS4wNC41MTJsMi42NTIgNC42MzdjLjE3Mi4zMDEuMTExLjQ5NC0uMDQzLjc3LS40MzcuNzg1LS44ODIgMS41NjQtMS4zMzUgMi4zNC0uMTU5LjI3Mi0uMzUyLjM3NS0uNjguMzctLjc3Ny0uMDE2LTEuNTUyLS4wMS0yLjMyNy4wMTZhLjA5OS4wOTkgMCAwMC0uMDgxLjA1IDU3NS4wOTcgNTc1LjA5NyAwIDAxLTIuNzA1IDQuNzRjLS4xNjkuMjkzLS4zOC4zNjMtLjcyNS4zNjQtLjk5Ny4wMDMtMi4wMDIuMDA0LTMuMDE3LjAwMmEuNTM3LjUzNyAwIDAxLS40NjUtLjI3MWwtMS4zMzUtMi4zMjNhLjA5LjA5IDAgMDAtLjA4My0uMDQ5SDQuOTgyYy0uMjg1LjAzLS41NTMtLjAwMS0uODA1LS4wOTJsLTEuNjAzLTIuNzdhLjU0My41NDMgMCAwMS0uMDAyLS41NGwxLjIwNy0yLjEyYS4xOTguMTk4IDAgMDAwLS4xOTcgNTUwLjk1MSA1NTAuOTUxIDAgMDEtMS44NzUtMy4yNzJsLS43OS0xLjM5NWMtLjE2LS4zMS0uMTczLS40OTYuMDk1LS45NjUuNDY1LS44MTMuOTI3LTEuNjI1IDEuMzg3LTIuNDM2LjEzMi0uMjM0LjMwNC0uMzM0LjU4NC0uMzM1YTMzOC4zIDMzOC4zIDAgMDEyLjU4OS0uMDAxLjEyNC4xMjQgMCAwMC4xMDctLjA2M2wyLjgwNi00Ljg5NWEuNDg4LjQ4OCAwIDAxLjQyMi0uMjQ2Yy41MjQtLjAwMSAxLjA1MyAwIDEuNTgzLS4wMDZMMTEuNzA0IDFjLjM0MS0uMDAzLjcyNC4wMzIuOS4zNHptLTMuNDMyLjQwM2EuMDYuMDYgMCAwMC0uMDUyLjAzTDYuMjU0IDYuNzg4YS4xNTcuMTU3IDAgMDEtLjEzNS4wNzhIMy4yNTNjLS4wNTYgMC0uMDcuMDI1LS4wNDEuMDc0bDUuODEgMTAuMTU2Yy4wMjUuMDQyLjAxMy4wNjItLjAzNC4wNjNsLTIuNzk1LjAxNWEuMjE4LjIxOCAwIDAwLS4yLjExNmwtMS4zMiAyLjMxYy0uMDQ0LjA3OC0uMDIxLjExOC4wNjguMTE4bDUuNzE2LjAwOGMuMDQ2IDAgLjA4LjAyLjEwNC4wNjFsMS40MDMgMi40NTRjLjA0Ni4wODEuMDkyLjA4Mi4xMzkgMGw1LjAwNi04Ljc2Ljc4My0xLjM4MmEuMDU1LjA1NSAwIDAxLjA5NiAwbDEuNDI0IDIuNTNhLjEyMi4xMjIgMCAwMC4xMDcuMDYybDIuNzYzLS4wMmEuMDQuMDQgMCAwMC4wMzUtLjAyLjA0MS4wNDEgMCAwMDAtLjA0bC0yLjktNS4wODZhLjEwOC4xMDggMCAwMTAtLjExM2wuMjkzLS41MDcgMS4xMi0xLjk3N2MuMDI0LS4wNDEuMDEyLS4wNjItLjAzNS0uMDYySDkuMmMtLjA1OSAwLS4wNzMtLjAyNi0uMDQzLS4wNzdsMS40MzQtMi41MDVhLjEwNy4xMDcgMCAwMDAtLjExNEw5LjIyNSAxLjc3NGEuMDYuMDYgMCAwMC0uMDUzLS4wMzF6bTYuMjkgOC4wMmMuMDQ2IDAgLjA1OC4wMi4wMzQuMDZsLS44MzIgMS40NjUtMi42MTMgNC41ODVhLjA1Ni4wNTYgMCAwMS0uMDUuMDI5LjA1OC4wNTggMCAwMS0uMDUtLjAyOUw4LjQ5OCA5Ljg0MWMtLjAyLS4wMzQtLjAxLS4wNTIuMDI4LS4wNTRsLjIxNi0uMDEyIDYuNzIyLS4wMTJ6Ij48L3BhdGg+PC9zdmc+",
  "trae": "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMjcyYzM2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGhlaWdodD0iMWVtIiBzdHlsZT0iZmxleDpub25lO2xpbmUtaGVpZ2h0OjEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjFlbSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+VFJBRTwvdGl0bGU+PHBhdGggZD0iTTI0IDIwLjU0MUgzLjQyOHYtMy40MjZIMFYzLjRoMjRWMjAuNTR6TTMuNDI4IDE3LjExNWgxNy4xNDRWNi44MjdIMy40Mjh2MTAuMjg4em04LjU3My01LjE5NmwtMi40MjUgMi40MjQtMi40MjQtMi40MjQgMi40MjQtMi40MjQgMi40MjUgMi40MjR6bTYuODU3LS4wMDFsLTIuNDI0IDIuNDIzLTIuNDI1LTIuNDIzIDIuNDI1LTIuNDI1IDIuNDI0IDIuNDI1eiI+PC9wYXRoPjwvc3ZnPg==",
  "kilo": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTUgNWg3djlMMjMgNWg4TDE4IDE2bDEzIDExaC05bC0xMC05djlINXoiIGZpbGw9IiMzOTQxZmYiLz48L3N2Zz4=",
  "lobsterai": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTggN2w1IDR2MTBsLTUgNC00LTR2LTl6bTE2IDBsLTUgNHYxMGw1IDQgNC00di05ek0xMyAxNGg2djEwbC0zIDQtMy00eiIgZmlsbD0iI2UyNGUzOSIvPjxwYXRoIGQ9Ik0xNCA1djZtNC02djYiIHN0cm9rZT0iI2UyNGUzOSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+",
  "loomy": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTYgOHYxM3EwIDUgNiA1aDRNMTUgNnYxNXEwIDUgNiA1aDVNMjQgNnYxMSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmQ3M2VjIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==",
  "generic": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTE2IDRsMTEgNnYxMmwtMTEgNi0xMS02VjEwek01IDEwbDExIDYgMTEtNk0xNiAxNnYxMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjU3NWFmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=",
  "claude": "data:image/svg+xml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsPSIjMjcyYzM2Ij48cGF0aCBkPSJNMTcuMzA0MSAzLjU0MWgtMy42NzE4bDYuNjk2IDE2LjkxOEgyNFptLTEwLjYwODIgMEwwIDIwLjQ1OWgzLjc0NDJsMS4zNjkzLTMuNTUyN2g3LjAwNTJsMS4zNjkzIDMuNTUyOGgzLjc0NDJMMTAuNTM2MyAzLjU0MDlabS0uMzcxMiAxMC4yMjMyIDIuMjkxNC01Ljk0NTYgMi4yOTE0IDUuOTQ1NloiPjwvcGF0aD48L3N2Zz4=",
  "gemini": "data:image/svg+xml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsPSIjMjcyYzM2Ij48cGF0aCBkPSJNMTEuMDQgMTkuMzJRMTIgMjEuNTEgMTIgMjRxMC0yLjQ5LjkzLTQuNjguOTYtMi4xOSAyLjU4LTMuODF0My44MS0yLjU1UTIxLjUxIDEyIDI0IDEycS0yLjQ5IDAtNC42OC0uOTNhMTIuMyAxMi4zIDAgMCAxLTMuODEtMi41OCAxMi4zIDEyLjMgMCAwIDEtMi41OC0zLjgxUTEyIDIuNDkgMTIgMHEwIDIuNDktLjk2IDQuNjgtLjkzIDIuMTktMi41NSAzLjgxYTEyLjMgMTIuMyAwIDAgMS0zLjgxIDIuNThRMi40OSAxMiAwIDEycTIuNDkgMCA0LjY4Ljk2IDIuMTkuOTMgMy44MSAyLjU1dDIuNTUgMy44MSI+PC9wYXRoPjwvc3ZnPg=="
})

const ACCOUNT_CHANNEL_ORDER = Object.freeze([
  'codearts', 'buddy', 'workbuddy', 'lobsterai', 'qoder', 'qoder-cn', 'trae',
  'cline', 'loomy', 'raccoon', 'minimax', 'gemini',
])

const CHANNEL_LABELS = Object.freeze({
  zen: 'OpenCode Zen 免费模型',
  kilo: 'Kilo 免费模型',
  codearts: '华为 CodeArts',
  buddy: 'WorkBuddy 国内版',
  workbuddy: 'WorkBuddy 国际版',
  lobsterai: '有道 LobsterAI',
  qoder: 'Qoder 国际版',
  'qoder-cn': 'Qoder 中国版',
  trae: 'TRAE',
  cline: 'Cline',
  loomy: '讯飞 Loomy',
  raccoon: '商汤 Raccoon',
  minimax: 'MiniMax Code',
  gemini: 'Google Code Assist',
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isEpoch(value) {
  return Number.isFinite(value) && value > 0
}

function channelLabel(id, reported) {
  if (typeof reported === 'string' && reported.trim() !== '') return reported
  return CHANNEL_LABELS[id] ?? id
}

function quotaSummary(quota) {
  if (!isObject(quota)) return { key: '未知' }
  if (quota.error) return { key: '额度读取失败' }
  if (quota.scope === 'unsupported') return { key: '该渠道不提供额度查询' }
  if (quota.unlimited === true) return { key: '不限额' }
  if (quota.displayOnly === true) {
    const balance = num(quota.balance) ?? num(quota.remaining) ?? num(quota.total)
    return balance === null ? { key: '未知' } : { key: '{count}', params: { count: String(balance) } }
  }
  if (quota.paused === true) return { key: '已暂停调用' }
  const balance = num(quota.remaining) ?? num(quota.balance)
  if (balance === null) return { key: '未知' }
  return { key: '{count}', params: { count: String(balance) } }
}

function readChannels(body) {
  const reported = new Map()
  for (const row of Array.isArray(body?.channels) ? body.channels : []) {
    if (!isObject(row) || typeof row.id !== 'string') continue
    reported.set(row.id, row)
  }
  const ids = [...reported.keys()]
  for (const id of ACCOUNT_CHANNEL_ORDER) if (!reported.has(id)) ids.push(id)
  ids.sort((left, right) => {
    const leftIndex = ACCOUNT_CHANNEL_ORDER.indexOf(left)
    const rightIndex = ACCOUNT_CHANNEL_ORDER.indexOf(right)
    if (leftIndex === -1 && rightIndex === -1) return left < right ? -1 : 1
    if (leftIndex === -1) return -1
    if (rightIndex === -1) return 1
    return leftIndex - rightIndex
  })
  return ids.map((id) => {
    const row = reported.get(id) ?? {}
    const isAnonymous = id === 'zen' || id === 'kilo'
    const known = reported.has(id)
    return {
      id,
      kind: row.kind === 'anonymous' || isAnonymous ? 'anonymous' : 'account',
      displayName: channelLabel(id, row.displayName),
      // Absent from the response means this build has no driver for it.
      implemented: known && row.implemented !== false,
      // `usable` is the host's own verdict: no credential service means no
      // login button, however implemented the driver is.
      usable: known && row.usable !== false && row.implemented !== false,
      unusableReason: typeof row.unusableReason === 'string' ? row.unusableReason : '',
      loginMethods: (Array.isArray(row.loginMethods) ? row.loginMethods : []).filter((v) => typeof v === 'string'),
      supportsRefresh: row.supportsRefresh === true,
      supportsQuota: row.supportsQuota === true,
      supportsClaim: row.supportsClaim === true,
      supportsAutoClaim: row.supportsAutoClaim === true,
      inferenceSupported: known && row.inferenceSupported !== false && row.inferencePaused !== true && row.implemented !== false,
      unsupportedReason: typeof row.pauseReason === 'string' && row.pauseReason !== '' ? row.pauseReason : typeof row.unsupportedReason === 'string' ? row.unsupportedReason : '',
      enabled: row.enabled === true,
      accountStrategy: row.accountStrategy === 'auto' ? 'auto' : 'fixed',
      autoClaim: row.autoClaim === true,
      selectedAccountId: typeof row.selectedAccountId === 'string' ? row.selectedAccountId : null,
      accountCount: num(row.accountCount),
      // Display-only convenience from the host; it never enables a call button.
      modelsAllowed: row.modelsAllowed === true,
      note: typeof row.note === 'string' ? row.note : '',
      billing: typeof row.billing === 'string' ? row.billing : '',
      error: typeof row.error === 'string' ? row.error : '',
    }
  })
}

function readAccounts(body) {
  return (Array.isArray(body?.accounts) ? body.accounts : []).filter(isObject).map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    channelId: typeof row.channelId === 'string' ? row.channelId : '',
    displayName: typeof row.displayName === 'string' && row.displayName !== '' ? row.displayName : (typeof row.id === 'string' ? row.id : ''),
    enabled: row.enabled !== false,
    selected: row.selected === true,
    status: ['ready', 'expired', 'pending', 'error', 'unknown'].includes(row.status) ? row.status : 'unknown',
    version: num(row.version),
    credentialVersion: num(row.credentialVersion),
    credentialExpiresAt: isEpoch(row.credentialExpiresAt) ? row.credentialExpiresAt : null,
    lastRefreshAt: isEpoch(row.lastRefreshAt) ? row.lastRefreshAt : null,
    lastErrorCode: typeof row.lastErrorCode === 'string' ? row.lastErrorCode : '',
    detailsLoading: row.detailsLoading === true,
  })).filter((row) => row.id !== '' && row.channelId !== '')
}

function readQuotas(body) {
  const rows = Array.isArray(body?.results) ? body.results : Array.isArray(body?.quotas) ? body.quotas : []
  return rows.filter(isObject).map((row) => ({
    channelId: typeof row.channelId === 'string' ? row.channelId : '',
    accountId: typeof row.accountId === 'string' ? row.accountId : '',
    // `balance: null` means "not reported". It is never turned into a 0.
    balance: num(row.balance),
    remaining: num(row.remaining),
    total: num(row.total),
    unlimited: row.unlimited === true,
    displayOnly: row.displayOnly === true,
    supportsAccountCredits: row.supportsAccountCredits === true,
    supportsFreeRoute: row.supportsFreeRoute === true,
    unit: typeof row.unit === 'string' ? row.unit : null,
    currency: typeof row.currency === 'string' ? row.currency : null,
    scope: ['gift', 'included', 'paid', 'unknown', 'unsupported'].includes(row.scope) ? row.scope : 'unknown',
    // Only a gift/included reading may be presented as a free entitlement.
    callableEntitlement: row.callableEntitlement === true,
    claimedToday: typeof row.claimedToday === 'boolean' ? row.claimedToday : null,
    resetsAt: isEpoch(row.resetsAt) ? row.resetsAt : null,
    observedAt: isEpoch(row.observedAt) ? row.observedAt : null,
    source: typeof row.source === 'string' ? row.source : '',
    paused: row.paused === true,
    stale: row.stale === true,
    pauseReason: typeof row.pauseReason === 'string' ? row.pauseReason : '',
    error: isObject(row.error) ? { code: typeof row.error.code === 'string' ? row.error.code : '', message: typeof row.error.message === 'string' ? row.error.message : '' } : null,
    kinds: readQuotaDetails(row.kinds),
    windows: readQuotaDetails(row.windows),
    tier: typeof row.tier === 'string' ? row.tier.slice(0, 200) : '',
    entitlementModels: (Array.isArray(row.entitlementModels) ? row.entitlementModels : []).filter((model) => typeof model === 'string').slice(0, 100).map((model) => model.slice(0, 200)),
  })).filter((row) => row.channelId !== '')
}

function readQuotaDetails(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).filter(isObject).map((row) => ({
    id: typeof row.id === 'string' ? row.id.slice(0, 200) : '',
    name: typeof row.name === 'string' ? row.name.slice(0, 200) : '',
    label: typeof row.label === 'string' ? row.label.slice(0, 200) : typeof row.name === 'string' ? row.name.slice(0, 200) : '',
    kind: typeof row.kind === 'string' ? row.kind : '',
    planId: typeof row.planId === 'string' ? row.planId.slice(0, 200) : '',
    bucketId: typeof row.bucketId === 'string' ? row.bucketId.slice(0, 200) : '',
    source: typeof row.source === 'string' ? row.source.slice(0, 200) : '',
    scope: ['gift', 'included', 'paid', 'unknown', 'unsupported'].includes(row.scope) ? row.scope : 'unknown',
    balance: num(row.balance),
    remaining: num(row.remaining),
    total: num(row.total),
    used: num(row.used),
    active: typeof row.active === 'boolean' ? row.active : null,
    remainingPercent: num(row.remainingPercent),
    usedPercent: num(row.usedPercent),
    unit: typeof row.unit === 'string' ? row.unit.slice(0, 80) : '',
    currency: typeof row.currency === 'string' ? row.currency.slice(0, 80) : '',
    expiresAt: isEpoch(row.expiresAt) ? row.expiresAt : null,
    resetsAt: isEpoch(row.resetsAt) ? row.resetsAt : null,
    observedAt: isEpoch(row.observedAt) ? row.observedAt : null,
    error: isObject(row.error) ? { code: typeof row.error.code === 'string' ? row.error.code.slice(0, 80) : '' } : null,
  }))
}
function createAccountQuotasClient(React, t, useLocaleRevision) {
const h = React.createElement

function BrandIcon({ brand, small = false }) {
    const key = brand === 'zen' ? 'opencode' : brand === 'gemini' ? (BRAND_ICONS.gemini ? 'gemini' : 'google') : brand
    return h('span', { className: 'dshus-ma-brand-icon' + (small ? ' dshus-ma-brand-icon-small' : ''), 'aria-hidden': true, 'data-brand': brand },
      h('img', { src: BRAND_ICONS[key] ?? BRAND_ICONS.generic, alt: '', width: small ? 24 : 36, height: small ? 24 : 36, draggable: false }))
  }

function quotaText(quota) {
    if (!quota) return t('额度未读取')
    const summary = quotaSummary(quota)
    if (['未知', '不限额', '该渠道不提供额度查询', '已暂停调用'].includes(summary.key)) return t(summary.key)
    const amount = num(summary.params?.count)
    const value = amount === null ? t('未知') : amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
    const unit = ['credit', 'credits', 'point', 'points'].includes(quota.unit) ? t('积分')
      : ['request', 'requests'].includes(quota.unit) ? t('次') : quota.unit || quota.currency || ''
    return value + (unit ? ' ' + unit : '')
  }

function QuotaAccount({ account, quota, channel, loading, onRefresh, refreshButton, formatTime, formatReset }) {
    const [expanded, setExpanded] = React.useState(false)
    const windowBuckets = new Set((quota?.windows ?? []).map(pool => pool.bucketId).filter(Boolean))
    const pools = quota ? [...quota.kinds.filter(pool => pool.kind !== 'window' && !windowBuckets.has(pool.bucketId)), ...quota.windows] : []
    const visible = expanded ? pools : pools.slice(0, 3)
    const value = quota ? quotaText({ ...quota, paused: false, error: null }) : t(channel.supportsQuota ? '未查询' : '该渠道不提供额度查询')
    const hasAmount = quota?.unlimited || num(quota?.remaining) !== null || num(quota?.balance) !== null || quota?.displayOnly && num(quota?.total) !== null
    const isCredit = ['credit', 'credits', 'point', 'points'].includes(quota?.unit)
    const reset = quota?.resetsAt && formatReset(quota.resetsAt)
    return h('div', { className: 'dshus-account-quota-row', 'data-quota-account': account.id },
      h('div', { className: 'dshus-account-quota-summary' },
        h('div', { className: 'dshus-account-quota-identity' },
          h('span', { className: 'dshus-account-quota-name' }, account.displayName),
          account.selected || channel.selectedAccountId === account.id ? h('span', { className: 'dshus-account-quota-meta' }, t('当前账号')) : null,
          quota?.tier ? h('span', { className: 'dshus-account-quota-meta' }, quota.tier) : null,
          account.status === 'expired' ? h('span', { className: 'dshus-account-quota-meta' }, t('凭据已过期')) : null),
        h('div', { className: 'dshus-account-quota-balance' },
          h('span', { className: 'dshus-account-quota-meta' }, t(isCredit ? '剩余积分' : quota?.displayOnly ? '账号余额' : '剩余额度')),
          h('strong', { className: 'dshus-account-quota-value' + (hasAmount ? '' : ' dshus-account-quota-status') }, value)),
        channel.supportsQuota ? refreshButton(() => onRefresh({ channelId: channel.id, accountId: account.id }), loading,
          t('刷新 {name} 配额', { name: account.displayName }), false) : null),
      quota?.error ? h('p', { className: 'dshus-error', role: 'status' },
        quota.stale ? t('保留上次成功数据') + ' · ' : '', quota.error.message || t('额度读取失败')) : null,
      quota?.paused && !quota.displayOnly ? h('p', { className: 'dshus-account-quota-meta', 'data-dshus-tip': quota.pauseReason || undefined }, t('已暂停调用')) : null,
      quota?.displayOnly && !quota.supportsAccountCredits && !quota.supportsFreeRoute ? h('p', { className: 'dshus-account-quota-meta' }, t('余额仅供展示')) : null,
      pools.length ? h('dl', { className: 'dshus-credit-details' }, visible.map((pool, index) => {
        const remaining = pool.remaining ?? pool.balance
        const pct = pool.remainingPercent ?? (pool.usedPercent !== null ? 100 - pool.usedPercent
          : remaining !== null && pool.total !== null && pool.total > 0 ? remaining / pool.total * 100 : null)
        const bounded = pct === null ? null : Math.max(0, Math.min(100, pct))
        const label = pool.label || pool.name || t('额度明细')
        const amount = remaining !== null ? pool.total !== null ? remaining.toLocaleString(undefined, { maximumFractionDigits: 6 }) : quotaText({ ...pool, remaining })
          : bounded !== null ? t('剩余 {count}%', { count: Number(bounded.toFixed(2)) }) : t('未知')
        const total = pool.total !== null ? quotaText({ ...pool, remaining: pool.total }) : ''
        const color = bounded !== null && bounded < 10 ? '#ef4444' : bounded !== null && bounded < 30 ? '#f59e0b' : 'var(--dsw-alias-brand-primary, #3b82f6)'
        return h('div', { key: pool.id || pool.bucketId || index, className: 'dshus-credit-detail', 'data-quota-pool': pool.id || pool.bucketId || index },
          h('dt', null, label),
          h('dd', { className: 'dshus-credit-detail-amount' }, amount,
            total ? h('span', { className: 'dshus-account-quota-meta' }, ' / ' + total) : null),
          h('dd', { className: 'dshus-credit-detail-progress' }, bounded !== null ? h('div', { className: 'dshus-go-track', role: 'progressbar', 'aria-label': label,
            'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': bounded, 'aria-valuetext': amount + (total ? ' / ' + total : '') },
          h('div', { className: 'dshus-go-fill', style: { width: bounded + '%', background: color } })) : null),
          h('dd', { className: 'dshus-credit-detail-time' },
            pool.active === false ? t('已过期') : '',
            pool.resetsAt !== null ? formatReset(pool.resetsAt) : '',
            pool.expiresAt !== null ? t('到期时间') + '：' + formatTime(pool.expiresAt) : '',
            pool.error ? t('额度读取失败') : ''))
      })) : null,
      pools.length > 3 ? h('button', { type: 'button', className: 'dshus-btn dshus-credit-toggle', 'aria-expanded': expanded,
        onClick: () => setExpanded(!expanded) }, expanded ? t('收起额度明细') : t('展开其余 {count} 项明细', { count: pools.length - 3 })) : null,
      h('div', { className: 'dshus-account-quota-footer' },
        reset ? h('span', null, reset) : null,
        h('span', null, t('上次获取时间：{time}', { time: formatTime(quota?.observedAt) }))))
  }

function AccountQuotaList({ data, loading, onRefresh, refreshButton, formatTime, formatReset }) {
    const channels = readChannels(data).filter(channel => channel.kind === 'account' && channel.enabled)
    const accounts = readAccounts(data).filter(account => account.enabled)
    const quotas = readQuotas(data)
    return h(React.Fragment, null, channels.map(channel => {
      const rows = accounts.filter(account => account.channelId === channel.id)
      return h('section', { key: channel.id, className: 'dshus-module dshus-account-quota-section', 'data-quota-channel': channel.id },
        h('h3', null, h(BrandIcon, { brand: channel.id, small: true }), t(channel.displayName)),
        rows.length ? rows.map(account => h(QuotaAccount, { key: account.id, account, channel, loading, onRefresh, refreshButton, formatTime, formatReset,
          quota: quotas.find(quota => quota.channelId === channel.id && quota.accountId === account.id) }))
          : h('p', { className: 'dshus-account-quota-meta' }, t('未登录')))
    }))
  }
return { QuotaPanel: AccountQuotaList, css: "\n.dshus-ma-brand-icon { display:inline-flex; vertical-align:middle; justify-content:center; align-items:center; width:42px; height:42px; flex:none; background:var(--dshus-brand-canvas,#f4f5f8); border-radius:10px; border:1px solid var(--dshus-brand-border,#e3e5eb); }\n.dshus-ma-brand-icon img { display:block; width:30px; height:30px; object-fit:contain; }\n.dshus-ma-brand-icon-small { width:30px; height:30px; border-radius:7px; }\n.dshus-ma-brand-icon-small img { width:22px; height:22px; }" }
}

var accountQuotasClient = typeof createAccountQuotasClient === 'function' ? createAccountQuotasClient(React, t, useLocaleRevision) : null

function UsageDisplayControls(props) {
  useLocaleRevision()
  var state = React.useState({ settings: { showModelDetails: false, showTokenSpeed: true } }), control = state[0], setControl = state[1]
  var errorState = React.useState(''), error = errorState[0], setError = errorState[1]
  var readyState = React.useState(false), ready = readyState[0], setReady = readyState[1]
  var savingState = React.useState(false), saving = savingState[0], setSaving = savingState[1]
  var request = React.useRef(0)
  React.useEffect(function () {
    var id = ++request.current
    props.api.controls().then(function (body) { if (id === request.current) { setControl(body); setReady(true) } }).catch(function (err) { if (id === request.current) setError(String(err.message || err)) })
    return function () { request.current++ }
  }, [props.api])
  function save(key, value) {
    var id = ++request.current, patch = {}; patch[key] = value; setSaving(true); setError('')
    props.api.controls(patch).then(function (body) { if (id === request.current) setControl(body) }).catch(function (err) { if (id === request.current) setError(String(err.message || err)) }).finally(function () { if (id === request.current) setSaving(false) })
  }
  return React.createElement('div', { className: 'dshus-page dshus-controls', 'data-plugin-controls': 'usage-stats' },
    error && React.createElement('p', { className: 'dshus-error', role: 'alert' }, uiError(error)),
    [['showModelDetails', '模型明细与分布'], ['showTokenSpeed', 'token输出速度']].map(function (entry) {
      var enabled = control.settings && (entry[0] === 'showModelDetails' ? control.settings.showModelDetails === true : control.settings.showTokenSpeed !== false)
      return React.createElement('div', { className: 'dshus-setting-row', key: entry[0] },
        React.createElement('span', { className: 'dshus-setting-label' }, t(entry[1])),
        React.createElement('button', { type: 'button', role: 'switch', className: 'dshus-switch' + (enabled ? ' on' : ''), 'aria-label': t(entry[1]), 'aria-checked': enabled, disabled: !ready || saving, onClick: function () { save(entry[0], !enabled) } }))
    }))
}

/**
 * Public Models-page extension. The build embeds this dependency-free module
 * in the renderer bundle; tests import the same factory directly.
 */
function createReasoningSettings(React, t, useLocaleRevision) {
  const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  const labels = { off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最大' }
  const slotName = 'settings.models.provider-card'
  const styleId = 'dsh-usage-stats-reasoning-styles'
  const clone = value => JSON.parse(JSON.stringify(value))
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
  const mode = entry => !own(entry, 'reasoningEfforts') ? 'inherit' : entry.reasoningEfforts === false ? 'disabled' : object(entry.reasoningEfforts) ? 'custom' : 'invalid'
  const preset = () => ({ low: 'low', medium: 'medium', high: 'high' })
  const readAt = (value, path) => path.reduce((current, key) => object(current) && own(current, key) ? current[key] : undefined, value)
  const same = (left, right) => {
    if (left === right) return true
    if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]))
    if (object(left) && object(right)) return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => own(right, key) && same(left[key], right[key]))
    return false
  }
  const selected = entry => mode(entry) === 'custom' ? levels.filter(level => own(entry.reasoningEfforts, level)) : []

  function validate(entries) {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const kind = mode(entry)
      if (kind === 'invalid') return { index, message: '推理档位配置无效，请恢复模型默认后重新配置。' }
      if (kind !== 'custom') continue
      const efforts = entry.reasoningEfforts
      if (!Object.keys(efforts).some(level => level !== 'off')) return { index, message: '至少选择一个非关闭档位，或取消启用推理强度。' }
      for (const [level, wire] of Object.entries(efforts)) {
        if (level === 'off' && (wire === null || wire === '')) continue
        if (typeof wire !== 'string' || wire.length === 0) return { index, level, message: '请在高级设置中填写该档位的参数取值。' }
      }
    }
    return null
  }

  function modelsFrom(namespace, path) {
    const user = readAt(namespace.user, path)
    const effective = user !== undefined ? user : readAt(namespace.value, path)
    if (effective === undefined) return []
    if (!Array.isArray(effective) || effective.some(entry => !object(entry) || typeof entry.id !== 'string' || !entry.id.trim())) throw new Error('invalid-models')
    return clone(effective)
  }

  function buildOp(settingsPath, entries) {
    return { op: 'set', path: [...settingsPath, 'models'], value: entries.map(entry => {
      const result = clone(entry)
      // Older editors use an empty string for omitted off parameters. Current
      // Desktop accepts null, so preserve that meaning with the valid spelling.
      if (object(result.reasoningEfforts) && result.reasoningEfforts.off === '') result.reasoningEfforts.off = null
      return result
    }) }
  }

  /** Keeps unsaved edits fenced at their original namespace revision. */
  function createController(settings, provider) {
    const path = [...provider.settingsPath, 'models']
    const listeners = new Set()
    let state = { phase: 'loading', stored: [], draft: null, writable: false, revision: undefined, stale: false, saving: false, error: '', notice: '' }
    let basis, basisEntries, memory = [], activeMemory = [], generation = 0, stopped = false, queued = false
    const publish = patch => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }
    const seedMemory = entries => {
      memory = entries.map(entry => object(entry.reasoningEfforts) ? clone(entry.reasoningEfforts) : {})
      activeMemory = clone(memory)
    }
    const issue = () => state.draft ? validate(state.draft) : null
    const failText = (result, saving) => result?.error?.code === 'settings/conflict'
      ? '模型设置已更新，未保存的更改已保留。请取消更改后重新编辑。'
      : saving ? '保存推理设置失败，请重试。' : '无法读取模型设置，请重试。'

    async function load() {
      if (stopped) return
      if (state.saving) { queued = true; return }
      const request = ++generation
      try {
        const result = await settings.describe()
        if (stopped || request !== generation) return
        if (!result?.ok) { publish({ phase: state.phase === 'ready' ? 'ready' : 'error', error: failText(result, false) }); return }
        const namespace = result.value?.namespaces?.find(candidate => candidate.ns === provider.settingsNs)
        if (!namespace || !Number.isInteger(namespace.revision)) throw new Error('missing-namespace')
        const entries = modelsFrom(namespace, path)
        if (!state.draft) seedMemory(entries)
        publish({ phase: 'ready', stored: entries, revision: namespace.revision, writable: result.value.writable === true,
          stale: !!state.draft && (state.stale || namespace.revision !== basis), error: '' })
      } catch {
        if (!stopped && request === generation) publish({ phase: state.phase === 'ready' ? 'ready' : 'error', error: '无法读取模型设置，请重试。' })
      }
    }

    function edit(index, update) {
      if (stopped || state.phase !== 'ready' || !state.writable || state.saving || state.stale) return
      const entries = clone(state.draft || state.stored)
      if (!entries[index]) return
      if (!state.draft) { basis = state.revision; basisEntries = clone(state.stored) }
      entries[index] = update(entries[index])
      const dirty = !same(entries, basisEntries)
      if (!dirty) { basis = undefined; basisEntries = undefined }
      publish({ draft: dirty ? entries : null, error: '', notice: '' })
    }

    function toggle(index, enabled) {
      edit(index, entry => {
        if (object(entry.reasoningEfforts)) {
          memory[index] = { ...memory[index], ...entry.reasoningEfforts }
          activeMemory[index] = clone(entry.reasoningEfforts)
        }
        return { ...entry, reasoningEfforts: enabled ? Object.keys(activeMemory[index] || {}).length ? clone(activeMemory[index]) : preset() : false }
      })
    }

    function toggleTier(index, level, enabled) {
      if (!levels.includes(level)) return
      edit(index, entry => {
        const efforts = object(entry.reasoningEfforts) ? { ...entry.reasoningEfforts } : preset()
        memory[index] = { ...memory[index], ...efforts }
        if (enabled) efforts[level] = own(memory[index] || {}, level) ? memory[index][level] : level === 'off' ? null : level
        else delete efforts[level]
        activeMemory[index] = clone(efforts)
        return { ...entry, reasoningEfforts: efforts }
      })
    }

    function setWire(index, level, value) {
      if (!levels.includes(level) || typeof value !== 'string') return
      edit(index, entry => {
        if (!object(entry.reasoningEfforts) || !own(entry.reasoningEfforts, level)) return entry
        const wire = level === 'off' && value === '' ? null : value
        memory[index] = { ...memory[index], [level]: wire }
        activeMemory[index] = { ...entry.reasoningEfforts, [level]: wire }
        return { ...entry, reasoningEfforts: { ...entry.reasoningEfforts, [level]: wire } }
      })
    }

    function restore(index) {
      edit(index, entry => {
        const result = { ...entry }
        delete result.reasoningEfforts
        memory[index] = {}
        activeMemory[index] = {}
        return result
      })
    }

    function cancel() {
      if (state.saving) return
      basis = undefined; basisEntries = undefined
      seedMemory(state.stored)
      publish({ draft: null, stale: false, error: '', notice: '' })
      void load()
    }

    async function save() {
      if (stopped || !state.draft || !state.writable || state.saving || state.stale || issue()) return
      const op = buildOp(provider.settingsPath, state.draft)
      const revision = basis
      ++generation
      publish({ saving: true, error: '', notice: '' })
      try {
        const result = await settings.mutate(provider.settingsNs, [op], revision)
        if (stopped) return
        if (!result?.ok) {
          const conflict = result?.error?.code === 'settings/conflict'
          publish({ saving: false, stale: state.stale || conflict, error: failText(result, true) })
          if (conflict) await load()
          return
        }
        if (!Number.isInteger(result.value?.revision)) throw new Error('invalid-save-response')
        const entries = modelsFrom(result.value, path)
        basis = undefined; basisEntries = undefined
        seedMemory(entries)
        publish({ stored: entries, draft: null, revision: result.value.revision, saving: false, stale: false, error: '', notice: '推理设置已保存' })
      } catch {
        if (!stopped) publish({ saving: false, error: '保存推理设置失败，请重试。' })
      } finally {
        if (!stopped && queued) { queued = false; void load() }
      }
    }

    return {
      getSnapshot: () => state,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      start() { stopped = false; void load() },
      stop() { stopped = true; ++generation },
      load, toggle, toggleTier, setWire, restore, cancel, save, issue,
    }
  }

  // The provider-card slot already separates blocks by 12px. Keep this
  // secondary action 4px below its provider instead of adding another row gap.
  const css = `
.dshus-reasoning { margin-top:0; color:var(--dsw-alias-label-primary,light-dark(#242428,#f3f3f5)); font-family:inherit; font-size:14px; font-weight:400; line-height:22px; min-width:0; }
.dshus-reasoning[data-dsh-part=reasoning-settings] { margin-top:-8px; display:flex; flex-direction:column; }
.dshus-reasoning * { box-sizing:border-box; }
.dshus-reasoning button,.dshus-reasoning input { font:inherit; color:inherit; }
.dshus-reasoning-toggle { display:inline-flex; align-self:flex-start; align-items:center; gap:6px; padding:2px 4px; margin-left:-4px; min-height:24px; max-width:100%; border:0; border-radius:4px; background:transparent; text-align:left; cursor:pointer; }
.dshus-reasoning .dshus-reasoning-toggle { font-size:12px; font-weight:500; line-height:18px; color:var(--dsw-alias-label-secondary); }
.dshus-reasoning .dshus-reasoning-toggle:hover,.dshus-reasoning .dshus-reasoning-toggle[aria-expanded=true] { color:var(--dsw-alias-label-primary); }
.dshus-reasoning-toggle:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshus-reasoning-toggle .dshus-reasoning-chevron { flex:none; width:5px; height:5px; margin:0 1px 3px 0; }
.dshus-reasoning-toggle[aria-expanded=true] .dshus-reasoning-chevron { transform:rotate(225deg); margin-top:3px; margin-bottom:0; }
.dshus-reasoning-body { padding-top:12px; }
.dshus-reasoning-muted { color:var(--dsw-alias-label-secondary,light-dark(#65656e,#b3b3bc)); font-size:12px; line-height:18px; }
.dshus-reasoning-row { border-top:1px solid var(--dsw-alias-border-l2); }
.dshus-reasoning-summary { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px 16px; width:100%; min-height:44px; padding:12px 0; border:0; background:transparent; text-align:left; border-radius:4px; }
.dshus-reasoning-summary:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshus-reasoning-name { font-weight:500; overflow-wrap:anywhere; }
.dshus-reasoning-tail { display:flex; align-items:center; gap:10px; margin-left:auto; }
.dshus-reasoning-chevron { display:inline-block; width:7px; height:7px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg); margin:0 6px 3px; }
.dshus-reasoning-summary[aria-expanded=false] .dshus-reasoning-chevron { transform:rotate(-45deg); }
.dshus-reasoning-fields { padding:0 0 16px; }
.dshus-reasoning-enable { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 16px; }
.dshus-reasoning-check { display:inline-flex; gap:8px; align-items:center; min-height:34px; }
.dshus-reasoning input[type=checkbox] { width:16px; height:16px; margin:0; accent-color:var(--dsw-alias-label-primary); }
.dshus-reasoning .dshus-reasoning-link { border:0; background:transparent; padding:6px 0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); text-decoration:underline; text-underline-offset:3px; }
.dshus-reasoning-caption { margin:10px 0 8px; }
.dshus-reasoning-levels { display:flex; flex-wrap:nowrap; gap:8px; min-width:0; max-width:100%; overflow-x:auto; }
.dshus-reasoning-level { display:inline-flex; flex:1 0 auto; align-items:center; justify-content:center; gap:8px; min-width:64px; min-height:36px; padding:7px 8px; white-space:nowrap; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; background:var(--dsw-alias-bg-layer-2); }
.dshus-reasoning-level:has(input:checked) { background:var(--dsw-alias-interactive-bg-hover); }
.dshus-reasoning-help { margin:10px 0 0; }
.dshus-reasoning-advanced { margin-top:12px; }
.dshus-reasoning-advanced summary { width:fit-content; padding:5px 0; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:18px; }
.dshus-reasoning-wires { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px 14px; margin-top:10px; }
.dshus-reasoning-wire { display:flex; flex-direction:column; gap:5px; min-width:0; }
.dshus-reasoning-wire input { width:100%; min-height:36px; padding:7px 10px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l2); border-radius:6px; caret-color:var(--dsw-alias-label-primary); }
.dshus-reasoning-wire input::placeholder { color:var(--dsw-alias-label-secondary); opacity:1; }
.dshus-reasoning-status { margin:10px 0; }
.dshus-reasoning-error { color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:18px; overflow-wrap:anywhere; }
.dshus-reasoning-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding-top:14px; border-top:1px solid var(--dsw-alias-border-l2); }
.dshus-reasoning-actions { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; }
.dshus-reasoning-button { padding:7px 14px; min-height:36px; border:1px solid var(--dsw-alias-border-l2); border-radius:7px; background:var(--dsw-alias-bg-layer-2); }
.dshus-reasoning-button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
.dshus-reasoning-primary { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-2)!important; border-color:var(--dsw-alias-label-primary); }
.dshus-reasoning button:disabled,.dshus-reasoning input:disabled { opacity:.5; cursor:not-allowed; }
@media(max-width:480px) { .dshus-reasoning-tail { width:100%; margin-left:0; justify-content:space-between; } .dshus-reasoning-footer>.dshus-reasoning-muted { width:100%; } }
@media(pointer:coarse) { .dshus-reasoning-toggle,.dshus-reasoning-check,.dshus-reasoning-level,.dshus-reasoning-link,.dshus-reasoning-button { min-height:44px; } .dshus-reasoning-wire input { min-height:44px; font-size:16px; } }
`

  function Panel({ provider, settings, refresh }) {
    if (useLocaleRevision) useLocaleRevision()
    const h = React.createElement
    const identity = provider.settingsNs + ':' + JSON.stringify(provider.settingsPath)
    const controller = React.useMemo(() => createController(settings, provider), [settings, identity])
    const [state, setState] = React.useState(controller.getSnapshot)
    const [sectionOpen, setSectionOpen] = React.useState(false)
    const [expanded, setExpanded] = React.useState(null)
    React.useEffect(() => {
      const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()))
      const stopRefresh = refresh.subscribe(() => { void controller.load() })
      setState(controller.getSnapshot())
      controller.start()
      return () => { unsubscribe(); stopRefresh(); controller.stop() }
    }, [controller, refresh])
    const entries = state.draft || state.stored
    const disabled = !state.writable || state.saving || state.stale
    const issue = controller.issue()
    const description = entry => mode(entry) === 'inherit' ? t('模型默认') : mode(entry) === 'disabled' ? t('无强度选择') : mode(entry) === 'invalid' ? t('配置无效') : selected(entry).map(level => t(labels[level])).join(' · ') || t('待选择')
    return h('section', { className: 'dshus-reasoning', 'data-dsh-plugin': 'usage-stats', 'data-dsh-part': 'reasoning-settings', 'aria-label': t('推理强度') },
      h('button', { className: 'dshus-reasoning-toggle', type: 'button', 'aria-expanded': sectionOpen, onClick: () => setSectionOpen(!sectionOpen) }, t('推理强度'), h('span', { className: 'dshus-reasoning-chevron', 'aria-hidden': true })),
      sectionOpen ? h('div', { className: 'dshus-reasoning-body' },
      state.phase === 'loading' ? h('p', { className: 'dshus-reasoning-status dshus-reasoning-muted', role: 'status' }, t('正在读取模型设置…')) : null,
      state.phase === 'ready' && entries.length === 0 ? h('p', { className: 'dshus-reasoning-status dshus-reasoning-muted' }, t('请先在模型目录添加模型并保存，再配置推理强度。')) : null,
      state.phase === 'ready' ? entries.map((entry, index) => {
        const open = expanded === index
        const custom = mode(entry) === 'custom'
        const label = typeof entry.name === 'string' && entry.name ? entry.name : entry.id
        const rowIssue = issue && issue.index === index ? issue : null
        return h('div', { key: entry.id + ':' + index, className: 'dshus-reasoning-row' },
          h('button', { className: 'dshus-reasoning-summary', type: 'button', 'aria-expanded': open, 'aria-label': t('配置模型 {model} 的推理强度', { model: label }), onClick: () => setExpanded(open ? null : index) },
            h('span', { className: 'dshus-reasoning-name' }, label),
            h('span', { className: 'dshus-reasoning-tail' }, h('span', { className: 'dshus-reasoning-muted' }, description(entry)), h('span', { className: 'dshus-reasoning-chevron', 'aria-hidden': true }))),
          open ? h('div', { className: 'dshus-reasoning-fields' },
            h('div', { className: 'dshus-reasoning-enable' },
              h('label', { className: 'dshus-reasoning-check' }, h('input', { type: 'checkbox', checked: custom, disabled, onChange: event => controller.toggle(index, event.target.checked) }), t('允许选择推理强度')),
              h('button', { className: 'dshus-reasoning-link', type: 'button', disabled: disabled || mode(entry) === 'inherit', onClick: () => controller.restore(index) }, t('恢复模型默认'))),
            custom ? h(React.Fragment, null,
              h('div', { className: 'dshus-reasoning-caption dshus-reasoning-muted' }, t('可用档位')),
              h('div', { className: 'dshus-reasoning-levels', role: 'group', 'aria-label': t('可用推理档位') }, levels.map(level => h('label', { key: level, className: 'dshus-reasoning-level' }, h('input', { type: 'checkbox', checked: own(entry.reasoningEfforts, level), disabled, 'data-effort': level, onChange: event => controller.toggleTier(index, level, event.target.checked) }), t(labels[level])))),
              h('p', { className: 'dshus-reasoning-help dshus-reasoning-muted' }, t('在聊天输入区选择实际强度；接口需支持所选档位。')),
              h('details', { className: 'dshus-reasoning-advanced' }, h('summary', null, t('高级设置：参数取值')),
                h('div', { className: 'dshus-reasoning-wires' }, selected(entry).map(level => h('label', { key: level, className: 'dshus-reasoning-wire' }, h('span', { className: 'dshus-reasoning-muted' }, t(labels[level]) + ' (' + level + ')'), h('input', { type: 'text', value: entry.reasoningEfforts[level] ?? '', disabled, autoComplete: 'off', spellCheck: false, 'aria-label': t('{level}档参数取值', { level: t(labels[level]) }), placeholder: level === 'off' ? t('不发送强度参数') : level, 'aria-invalid': !!rowIssue && rowIssue.level === level, onChange: event => controller.setWire(index, level, event.target.value) })))),
                h('p', { className: 'dshus-reasoning-help dshus-reasoning-muted' }, t('关闭档留空表示不发送强度参数；是否关闭推理由接口决定。'))))
              : h('p', { className: 'dshus-reasoning-help dshus-reasoning-muted' }, mode(entry) === 'inherit' ? t('沿用模型目录的默认能力。') : t('聊天输入区将隐藏强度选择。')),
            rowIssue ? h('p', { className: 'dshus-reasoning-error', role: 'alert' }, t(rowIssue.message)) : null) : null)
      }) : null,
      state.stale ? h('p', { className: 'dshus-reasoning-error', role: 'alert' }, t('模型设置已更新，未保存的更改已保留。请取消更改后重新编辑。')) : null,
      state.error && !state.stale ? h('p', { className: 'dshus-reasoning-error', role: 'alert' }, t(state.error)) : null,
      state.phase === 'error' ? h('button', { className: 'dshus-reasoning-button', type: 'button', onClick: () => { void controller.load() } }, t('重试')) : null,
      state.phase === 'ready' && entries.length > 0 ? h('footer', { className: 'dshus-reasoning-footer' },
        h('span', { className: 'dshus-reasoning-muted', role: 'status', 'aria-live': 'polite' }, !state.writable ? t('模型设置只读') : state.saving ? t('正在保存…') : issue ? t('请检查模型 {model} 的推理配置', { model: entries[issue.index].name || entries[issue.index].id }) : state.draft ? t('有未保存的更改') : state.notice ? t(state.notice) : ''),
        h('div', { className: 'dshus-reasoning-actions' }, h('button', { type: 'button', className: 'dshus-reasoning-button', disabled: !state.draft || state.saving, onClick: () => controller.cancel() }, t('取消')), h('button', { type: 'button', className: 'dshus-reasoning-button dshus-reasoning-primary', disabled: !state.draft || disabled || !!issue, onClick: () => { void controller.save() } }, state.saving ? t('保存中…') : t('保存推理设置')))) : null) : null)
  }

  /** Public registry only; never replace a competing plugin's keyed entry. */
  function mount(ctx) {
    const slots = ctx.get('slots')
    const remote = ctx.get('remote')
    const face = remote?.settings
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function' || typeof face?.describe !== 'function' || typeof face?.mutate !== 'function') return
    let inflight
    const settings = {
      describe() {
        if (!inflight) {
          const request = Promise.resolve().then(() => face.describe())
          inflight = request
          request.then(() => { if (inflight === request) inflight = undefined }, () => { if (inflight === request) inflight = undefined })
        }
        return inflight
      },
      mutate: (ns, ops, revision) => face.mutate(ns, ops, revision),
    }
    const listeners = new Set()
    const refresh = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) } }
    let conflict = false, stopped = false
    const disposers = []
    const notify = () => { for (const listener of [...listeners]) listener() }
    function ConflictNotice() {
      if (useLocaleRevision) useLocaleRevision()
      const [visible, setVisible] = React.useState(conflict)
      React.useEffect(() => refresh.subscribe(() => setVisible(conflict)), [])
      return visible ? React.createElement('p', { className: 'dshus-reasoning dshus-reasoning-error', role: 'alert' }, t('推理强度扩展区已被其他插件占用，请停用其中一个模型配置插件。')) : null
    }
    try {
      if (typeof remote.$on === 'function') disposers.push(remote.$on('settings/document-updated', ns => { if (ns === 'llm-pi-ai') notify() }))
      let style = document.getElementById(styleId)
      if (!style) { style = document.createElement('style'); style.id = styleId; document.head.appendChild(style) }
      style.textContent = css
      disposers.push(() => style.remove())
      disposers.push(slots.inject(slotName, () => {
        let release, claiming = false, disposed = false
        const claim = () => {
          if (stopped || disposed || claiming || release) return
          claiming = true
          try {
            release = slots.register({ name: slotName, key: 'llm-pi-ai', inject: () => ({ settings, refresh }) }, props => {
              if (typeof props.provider?.settingsNs !== 'string' || !Array.isArray(props.provider?.settingsPath)) return null
              return React.createElement(Panel, props)
            })
            if (conflict) { conflict = false; notify() }
          } catch {
            if (!conflict) { conflict = true; notify(); console.warn('[dsh-usage-stats] reasoning settings provider-card slot is occupied') }
          } finally { claiming = false }
        }
        claim()
        const unsubscribe = typeof slots.subscribe === 'function' ? slots.subscribe(slotName, claim) : () => {}
        return () => { disposed = true; unsubscribe(); if (typeof release === 'function') release() }
      }))
      disposers.push(slots.inject('settings.models.footer', () => slots.register({ name: 'settings.models.footer', id: 'usage-stats-reasoning-conflict' }, ConflictNotice)))
    } catch {
      console.warn('[dsh-usage-stats] reasoning settings extension unavailable')
    }
    return () => {
      stopped = true
      for (const dispose of disposers.reverse()) {
        if (typeof dispose === 'function') dispose()
        else if (typeof dispose?.dispose === 'function') dispose.dispose()
      }
      listeners.clear()
    }
  }

  /** Feature visibility never rewrites the model capability declarations. */
  function createVisibility(ctx) {
    let release, readyCtx, scope, started = false, enabled = true, stopped = false
    const unmount = () => { if (release) { const dispose = release; release = undefined; dispose() } }
    const reconcile = () => {
      if (stopped) return
      if (enabled && readyCtx && !release) release = mount(readyCtx)
      else if (!enabled) unmount()
    }
    return {
      sync(settings) {
        if (stopped) return false
        enabled = settings?.modelReasoning !== false
        if (!started) {
          started = true
          if (typeof ctx.inject === 'function') {
            // RPC faces arrive asynchronously; register in their service scope.
            scope = ctx.inject(['slots', 'remote', 'remote.settings'], ready => {
              if (stopped) return
              readyCtx = ready
              reconcile()
              return () => { readyCtx = undefined; unmount() }
            })
          } else readyCtx = ctx
        }
        reconcile()
        return enabled
      },
      dispose() {
        stopped = true
        readyCtx = undefined
        unmount()
        if (typeof scope === 'function') scope()
        else if (typeof scope?.dispose === 'function') scope.dispose()
        scope = undefined
      },
    }
  }

  return { levels, labels, preset, mode, selected, validate, modelsFrom, buildOp, createController, Panel, mount, createVisibility, css }
}

var reasoningSettings = typeof createReasoningSettings === 'function' ? createReasoningSettings(React, t, useLocaleRevision) : null

var SEAT_STYLE_ID = 'dsh-usage-stats-seat-styles'

var SEAT_ENABLED_KEY = 'dsh-usage-stats-advanced-model-select'

var SEAT_COLOR_DEFAULT = 'blue'

var SEAT_COLOR_LABELS = { red: '红色', green: '绿色', yellow: '黄色', blue: '蓝色', purple: '紫色' }

// A missing or unknown value (an older store, a hand-edited file) falls back
// to the blue palette instead of leaving the selector unthemed.
function seatNormalizeColor(color) {
      for (var i = 0; i < SEAT_COLOR_CHOICES.length; i++) {
        if (SEAT_COLOR_CHOICES[i].name === color) return color
      }
      return SEAT_COLOR_DEFAULT
    }

// The seat is painted in the page, so one attribute on <html> retints every
// mounted selector — including ones the host has cached for other sessions.
function seatApplyColor(color) {
      var next = seatNormalizeColor(color)
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
          document.documentElement.dataset.dshusSeatColor = next
        }
      } catch (error) { /* best-effort theming */ }
      return next
    }

function seatClearColor() {
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
          delete document.documentElement.dataset.dshusSeatColor
        }
      } catch (error) { /* best-effort theming */ }
    }

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

function SeatCheckIcon() {
      return React.createElement('svg', { viewBox: '0 0 16 16', width: '14', height: '14', 'aria-hidden': true },
        React.createElement('path', { d: 'M3.5 8.5l3 3 6-7', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
    }

function seatReadEnabledPref() {
      try { return localStorage.getItem(SEAT_ENABLED_KEY) === '1' } catch (error) { return false }
    }

function seatWriteEnabledPref(value) {
      try { localStorage.setItem(SEAT_ENABLED_KEY, value ? '1' : '0') } catch (error) { /* startup hint is best-effort */ }
    }

var SEAT_EFFORT_ZH = { auto: '自动', default: '默认', none: '关', off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最大' }

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

/**
 * Render whatever the host reported for a rejected model switch.
 *
 * `ModelDirectory.select()` resolves with the Remote failure result
 * (`{ ok: false, error: { code, message } }`) instead of throwing, and an
 * adapter may also reject outright, so normalize both shapes into one line.
 */
function seatFailureText(result) {
      if (result && typeof result === 'object' && result.error && typeof result.error === 'object') {
        var code = result.error.code ? String(result.error.code) : ''
        var message = result.error.message ? String(result.error.message) : ''
        if (code && message) return code + ': ' + message
        return message || code || t('切换模型失败')
      }
      var direct = result && typeof result === 'object' && typeof result.message === 'string' ? result.message : ''
      if (direct) return direct
      if (typeof result === 'string' && result) return result
      return t('切换模型失败')
    }

/**
 * Read the deployment default model — the selection a session that does not
 * exist yet will start with.
 *
 * A composer that paints before its session is created has no model directory
 * (the host resolves one per retained session scope), so a per-session switch is
 * impossible there. The host owns the default (`agentDefaultModel`) and writes
 * it after every session-level switch, so the seat drives that instead.
 */
function seatSaveDefaultModel(selection) {
      var body = { provider: selection.provider, model: selection.model }
      if (selection.reasoningEffort !== undefined) body.reasoningEffort = selection.reasoningEffort
      return Promise.resolve(fetch('/api/dsh-usage-stats/default-model', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
      }).then(readJson))
    }

function seatPrand(i, salt) {
      var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
      return x - Math.floor(x)
    }

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
 * Last-resort guard: a composer seat that throws would be dropped from its slot
 * cell for the rest of the page life, and the cell would then render nothing at
 * all. Reporting the failure and painting a disabled trigger keeps the composer
 * honest instead of blank.
 */
function ModelSeat(props) {
  try {
    return ModelSeatBody(props)
  } catch (error) {
    seatDiag('seat/render-threw', { message: (error && error.message) || String(error) })
    console.warn('[dsh-usage-stats] 高级模型选择器: render failed', error)
    return React.createElement('button', { type: 'button', className: 'rs2-root rs2-trigger', disabled: true }, t('选择模型'))
  }
}

function ModelSeatBody(props) {
      useLocaleRevision()
      var store = props.store
      var state = React.useSyncExternalStore(
        function (onChange) { return store ? store.subscribe(onChange) : function () {} },
        function () { return store ? store.getSnapshot() : null },
      )
      // Render evidence: without it a seat that mounts and injects but paints
      // nothing is indistinguishable from one that never reached the composer.
      if (seatDiagSent < 30) {
        seatDiag('seat/render', {
          available: props.available !== false,
          store: !!store,
          state: !!state,
          status: state ? state.status : undefined,
          current: state && state.current ? state.current.model : null,
          groups: state && state.groups ? state.groups.length : undefined,
          locked: props.locked === true,
        })
      }
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
      var failureState = React.useState(null)
      var failure = failureState[0]
      var setFailure = failureState[1]
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
        setFailure(null)
        // The host reports a failed switch as a result, not as a throw — and a
        // switch that silently does nothing is indistinguishable from a broken
        // selector, so keep the menu open and show what the host said.
        return Promise.resolve(props.select(selection)).then(function (result) {
          if (result !== false && !(result && result.ok === false)) {
            setOpt(null)
            return
          }
          setFailure({ text: seatFailureText(result), selection: selection })
          setOpen(true)
        }, function (error) {
          setFailure({ text: seatFailureText(error), selection: selection })
          setOpen(true)
        }).finally(function () {
          selectingRef.current = false
          setOpt(null)
        })
      }
      var stops = []
      var value = 0
      var committedIdx = 0
      if (current && reasoning && reasoning.efforts.length > 0) {
        stops = seatEffortStops(reasoning)
        var idx = -1
        for (var si = 0; si < stops.length; si++) { if (stops[si].id === current.reasoningEffort) { idx = si; break } }
        if (idx === -1) for (var sj = 0; sj < stops.length; sj++) { if (stops[sj].id === undefined) { idx = sj; break } }
        if (idx === -1) idx = 0
        committedIdx = idx
        value = opt && opt.provider === current.provider && opt.model === current.model && opt.value !== idx ? opt.value : idx
      }
      // A brand-new session has no projected model yet, so there is no effort
      // ladder to drag. Keeping the menu on "advanced" then shows an empty rail
      // and hides the model list — the selector looks broken exactly while the
      // user picks the session's first model. Mirror the official seat: with no
      // current model (or no effort levels) the menu opens on the model list.
      var effortPane = stops.length > 0
      var pane = mode === 'models' || !effortPane ? 'models' : 'advanced'
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
      if (pane === 'models') {
        body = React.createElement(React.Fragment, null,
          effortPane ? React.createElement('button', { type: 'button', className: 'rs2-back', onClick: function () { setMode('advanced') } }, t('‹ 模型')) : null,
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
            setFailure(null)
            if (props.available) props.load()
            setOpen(function (v) {
              var next = !v
              if (next) setMode(effortPane ? 'advanced' : 'models')
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
        open && React.createElement('div', { className: 'rs2-menu' },
          failure ? React.createElement('div', { className: 'rs2-error', role: 'alert' },
            React.createElement('span', { className: 'rs2-error-text' }, failure.text),
            React.createElement('button', {
              type: 'button',
              className: 'rs2-retry',
              onClick: function () {
                // Retry the rejected switch itself; only fall back to reloading
                // the catalog when the failure carried no selection.
                var rejected = failure
                setFailure(null)
                if (rejected.selection) commitSelection(rejected.selection)
                else if (props.available) props.load()
              },
            }, t('重试'))) : null,
          state.defaultModel === true ? React.createElement('div', { className: 'rs2-hint' }, t('新会话默认模型，创建后生效')) : null,
          body))
    }

function seatDisposer() {
      // `stores` holds every per-session seat store the seat minted, so unmounting
      // the selector also stops their pending resolve timers and mirroring.
      var state = { disposed: false, disposer: undefined, fiber: undefined, stores: [], timers: [] }
      function dispose() {
        if (state.disposed) return
        state.disposed = true
        if (typeof state.disposer === 'function') state.disposer()
        // The registration is owned by the seat's child fiber, so disposing it
        // also releases the slot controller — including when the fiber was
        // still waiting for its services.
        if (state.fiber && typeof state.fiber.dispose === 'function') {
          try {
            var pending = state.fiber.dispose()
            if (pending && typeof pending.catch === 'function') pending.catch(function () {})
          } catch (error) { /* fiber already disposed */ }
        }
        state.timers.slice().forEach(function (stop) {
          try { if (typeof stop === 'function') stop() } catch (error) { /* timer already fired */ }
        })
        state.timers.length = 0
        state.stores.slice().forEach(function (store) {
          try { store.dispose() } catch (error) { /* store already disposed */ }
        })
        state.stores.length = 0
      }
      return {
        state: state,
        dispose: dispose,
      }
    }

// A brand-new session paints the composer seat before its session scope is
// retained, and `modelDirectories.directoryFor(sessionId)` fails loud on
// unknown sessions ("resolved no scope" / "resolved no binding"). The host
// caches every inject result per session binding and permanently abdicates any
// entry that throws while rendering, so neither throwing nor answering
// "unavailable" from `inject` is survivable: both leave the composer model area
// empty for the rest of that session. The seat therefore hands the component a
// live store that starts pending, resolves once the session's scope exists, and
// notifies on every transition — the trigger paints immediately and fills in
// the real model as soon as the directory can be resolved.
var SEAT_RESOLVE_ATTEMPTS = 48
var SEAT_RESOLVE_DELAY = 90

var SEAT_PENDING_SNAPSHOT = {
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'loading',
  pending: null,
  error: null,
}

var SEAT_UNRESOLVED_SNAPSHOT = {
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'error',
  pending: null,
  error: 'model directory unresolved',
}

// One catalog per host generation, mirroring the official `ModelCatalogDirectory`.
// The catalog is the only model source that needs no session scope, so it is what
// a brand-new session can render at all; sharing it also keeps every seat from
// repeating the same remote call.
var SEAT_CATALOG_TTL = 15000

var seatCatalog = { owner: null, value: null, status: 'idle', error: null, at: 0 }
var seatCatalogWatchers = []

// Deployment default written by a seat, keyed by session: rebuilding the seat for
// the same session must show the pick instead of snapping back to the config value.
var seatDefaultChoices = {}

var seatCatalogLogged = ''

function seatCatalogNotify() {
  var stamp = seatCatalog.status + '|' + (seatCatalog.error || '')
  if (stamp !== seatCatalogLogged) {
    seatCatalogLogged = stamp
    seatDiag('seat/catalog', { status: seatCatalog.status, error: seatCatalog.error || null })
  }
  seatCatalogWatchers.slice().forEach(function (fn) {
    try { fn() } catch (error) { console.warn('[dsh-usage-stats] 高级模型选择器: catalog watcher failed', error) }
  })
}

/**
 * Pull the host-generation model catalog through the shared remote namespace.
 *
 * @param remote - the `remote` client namespace (`ctx.get('remote')`).
 * @param force - reload even when a ready catalog is already cached.
 */
function seatCatalogLoad(remote, force) {
  if (remote === null || remote === undefined) {
    seatCatalog.status = 'error'
    seatCatalog.error = 'remote namespace unavailable'
    seatCatalogNotify()
    return
  }
  var session = remote.session
  if (!session || typeof session.modelCatalog !== 'function') {
    // Not transient: without the namespace there is nothing to retry, so say so
    // instead of leaving a brand-new session on "loading" forever.
    seatCatalog.status = 'error'
    seatCatalog.error = 'model catalog unavailable in this host'
    seatCatalogNotify()
    return
  }
  // The catalog belongs to a host generation: a different remote namespace means
  // a different host, so the cached view must not bleed across.
  if (seatCatalog.owner !== remote) {
    seatCatalog.owner = remote
    seatCatalog.value = null
    seatCatalog.status = 'idle'
    seatCatalog.error = null
    seatCatalog.at = 0
  }
  if (seatCatalog.status === 'loading') return
  if (force !== true && seatCatalog.status === 'ready' && seatCatalog.value !== null) return
  seatCatalog.status = 'loading'
  seatCatalog.error = null
  seatCatalogNotify()
  var pending
  try {
    pending = session.modelCatalog()
  } catch (error) {
    seatCatalog.status = 'error'
    seatCatalog.error = (error && error.message) || String(error)
    seatCatalogNotify()
    return
  }
  Promise.resolve(pending).then(function (response) {
    if (!response || !response.ok) {
      var failure = response && response.error
      seatCatalog.status = 'error'
      seatCatalog.error = failure && failure.code ? failure.code + ': ' + failure.message : 'model catalog unavailable'
      seatCatalogNotify()
      return
    }
    seatCatalog.value = response.value || null
    seatCatalog.status = seatCatalog.value === null ? 'error' : 'ready'
    seatCatalog.error = seatCatalog.value === null ? 'empty model catalog' : null
    seatCatalog.at = Date.now()
    seatCatalogNotify()
  }, function (error) {
    seatCatalog.status = 'error'
    seatCatalog.error = (error && error.message) || String(error)
    seatCatalogNotify()
  })
}

/** True when the cached catalog is old enough to justify a refresh. */
function seatCatalogStale() {
  if (seatCatalog.status !== 'ready' || seatCatalog.value === null) return true
  return (Date.now() - seatCatalog.at) > SEAT_CATALOG_TTL
}

// The desktop renderer console is not reachable from the host, so every seat
// decision that used to fail silently is reported to the control route and
// appended to ~/.dsh/usage-stats-seat-diag.log.
var seatDiagSent = 0

function seatDiag(event, data) {
  if (seatDiagSent >= 120) return
  seatDiagSent++
  try {
    var body = { event: event }
    if (data) Object.keys(data).forEach(function (key) { if (data[key] !== undefined) body[key] = data[key] })
    var request = fetch('/api/dsh-usage-stats/seat-diag', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (request && typeof request.catch === 'function') request.catch(function () {})
  } catch (error) {
    /* diagnostics must never break the seat */
  }
}

/**
 * Per-session seat store that survives a late-arriving model directory.
 *
 * `modelDirectories.directoryFor` fails while a session's scope/binding is
 * still being materialized, which is exactly what a brand-new session looks
 * like on its first frames. Failures are retried on a fibre-owned timer rather
 * than reported as an unavailable seat; once the directory exists the store
 * mirrors its snapshots, so the component keeps the official
 * `{ current, groups, status, error }` view.
 *
 * @param models - the `modelDirectories` client service.
 * @param sessionId - session whose directory this seat renders.
 * @param retry - schedules `fn` after `delay` ms, owned by the plugin fibre.
 */
function createSeatStore(models, sessionId, retry, hooks) {
      hooks = hooks || {}
      var directory = null
      var listeners = []
      var stopMirror = null
      var attempts = 0
      var disposed = false
      var unresolved = false
      var cache = null
      // Fallback view for a composer whose session does not exist yet. Such a
      // session owns no model directory, so the seat shows the shared catalog and
      // the deployment default the new session will start with, and writes that
      // default when the user picks something.
      seatCatalogWatchers.push(watchCatalog)
      function emit() {
        cache = null
        listeners.slice().forEach(function (fn) {
          try { fn() } catch (error) { console.warn('[dsh-usage-stats] 高级模型选择器: store listener failed', error) }
        })
      }
      function watchCatalog() {
        emit()
      }
      function loadCatalog(force) {
        if (disposed) return
        seatCatalogLoad(hooks.remote, force === true)
      }
      /**
       * Snapshot of the fallback view, rebuilt only when something changed so
       * `useSyncExternalStore` sees a stable reference between renders.
       */
      function fallbackSnapshot() {
        if (cache !== null) return cache
        var value = seatCatalog.value
        var groups = (value && value.groups) || []
        var failures = (value && value.failures) || []
        cache = {
          current: seatDefaultChoices[sessionId] || (value && value.default) || null,
          routable: null,
          groups: groups,
          failures: failures,
          status: seatCatalog.status === 'error' ? 'error' : 'ready',
          pending: null,
          error: seatCatalog.status === 'error' ? seatCatalog.error : null,
          // Tells the component this seat drives the deployment default rather
          // than the current session's model.
          defaultModel: true,
        }
        return cache
      }
      function selectDefault(selection) {
        return seatSaveDefaultModel(selection).then(function (response) {
          if (response && response.ok === false) {
            return { ok: false, error: { code: 'model/default-model', message: response.error || '' } }
          }
          // `saveSelection()` returns quietly when the deployment has no config
          // editor, so an "ok" answer alone does not prove the pick survives the
          // next session; say so instead of showing a switch that did nothing.
          if (response && response.persisted === false) {
            return { ok: false, error: { code: 'model/not-persisted', message: t('默认模型未能写入配置') } }
          }
          seatDefaultChoices[sessionId] = (response && response.selection) || selection
          emit()
          return { ok: true }
        }, function (error) {
          return { ok: false, error: { code: 'model/default-model', message: (error && error.message) || String(error) } }
        })
      }
      function adopt(found) {
        directory = found
        unresolved = false
        attempts = 0
        var source = found && found.store
        if (source && typeof source.subscribe === 'function') {
          var stop = source.subscribe(emit)
          if (typeof stop === 'function') stopMirror = stop
        }
        // Adopting is this seat's mount: the component already ran its own load
        // effect against the pending store, so the catalog has to be pulled here.
        try {
          var pending = found && found.load()
          if (pending && typeof pending.catch === 'function') pending.catch(function () {})
        } catch (error) {
          console.warn('[dsh-usage-stats] 高级模型选择器: load failed', error)
        }
      }
      function schedule() {
        if (disposed || directory !== null) return
        if (attempts >= SEAT_RESOLVE_ATTEMPTS) {
          if (unresolved) return
          unresolved = true
          console.warn('[dsh-usage-stats] 高级模型选择器: directoryFor never resolved for session', sessionId)
          emit()
          return
        }
        var delay = Math.min(SEAT_RESOLVE_DELAY + attempts * 30, 1200)
        attempts++
        retry(resolve, delay)
      }
      function resolve() {
        if (disposed || directory !== null) return directory
        var found
        try {
          found = models.directoryFor(sessionId)
        } catch (error) {
          // Unknown-session timing, not a broken seat: wait for the scope. The
          // shared catalog needs no session scope, so pull it in the meantime —
          // that is what lets a not-yet-created session list models at all.
          if (attempts < 3) seatDiag('seat/directory-error', { session: String(sessionId), message: (error && error.message) || String(error) })
          loadCatalog()
          schedule()
          return null
        }
        if (!found) {
          schedule()
          return null
        }
        adopt(found)
        emit()
        return found
      }
      var store = {
        getSnapshot: function () {
          var source = directory && directory.store
          if (source && typeof source.getSnapshot === 'function') return source.getSnapshot()
          if (seatCatalog.value !== null) return fallbackSnapshot()
          return unresolved ? SEAT_UNRESOLVED_SNAPSHOT : SEAT_PENDING_SNAPSHOT
        },
        subscribe: function (fn) {
          if (typeof fn !== 'function') return function () {}
          listeners.push(fn)
          return function () {
            var index = listeners.indexOf(fn)
            if (index >= 0) listeners.splice(index, 1)
          }
        },
      }
      return {
        store: store,
        resolve: resolve,
        resolved: function () { return directory !== null },
        load: function () {
          // An explicit load (mount, or a click on the trigger) is a fresh
          // chance: reset the budget so a directory that appeared later is
          // still picked up after the automatic retries gave up.
          if (directory === null && unresolved) {
            unresolved = false
            attempts = 0
          }
          var had = directory !== null
          var found = resolve()
          if (!found) {
            // A session that has no directory yet still opens a usable menu: the
            // shared catalog needs no scope, so refresh it when it went stale.
            loadCatalog(seatCatalogStale())
            return
          }
          // A directory adopted by this very call already pulled the catalog.
          if (!had) return
          try {
            var pending = found.load()
            if (pending && typeof pending.catch === 'function') pending.catch(function () {})
          } catch (error) {
            console.warn('[dsh-usage-stats] 高级模型选择器: load failed', error)
          }
        },
        // Keep the official `{ ok, error }` outcome: swallowing a failure into a
        // boolean left the menu open with no explanation, which reads as a dead
        // selector.
        select: function (selection) {
          var found = resolve()
          if (!found) return selectDefault(selection)
          return Promise.resolve(found.select(selection)).then(function (result) {
            return result === undefined ? { ok: true } : result
          }, function (error) {
            return { ok: false, error: { code: 'select/failed', message: (error && error.message) || String(error) } }
          })
        },
        dispose: function () {
          disposed = true
          var index = seatCatalogWatchers.indexOf(watchCatalog)
          if (index >= 0) seatCatalogWatchers.splice(index, 1)
          if (typeof stopMirror === 'function') {
            try { stopMirror() } catch (error) { /* directory already gone */ }
          }
          stopMirror = null
          listeners.length = 0
        },
      }
    }

/**
 * Priorities currently registered in the composer's model cell. It answers the
 * one question the seat cannot answer from inside: is this registration really
 * the winning entry of the cell, or is something else shadowing it?
 */
function seatEntryPriorities(slots) {
  if (typeof slots.entries !== 'function') return null
  try {
    var entries = slots.entries('conversation.input.model') || []
    return entries.map(function (entry) {
      return entry && entry.priority !== undefined ? entry.priority : null
    })
  } catch (error) {
    return null
  }
}

function registerModelSeat(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) {
        seatDiag('seat/no-slots')
        console.warn('[dsh-usage-stats] 高级模型选择器: slots service unavailable')
        return null
      }
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      // The shared catalog lives on the remote namespace; it is the only model
      // source available before a session's scope exists, so the seat keeps it
      // optional and degrades to the pending view without it. Client plugins
      // reach it as `ctx.remote` (the declared `remote` service); `ctx.get` is
      // kept as a fallback for hosts that expose it as a plain service instead.
      var remote = ctx.remote !== undefined ? ctx.remote : ctx.get('remote')
      if (models === undefined || typeof models.directoryFor !== 'function' || sessions === undefined || typeof sessions.subagentAddress !== 'function') {
        seatDiag('seat/no-services', { models: models !== undefined, sessions: sessions !== undefined, remote: remote !== undefined })
        console.warn('[dsh-usage-stats] 高级模型选择器: modelDirectories/sessions service unavailable')
        return null
      }
      var handle = seatDisposer()
      // `ModelDirectoryResolver.directoryFor` runs on its caller's context and
      // reads `ctx.sessions` / `ctx.remote.session` there. Declaring those at
      // the top level would make the whole settings section wait for
      // `modelDirectories`, which hosts without the official selector do not
      // have; a child fiber scoped to the seat's services satisfies the guard
      // without turning them into plugin-wide dependencies.
      try {
        handle.state.fiber = ctx.inject(['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], function (seatCtx) {
          mountModelSeat(seatCtx, handle)
        })
      } catch (error) {
        seatDiag('seat/inject-threw', { message: (error && error.message) || String(error) })
        console.warn('[dsh-usage-stats] 高级模型选择器: scoped inject failed', error)
        return null
      }
      return handle
    }

function mountModelSeat(ctx, handle) {
      var slots = ctx.get('slots')
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      var remote = ctx.remote !== undefined ? ctx.remote : ctx.get('remote')
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
      // Retry timers for seat stores still waiting on a session scope. They are
      // owned by the plugin fibre (ctx.timeout) and cancelled when the seat
      // unmounts, so a disabled selector leaves nothing running.
      function later(fn, delay) {
        if (handle.state.disposed || typeof ctx.timeout !== 'function') return
        var stop
        var fire = function () {
          var index = handle.state.timers.indexOf(stop)
          if (index >= 0) handle.state.timers.splice(index, 1)
          fn()
        }
        try {
          stop = ctx.timeout(fire, delay)
        } catch (error) {
          console.warn('[dsh-usage-stats] 高级模型选择器: retry timer failed', error)
          return
        }
        if (typeof stop === 'function') handle.state.timers.push(stop)
      }
      slots.inject('conversation.input.model', function () {
        if (handle.state.disposed) return undefined
        var disposer
        try {
          disposer = slots.register({
            name: 'conversation.input.model',
            // A negative priority places this enabled seat ahead of the official selector.
            priority: -1,
            locale: 'model',
            inject: function (sessionId) {
              var addressed = true
              try {
                addressed = sessions.subagentAddress(sessionId) === undefined
              } catch (error) {
                addressed = true
              }
              // Agent-addressed subagent sessions cannot switch models; the
              // official seat renders nothing for them either (`if (!available)
              // return null`), so mirroring that keeps the composer identical.
              if (!addressed) {
                seatDiag('seat/inject-addressed', { session: String(sessionId) })
                return { available: false }
              }
              var seat = createSeatStore(models, sessionId, later, { remote: remote })
              handle.state.stores.push(seat)
              // The host caches one inject result per session, so this list grows
              // with the sessions the composer was ever painted for; keep it bounded
              // by retiring the oldest store (a session that is painted again mints
              // a fresh one through the same path).
              while (handle.state.stores.length > 64) {
                var oldest = handle.state.stores.shift()
                try { oldest.dispose() } catch (error) { /* store already disposed */ }
              }
              // Resolve eagerly: a retained session (every session whose composer
              // already paints) skips the pending state entirely, so the trigger
              // still shows the real model on its first frame.
              seat.resolve()
              seatDiag('seat/inject', {
                session: String(sessionId),
                resolved: seat.resolved(),
                catalog: seatCatalog.status,
                remote: remote !== undefined,
              })
              return {
                available: true,
                store: seat.store,
                load: seat.load,
                select: seat.select,
              }
            },
          }, function (slotProps) {
            return React.createElement(ModelSeat, Object.assign({}, slotProps, { scheduleClear: scheduleClear }))
          })
        } catch (error) {
          seatDiag('seat/register-threw', { message: (error && error.message) || String(error) })
          console.warn('[dsh-usage-stats] 高级模型选择器: register failed', error)
          return undefined
        }
        if (handle.state.disposed) {
          if (typeof disposer === 'function') disposer()
          return undefined
        }
        seatDiag('seat/registered', { priority: -1, entries: seatEntryPriorities(slots) })
        handle.state.disposer = disposer
        return disposer
      })
    }

var seatRegistration = null

var reasoningVisibility = null

var modelSeatSync = null

var modelSeatSyncRevision = 0

function setModelSeatSync(fn) {
      modelSeatSync = fn
    }

function syncModelSeatFromControls(control) {
      if (typeof modelSeatSync !== 'function') return false
      try {
        // Wait for an explicit host value before mounting the selector.
        var enabled = !!(control && control.settings && control.settings.advancedModelSelect)
        seatApplyColor(control && control.settings && control.settings.modelSeatColor)
        modelSeatSyncRevision++
        seatWriteEnabledPref(enabled)
        return modelSeatSync(enabled)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 sync failed:', error)
        return false
      }
    }

function syncModelFeaturesFromControls(control) {
      if (reasoningVisibility) reasoningVisibility.sync(control && control.settings)
      return syncModelSeatFromControls(control)
    }

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
          if (!syncModelFeaturesFromControls(body) && enabled) retry()
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
          seatClearColor()
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

function registerLocale(ctx) {
  var locale = ctx.get('locale')
  if (!locale || typeof locale.register !== 'function' || typeof locale.bind !== 'function') return
  var dictionaries = { zh: {}, en: {}, ja: {} }
  Object.keys(messages).forEach(function (key) { dictionaries.zh[key] = key; dictionaries.en[key] = messages[key][0]; dictionaries.ja[key] = messages[key][1] })
  ctx.effect(function () { return locale.register(SECTION_ID, dictionaries) }, SECTION_ID + ': translations')
  localeService = locale; translate = locale.bind(SECTION_ID)
}

function apply(ctx) {
  // DSH Desktop marks its renderer through the preload bridge dshDesktop.
  // 0.2.0-rc.2 exposes only { protocolVersion: 1 }; older builds carried a
  // deviceInfo() function. Accept either marker so the settings section
  // registers on both, while plain browser tabs (no bridge) still bail out.
  if (typeof window === 'undefined' || !window.dshDesktop) return
  var hasDeviceInfo = typeof window.dshDesktop.deviceInfo === 'function'
  var hasProtocolVersion = typeof window.dshDesktop.protocolVersion === 'number'
  if (!hasDeviceInfo && !hasProtocolVersion) return
  if (applyStarted) return
  applyStarted = true
  mountClient(ctx, 0)
}

// The client half must never lose the race against the services it renders
// into. `dsh.client.inject` in package.json is what normally makes the host wait
// for them, but a host that activates this plugin without that gate (or a slot
// service that appears a frame later) would otherwise leave the caller with no
// seat and no settings section at all, silently and permanently.
var applyStarted = false
var APPLY_RETRY_LIMIT = 40

function mountClient(ctx, attempt) {
  var slots = ctx.get('slots')
  if (slots) {
    if (attempt > 0) seatDiag('apply/delayed', { attempts: attempt })
    mountClientOnce(ctx, slots)
    return
  }
  if (attempt >= APPLY_RETRY_LIMIT) {
    seatDiag('apply/no-slots', { attempts: attempt })
    console.warn('[dsh-usage-stats] 用量统计: slots service never appeared; client UI not mounted')
    return
  }
  var delay = Math.min(50 + attempt * 50, 1000)
  var again = function () { mountClient(ctx, attempt + 1) }
  if (typeof ctx.timeout === 'function') {
    try { ctx.timeout(again, delay); return } catch (error) { /* fall through to window timer */ }
  }
  if (typeof window.setTimeout === 'function') window.setTimeout(again, delay)
}

function mountClientOnce(ctx, slots) {
  seatDiag('apply/mounted', {
    slots: slots !== undefined,
    locale: ctx.get('locale') !== undefined,
    timer: typeof ctx.timeout === 'function',
    remote: ctx.remote !== undefined || ctx.get('remote') !== undefined,
    modelDirectories: ctx.get('modelDirectories') !== undefined,
    sessions: ctx.get('sessions') !== undefined,
    seatPref: seatReadEnabledPref(),
  })
  registerLocale(ctx)
  // An abdicated entry is silently dropped from its cell for the rest of the
  // page life, and that is the difference between "our seat is hidden" and "the
  // seat never registered" — so record every abdication the host reports.
  if (typeof slots.onEntryError === 'function') {
    try {
      ctx.effect(function () {
        return slots.onEntryError(function (slotKey, entry, error) {
          seatDiag('slot/entry-error', {
            slot: slotKey === undefined ? null : String(slotKey),
            message: (error && error.message) || String(error),
          })
        })
      }, 'dsh-usage-stats: slot diagnostics')
    } catch (error) {
      /* diagnostics only */
    }
  }
  var api = new UsageApi()
  // Final evidence for the composer seat: does our trigger actually exist in the
  // DOM, does it have a box, and is the host showing a dead cell instead?
  ctx.effect(function () {
    if (typeof ctx.timeout !== 'function') return undefined
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return undefined
    var schedule = ctx.timeout
    var stops = []
    function probe(delay, label) {
      stops.push(schedule(function () {
        var trigger = null
        try { trigger = typeof document.querySelector === 'function' ? document.querySelector('.rs2-trigger') : null } catch (error) { trigger = null }
        var rect = null
        try { rect = trigger && typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : null } catch (error) { rect = null }
        var dead = 0
        try { dead = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('[data-slot-error]').length : 0 } catch (error) { dead = 0 }
        seatDiag('seat/dom', {
          at: label,
          trigger: trigger !== null,
          width: rect ? Math.round(rect.width) : null,
          height: rect ? Math.round(rect.height) : null,
          deadCells: dead,
        })
      }, delay))
    }
    probe(1500, '1.5s')
    probe(5000, '5s')
    return function () { stops.forEach(function (stop) { try { stop() } catch (error) { /* already fired */ } }) }
  }, 'dsh-usage-stats: seat dom probe')
  injectStyles()
  ctx.effect(bindHoverTips, 'dsh-usage-stats: hover tips')
  if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') window.dispatchEvent(new window.Event('dsh-usage-stats/features-owner'))
  setModelSeatSync(function (enabled) { return syncModelSeat(ctx, enabled) })
  if (seatReadEnabledPref()) syncModelSeat(ctx, true)
  if (reasoningSettings) ctx.effect(function () { var visibility = reasoningSettings.createVisibility(ctx); reasoningVisibility = visibility; visibility.sync(); return function () { visibility.dispose(); if (reasoningVisibility === visibility) reasoningVisibility = null } }, 'dsh-usage-stats: reasoning')
  ctx.effect(function () { return bootModelSeat(ctx, api) }, 'dsh-usage-stats: model seat')
  ctx.effect(function () { return function () { syncModelSeat(ctx, false); setModelSeatSync(null) } }, 'dsh-usage-stats: model seat cleanup')
  var common = { api: api, uiWorkspace: ctx.get('uiWorkspace'), uiSession: ctx.get('uiSession'), modelDirectories: ctx.get('modelDirectories') }
  ctx.effect(watchUsageNavIcon, 'dsh-usage-stats: sidebar icon')
  ctx.effect(function () { return slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: SECTION_ID, order: 32, locale: SECTION_ID, label: function () { return t('用量统计') } }, function (props) {
      return React.createElement(UsageStatsSection, Object.assign({}, common, { intl: !props || props.intl !== false }))
    })
  }) }, 'dsh-usage-stats: settings section')
  ctx.effect(function () { return slots.inject('sidebar.footer.action', function () {
    return slots.register({ name: 'sidebar.footer.action', id: SECTION_ID + '-dashboard', locale: SECTION_ID }, UsageDashboardTrigger)
  }) }, 'dsh-usage-stats: dashboard shortcut')
  ctx.effect(function () { return slots.inject('shell.overlay', function () {
    return slots.register({ name: 'shell.overlay', id: SECTION_ID + '-dashboard', locale: SECTION_ID }, function () {
      return React.createElement(UsageDashboard, { api: api })
    })
  }) }, 'dsh-usage-stats: dashboard overlay')
}

// `modelDirectories` stays out of this list so a host without the official
// model selector still mounts the settings section; the composer seat takes it
// through a scoped `ctx.inject` (see registerModelSeat). The services that
// `ModelDirectoryResolver.directoryFor` reads on its caller's context —
// `sessions`, `remote` and `remote.session` — are declared here because the
// settings section's model detection also calls `directoryFor` on this fiber,
// where the cordis guard turns an undeclared access into a throw.
// `remote.session` is a separate service from `remote`, so both are required.
exports.inject = ['slots', 'sessions', 'remote', 'remote.session', 'locale', 'timer']; exports.apply = apply; exports.__components = { Heatmap, HeatPager, buildHeatmap, OverviewDetails, TokenSpeedRanking, UsageDisplayControls, ControlsPanel, DetectionPanel, ProviderPicker };
return module.exports
} })
