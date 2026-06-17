/**
 * @file ThresholdEngine.js
 * @description Convert ImageData → BinaryMask using alpha or luminance thresholding.
 *
 * Two modes:
 *   - "alpha":      pixel alpha >= threshold → foreground (1), else background (0)
 *   - "luminance":  L = 0.299R + 0.587G + 0.114B; L < threshold → foreground (1)
 *
 * Canvas preview renders foreground overlay as rgba(0, 200, 100, 0.4).
 *
 * @see architecture/module_design.md — ThresholdEngine.js
 * @see architecture/dataflow.md — BinaryMask
 */

/**
 * Apply threshold to ImageData and produce a BinaryMask.
 *
 * @param {ImageData} imageData  - Decoded pixel data
 * @param {number}    threshold  - Threshold value (0–255)
 * @param {"alpha"|"luminance"} mode - Thresholding mode
 * @returns {import('../types/characterData.js').BinaryMask}
 */
export function applyThreshold(imageData, threshold, mode) {
  const { width, height, data } = imageData
  const mask = new Uint8Array(width * height)

  if (mode === 'alpha') {
    applyAlphaThreshold(data, mask, threshold)
  } else if (mode === 'luminance') {
    applyLuminanceThreshold(data, mask, threshold)
  } else {
    throw new Error(`ThresholdEngine: Unknown mode "${mode}". Use "alpha" or "luminance".`)
  }

  return { data: mask, width, height }
}

/**
 * Alpha threshold: pixel with alpha >= threshold → foreground (1).
 *
 * @param {Uint8ClampedArray} srcData - RGBA pixel data
 * @param {Uint8Array}        mask    - Output binary mask
 * @param {number}            threshold
 */
function applyAlphaThreshold(srcData, mask, threshold) {
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) {
    mask[i] = srcData[p] >= threshold ? 1 : 0
  }
}

/**
 * Luminance threshold: L = 0.299R + 0.587G + 0.114B; L < threshold → foreground (1).
 *
 * @param {Uint8ClampedArray} srcData - RGBA pixel data
 * @param {Uint8Array}        mask    - Output binary mask
 * @param {number}            threshold
 */
function applyLuminanceThreshold(srcData, mask, threshold) {
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const luminance = 0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2]
    mask[i] = luminance < threshold ? 1 : 0
  }
}

/**
 * Render a threshold preview overlay onto a 2D canvas context.
 * Foreground pixels are drawn as rgba(0, 200, 100, 0.4).
 * Background pixels are left transparent.
 *
 * @param {ImageData}  imageData  - Source pixel data
 * @param {number}     threshold  - Threshold value (0–255)
 * @param {"alpha"|"luminance"} mode - Thresholding mode
 * @param {CanvasRenderingContext2D} outputCtx - Target canvas 2D context
 */
export function applyThresholdToCanvas(imageData, threshold, mode, outputCtx) {
  const { width, height } = imageData
  const mask = applyThreshold(imageData, threshold, mode)

  // Build overlay ImageData: foreground = rgba(0, 200, 100, 102), background = transparent
  const overlay = outputCtx.createImageData(width, height)
  const out = overlay.data

  for (let i = 0; i < mask.data.length; i++) {
    const p = i * 4
    if (mask.data[i] === 1) {
      out[p] = 0       // R
      out[p + 1] = 200  // G
      out[p + 2] = 100  // B
      out[p + 3] = 102  // A ≈ 0.4 × 255
    }
    // Background pixels remain (0,0,0,0) — transparent
  }

  outputCtx.putImageData(overlay, 0, 0)
}
