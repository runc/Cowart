// LLM orchestration adapters. These return a Vercel AI SDK LanguageModel that
// drives the multi-step tool-calling loop in agent/runner.js.
//
// All supported orchestration vendors (OpenAI, Qwen, DeepSeek, ByteDance
// Doubao) speak the OpenAI-compatible Chat Completions protocol, so a single
// adapter suffices. We must use `openai.chat(modelId)` rather than
// `openai(modelId)`: the latter defaults to the Responses API (`/responses`),
// which only OpenAI's own endpoint implements — DeepSeek/Qwen/Doubao return
// 404 there. The CORS constraint is handled by routing through the proxy URL
// (when configured) via the baseURL passed to createOpenAI.

import { createOpenAI } from '@ai-sdk/openai'
import { resolveEndpoint } from './cors.js'

// Build a LanguageModel for the configured orchestration provider.
// `config` = { endpoint, apiKey, model, proxyUrl, corsMode }
export function getChatModel(config) {
  if (!config.apiKey) {
    throw new Error('No orchestrator API key configured. Open ⚙ 设置 and set the LLM API key.')
  }
  // resolveEndpoint applies the proxy rewrite when corsMode is 'proxy'; for
  // direct mode it returns the endpoint unchanged. We feed the result as the
  // baseURL so createOpenAI routes all chat requests through the right URL.
  const baseURL = resolveEndpoint(config, config.endpoint)
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL,
    // 'compatible' disables OpenAI-specific response parsing that breaks some
    // third-party compatible endpoints (e.g. some return slightly different
    // shapes).
    compatibility: 'compatible'
  })
  if (!config.model) {
    throw new Error('No orchestrator model configured. Open ⚙ 设置 and set the model name.')
  }
  // Use the Chat Completions protocol (`/chat/completions`), not the Responses
  // API (`/responses`). The OpenAI-compatible vendors we support (DeepSeek,
  // Qwen, Doubao) only implement Chat Completions; calling openai(modelId)
  // directly defaults to Responses and returns 404 on those endpoints.
  return openai.chat(config.model)
}
