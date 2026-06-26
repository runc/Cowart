// CORS model for backend-free browser calls.
//
// A provider's official API either sends permissive CORS headers (so the
// browser can call it directly) or does not (so the user must supply a proxy
// URL that forwards to the real API). This is the make-or-break detail for a
// standalone browser app, and every adapter/preset declares its mode so the
// settings UI can guide the user correctly.

// The endpoint sends permissive CORS headers — call it as-is.
export const CORS_DIRECT = 'direct'
// The endpoint blocks CORS — the user must supply a proxyUrl.
export const CORS_PROXY = 'proxy'

// Resolve the effective fetch URL for a provider request given the CORS mode.
// - Direct mode: use the endpoint as-is.
// - Proxy mode: if config.proxyUrl is set, route through it (appending the real
//   endpoint's path so a generic proxy can reach any upstream API); otherwise
//   fall back to a direct call. The proxy is optional — providers' official APIs
//   usually block browser CORS, but the user may have other ways around it
//   (browser extension, local network, etc.), so we don't hard-fail.
export function resolveEndpoint(config, endpoint) {
  if (config.corsMode === CORS_PROXY && config.proxyUrl) {
    const proxy = config.proxyUrl.replace(/\/+$/, '')
    const targetPath = endpoint.replace(/^https?:\/\/[^/]+/, '')
    return `${proxy}${targetPath || ''}`
  }
  return endpoint
}
