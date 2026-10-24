import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ChatImage } from '@dsa/core/chatEvents'

export interface Attachment {
  image: ChatImage
  /** A small JPEG data URL kept in the chat history (the full image isn't stored). */
  thumb?: string
}

const THUMB_SIZE = 160

export class ImageError extends Error {}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new ImageError('Couldn’t read that image.'))
    reader.readAsDataURL(file)
  })
}

/** A small preview, or undefined where the browser can't draw one (e.g. in tests). */
async function thumbnail(file: Blob): Promise<string | undefined> {
  try {
    if (typeof createImageBitmap !== 'function') return undefined
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, THUMB_SIZE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.75)
  } catch {
    return undefined
  }
}

/** Reads a pasted, dropped or chosen file into something Claude can see. */
export async function readImage(file: File): Promise<Attachment> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageError('Only PNG, JPEG, GIF or WebP images can be sent to Claude.')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError(`${file.name || 'That image'} is over 5 MB.`)
  const [data, thumb] = await Promise.all([toBase64(file), thumbnail(file)])
  return { image: { mediaType: file.type as ChatImage['mediaType'], data }, thumb }
}
