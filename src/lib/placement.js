// Pure geometry helpers extracted from the former MCP server (mcp/server.mjs).
//
// These functions compute how to place a new image shape on the tldraw canvas
// without overlapping existing shapes. They are framework-agnostic and operate
// on plain tldraw store records, so they are reused by the AI agent tools
// (insert_image / edit_image) without any Node-specific or MCP-specific code.

import { generateKeyBetween } from 'fractional-indexing'

export function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function rectsOverlap(a, b, padding = 0) {
  return !(
    a.x + a.w + padding <= b.x ||
    b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y ||
    b.y + b.h + padding <= a.y
  )
}

function getRecord(store, id, label) {
  const record = store[id]
  if (!record) throw new Error(`Missing ${label}: ${id}`)
  return record
}

export function findPageIdForShape(store, shapeId) {
  let record = getRecord(store, shapeId, 'shape')
  const visited = new Set()
  while (record && !visited.has(record.id)) {
    visited.add(record.id)
    if (record.typeName === 'page') return record.id
    const parentId = record.parentId
    if (!parentId) break
    const parent = store[parentId]
    if (parent?.typeName === 'page') return parent.id
    record = parent
  }
  return null
}

export function getPageShapes(store, pageId) {
  const shapes = []
  const byParent = new Map()
  for (const record of Object.values(store)) {
    if (record?.typeName !== 'shape') continue
    const siblings = byParent.get(record.parentId) ?? []
    siblings.push(record)
    byParent.set(record.parentId, siblings)
  }
  const queue = [...(byParent.get(pageId) ?? [])]
  while (queue.length > 0) {
    const shape = queue.shift()
    shapes.push(shape)
    queue.push(...(byParent.get(shape.id) ?? []))
  }
  return shapes
}

function localBoundsForShape(shape) {
  if (!shape || shape.typeName !== 'shape') return null
  if (shape.type === 'arrow') {
    const start = shape.props?.start ?? { x: 0, y: 0 }
    const end = shape.props?.end ?? { x: 0, y: 0 }
    const minX = Math.min(start.x ?? 0, end.x ?? 0)
    const minY = Math.min(start.y ?? 0, end.y ?? 0)
    const maxX = Math.max(start.x ?? 0, end.x ?? 0)
    const maxY = Math.max(start.y ?? 0, end.y ?? 0)
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
  }
  const w = finiteNumber(shape.props?.w, shape.type === 'text' ? 160 : 1)
  const h = finiteNumber(shape.props?.h, shape.type === 'text' ? 40 : 1)
  return { x: 0, y: 0, w, h }
}

export function pageBoundsForShape(store, shape) {
  const local = localBoundsForShape(shape)
  if (!local) return null
  let x = finiteNumber(shape.x, 0) + local.x
  let y = finiteNumber(shape.y, 0) + local.y
  let parent = store[shape.parentId]
  const visited = new Set([shape.id])
  while (parent?.typeName === 'shape' && !visited.has(parent.id)) {
    visited.add(parent.id)
    x += finiteNumber(parent.x, 0)
    y += finiteNumber(parent.y, 0)
    parent = store[parent.parentId]
  }
  return { x, y, w: local.w, h: local.h }
}

function chooseIndex(store, parentId) {
  const siblingIndexes = Object.values(store)
    .filter((record) => record?.typeName === 'shape' && record.parentId === parentId && typeof record.index === 'string')
    .map((record) => record.index)
    .sort()
  return generateKeyBetween(siblingIndexes.at(-1) ?? null, null)
}

export function choosePlacement({ store, pageId, parentId, anchorShape, width, height, margin, placement }) {
  const anchorBounds = anchorShape ? pageBoundsForShape(store, anchorShape) : null
  let x = anchorBounds ? anchorBounds.x + anchorBounds.w + margin : 0
  let y = anchorBounds ? anchorBounds.y : 0

  if (placement === 'left' && anchorBounds) x = anchorBounds.x - width - margin
  if (placement === 'below' && anchorBounds) {
    x = anchorBounds.x
    y = anchorBounds.y + anchorBounds.h + margin
  }

  const pageShapes = getPageShapes(store, pageId)
  const obstacles = pageShapes
    .filter((shape) => shape.parentId === parentId && shape.id !== anchorShape?.id)
    .map((shape) => pageBoundsForShape(store, shape))
    .filter(Boolean)

  const stepX = Math.max(width + margin, 1)
  const stepY = Math.max(height + margin, 1)
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = { x, y, w: width, h: height }
    if (!obstacles.some((bounds) => rectsOverlap(candidate, bounds, margin / 2))) return candidate
    if (placement === 'below') y += stepY
    else if (placement === 'left') x -= stepX
    else x += stepX
  }

  return { x, y, w: width, h: height }
}

export function firstSelectedShapeId(selection) {
  return selection?.selectedShapes?.length === 1 ? selection.selectedShapes[0]?.id : null
}

// Build the tldraw asset + image-shape records for a generated bitmap. This is
// the browser-native counterpart of insertCowartImage in the old MCP server:
// instead of copying a file into a page-assets folder, it embeds the image as
// a data URL so the snapshot stays self-contained.
//
// `dimensions` should come from getImageDimensions (lib/imageFormat.js).
export function buildImageShapeRecords({
  store,
  anchorShapeId,
  anchorShape,
  parentId,
  imageSize,
  displayWidth,
  displayHeight,
  margin = 40,
  placement = 'right',
  matchAnchor = true,
  pageId,
  dataUrl,
  mimeType,
  altText = 'Cowart inserted image',
  shapeMeta = {}
}) {
  const anchorBounds = anchorShape ? pageBoundsForShape(store, anchorShape) : null
  const useAnchorSize = matchAnchor && anchorBounds
  const width = finiteNumber(displayWidth, useAnchorSize ? anchorBounds.w : Math.min(imageSize.width, 512))
  const height = finiteNumber(
    displayHeight,
    useAnchorSize ? anchorBounds.h : Math.round(width * (imageSize.height / imageSize.width))
  )
  const bounds = choosePlacement({ store, pageId, parentId, anchorShape, width, height, margin, placement })

  const assetId = `asset:${uniqueIdSeed(dataUrl)}`
  const shapeId = `shape:${uniqueIdSeed(dataUrl, assetId)}`
  const index = chooseIndex(store, parentId)

  const finalShapeMeta = { ...shapeMeta }
  if (anchorShapeId && !finalShapeMeta.cowartAnnotationSourceShapeId) {
    finalShapeMeta.cowartAnnotationSourceShapeId = anchorShapeId
  }

  const assetRecord = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: `generated-${Date.now()}.png`,
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
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: finalShapeMeta,
    id: shapeId,
    type: 'image',
    props: {
      w: width,
      h: height,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText
    },
    parentId,
    index,
    typeName: 'shape'
  }

  return { assetRecord, shapeRecord, bounds, assetId, shapeId, index }
}

// Derive a short, collision-avoiding id fragment from the data URL so two
// inserts of the same image do not collide. Falls back to a counter.
let idCounter = 0
function uniqueIdSeed(dataUrl, extra = '') {
  idCounter += 1
  const hashSource = `${dataUrl?.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 33)}${extra}`
  const compact = hashSource.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
  return `${compact || 'img'}-${idCounter}`
}
