// Ephemeral in-memory store for generated/edited image bytes during an agent
// turn. Tool results sent back to the LLM must never include base64 data URLs —
// they blow past context limits. Tools stash pixels here and return a short
// imageRef the model passes to insert_image.

const stash = new Map()

export function clearImageRefs() {
  stash.clear()
}

export function stashImage({ dataUrl, width, height, mimeType }) {
  const imageRef = `img_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  stash.set(imageRef, { dataUrl, width, height, mimeType })
  return imageRef
}

export function resolveImageRef(imageRef) {
  const entry = stash.get(imageRef)
  if (!entry) {
    throw new Error(`Unknown imageRef "${imageRef}". Generate or edit the image again.`)
  }
  return entry
}
