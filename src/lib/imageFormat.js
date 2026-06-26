// Browser counterpart of getImageDimensions from the former MCP server.
// Parses PNG/JPEG/WebP headers from a Blob/ArrayBuffer to read the true pixel
// dimensions without needing the <img> decode round-trip. Returns a promise so
// it composes cleanly with await-based tool code.

function readUint32BE(view, offset) {
  return (view.getUint32(offset) >>> 0)
}

function readUint16BE(view, offset) {
  return view.getUint16(offset) >>> 0
}

function readUint24LE(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
}

export async function getImageDimensions(source) {
  const buffer = source instanceof Blob ? await source.arrayBuffer() : source
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // PNG: magic at bytes 1-3, IHDR width/height at 16-23.
  if (bytes.length >= 24 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: readUint32BE(view, 16), height: readUint32BE(view, 20) }
  }

  // JPEG: scan SOFn marker for dimensions.
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break
      const marker = bytes[offset + 1]
      const size = readUint16BE(view, offset + 2)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { width: readUint16BE(view, offset + 7), height: readUint16BE(view, offset + 5) }
      }
      offset += 2 + size
    }
  }

  // WebP (RIFF/WEBP/VP8X extended header).
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const chunk =
      String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
    if (chunk === 'VP8X') {
      return {
        width: 1 + readUint24LE(view, 24),
        height: 1 + readUint24LE(view, 27)
      }
    }
  }

  throw new Error('Could not read image dimensions. Provide a PNG, JPEG, or WebP source.')
}

export function mimeTypeForDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?/.exec(dataUrl ?? '')
  return match?.[1] || 'image/png'
}
