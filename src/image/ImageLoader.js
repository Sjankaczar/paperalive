/**
 * @file ImageLoader.js
 * @description Load, decode, and resize images from File/Blob/URL sources.
 *
 * - Accepts PNG, JPEG, WebP, GIF (frame 0 only)
 * - Resizes to max 1024px on the longest side (aspect ratio preserved)
 * - Returns LoadedImage with decoded ImageData and metadata
 *
 * @see architecture/module_design.md — ImageLoader.js
 * @see architecture/dataflow.md — LoadedImage
 */

const MAX_DIMENSION = 1024

/**
 * Allowed MIME types for image input.
 * @type {Set<string>}
 */
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

/**
 * Calculate resize dimensions so that the longest side ≤ MAX_DIMENSION.
 * Aspect ratio is preserved. If both sides are already ≤ MAX_DIMENSION, returns original.
 *
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number }}
 */
function calcResize(width, height) {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height }
  }

  const scale = MAX_DIMENSION / Math.max(width, height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

/**
 * Detect whether an ImageData has any pixel with alpha < 255.
 *
 * @param {ImageData} imageData
 * @returns {boolean}
 */
function detectAlpha(imageData) {
  const data = imageData.data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true
  }
  return false
}

/**
 * Load an image from a File, Blob, or URL string.
 * Decodes the image, resizes to max 1024px (longest side), and returns a LoadedImage.
 *
 * For GIF files, only the first frame is decoded (no animation playback).
 * For clipboard paste, pass the File object from e.clipboardData.files[0].
 *
 * @param {File | Blob | string} source - Image source
 * @returns {Promise<import('../types/characterData.js').LoadedImage>}
 * @throws {Error} If source is null/undefined or file type is not supported
 */
export async function loadImage(source) {
  // TASK-025: Handle null/undefined input (e.g. clipboard with no file)
  if (source === null || source === undefined) {
    throw new Error('ImageLoader: No valid image source provided (received null or undefined)')
  }

  // TASK-017: Validate source type
  let blob
  if (typeof source === 'string') {
    // URL string — fetch to get a Blob
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`ImageLoader: Failed to fetch image from URL: ${source}`)
    }
    blob = await response.blob()
  } else if (source instanceof Blob) {
    blob = source
  } else {
    throw new Error(`ImageLoader: Unsupported source type. Expected File, Blob, or URL string.`)
  }

  // Validate MIME type
  if (!ALLOWED_TYPES.has(blob.type)) {
    throw new Error(
      `ImageLoader: Unsupported file type "${blob.type}". ` +
      'Supported types: PNG, JPEG, WebP, GIF.'
    )
  }

  // TASK-017: Decode image using createImageBitmap
  // TASK-019: GIF is decoded as frame 0 only (createImageBitmap default behavior)
  let originalBitmap
  try {
    originalBitmap = await createImageBitmap(blob)
  } catch (err) {
    throw new Error(`ImageLoader: Failed to decode image — ${err.message}`)
  }

  const originalWidth = originalBitmap.width
  const originalHeight = originalBitmap.height

  // TASK-018: Calculate resize dimensions
  const { width: targetWidth, height: targetHeight } = calcResize(originalWidth, originalHeight)

  // Decode to ImageData at target resolution
  let imageData
  if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
    // Resize needed — use createImageBitmap with resize options
    const resizedBitmap = await createImageBitmap(blob, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'high',
    })
    imageData = bitmapToImageData(resizedBitmap, targetWidth, targetHeight)
    resizedBitmap.close()
  } else {
    // No resize needed
    imageData = bitmapToImageData(originalBitmap, originalWidth, originalHeight)
  }

  originalBitmap.close()

  // TASK-017: Detect alpha channel
  const hasAlpha = detectAlpha(imageData)

  return {
    imageData,
    width: targetWidth,
    height: targetHeight,
    originalSize: { width: originalWidth, height: originalHeight },
    hasAlpha,
  }
}

/**
 * Convert an ImageBitmap to ImageData by drawing onto an OffscreenCanvas.
 *
 * @param {ImageBitmap} bitmap
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
function bitmapToImageData(bitmap, width, height) {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  return ctx.getImageData(0, 0, width, height)
}
