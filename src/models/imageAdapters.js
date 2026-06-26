// Image protocol adapters. Each adapter implements the same contract:
//
//   generateImage(config, { prompt, width, height, referenceDataUrl? }) -> ImageResult
//   editImage?(config, { prompt, imageDataUrl, maskDataUrl }) -> ImageResult   (optional)
//
// where ImageResult = { dataUrl, width, height, mimeType }.
//
// Adapters are keyed by protocol id (e.g. 'openai-image') and selected by the
// preset in presets.js. Multiple vendors can share one adapter when they speak
// the same wire protocol — e.g. OpenAI gpt-image-1 and ByteDance Seedream both
// use the OpenAI /images/generations shape, differing only in endpoint/model.

import { resolveEndpoint } from './cors.js'
import { getImageDimensions, mimeTypeForDataUrl } from '../lib/imageFormat.js'

const DEFAULT_DIMENSIONS = { width: 1024, height: 1024 }

function imageResult(dataUrl, fallbackDimensions = DEFAULT_DIMENSIONS) {
  const mimeType = mimeTypeForDataUrl(dataUrl) || 'image/png'
  const dimensions = awaitDimensions(dataUrl, fallbackDimensions)
  return { dataUrl, ...dimensions, mimeType, createdAt: new Date().toISOString() }
}

async function awaitDimensions(dataUrl, fallback) {
  try {
    return await getImageDimensions(dataUrl)
  } catch {
    return fallback
  }
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl)
  return response.blob()
}

function dataUrlToBase64(dataUrl) {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

function dashscopeImagePayload(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return dataUrl
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) return dataUrl
  return dataUrl
}

// ---- openai-image: synchronous /images/generations (OpenAI, Seedream) ----

const openaiImageAdapter = {
  async generateImage(config, { prompt, width, height, referenceDataUrl }) {
    if (referenceDataUrl) {
      return openaiImageAdapter.editImage(config, { prompt, imageDataUrl: referenceDataUrl })
    }
    const endpoint = resolveEndpoint(config, `${config.endpoint}/images/generations`)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        size: closestOpenAiSize(width, height),
        n: 1
      })
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`${config.model} ${response.status}: ${json?.error?.message ?? response.statusText}`)
    }
    const b64 = json?.data?.[0]?.b64_json
    const url = json?.data?.[0]?.url
    if (b64) return imageResult(`data:image/png;base64,${b64}`, { width, height })
    if (url) {
      const imageResponse = await fetch(resolveEndpoint(config, url))
      const dataUrl = await blobToDataUrl(await imageResponse.blob())
      return imageResult(dataUrl, { width, height })
    }
    throw new Error(`${config.model} returned no image data.`)
  },

  async editImage(config, { prompt, imageDataUrl, maskDataUrl }) {
    const endpoint = resolveEndpoint(config, `${config.endpoint}/images/edits`)
    const form = new FormData()
    form.append('model', config.model)
    form.append('prompt', prompt)
    form.append('image', await dataUrlToBlob(imageDataUrl), 'source.png')
    if (maskDataUrl) {
      form.append('mask', await dataUrlToBlob(maskDataUrl), 'mask.png')
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: form
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`${config.model} edit ${response.status}: ${json?.error?.message ?? response.statusText}`)
    }
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) throw new Error(`${config.model} edit returned no image data.`)
    return imageResult(`data:image/png;base64,${b64}`)
  }
}

// gpt-image-1 accepts a fixed set of sizes; Seedream accepts WxH strings via
// the same field. Pick the closest by orientation for gpt-image-1.
function closestOpenAiSize(width, height) {
  const portrait = height > width
  if (portrait && height / width >= 1.3) return '1024x1536'
  if (!portrait && width / height >= 1.3) return '1536x1024'
  return '1024x1024'
}

// ---- dashscope-image: Qwen Image + Z-Image synchronous multimodal-generation ----
//
// DashScope exposes a synchronous text-to-image endpoint at
// /services/aigc/multimodal-generation/generation for qwen-image-2.0 /
// qwen-image-max / qwen-image-plus and z-image-turbo. One request, one image
// URL in the response — no task polling.

function isZImageModel(model) {
  return /^z-image/i.test(model ?? '')
}

// Z-Image recommended sizes (1280×1280 total-pixel tier). Picked by aspect ratio.
const Z_IMAGE_SIZES = [
  [1280, 1280],
  [1024, 1536],
  [1536, 1024],
  [1104, 1472],
  [1472, 1104],
  [1120, 1440],
  [1440, 1120],
  [864, 1536],
  [720, 1680],
  [1536, 864],
  [1680, 720]
]

