// Rasterize selected tldraw shapes to a PNG data URL for image-model reference input.

export async function exportSelectionToDataUrl(editor, shapeIds) {
  if (!editor) throw new Error('Canvas is not ready yet.')
  const ids = shapeIds?.length ? shapeIds : editor.getSelectedShapeIds()
  if (!ids.length) {
    throw new Error('No shapes are selected. Select the elements to use as a reference image.')
  }

  const result = await editor.toImageDataUrl(ids, {
    format: 'png',
    background: true,
    padding: 'auto',
    pixelRatio: 2
  })

  return {
    dataUrl: result.url,
    width: result.width,
    height: result.height,
    shapeIds: ids,
    mimeType: 'image/png'
  }
}
