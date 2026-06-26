// AI SDK tool definitions for the Cowart canvas agent.
//
// Each tool wraps a canvas/provider operation that Codex used to perform via
// MCP. The tools are created with a factory so they can close over the live
// tldraw editor instance (getEditor) without a module global. Results are
// plain objects the model can read; side effects (canvas mutation) happen via
// the editor + IndexedDB storage.

import { tool } from 'ai'
import { z } from 'zod'
import { getImageProvider } from '../models/resolve.js'
import { getImageDimensions, mimeTypeForDataUrl } from '../lib/imageFormat.js'
import {
  buildImageShapeRecords,
  findPageIdForShape,
  firstSelectedShapeId
} from '../lib/placement.js'
import { saveCanvasSnapshot, readSelection } from '../lib/storage.js'
import { exportSelectionToDataUrl } from '../lib/selectionExport.js'
import { stashImage, resolveImageRef } from './imageRefs.js'

// Factory: returns the tool set bound to a way to reach the current editor.
export function createCowartTools({ getEditor }) {
  // Remember the holder id from get_selection so insert_image still targets it
  // after the user focuses the chat input and canvas selection clears.
  let activeHolderId = null
  let activeReferenceShapeIds = null

  async function snapshotStore() {
    const editor = getEditor()
    if (!editor) throw new Error('Canvas is not ready yet.')
    const snapshot = editor.store.getStoreSnapshot()
    return { editor, store: snapshot.store, snapshot }
  }

  async function readCanvasSelection() {
    const editor = getEditor()
    if (editor?.getSelectedShapeIds()?.length) {
      return { selectedShapes: getEditorSelectionShapes(editor) }
    }
    const { selection } = await readSelection()
    return selection ?? { selectedShapes: [] }
  }

  return {
    get_selection: tool({
      description:
        'Return the currently selected Cowart/tldraw shapes on the canvas, including whether any is an AI image holder and its props (w/h for size contract). Call this first to decide the generation workflow.',
      inputSchema: z.object({}),
      execute: async () => {
        const selection = await readCanvasSelection()
        const rawShapes = selection.selectedShapes ?? []
        const holder = rawShapes.find(isAiImageHolderRecord)
        activeHolderId = holder?.id ?? null
        activeReferenceShapeIds = rawShapes.length ? rawShapes.map((shape) => shape.id) : null

        const shapes = rawShapes.map(shapeForModel)
        const summary =
          shapes.length === 0
            ? 'No shapes are currently selected.'
            : shapes.map((shape) => shape.summaryLine).join('\n')
        return {
          selectedShapes: shapes,
          summary,
          activeHolderId,
          canExportReference: shapes.length > 0
        }
      }
    }),

    export_selection_reference: tool({
      description:
        'Rasterize the current canvas selection (images, annotations, frames, etc.) into a reference image for generate_image. Returns a short referenceRef — never pass raw image bytes to the LLM. Call when the user wants to regenerate or vary the selected content.',
      inputSchema: z.object({
        shapeIds: z
          .array(z.string())
          .optional()
          .describe('Optional shape ids to export. Defaults to current selection or remembered selection from get_selection.')
      }),
      execute: async ({ shapeIds }) => {
        const editor = getEditor()
        if (!editor) return { ok: false, error: 'Canvas is not ready yet.' }
        const ids =
          shapeIds?.length > 0
            ? shapeIds
            : editor.getSelectedShapeIds()?.length
              ? editor.getSelectedShapeIds()
              : activeReferenceShapeIds
        if (!ids?.length) {
          return {
            ok: false,
            error: 'No shapes to export. Select the elements to use as a reference image first.'
          }
        }
        try {
          const exported = await exportSelectionToDataUrl(editor, ids)
          const referenceRef = stashImage({
            dataUrl: exported.dataUrl,
            width: exported.width,
            height: exported.height,
            mimeType: exported.mimeType
          })
          activeReferenceShapeIds = exported.shapeIds
          return {
            ok: true,
            referenceRef,
            width: exported.width,
            height: exported.height,
            shapeIds: exported.shapeIds
          }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
    }),

    generate_image: tool({
      description:
        'Generate an AI bitmap via the configured provider. Pass a prompt and target width/height. For reference-based generation, pass referenceRef from export_selection_reference or set useSelectionAsReference true. Returns imageRef for insert_image.',
      inputSchema: z.object({
        prompt: z.string().min(1),
        width: z.number().int().positive().describe('Target display width in canvas units'),
        height: z.number().int().positive().describe('Target display height in canvas units'),
        referenceRef: z
          .string()
          .optional()
          .describe('Reference image ref from export_selection_reference'),
        useSelectionAsReference: z
          .boolean()
          .optional()
          .describe('When true, rasterize the current/remembered selection as the reference image before generating.')
      }),
      execute: async ({ prompt, width, height, referenceRef, useSelectionAsReference }) => {
        const { provider, adapter, config } = await getImageProvider()
        if (!provider || !adapter) {
          return {
            ok: false,
            error: 'No image provider configured. Open ⚙ 设置 to choose an image provider.'
          }
        }

        let referenceDataUrl = null
        let resolvedReferenceRef = referenceRef
        if (useSelectionAsReference) {
          const editor = getEditor()
          const ids =
            editor?.getSelectedShapeIds()?.length > 0
              ? editor.getSelectedShapeIds()
              : activeReferenceShapeIds
          if (!ids?.length) {
            return {
              ok: false,
              error: 'No selection to use as reference. Select shapes on the canvas first.'
            }
          }
          try {
            const exported = await exportSelectionToDataUrl(editor, ids)
            resolvedReferenceRef = stashImage({
              dataUrl: exported.dataUrl,
              width: exported.width,
              height: exported.height,
              mimeType: exported.mimeType
            })
            activeReferenceShapeIds = exported.shapeIds
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
          }
        }

        if (resolvedReferenceRef) {
          if (!provider.supportsReference) {
            return {
              ok: false,
              error: `The "${provider.label}" provider does not support reference images. Switch to Qwen, OpenAI gpt-image-1, Seedream, or Gemini.`
            }
          }
          try {
            referenceDataUrl = resolveImageRef(resolvedReferenceRef).dataUrl
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
          }
        }

        try {
          const result = await adapter.generateImage(config, {
            prompt,
            width,
            height,
            referenceDataUrl
          })
          const imageRef = stashImage({
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
            mimeType: result.mimeType
          })
          return {
            ok: true,
            imageRef,
            width: result.width,
            height: result.height,
            mimeType: result.mimeType,
            usedReference: Boolean(referenceDataUrl)
          }
        } catch (error) {
          return { ok: false, error: explainProviderError(error, provider, config) }
        }
      }
    }),

    edit_image: tool({
      description:
        'Edit an existing canvas image via the configured provider (annotation-driven). Pass the source shape id from get_selection and a prompt describing the edits. Returns imageRef for insert_image.',
      inputSchema: z.object({
        sourceShapeId: z.string().describe('Shape id of the source image from get_selection'),
        prompt: z.string().min(1).describe('Edit instructions, including removing annotation artifacts')
      }),
      execute: async ({ sourceShapeId, prompt }) => {
        const { provider, adapter, config } = await getImageProvider()
        if (!provider || !adapter) {
          return {
            ok: false,
            error: 'No image provider configured. Open ⚙ 设置 to choose an image provider.'
          }
        }
        if (!provider.supportsEdit) {
          return {
            ok: false,
            error: `The "${provider.label}" provider does not support image editing. Switch to a provider that supports edits (e.g. OpenAI gpt-image-1, Gemini).`
          }
        }
        const { store } = await snapshotStore()
        const sourceDataUrl = resolveShapeImageSrc(store, sourceShapeId)
        if (!sourceDataUrl) {
          return {
            ok: false,
            error: `Shape "${sourceShapeId}" has no image asset to edit. Select an image shape on the canvas.`
          }
        }
        try {
          const result = await adapter.editImage(config, { prompt, imageDataUrl: sourceDataUrl })
          const imageRef = stashImage({
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
            mimeType: result.mimeType
          })
          return {
            ok: true,
            imageRef,
            width: result.width,
            height: result.height,
            mimeType: result.mimeType
          }
        } catch (error) {
          return { ok: false, error: explainProviderError(error, provider, config) }
        }
      }
    }),

    insert_image: tool({
      description:
        'Insert a generated/edited image onto the canvas. When the anchor is an AI 图片 holder frame, the image is inserted inside the frame automatically. Pass the imageRef from generate_image or edit_image.',
      inputSchema: z.object({
        imageRef: z.string().describe('Short imageRef from generate_image/edit_image'),
        anchorShapeId: z
          .string()
          .optional()
          .describe('Holder or anchor shape id from get_selection. Defaults to current selection or remembered holder.'),
        placement: z.enum(['right', 'left', 'below']).optional().default('right'),
        matchAnchor: z.boolean().optional().default(true),
        altText: z.string().optional(),
        asChildOfHolder: z
          .boolean()
          .optional()
          .describe('Set false only to place beside (not inside) an AI 图片 holder.')
      }),
      execute: async ({ imageRef, anchorShapeId, placement, matchAnchor, altText, asChildOfHolder }) => {
        let dataUrl
        let mimeType
        try {
          const resolved = resolveImageRef(imageRef)
          dataUrl = resolved.dataUrl
          mimeType = resolved.mimeType || mimeTypeForDataUrl(dataUrl)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }

        const { editor, store: initialStore } = await snapshotStore()
        let store = initialStore
        const selection = await readCanvasSelection()
        const resolvedAnchorId =
          anchorShapeId || firstSelectedShapeId(selection) || activeHolderId
        const anchorShape = resolvedAnchorId
          ? store[resolvedAnchorId] || editor.getShape(resolvedAnchorId)
          : null

        const pageId =
          (anchorShape ? findPageIdForShape(store, anchorShape.id) : null) ||
          editor.getCurrentPageId() ||
          Object.values(store).find((record) => record?.typeName === 'page')?.id
        if (!pageId) return { ok: false, error: 'Could not determine the target page.' }

        const imageSize = await getImageDimensions(dataUrl).catch(() => ({ width: 1024, height: 1024 }))

        const isFrameHolder = isAiImageHolderRecord(anchorShape)
        const childOfHolder = isFrameHolder && asChildOfHolder !== false
        const parentId = childOfHolder ? anchorShape.id : pageId

        if (childOfHolder) {
          removeGeneratedImagesInHolder(editor, store, anchorShape.id)
          store = editor.store.getStoreSnapshot().store
        }

        let records
        if (childOfHolder) {
          // Insert inside the frame: zero offset, full frame size.
          records = buildImageShapeRecords({
            store,
            anchorShape,
            anchorShapeId: resolvedAnchorId,
            parentId,
            pageId,
            imageSize,
            displayWidth: anchorShape.props.w,
            displayHeight: anchorShape.props.h,
            margin: 0,
            placement: 'right',
            matchAnchor: false,
            dataUrl,
            mimeType,
            altText: altText || 'Cowart generated image',
            shapeMeta: resolvedAnchorId ? { cowartGeneratedForAiImageHolder: resolvedAnchorId } : {}
          })
          // Override placement to fill the frame.
          records.shapeRecord.x = 0
          records.shapeRecord.y = 0
          records.bounds = { x: 0, y: 0, w: anchorShape.props.w, h: anchorShape.props.h }
        } else {
          records = buildImageShapeRecords({
            store,
            anchorShape,
            anchorShapeId: resolvedAnchorId,
            parentId,
            pageId,
            imageSize,
            margin: 40,
            placement,
            matchAnchor,
            dataUrl,
            mimeType,
            altText: altText || 'Cowart inserted image',
            shapeMeta: resolvedAnchorId ? { cowartGeneratedStandalone: true } : {}
          })
        }

        // Apply to the live editor (so the user sees it immediately) and persist.
        editor.store.put([records.assetRecord, records.shapeRecord])
        const updatedSnapshot = editor.store.getStoreSnapshot()
        await saveCanvasSnapshot(updatedSnapshot)

        return {
          ok: true,
          shapeId: records.shapeRecord.id,
          assetId: records.assetRecord.id,
          pageId,
          parentId,
          insertedInHolder: childOfHolder,
          bounds: records.bounds,
          sourceDimensions: imageSize
        }
      }
    })
  }
}

// Strip inline image bytes from selection payloads — asset.src can be a multi-MB
// data URL that would exceed the orchestrator context window.
function getEditorSelectionShapes(editor) {
  return editor.getSelectedShapeIds().map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.cowartAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    }
  })
}

