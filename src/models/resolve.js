// Resolution layer: turns stored settings into a ready-to-use adapter+config
// pair, for either the image domain or the orchestration domain.
//
// The new hierarchical structure stores credentials on providers and only an
// active pointer on each domain, so resolution = "find the active provider →
// find its active model → merge corsMode/protocol from the provider's preset →
// build the config the adapter expects". Adapters themselves are unchanged.

import { getSettings } from '../lib/settings.js'
import { findImageProvider, findOrchestratorProvider } from './presets.js'
import { getImageAdapter } from './imageAdapters.js'
import { getChatModel } from './chatAdapters.js'

// Returns { provider, adapter, config, model } for the active image entry, or
// { provider: null, ... } when nothing is configured. `config` is the shape
// image adapters expect: { endpoint, apiKey, proxyUrl, model, corsMode }.
export async function getImageProvider() {
  const settings = await getSettings()
  const active = settings.image
  const provider = active?.activeProviderId
    ? settings.providers.find((p) => p.id === active.activeProviderId && p.kind === 'image')
    : null
  if (!provider) return { provider: null, adapter: null, config: null, model: null }

  const preset = provider.presetId ? findImageProvider(provider.presetId) : null
  const protocol = preset?.protocol ?? 'openai-image'
  const adapter = getImageAdapter(protocol)
  const model = provider.models.find((m) => m.id === active.activeModelId) ?? provider.models[0] ?? null

  const config = {
    endpoint: provider.endpoint || preset?.defaults.endpoint || '',
    apiKey: provider.apiKey || '',
    proxyUrl: provider.proxyUrl || '',
    model: model?.name || preset?.defaults.model || '',
    corsMode: preset?.corsMode ?? 'proxy'
  }
  return {
    provider: {
      ...provider,
      label: preset?.label ?? provider.label,
      supportsEdit: preset?.supportsEdit ?? false,
      supportsReference: preset?.supportsReference ?? false
    },
    adapter,
    config,
    model
  }
}

// Returns a Vercel AI SDK LanguageModel for the active orchestrator entry, or
// throws a user-actionable error.
export async function getOrchestratorModel() {
  const settings = await getSettings()
  const active = settings.orchestrator
  const provider = active?.activeProviderId
    ? settings.providers.find((p) => p.id === active.activeProviderId && p.kind === 'orchestrator')
    : null
  if (!provider) {
    throw new Error('未配置 LLM 编排 provider。请打开 ⚙ 设置 添加一个编排 provider。')
  }

  const preset = provider.presetId ? findOrchestratorProvider(provider.presetId) : null
  const model = provider.models.find((m) => m.id === active.activeModelId) ?? provider.models[0] ?? null

  const config = {
    endpoint: provider.endpoint || preset?.defaults.endpoint || '',
    apiKey: provider.apiKey || '',
    proxyUrl: provider.proxyUrl || '',
    model: model?.name || preset?.defaults.model || '',
    corsMode: preset?.corsMode ?? 'proxy'
  }
  return getChatModel(config)
}
