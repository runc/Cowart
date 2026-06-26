const TOOL_LABELS = {
  get_selection: '读取选区',
  export_selection_reference: '导出参考图',
  generate_image: '生成图片',
  edit_image: '编辑图片',
  insert_image: '插入画布'
}

export function toolLabel(name) {
  return TOOL_LABELS[name] ?? name
}

function clip(text, max = 48) {
  if (typeof text !== 'string' || !text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function summarizeToolArgs(name, args) {
  if (!args || typeof args !== 'object') return ''
  switch (name) {
    case 'generate_image': {
      const bits = []
      if (args.width && args.height) bits.push(`${args.width}×${args.height}`)
      if (args.referenceRef || args.useSelectionAsReference) bits.push('参考图')
      const prompt = clip(args.prompt)
      if (prompt) bits.push(prompt)
      return bits.join(' · ')
    }
    case 'edit_image':
      return clip(args.prompt) || '编辑指令'
    case 'insert_image': {
      const bits = []
      if (args.placement) bits.push(args.placement)
      if (args.asChildOfHolder === false) bits.push('旁侧插入')
      return bits.join(' · ') || '放置图片'
    }
    case 'export_selection_reference':
      return args.shapeIds?.length ? `${args.shapeIds.length} 个形状` : '当前选区'
    default:
      return ''
  }
}

export function summarizeToolResult(name, result) {
  if (!result || typeof result !== 'object') return ''
  if (result.ok === false) return clip(result.error, 80) || '失败'
  switch (name) {
    case 'get_selection':
      return typeof result.summary === 'string' ? clip(result.summary, 60) : '完成'
    case 'export_selection_reference':
      return result.width && result.height ? `${result.width}×${result.height}` : '完成'
    case 'generate_image':
      return result.usedReference ? '完成 · 参考图' : '完成'
    case 'edit_image':
      return '完成'
    case 'insert_image':
      if (result.insertedInHolder) return '已放入 AI 占位框'
      return '已插入画布'
    default:
      return result.ok === true ? '完成' : ''
  }
}

export function summarizeToolError(error) {
  if (error instanceof Error) return clip(error.message, 80)
  if (typeof error === 'string') return clip(error, 80)
  return '失败'
}
