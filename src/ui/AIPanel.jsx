import { useCallback, useEffect, useRef, useState } from 'react'
import { runAgentTurn } from '../agent/runner.js'
import StepTimeline from './StepTimeline.jsx'

const PANEL_POSITION_KEY = 'cowart-ai-panel-position'
const PANEL_MARGIN = 8

function readStoredPanelPosition() {
  try {
    const raw = localStorage.getItem(PANEL_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    // ignore corrupt storage
  }
  return null
}

function clampPanelPosition(x, y, width, height) {
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)
  const maxY = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)
  return {
    x: Math.min(Math.max(PANEL_MARGIN, x), maxX),
    y: Math.min(Math.max(PANEL_MARGIN, y), maxY)
  }
}

function upsertStep(steps, patch) {
  const index = steps.findIndex((step) => step.id === patch.id)
  if (index === -1) {
    return [...steps, { status: 'running', ...patch }]
  }
  const next = [...steps]
  next[index] = { ...next[index], ...patch }
  return next
}

export default function AIPanel({ open, onClose, getEditor }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [activeTurn, setActiveTurn] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [panelPosition, setPanelPosition] = useState(readStoredPanelPosition)
  const scrollRef = useRef(null)
  const panelRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!open || !panelPosition || !panelRef.current) return
    const panel = panelRef.current
    const clamped = clampPanelPosition(
      panelPosition.x,
      panelPosition.y,
      panel.offsetWidth,
      panel.offsetHeight
    )
    if (clamped.x !== panelPosition.x || clamped.y !== panelPosition.y) {
      setPanelPosition(clamped)
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(clamped))
    }
  }, [panelPosition, open])

  const handleHeaderPointerDown = useCallback((event) => {
    if (event.button !== 0) return
    if (event.target.closest('.cowart-ai-panel-close')) return

    const panel = panelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition?.x ?? rect.left,
      originY: panelPosition?.y ?? rect.top
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [panelPosition])

  const handleHeaderPointerMove = useCallback((event) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || drag.pointerId !== event.pointerId) return

    const next = clampPanelPosition(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
      panel.offsetWidth,
      panel.offsetHeight
    )
    setPanelPosition(next)
  }, [])

  const handleHeaderPointerUp = useCallback((event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    dragRef.current = null
    setPanelPosition((current) => {
      if (!current) return current
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(current))
      return current
    })
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, activeTurn, error])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      const text = input.trim()
      if (!text || running) return

      setRunning(true)
      const nextMessages = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')
      setActiveTurn({ assistantText: '', steps: [] })
      setError(null)

      let latestText = ''
      let latestSteps = []

      try {
        const result = await runAgentTurn({
          getEditor,
          messages: nextMessages,
          callbacks: {
            onTextDelta: (delta) => {
              latestText += delta
              setActiveTurn((prev) =>
                prev ? { ...prev, assistantText: prev.assistantText + delta } : prev
              )
            },
            onToolStepStart: (step) => {
              latestSteps = upsertStep(latestSteps, {
                id: step.id,
                name: step.name,
                label: step.label,
                status: 'running',
                argsSummary: step.argsSummary
              })
              setActiveTurn((prev) =>
                prev ? { ...prev, steps: latestSteps } : prev
              )
            },
            onToolStepFinish: (step) => {
              latestSteps = upsertStep(latestSteps, {
                id: step.id,
                name: step.name,
                label: step.label,
                status: step.status,
                resultSummary: step.resultSummary,
                durationMs: step.durationMs
              })
              setActiveTurn((prev) =>
                prev ? { ...prev, steps: latestSteps } : prev
              )
            },
            onError: (err) => setError(err instanceof Error ? err.message : String(err))
          }
        })

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.text || latestText || '(completed without text)',
            steps: latestSteps
          }
        ])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        if (latestText || latestSteps.length) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: latestText || '(interrupted)',
              steps: latestSteps
            }
          ])
        }
      } finally {
        setActiveTurn(null)
        setRunning(false)
      }
    },
    [input, messages, running, getEditor]
  )

  if (!open) return null

  const showEmpty = messages.length === 0 && !activeTurn

  return (
    <aside
      ref={panelRef}
      className={`cowart-ai-panel${panelPosition ? ' cowart-ai-panel-positioned' : ''}`}
      style={
        panelPosition
          ? { left: `${panelPosition.x}px`, top: `${panelPosition.y}px` }
          : undefined
      }
      aria-label="AI assistant"
    >
      <header
        className="cowart-ai-panel-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <h2>AI 画布助手</h2>
        <button type="button" className="cowart-ai-panel-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </header>

      <div className="cowart-ai-panel-messages" ref={scrollRef}>
        {showEmpty && (
          <div className="cowart-ai-panel-empty">
            <p>告诉我你想生成或编辑什么。</p>
            <ul>
              <li>选中一个 AI 图片占位框，然后说「生成一张…」</li>
              <li>选中图片 + 标注，说「按标注重新生成」或「参考选中内容生成…」</li>
              <li>或直接说「生成一张 3:4 的咖啡海报」</li>
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className="cowart-ai-turn">
            {message.role === 'user' ? (
              <div className="cowart-ai-message cowart-ai-message-user">{message.content}</div>
            ) : (
              <>
                {message.steps?.length > 0 && (
                  <StepTimeline steps={message.steps} collapsible defaultCollapsed />
                )}
                <div className="cowart-ai-message cowart-ai-message-assistant">{message.content}</div>
              </>
            )}
          </div>
        ))}

        {activeTurn && (
          <div className="cowart-ai-turn cowart-ai-turn-active">
            <StepTimeline steps={activeTurn.steps} />
            {activeTurn.assistantText && (
              <div className="cowart-ai-message cowart-ai-message-assistant">{activeTurn.assistantText}</div>
            )}
            {running && !activeTurn.assistantText && activeTurn.steps.length === 0 && (
              <div className="cowart-ai-message cowart-ai-message-assistant cowart-ai-message-pending">思考中…</div>
            )}
          </div>
        )}

        {error && <div className="cowart-ai-error">{error}</div>}
      </div>

      <form className="cowart-ai-panel-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent?.isComposing || event.keyCode === 229)) {
              event.preventDefault()
            }
          }}
          placeholder={running ? '生成中…' : '描述你想生成或编辑的图片'}
          disabled={running}
          autoFocus
        />
        <button type="submit" disabled={running || !input.trim()}>
          {running ? '…' : '发送'}
        </button>
      </form>
    </aside>
  )
}
