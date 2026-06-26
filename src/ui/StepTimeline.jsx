import { useState } from 'react'

function StepIcon({ status }) {
  if (status === 'running') {
    return <span className="cowart-step-icon cowart-step-icon-running" aria-hidden="true" />
  }
  if (status === 'error') {
    return <span className="cowart-step-icon cowart-step-icon-error" aria-hidden="true">✕</span>
  }
  if (status === 'done') {
    return <span className="cowart-step-icon cowart-step-icon-done" aria-hidden="true">✓</span>
  }
  return <span className="cowart-step-icon cowart-step-icon-pending" aria-hidden="true">○</span>
}

function formatDuration(ms) {
  if (!ms || ms < 1) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function StepRow({ step }) {
  const detail = [step.argsSummary, step.resultSummary].filter(Boolean).join(' → ')
  const duration = formatDuration(step.durationMs)

  return (
    <li className={`cowart-step-row cowart-step-row-${step.status}`}>
      <StepIcon status={step.status} />
      <div className="cowart-step-row-body">
        <div className="cowart-step-row-title">
          <span className="cowart-step-row-label">{step.label}</span>
          {duration && <span className="cowart-step-row-duration">{duration}</span>}
        </div>
        {detail && <div className="cowart-step-row-detail">{detail}</div>}
      </div>
    </li>
  )
}

export default function StepTimeline({ steps, collapsible = false, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (!steps?.length) return null

  const summary = steps.map((step) => step.label).join(' → ')

  if (collapsible && collapsed) {
    return (
      <button type="button" className="cowart-step-timeline-collapsed" onClick={() => setCollapsed(false)}>
        {steps.length} 步 · {summary}
      </button>
    )
  }

  return (
    <div className="cowart-step-timeline">
      {collapsible && (
        <button type="button" className="cowart-step-timeline-toggle" onClick={() => setCollapsed(true)}>
          收起步骤
        </button>
      )}
      <ol className="cowart-step-list">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ol>
    </div>
  )
}
