import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { renderClient } from '../scripts/build.mjs'
import { apply, inject } from '../src/index.js'

test('the bundle enables both plugin halves only in the desktop profile', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const expression = patch.match(/disabled: !!js "([^"]+)"/)?.[1]
  assert.ok(expression, 'the bundle needs a profile gate')
  const disabled = new Function('ctx', 'return (' + expression + ')')
  for (const name of ['desktop', 'web', 'Default', 'headless', 'tui', undefined]) {
    const ctx = { get: () => name === undefined ? undefined : { name } }
    assert.equal(disabled(ctx), name !== 'desktop')
  }
  // Electron uses this same client bundle format; changing it to "desktop"
  // would make DSH's client-modules scanner skip the renderer entirely.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(inject.includes('profileContext'))
})

test('non-desktop hosts never register routes, start timers or access usage and quota services', () => {
  for (const name of ['web', 'Default', 'headless', 'tui', undefined]) {
    apply({
      get(service) {
        assert.equal(service, 'profileContext', 'an unsupported host must stop before accessing other services')
        return name === undefined ? undefined : { name }
      },
      effect() { assert.fail('an unsupported host must not register effects') },
      interval() { assert.fail('an unsupported host must not start timers') },
    })
  }
})

test('browser clients never mount settings, restore a cached model seat or request host data', () => {
  const source = renderClient()
  for (const bridge of [undefined, { deviceInfo: 'unavailable' }, { protocolVersion: 'broken' }]) {
    let plugin
    const context = {
      window: {
        dshDesktop: bridge,
        localStorage: { getItem() { assert.fail('the browser must not restore desktop preferences') } },
        __ModuleLoader__: { load(definition) { plugin = definition.factory(() => ({})) } },
      },
      document: new Proxy({}, { get() { assert.fail('the browser must not access the DOM') } }),
      fetch() { assert.fail('the browser must not request desktop data') },
    }
    vm.runInNewContext(source, context)
    plugin.apply({
      get() { assert.fail('the browser must not access client services') },
      effect() { assert.fail('the browser must not register effects') },
    })
  }
})

test('desktop clients register settings with either supported preload marker', () => {
  const source = renderClient()
  for (const bridge of [{ protocolVersion: 1 }, { deviceInfo() {} }]) {
    let plugin
    const registrations = []
    const slots = {
      inject(_name, callback) { return callback() },
      register(options) { registrations.push(options.id); return () => {} },
    }
    vm.runInNewContext(source, {
      window: {
        dshDesktop: bridge,
        localStorage: { getItem: () => null },
        __ModuleLoader__: { load(definition) { plugin = definition.factory(() => ({})) } },
      },
      document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } },
      URLSearchParams,
      fetch() { assert.fail('registering the desktop settings section must not issue requests') },
    })
    plugin.apply({
      get: name => name === 'slots' ? slots : undefined,
      effect(callback, label) { return label === 'dsh-usage-stats: settings section' ? callback() : () => {} },
    })
    assert.deepEqual(registrations, ['usage-stats'])
  }
})