const dashscopeImageAdapter = {
  async generateImage(config, { prompt, width, height, referenceDataUrl }) {
    const base = (config.endpoint || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '')
    const zImage = isZImageModel(config.model)
    if (referenceDataUrl && zImage) {
      throw new Error('Z-Image does not support reference images. Switch to Qwen 通义万相 or another reference-capable provider.')
    }
    const size = zImage ? zImageSize(width, height) : dashscopeSize(width, height)
    const text = zImage && prompt.length > 800 ? prompt.slice(0, 800) : prompt
    const endpoint = resolveEndpoint(config, `${base}/services/aigc/multimodal-generation/generation`)

    const content = referenceDataUrl
      ? [{ image: dashscopeImagePayload(referenceDataUrl) }, { text }]
      : [{ text }]
    const parameters = zImage ? { size, prompt_extend: false } : { size, n: 1 }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          messages: [
            {
              role: 'user',
              content
            }
          ]
        },
        parameters
      })
    })
    const json = await response.json().catch(() => null)
    const label = zImage ? 'Z-Image' : 'Qwen'
    if (!response.ok) {
      throw new Error(`${label} ${response.status}: ${json?.message ?? JSON.stringify(json)}`)
    }
    const responseContent = json?.output?.choices?.[0]?.message?.content
    const imageUrl = Array.isArray(responseContent)
      ? responseContent.find((part) => part?.image)?.image
      : responseContent?.[0]?.image
    if (!imageUrl) {
      throw new Error(`${label} returned no image. ${json?.message ?? ''}`.trim())
    }

    // Fetch the generated image bytes (through the proxy if needed) and embed.
    const imageResponse = await fetch(resolveEndpoint(config, imageUrl))
    const dataUrl = await blobToDataUrl(await imageResponse.blob())
    return imageResult(dataUrl, { width, height })
  }
}

function zImageSize(width, height) {
  const w = width || 1024
  const h = height || 1024
  const ratio = w / h
  let best = Z_IMAGE_SIZES[0]
  let bestDelta = Infinity
  for (const [sw, sh] of Z_IMAGE_SIZES) {
    const delta = Math.abs(Math.log(ratio) - Math.log(sw / sh))
    if (delta < bestDelta) {
      bestDelta = delta
      best = [sw, sh]
    }
  }
  return `${best[0]}*${best[1]}`
}

function dashscopeSize(width, height) {
  const w = Math.min(roundToMultiple(width || 1024, 128), 2048)
  const h = Math.min(roundToMultiple(height || 1024, 128), 2048)
  return `${w}*${h}`
}

function roundToMultiple(value, multiple) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}

// ---- gemini-image: Nano Banana via generateContent (multimodal inline) ----
//
// Gemini returns generated images inline as an inlineData part (base64) inside
// a generateContent response, so there is no separate image endpoint.

const geminiImageAdapter = {
  async generateImage(config, { prompt, width, height, referenceDataUrl }) {
    const base = (config.endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    const endpoint = resolveEndpoint(config, `${base}/models/${config.model}:generateContent`)
    const parts = referenceDataUrl
      ? [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeTypeForDataUrl(referenceDataUrl) || 'image/png',
              data: dataUrlToBase64(referenceDataUrl)
            }
          }
        ]
      : [{ text: prompt }]
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Gemini ${response.status}: ${json?.error?.message ?? response.statusText}`)
    }
    const inlinePart = json?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)
    const inline = inlinePart?.inlineData
    if (!inline?.data) throw new Error('Gemini returned no inline image.')
    const mimeType = inline.mimeType || 'image/png'
    return imageResult(`data:${mimeType};base64,${inline.data}`, { width, height })
  },

  async editImage(config, { prompt, imageDataUrl }) {
    const base = (config.endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    const endpoint = resolveEndpoint(config, `${base}/models/${config.model}:generateContent`)
    const source = await dataUrlToBlob(imageDataUrl)
    const base64 = imageDataUrl.slice(imageDataUrl.indexOf(',') + 1)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: source.type || 'image/png', data: base64 } }
            ]
          }
        ],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Gemini edit ${response.status}: ${json?.error?.message ?? response.statusText}`)
    }
    const inlinePart = json?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)
    const inline = inlinePart?.inlineData
    if (!inline?.data) throw new Error('Gemini edit returned no inline image.')
    const mimeType = inline.mimeType || 'image/png'
    return imageResult(`data:${mimeType};base64,${inline.data}`)
  }
}

// ---- registry ----

export const IMAGE_ADAPTERS = {
  'openai-image': openaiImageAdapter,
  'dashscope-image': dashscopeImageAdapter,
  'gemini-image': geminiImageAdapter
}

export function getImageAdapter(protocol) {
  return IMAGE_ADAPTERS[protocol] ?? null
}
