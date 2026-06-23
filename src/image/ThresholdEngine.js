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

import { morphologicalClose } from '../geometry/MorphologicalCleaner.js'

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

/**
 * Sample the border pixels of the image to estimate the background color (RGBA).
 *
 * @param {ImageData} imageData
 * @returns {[number, number, number, number]} [R, G, B, A] average border color
 */
export function estimateBackgroundColor(imageData) {
  const { width, height, data } = imageData
  let totalR = 0, totalG = 0, totalB = 0, totalA = 0
  let count = 0

  for (let x = 0; x < width; x++) {
    // Top edge
    const topIdx = x * 4
    totalR += data[topIdx]
    totalG += data[topIdx + 1]
    totalB += data[topIdx + 2]
    totalA += data[topIdx + 3]
    count++

    // Bottom edge
    if (height > 1) {
      const bottomIdx = ((height - 1) * width + x) * 4
      totalR += data[bottomIdx]
      totalG += data[bottomIdx + 1]
      totalB += data[bottomIdx + 2]
      totalA += data[bottomIdx + 3]
      count++
    }
  }

  for (let y = 1; y < height - 1; y++) {
    // Left edge
    const leftIdx = (y * width) * 4
    totalR += data[leftIdx]
    totalG += data[leftIdx + 1]
    totalB += data[leftIdx + 2]
    totalA += data[leftIdx + 3]
    count++

    // Right edge
    if (width > 1) {
      const rightIdx = (y * width + width - 1) * 4
      totalR += data[rightIdx]
      totalG += data[rightIdx + 1]
      totalB += data[rightIdx + 2]
      totalA += data[rightIdx + 3]
      count++
    }
  }

  if (count === 0) {
    return [0, 0, 0, 0]
  }

  return [
    totalR / count,
    totalG / count,
    totalB / count,
    totalA / count
  ]
}

/**
 * Automatically erase the background of an image using border sampling, flood fill,
 * and morphological closing.
 *
 * @param {ImageData} imageData
 * @param {number} tolerance
 * @returns {import('../types/characterData.js').BinaryMask}
 */
export function autoEraseBackground(imageData, tolerance = 30) {
  if (!imageData || !imageData.data || imageData.width <= 0 || imageData.height <= 0) {
    throw new Error('autoEraseBackground: Invalid imageData')
  }

  const { width, height, data } = imageData
  const avgBg = estimateBackgroundColor(imageData)
  const [avgR, avgG, avgB, avgA] = avgBg

  const mask = new Uint8Array(width * height)
  mask.fill(1) // 1 is foreground, 0 is background

  const visited = new Uint8Array(width * height)
  const queue = []

  function checkAndEnqueue(x, y) {
    const idx = y * width + x
    if (visited[idx]) return
    visited[idx] = 1

    const p = idx * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    const a = data[p + 3]

    const dist = Math.sqrt(
      (r - avgR) ** 2 +
      (g - avgG) ** 2 +
      (b - avgB) ** 2 +
      (a - avgA) ** 2
    )

    if (dist < tolerance) {
      mask[idx] = 0 // background
      queue.push(idx)
    }
  }

  // Seed flood fill from the borders
  for (let x = 0; x < width; x++) {
    checkAndEnqueue(x, 0)
    if (height > 1) {
      checkAndEnqueue(x, height - 1)
    }
  }
  for (let y = 1; y < height - 1; y++) {
    checkAndEnqueue(0, y)
    if (width > 1) {
      checkAndEnqueue(width - 1, y)
    }
  }

  // BFS
  let head = 0
  const DX4 = [0, 0, -1, 1]
  const DY4 = [-1, 1, 0, 0]

  while (head < queue.length) {
    const idx = queue[head++]
    const cx = idx % width
    const cy = Math.floor(idx / width)

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d]
      const ny = cy + DY4[d]

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        checkAndEnqueue(nx, ny)
      }
    }
  }

  // Apply morphological close
  const rawMask = { data: mask, width, height }
  const closedMask = morphologicalClose(rawMask)

  return closedMask
}
