/**
 * Public Models-page extension. The build embeds this dependency-free module
 * in the renderer bundle; tests import the same factory directly.
 */
export function createReasoningSettings(React, t, useLocaleRevision) {
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
