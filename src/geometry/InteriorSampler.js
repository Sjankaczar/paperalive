// @worker-safe
/**
 * @file InteriorSampler.js
 * @description Sample interior points within a contour using a normalized grid.
 *
 * Grid spacing = max(ceil(max(bbox.width, bbox.height) / 20), 5)
 * Only samples pixels that are inside the mask (foreground = 1).
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — InteriorSampler.js
 */

const TARGET_GRID_COUNT = 20
const MIN_SPACING = 5

/**
 * Sample interior points within the mask using a normalized grid.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @param {Array<{x: number, y: number}>} contour - Simplified contour (unused in grid sampling, kept for API compatibility)
 * @param {{top: number, left: number, width: number, height: number}} bbox - Bounding box of foreground
 * @returns {Array<{x: number, y: number}>}
 */
export function sampleInterior(mask, contour, bbox) {
  const { data, width, height } = mask
  const maxDim = Math.max(bbox.width, bbox.height)
  const spacing = Math.max(Math.ceil(maxDim / TARGET_GRID_COUNT), MIN_SPACING)

  const points = []

  // Grid origin: top-left corner of the bounding box
  const startX = bbox.left
  const startY = bbox.top
  const endX = bbox.left + bbox.width
  const endY = bbox.top + bbox.height

  for (let y = startY; y < endY; y += spacing) {
    for (let x = startX; x < endX; x += spacing) {
      // Bounds check
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      // Only sample foreground pixels
      if (data[y * width + x] === 1) {
        points.push({ x, y })
      }
    }
  }

  return points
}
