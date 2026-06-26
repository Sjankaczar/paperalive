import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

let _segmenter = null
let _initPromise = null

/**
 * Lazy-init the MediaPipe ImageSegmenter singleton.
 * Safe to call multiple times — resolves immediately after first load.
 *
 * @returns {Promise<ImageSegmenter>}
 */
export async function initSegmenter() {
  if (_segmenter) return _segmenter
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    _segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })
    return _segmenter
  })()

  return _initPromise
}

/**
 * Segment foreground using MediaPipe Selfie Segmenter.
 * Returns BinaryMask: 1 = foreground (subject), 0 = background.
 *
 * Throws on failure — caller should catch and fall back to autoEraseBackground.
 *
 * @param {ImageData} imageData
 * @returns {Promise<import('../types/characterData.js').BinaryMask>}
 */
export async function segmentWithMediaPipe(imageData) {
  const segmenter = await initSegmenter()
  const { width, height } = imageData

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(imageData, 0, 0)

  const result = segmenter.segment(canvas)

  // confidenceMasks[0] = background, confidenceMasks[1] = person (selfie model)
  // Use [1] if available, fall back to inverted [0]
  const confMask = result.confidenceMasks[1] ?? result.confidenceMasks[0]
  const invert = !result.confidenceMasks[1]
  const confidence = confMask.getAsFloat32Array()

  // Lower threshold (0.3) to catch drawn/non-photographic characters
  const THRESHOLD = 0.3
  const mask = new Uint8Array(width * height)
  let fgCount = 0
  for (let i = 0; i < confidence.length; i++) {
    const isFg = invert ? confidence[i] < (1 - THRESHOLD) : confidence[i] >= THRESHOLD
    if (isFg) { mask[i] = 1; fgCount++ }
  }

  result.close()

  // Selfie model didn't recognize subject — signal fallback to heuristic
  if (fgCount / mask.length < 0.01) {
    throw new Error('MediaPipe: no foreground detected')
  }

  return { data: mask, width, height }
}
