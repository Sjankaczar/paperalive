/**
 * @file bbox.js
 * @description Bounding box and centroid utilities for BinaryMask.
 *
 * BinaryMask is a Uint8Array of length width × height.
 * Pixel at (col, row) = mask[row * width + col].
 * Foreground = value > 0.
 */

/**
 * Compute the axis-aligned bounding box of all foreground pixels in a mask.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 *   Returns null if the mask has no foreground pixels.
 */
export function getMaskBoundingBox(mask) {
  const { data, width, height } = mask

  let minRow = height
  let maxRow = -1
  let minCol = width
  let maxCol = -1

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (data[row * width + col] > 0) {
        if (row < minRow) minRow = row
        if (row > maxRow) maxRow = row
        if (col < minCol) minCol = col
        if (col > maxCol) maxCol = col
      }
    }
  }

  if (maxRow === -1) {
    // No foreground pixels
    return null
  }

  return {
    top: minRow,
    left: minCol,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  }
}

/**
 * Compute the centroid (center of mass) of all foreground pixels in a mask.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{ cx: number, cy: number } | null}
 *   Returns null if the mask has no foreground pixels.
 */
export function getMaskCentroid(mask) {
  const { data, width, height } = mask

  let sumX = 0
  let sumY = 0
  let count = 0

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (data[row * width + col] > 0) {
        sumX += col
        sumY += row
        count++
      }
    }
  }

  if (count === 0) return null

  return {
    cx: sumX / count,
    cy: sumY / count,
  }
}
