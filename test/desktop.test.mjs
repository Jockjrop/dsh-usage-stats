import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
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
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  for (const bridge of [undefined, { protocolVersion: 1 }, { deviceInfo: 'unavailable' }]) {
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
