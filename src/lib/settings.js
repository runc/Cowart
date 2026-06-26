// Hierarchical settings: providers hold credentials + a list of models; each
// domain (image / orchestrator) only stores which provider+model is active.
//
// Data shape (persisted in IndexedDB under the 'settings' key):
//   {
//     providers: [
//       { id, label, presetId, kind, endpoint, apiKey, proxyUrl,
//         models: [{ id, name, alias }] }
//     ],
//     image:        { activeProviderId, activeModelId },
//     orchestrator: { activeProviderId, activeModelId }
//   }
//
// kind ('image' | 'orchestrator') marks which domain a provider serves, so the
// same vendor can be added twice (once per domain) or reused conceptually.
// Migration from the old flat structure lives in storage.js readSettings.

import { readSettings as readStored, writeSettings as writeStored } from './storage.js'

const KIND_IMAGE = 'image'
const KIND_ORCHESTRATOR = 'orchestrator'

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export async function getSettings() {
  const settings = await readStored()
  if (sanitizeActivePointers(settings)) {
    await writeStored(settings)
  }
  return settings
}

export async function saveSettings(settings) {
  return writeStored(settings)
}

// ---- provider CRUD ----

export async function listProviders(kind) {
  const settings = await getSettings()
  return settings.providers.filter((provider) => provider.kind === kind)
}

export async function getProvider(id) {
  const settings = await getSettings()
  return settings.providers.find((provider) => provider.id === id) ?? null
}

export async function addProvider({ label, presetId, kind, endpoint, apiKey, proxyUrl, models }) {
  const settings = await getSettings()
  const provider = {
    id: uid('pv'),
    label: label || '未命名',
    presetId: presetId || null,
    kind,
    endpoint: endpoint || '',
    apiKey: apiKey || '',
    proxyUrl: proxyUrl || '',
    models: (models && models.length ? models : [{ id: uid('md'), name: '', alias: '默认' }]).map(
      (model) => ({ id: model.id || uid('md'), name: model.name || '', alias: model.alias || model.name || '默认' })
    )
  }
  settings.providers.push(provider)
  const kindProviders = settings.providers.filter((p) => p.kind === kind)
  const active = settings[kind] ?? { activeProviderId: null, activeModelId: null }
  const hasValidActive =
    active.activeProviderId && kindProviders.some((p) => p.id === active.activeProviderId)
  if (!hasValidActive) {
    settings[kind] = {
      activeProviderId: provider.id,
      activeModelId: provider.models[0]?.id ?? null
    }
  }
  await saveSettings(settings)
  return provider
}

export async function updateProvider(id, patch) {
  const settings = await getSettings()
  const provider = settings.providers.find((p) => p.id === id)
  if (!provider) return null
  Object.assign(provider, patch)
  await saveSettings(settings)
  return provider
}

export async function removeProvider(id) {
  const settings = await getSettings()
  settings.providers = settings.providers.filter((p) => p.id !== id)
  // Clear the active pointer in any domain that referenced it.
  for (const kind of [KIND_IMAGE, KIND_ORCHESTRATOR]) {
    if (settings[kind].activeProviderId === id) {
      settings[kind] = { activeProviderId: null, activeModelId: null }
    }
  }
  await saveSettings(settings)
}

// ---- model CRUD (nested under a provider) ----

export async function addModel(providerId, { name, alias }) {
  const settings = await getSettings()
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) return null
  const model = { id: uid('md'), name: name || '', alias: alias || name || '默认' }
  provider.models.push(model)
  await saveSettings(settings)
  return model
}

export async function updateModel(providerId, modelId, patch) {
  const settings = await getSettings()
  const provider = settings.providers.find((p) => p.id === providerId)
  const model = provider?.models.find((m) => m.id === modelId)
  if (!model) return null
  Object.assign(model, patch)
  await saveSettings(settings)
  return model
}

export async function removeModel(providerId, modelId) {
  const settings = await getSettings()
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) return
  provider.models = provider.models.filter((m) => m.id !== modelId)
  // Clear the active model pointer in any domain that referenced it.
  for (const kind of [KIND_IMAGE, KIND_ORCHESTRATOR]) {
    if (settings[kind].activeProviderId === providerId && settings[kind].activeModelId === modelId) {
      settings[kind].activeModelId = provider.models[0]?.id ?? null
    }
  }
  await saveSettings(settings)
}

// ---- domain active pointers ----

export async function getActive(kind) {
  const settings = await getSettings()
  return settings[kind] ?? { activeProviderId: null, activeModelId: null }
}

export async function setActive(kind, providerId, modelId) {
  const settings = await readStored()
  settings[kind] = { activeProviderId: providerId, activeModelId: modelId }
  sanitizeActivePointers(settings)
  await saveSettings(settings)
}

function sanitizeActivePointers(settings) {
  if (!settings || typeof settings !== 'object') return false
  let changed = false
  for (const kind of [KIND_IMAGE, KIND_ORCHESTRATOR]) {
    const providers = (settings.providers ?? []).filter((p) => p.kind === kind)
    const block = settings[kind] ?? { activeProviderId: null, activeModelId: null }
    const provider = providers.find((p) => p.id === block.activeProviderId) ?? null
    if (!provider) {
      const first = providers[0] ?? null
      settings[kind] = first
        ? { activeProviderId: first.id, activeModelId: first.models[0]?.id ?? null }
        : { activeProviderId: null, activeModelId: null }
      changed = true
      continue
    }
    const model = provider.models.find((m) => m.id === block.activeModelId) ?? provider.models[0] ?? null
    if (model?.id !== block.activeModelId) {
      settings[kind] = { activeProviderId: provider.id, activeModelId: model?.id ?? null }
      changed = true
    }
  }
  return changed
}

export { KIND_IMAGE, KIND_ORCHESTRATOR }
