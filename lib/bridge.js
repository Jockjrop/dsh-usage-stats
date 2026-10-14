/** Versioned host-service lookup and registration. */
export const PROTOCOL_VERSION = 1
export const HUB_SERVICE = 'dshModelsHub'
export const USAGE_SERVICE = 'dshUsageStats'
export const HUB_UPDATED = 'dsh-models-hub/updated'

export function getBridge(ctx, name) {
  try {
    const service = ctx.get(name)
    return service?.protocolVersion === PROTOCOL_VERSION ? service : null
  } catch { return null }
}

export function publishBridge(ctx, name, methods) {
  if (getBridge(ctx, name)) throw new Error(`The ${name} service is already registered.`)
  const service = Object.freeze({ protocolVersion: PROTOCOL_VERSION, ...methods })
  if (typeof ctx.provide === 'function') ctx.provide(name, service)
  return service
}

export class IntegrationError extends Error {
  constructor(message = '账号配额暂不可用，请稍后重试。') {
    super(message)
    this.code = 'PLUGIN_UNAVAILABLE'
    this.httpStatus = 503
  }
}

export function requireBridge(ctx, name = HUB_SERVICE) {
  const service = getBridge(ctx, name)
  if (!service) throw new IntegrationError(name === HUB_SERVICE ? undefined : '用量统计暂不可用，请稍后重试。')
  return service
}
