/**
 * @file MaskBrush.js
 * @description Interactive brush editing on a BinaryMask.
 *
 * Modifies the mask in-place: all pixels within `brushRadius` from the stroke
 * point are set to 1 (add mode) or 0 (erase mode).
 *
 * @see architecture/module_design.md — MaskBrush.js
 */

/**
 * Brush tool for interactive mask editing.
 *
 * Usage:
 *   const brush = new MaskBrush(canvas, mask)
 *   brush.brushRadius = 10
 *   brush.brushMode = 'add'
 *   brush.applyStroke(50, 50)  // sets pixels within radius to 1
 */
export class MaskBrush {
  /** @type {HTMLCanvasElement} */
  #canvas

  /** @type {import('../types/characterData.js').BinaryMask} */
  #mask

  /**
   * @param {HTMLCanvasElement} canvas - Canvas element (used for coordinate reference)
   * @param {import('../types/characterData.js').BinaryMask} mask - BinaryMask to edit in-place
   */
  constructor(canvas, mask) {
    this.#canvas = canvas
    this.#mask = mask

    /** @type {number} Brush radius in pixels */
    this.brushRadius = 10

    /** @type {"add"|"erase"} Brush mode */
    this.brushMode = 'add'
  }

  /**
   * Apply a circular brush stroke at (x, y).
   * All pixels within `brushRadius` distance from (x, y) are modified:
   *   - mode "add":   set to 1 (foreground)
   *   - mode "erase": set to 0 (background)
   *
   * Boundary-safe: pixels outside the mask dimensions are skipped.
   *
   * @param {number} x - X coordinate in mask pixel space
   * @param {number} y - Y coordinate in mask pixel space
   */
  applyStroke(x, y) {
    const { data, width, height } = this.#mask
    const radius = this.brushRadius
    const value = this.brushMode === 'add' ? 1 : 0
    const rSq = radius * radius

    // Bounding box of the brush circle, clamped to mask bounds
    const x0 = Math.max(0, Math.floor(x - radius))
    const x1 = Math.min(width - 1, Math.ceil(x + radius))
    const y0 = Math.max(0, Math.floor(y - radius))
    const y1 = Math.min(height - 1, Math.ceil(y + radius))

    for (let py = y0; py <= y1; py++) {
      const dy = py - y
      for (let px = x0; px <= x1; px++) {
        const dx = px - x
        if (dx * dx + dy * dy <= rSq) {
          data[py * width + px] = value
        }
      }
    }
  }

  /**
   * Get a small canvas element suitable for rendering a brush cursor preview.
   * @returns {HTMLCanvasElement}
   */
  getCursorPreviewCanvas() {
    const size = this.brushRadius * 2 + 2
    const preview = document.createElement('canvas')
    preview.width = size
    preview.height = size
    return preview
  }

  /**
   * Clean up resources. Call when the brush is no longer needed.
   */
  destroy() {
    this.#canvas = null
    this.#mask = null
  }
}
