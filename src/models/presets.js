// Provider presets for the two model domains: image generation and LLM
// orchestration. Each preset declares the protocol adapter it uses, default
// endpoint/model values, the CORS mode, and which fields the settings form
// should show. Switching a preset in the UI swaps these defaults and the
// adapter that actually runs the request.
//
// Why "protocol" rather than "vendor": vendors that speak the same protocol
// (e.g. OpenAI gpt-image-1 and ByteDance Seedream both use the OpenAI
// /images/generations shape) share one adapter — only the endpoint/model
// defaults differ. This keeps the adapter set small (5 protocols) while
// supporting many vendors.

import { CORS_PROXY } from './cors.js'

// ---- Image generation providers ----
export const IMAGE_PROVIDERS = [
  {
    id: 'openai-image',
    label: 'OpenAI gpt-image-1',
    protocol: 'openai-image',
    corsMode: CORS_PROXY,
    supportsEdit: true,
    supportsReference: true,
    defaults: { endpoint: 'https://api.openai.com/v1', model: 'gpt-image-1' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'seedream',
    label: '字节 Seedream（火山方舟）',
    protocol: 'openai-image',
    corsMode: CORS_PROXY,
    supportsEdit: true,
    supportsReference: true,
    defaults: { endpoint: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-3-0-t2i-250415' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'qwen-image',
    label: 'Qwen 通义万相（DashScope）',
    protocol: 'dashscope-image',
    corsMode: CORS_PROXY,
    supportsEdit: false,
    supportsReference: true,
    // qwen-image-2.0-pro is the recommended model
    // multimodal-generation endpoint. The legacy /text2image/image-synthesis
    // path only serves qwen-image and qwen-image-plus; using V2 model IDs
    // (or non-existent names like wanx-v1) on either path triggers the
    // misleading "url error, please check url!".
    defaults: { endpoint: 'https://dashscope.aliyuncs.com/api/v1', model: 'qwen-image-2.0-pro' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'z-image',
    label: 'Z-Image Turbo（DashScope）',
    protocol: 'dashscope-image',
    corsMode: CORS_PROXY,
    supportsEdit: false,
    supportsReference: false,
    defaults: { endpoint: 'https://dashscope.aliyuncs.com/api/v1', model: 'z-image-turbo' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'gemini-image',
    label: 'Gemini Nano Banana',
    protocol: 'gemini-image',
    corsMode: CORS_PROXY,
    supportsEdit: true,
    supportsReference: true,
    defaults: { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash-image' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  }
]

// ---- LLM orchestration providers (all OpenAI-compatible chat) ----
export const ORCHESTRATOR_PROVIDERS = [
  {
    id: 'openai-chat',
    label: 'OpenAI',
    protocol: 'openai-chat',
    corsMode: CORS_PROXY,
    defaults: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'qwen-chat',
    label: 'Qwen 通义千问',
    protocol: 'openai-chat',
    corsMode: CORS_PROXY,
    defaults: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek',
    protocol: 'openai-chat',
    corsMode: CORS_PROXY,
    defaults: { endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'doubao-chat',
    label: '字节 Doubao（火山方舟）',
    protocol: 'openai-chat',
    corsMode: CORS_PROXY,
    defaults: { endpoint: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  },
  {
    id: 'custom-chat',
    label: '自定义 OpenAI 兼容',
    protocol: 'openai-chat',
    corsMode: CORS_PROXY,
    defaults: { endpoint: '', model: '' },
    fields: ['endpoint', 'apiKey', 'model', 'proxyUrl']
  }
]

export function findImageProvider(id) {
  return IMAGE_PROVIDERS.find((p) => p.id === id) ?? null
}

export function findOrchestratorProvider(id) {
  return ORCHESTRATOR_PROVIDERS.find((p) => p.id === id) ?? null
}
