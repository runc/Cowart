import { createShapeId, toRichText } from 'tldraw'
import { generateKeyBetween } from 'fractional-indexing'
import demoImageUrl from '../../assets/canvas-edit.png?url'
import { getImageDimensions } from './imageFormat.js'

const DEMO_IMAGE_DISPLAY_W = 900
const DEMO_IMAGE_X = 280
const DEMO_IMAGE_Y = 88
const ONBOARDING_META = { cowartOnboarding: true }

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function loadDemoImage() {
  const response = await fetch(demoImageUrl)
  if (!response.ok) {
    throw new Error(`Failed to load demo image (${response.status})`)
  }
  const blob = await response.blob()
  const [dataUrl, imageSize] = await Promise.all([blobToDataUrl(blob), getImageDimensions(blob)])
  return { dataUrl, imageSize, mimeType: blob.type || 'image/png' }
}

function createOnboardingTextShape({ editor, pageId, x, y, text, size = 'm', w = 248 }) {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'text',
    parentId: pageId,
    x,
    y,
    meta: ONBOARDING_META,
    props: {
      richText: toRichText(text),
      color: 'blue',
      size,
      font: 'sans',
      textAlign: 'start',
      w,
      autoSize: true,
      scale: editor.getResizeScaleFactor()
    }
  })
  return id
}

function createDemoImageShape({ editor, pageId, dataUrl, imageSize, mimeType }) {
  const displayH = Math.round(DEMO_IMAGE_DISPLAY_W * (imageSize.height / imageSize.width))
  const assetId = 'asset:cowart-demo-onboarding'
  const shapeId = 'shape:cowart-demo-onboarding-image'
  const index = generateKeyBetween(null, null)

  const assetRecord = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: 'cowart-demo.png',
      src: dataUrl,
      w: imageSize.width,
      h: imageSize.height,
      fileSize: Math.round((dataUrl.length - dataUrl.indexOf(',')) * 0.75),
      mimeType,
      isAnimated: false
    },
    meta: {}
  }

  const shapeRecord = {
    id: shapeId,
    typeName: 'shape',
    type: 'image',
    parentId: pageId,
    x: DEMO_IMAGE_X,
    y: DEMO_IMAGE_Y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    index,
    meta: ONBOARDING_META,
    props: {
      w: DEMO_IMAGE_DISPLAY_W,
      h: displayH,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: 'Cowart 使用示例'
    }
  }

  editor.store.put([assetRecord, shapeRecord])
  return { shapeId, bounds: { x: DEMO_IMAGE_X, y: DEMO_IMAGE_Y, w: DEMO_IMAGE_DISPLAY_W, h: displayH } }
}

// Seed the canvas with the demo screenshot and concise step labels for first-time users.
export async function seedDemoCanvas(editor) {
  const pageId = editor.getCurrentPageId()
  const { dataUrl, imageSize, mimeType } = await loadDemoImage()

  editor.markHistoryStoppingPoint('cowart-onboarding-demo')

  createDemoImageShape({ editor, pageId, dataUrl, imageSize, mimeType })

  createOnboardingTextShape({
    editor,
    pageId,
    x: 24,
    y: 24,
    text: 'Cowart 快速上手',
    size: 'l',
    w: 420
  })
  createOnboardingTextShape({
    editor,
    pageId,
    x: 24,
    y: 68,
    text: '本页为完整示例，可自由编辑或清空后创作',
    size: 's',
    w: 420
  })

  const steps = [
    '① 工具栏「AI 图片」— 放置占位框',
    '②「标注」— 画箭头写修改说明',
    '③ 选中内容 →「✨ AI 助手」生成',
    '④「⚙ 设置」— 配置图像模型与 LLM'
  ]

  let stepY = 160
  for (const text of steps) {
    createOnboardingTextShape({ editor, pageId, x: 24, y: stepY, text })
    stepY += 52
  }

  editor.timers.requestAnimationFrame(() => {
    editor.zoomToFit({ animation: { duration: 320 } })
  })
}
