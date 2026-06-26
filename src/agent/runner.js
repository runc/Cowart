// Agentic orchestration loop, built on AI SDK streamText.
//
// This replaces the multi-step workflows Codex used to run from its skills.
// The model is the orchestrator (text + tool calling); the tools (defined in
// ./tools.js) perform the actual canvas/provider work. stopWhen drives the loop
// so the model can chain get_selection -> generate_image -> insert_image across
// steps automatically.

import { streamText, stepCountIs } from 'ai'
import { createCowartTools } from './tools.js'
import { clearImageRefs } from './imageRefs.js'
import { SYSTEM_PROMPT } from './prompts.js'
import { getOrchestratorModel } from '../models/resolve.js'
import {
  toolLabel,
  summarizeToolArgs,
  summarizeToolResult,
  summarizeToolError
} from './stepSummaries.js'

const MAX_STEPS = 12

function emitToolStart(callbacks, stepStartTimes, part) {
  const stepId = part.toolCallId
  stepStartTimes.set(stepId, Date.now())
  callbacks.onToolStepStart?.({
    id: stepId,
    name: part.toolName,
    label: toolLabel(part.toolName),
    argsSummary: summarizeToolArgs(part.toolName, part.input)
  })
}

function emitToolFinish(callbacks, stepStartTimes, part, status) {
  const startedAt = stepStartTimes.get(part.toolCallId)
  const durationMs = startedAt ? Date.now() - startedAt : undefined
  const payload = {
    id: part.toolCallId,
    name: part.toolName,
    label: toolLabel(part.toolName),
    durationMs,
    status
  }
  if (status === 'error') {
    payload.resultSummary = summarizeToolError(part.error)
    callbacks.onToolStepFinish?.(payload)
    return
  }
  payload.resultSummary = summarizeToolResult(part.toolName, part.output)
  callbacks.onToolStepFinish?.(payload)
}

// Run one agent turn. `getEditor` lets the tools reach the live tldraw editor.
// `callbacks` receives streaming text deltas and per-tool events for the UI.
export async function runAgentTurn({ getEditor, messages, callbacks = {} }) {
  clearImageRefs()
  const model = await getOrchestratorModel()
  const tools = createCowartTools({ getEditor })
  const stepStartTimes = new Map()

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    tools,
    messages,
    stopWhen: stepCountIs(MAX_STEPS),
    onError: ({ error }) => {
      callbacks.onError?.(error)
    }
  })

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        callbacks.onTextDelta?.(part.text)
        break
      case 'tool-call':
        emitToolStart(callbacks, stepStartTimes, part)
        break
      case 'tool-result':
        emitToolFinish(callbacks, stepStartTimes, part, 'done')
        break
      case 'tool-error':
        emitToolFinish(callbacks, stepStartTimes, part, 'error')
        break
      case 'error':
        callbacks.onError?.(part.error)
        break
      default:
        break
    }
  }

  return {
    text: await result.text,
    usage: await result.usage.catch(() => null)
  }
}