function isAiImageHolderRecord(shape) {
  if (!shape) return false
  if (shape.isAiImageHolder) return true
  return shape.type === 'frame' && shape.meta?.cowartAiImageHolder === true
}

function removeGeneratedImagesInHolder(editor, store, holderId) {
  const toRemove = []
  for (const record of Object.values(store)) {
    if (record?.typeName !== 'shape' || record.parentId !== holderId || record.type !== 'image') continue
    if (record.meta?.cowartGeneratedForAiImageHolder !== holderId) continue
    if (record.props?.assetId) toRemove.push(record.props.assetId)
    toRemove.push(record.id)
  }
  if (toRemove.length) editor.store.remove(toRemove)
}

function shapeForModel(shape) {
  const holder = shape.isAiImageHolder || shape.meta?.cowartAiImageHolder ? ' [AI 图片 holder]' : ''
  const size = shape.props?.w ? ` ${Math.round(shape.props.w)}x${Math.round(shape.props.h)}` : ''
  const hasImage = shape.asset?.src ? ' [has image]' : ''
  return {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    meta: shape.meta,
    isAiImageHolder: shape.isAiImageHolder,
    props: shape.props
      ? { w: shape.props.w, h: shape.props.h, assetId: shape.props.assetId }
      : null,
    asset: shape.asset
      ? {
          id: shape.asset.id,
          w: shape.asset.w,
          h: shape.asset.h,
          mimeType: shape.asset.mimeType,
          fileSize: shape.asset.fileSize,
          hasImage: Boolean(shape.asset.src)
        }
      : null,
    summaryLine: `${shape.id} [${shape.type ?? 'unknown'}]${holder}${size}${hasImage}`
  }
}

function resolveShapeImageSrc(store, shapeId) {
  const shape = store[shapeId]
  if (!shape || shape.type !== 'image') return null
  const assetId = shape.props?.assetId
  if (!assetId) return null
  const asset = store[assetId]
  const src = asset?.props?.src
  return typeof src === 'string' && src.length > 0 ? src : null
}

function explainProviderError(error, provider, config) {
  const message = error instanceof Error ? error.message : String(error)
  // Heuristic: CORS failures and proxy misconfigurations surface as network
  // errors. When the provider's API is being called without a proxy, the most
  // likely cause is the browser blocking the cross-origin request.
  if (/Failed to fetch|NetworkError|load failed/i.test(message)) {
    if (config?.proxyUrl) {
      return `${message}\n\nThis usually means the proxy URL is unreachable. Open ⚙ 设置 and check the 代理 URL for ${provider.label}.`
    }
    return `${message}\n\nThis usually means the browser blocked the request (CORS). Open ⚙ 设置 and configure a 代理 URL for ${provider.label}, or switch to a CORS-friendly endpoint.`
  }
  return message
}
