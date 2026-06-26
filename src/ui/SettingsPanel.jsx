import { useCallback, useEffect, useState } from 'react'
import { IMAGE_PROVIDERS, ORCHESTRATOR_PROVIDERS } from '../models/presets.js'
import { CORS_DIRECT, CORS_PROXY } from '../models/cors.js'
import {
  getSettings,
  addProvider,
  updateProvider,
  removeProvider,
  addModel,
  updateModel,
  removeModel,
  setActive,
  KIND_IMAGE,
  KIND_ORCHESTRATOR
} from '../lib/settings.js'

// Layered settings: each domain (image / orchestrator) first picks its active
// provider+model, then manages a list of providers. Each provider holds its own
// credentials and a list of models. Adding a provider starts from a preset.
export default function SettingsPanel({ open, onClose }) {
  const [settings, setSettings] = useState(null)

  const reload = useCallback(() => {
    getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  if (!open) return null
  if (!settings) return null

  return (
    <div className="cowart-settings-overlay" onClick={onClose}>
      <div
        className="cowart-settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="模型设置"
      >
        <header className="cowart-settings-header">
          <h2>模型设置</h2>
          <button type="button" className="cowart-settings-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <DomainSection
          title="🖼️ 图像生成"
          subtitle="生成与编辑画布图片。先选默认，再管理 provider"
          kind={KIND_IMAGE}
          presets={IMAGE_PROVIDERS}
          settings={settings}
          active={settings.image}
          reload={reload}
        />

        <DomainSection
          title="🧠 LLM 编排"
          subtitle="驱动 AI 助手多步工具调用。独立配置，不复用图像凭证"
          kind={KIND_ORCHESTRATOR}
          presets={ORCHESTRATOR_PROVIDERS}
          settings={settings}
          active={settings.orchestrator}
          reload={reload}
        />

        <aside className="cowart-settings-warning">
          <strong>密钥安全提示</strong>
          <span>BYOK 模式下密钥仅存于本机浏览器（IndexedDB），不会上传。但浏览器内密钥仍可被本机脚本读取，请用额度受限的 key。</span>
        </aside>
      </div>
    </div>
  )
}

const PRESET_NONE = '__none__'

function DomainSection({ title, subtitle, kind, presets, settings, active, reload }) {
  const [adding, setAdding] = useState(false)
  const providers = settings.providers.filter((p) => p.kind === kind)
  const activeProvider = providers.find((p) => p.id === active.activeProviderId) ?? null
  const activeModels = activeProvider?.models ?? []
  const activeModel = activeModels.find((m) => m.id === active.activeModelId) ?? activeModels[0] ?? null

  const handleSetActiveProvider = useCallback(
    async (providerId) => {
      const provider = providers.find((p) => p.id === providerId)
      const firstModelId = provider?.models?.[0]?.id ?? null
      await setActive(kind, providerId, firstModelId)
      reload()
    },
    [kind, providers, reload]
  )

  const handleSetActiveModel = useCallback(
    async (modelId) => {
      await setActive(kind, active.activeProviderId, modelId)
      reload()
    },
    [kind, active.activeProviderId, reload]
  )

  const activePreset = activeProvider?.presetId ? presets.find((p) => p.id === activeProvider.presetId) : null

  return (
    <section className="cowart-domain">
      <div className="cowart-section-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <div className="cowart-active-row">
        <label className="cowart-settings-field">
          <span className="cowart-settings-label">默认 Provider</span>
          <select value={active.activeProviderId ?? ''} onChange={(e) => handleSetActiveProvider(e.target.value)}>
            {providers.length === 0 && <option value="">未配置</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cowart-settings-field">
          <span className="cowart-settings-label">默认 Model</span>
          <select
            value={activeModel?.id ?? ''}
            onChange={(e) => handleSetActiveModel(e.target.value)}
            disabled={activeModels.length === 0}
          >
            {activeModels.length === 0 && <option value="">无</option>}
            {activeModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.alias || m.name || '(未命名)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeProvider && (
        <p className={`cowart-settings-hint cowart-cors-${activePreset?.corsMode ?? CORS_PROXY}`}>
          {activePreset?.corsMode === CORS_DIRECT
            ? '✓ 可直连：该 provider 支持浏览器 CORS。'
            : '⚠ 建议填代理：官方 API 通常屏蔽浏览器 CORS。留空将直连，若浏览器拦截请求（CORS 错误）请补上「代理 URL」。'}
        </p>
      )}

      <div className="cowart-provider-list">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            presets={presets}
            isActive={provider.id === active.activeProviderId}
            activeModelId={active.activeModelId}
            onSetDefault={() => handleSetActiveProvider(provider.id)}
            reload={reload}
          />
        ))}
      </div>

      {adding ? (
        <AddProviderForm
          kind={kind}
          presets={presets}
          onAdd={async (payload) => {
            await addProvider(payload)
            setAdding(false)
            reload()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="cowart-add-button" onClick={() => setAdding(true)}>
          + 添加 provider
        </button>
      )}
    </section>
  )
}

function AddProviderForm({ kind, presets, onAdd, onCancel }) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? PRESET_NONE)
  const preset = presets.find((p) => p.id === presetId)

  const [label, setLabel] = useState(preset?.label ?? '')
  const [endpoint, setEndpoint] = useState(preset?.defaults.endpoint ?? '')
  const [apiKey, setApiKey] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [modelName, setModelName] = useState(preset?.defaults.model ?? '')

  const handlePresetChange = (nextId) => {
    setPresetId(nextId)
    const next = presets.find((p) => p.id === nextId)
    setLabel(next?.label ?? '')
    setEndpoint(next?.defaults.endpoint ?? '')
    setModelName(next?.defaults.model ?? '')
  }

  return (
    <div className="cowart-provider-card cowart-provider-card-adding">
      <label className="cowart-settings-field">
        <span className="cowart-settings-label">来源预设</span>
        <select value={presetId} onChange={(e) => handlePresetChange(e.target.value)}>
          <option value={PRESET_NONE}>自定义</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <Field label="显示名" value={label} onChange={setLabel} placeholder="如：我的火山方舟" />
      <Field label="Endpoint / Base URL" value={endpoint} onChange={setEndpoint} placeholder="https://..." />
      <Field label="API Key" value={apiKey} onChange={setApiKey} type="password" placeholder="sk-..." />
      <Field label="代理 URL（CORS 需要）" value={proxyUrl} onChange={setProxyUrl} placeholder="https://your-proxy" />
      <Field label="首个 Model 名称" value={modelName} onChange={setModelName} placeholder="model-id" />

      <div className="cowart-provider-card-actions">
        <button
          type="button"
          className="cowart-settings-save"
          disabled={!label.trim() || !modelName.trim()}
          onClick={() =>
            onAdd({
              kind,
              presetId: presetId === PRESET_NONE ? null : presetId,
              label: label.trim(),
              endpoint: endpoint.trim(),
              apiKey: apiKey.trim(),
              proxyUrl: proxyUrl.trim(),
              models: [{ name: modelName.trim(), alias: '默认' }]
            })
          }
        >
          添加
        </button>
        <button type="button" className="cowart-ghost-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

function ProviderCard({ provider, presets, isActive, activeModelId, onSetDefault, reload }) {
  const [expanded, setExpanded] = useState(false)
  const preset = provider.presetId ? presets.find((p) => p.id === provider.presetId) : null

  const [label, setLabel] = useState(provider.label)
  const [endpoint, setEndpoint] = useState(provider.endpoint)
  const [apiKey, setApiKey] = useState(provider.apiKey)
  const [proxyUrl, setProxyUrl] = useState(provider.proxyUrl)

  const modelSummary = provider.models
    .map((model) => {
      const name = model.name || model.alias || '(未命名)'
      if (isActive && model.id === activeModelId) return `${name} ★`
      return name
    })
    .join(' · ')

  const saveProvider = useCallback(async () => {
    await updateProvider(provider.id, {
      label: label.trim() || provider.label,
      endpoint: endpoint.trim(),
      apiKey: apiKey.trim(),
      proxyUrl: proxyUrl.trim()
    })
    reload()
  }, [provider.id, provider.label, label, endpoint, apiKey, proxyUrl, reload])

  const handleDelete = useCallback(async () => {
    if (!confirm(`删除 provider「${provider.label}」？该 provider 下的所有 model 也会被删除。`)) return
    await removeProvider(provider.id)
    reload()
  }, [provider.id, provider.label, reload])

  return (
    <div className={`cowart-provider-card${isActive ? ' cowart-provider-card-active' : ''}`}>
      <div className="cowart-provider-card-head" onClick={() => setExpanded((v) => !v)}>
        <span className="cowart-provider-card-title">
          <span className="cowart-provider-card-title-row">
            <span>{provider.label}</span>
            {isActive ? <span className="cowart-default-badge">当前默认</span> : null}
          </span>
          {preset && <em>{preset.label}</em>}
          <span className="cowart-provider-card-models">{modelSummary || '无 model'}</span>
        </span>
        <span className="cowart-provider-card-toggle">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="cowart-provider-card-body">
          {!isActive && (
            <button
              type="button"
              className="cowart-set-default-button"
              onClick={(event) => {
                event.stopPropagation()
                onSetDefault()
              }}
            >
              设为默认 Provider
            </button>
          )}
          <Field label="显示名" value={label} onChange={setLabel} />
          <Field label="Endpoint / Base URL" value={endpoint} onChange={setEndpoint} placeholder={preset?.defaults.endpoint} />
          <Field label="API Key" value={apiKey} onChange={setApiKey} type="password" />
          <Field label="代理 URL" value={proxyUrl} onChange={setProxyUrl} />

          <div className="cowart-model-list">
            <span className="cowart-settings-label">Models（{provider.models.length}）</span>
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                providerId={provider.id}
                model={model}
                canDelete={provider.models.length > 1}
                reload={reload}
              />
            ))}
            <AddModelRow providerId={provider.id} reload={reload} />
          </div>

          <div className="cowart-provider-card-actions">
            <button type="button" className="cowart-settings-save" onClick={saveProvider}>
              保存凭证
            </button>
            <button type="button" className="cowart-danger-button" onClick={handleDelete}>
              删除 provider
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelRow({ providerId, model, canDelete, reload }) {
  const [name, setName] = useState(model.name)
  const [alias, setAlias] = useState(model.alias)

  const save = useCallback(async () => {
    await updateModel(providerId, model.id, {
      name: name.trim(),
      alias: alias.trim() || name.trim() || '默认'
    })
    reload()
  }, [providerId, model.id, name, alias, reload])

  const remove = useCallback(async () => {
    await removeModel(providerId, model.id)
    reload()
  }, [providerId, model.id, reload])

  return (
    <div className="cowart-model-row">
      <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="显示名" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="模型 ID" />
      <button type="button" className="cowart-icon-button" onClick={save} title="保存">
        ✓
      </button>
      {canDelete && (
        <button type="button" className="cowart-icon-button cowart-icon-danger" onClick={remove} title="删除">
          ✕
        </button>
      )}
    </div>
  )
}

function AddModelRow({ providerId, reload }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')

  if (!open) {
    return (
      <button type="button" className="cowart-add-model-button" onClick={() => setOpen(true)}>
        + 添加 model
      </button>
    )
  }

  const submit = async () => {
    if (!name.trim()) return
    await addModel(providerId, { name: name.trim(), alias: alias.trim() || name.trim() })
    setName('')
    setAlias('')
    setOpen(false)
    reload()
  }

  return (
    <div className="cowart-model-row">
      <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="显示名" autoFocus />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="模型 ID" />
      <button type="button" className="cowart-icon-button" onClick={submit} title="添加">
        ✓
      </button>
      <button type="button" className="cowart-icon-button" onClick={() => setOpen(false)} title="取消">
        ✕
      </button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="cowart-settings-field">
      <span className="cowart-settings-label">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} />
    </label>
  )
}
