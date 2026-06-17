/**
 * @file MaskBrush.test.js
 * @description Unit tests for MaskBrush.js — covers TASK-023.
 */

import { describe, it, expect } from 'vitest'
import { MaskBrush } from './MaskBrush.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a BinaryMask filled with a given value.
 * @param {number} width
 * @param {number} height
 * @param {number} [fillValue=0]
 * @returns {import('../types/characterData.js').BinaryMask}
 */
function makeMask(width, height, fillValue = 0) {
  return {
    data: new Uint8Array(width * height).fill(fillValue),
    width,
    height,
  }
}

// ─── TASK-023: MaskBrush ─────────────────────────────────────────────────────

describe('TASK-023: MaskBrush', () => {
  it('applyStroke(50,50) with radius=10, mode="add" sets pixels within radius to 1', () => {
    const mask = makeMask(100, 100, 0)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'add'

    brush.applyStroke(50, 50)

    // Center pixel should be 1
    expect(mask.data[50 * 100 + 50]).toBe(1)

    // Pixel at distance 5 (inside radius) should be 1
    expect(mask.data[50 * 100 + 55]).toBe(1) // 5px right
    expect(mask.data[45 * 100 + 50]).toBe(1) // 5px up

    // Pixel at distance 11 (outside radius) should be 0
    expect(mask.data[50 * 100 + 61]).toBe(0) // 11px right
    expect(mask.data[39 * 100 + 50]).toBe(0) // 11px up
  })

  it('pixels outside radius remain 0', () => {
    const mask = makeMask(100, 100, 0)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 5
    brush.brushMode = 'add'

    brush.applyStroke(50, 50)

    // Count foreground pixels
    let fgCount = 0
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i] === 1) fgCount++
    }

    // Should be roughly π × 5² ≈ 78 pixels (circle area)
    expect(fgCount).toBeGreaterThan(50)
    expect(fgCount).toBeLessThan(100)

    // Far-away pixel should definitely be 0
    expect(mask.data[0]).toBe(0) // top-left corner
    expect(mask.data[99 * 100 + 99]).toBe(0) // bottom-right corner
  })

  it('mode="erase": pixels within radius become 0', () => {
    const mask = makeMask(100, 100, 1) // all foreground
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'erase'

    brush.applyStroke(50, 50)

    // Center pixel should be 0
    expect(mask.data[50 * 100 + 50]).toBe(0)

    // Pixel within radius should be 0
    expect(mask.data[50 * 100 + 55]).toBe(0)

    // Pixel outside radius should still be 1
    expect(mask.data[50 * 100 + 70]).toBe(1) // 20px right (outside radius 10)
  })

  it('stroke at edge of image does not crash (boundary check)', () => {
    const mask = makeMask(100, 100, 0)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'add'

    // Stroke at top-left corner
    expect(() => brush.applyStroke(0, 0)).not.toThrow()
    expect(mask.data[0]).toBe(1) // center pixel

    // Stroke at bottom-right corner
    expect(() => brush.applyStroke(99, 99)).not.toThrow()
    expect(mask.data[99 * 100 + 99]).toBe(1)

    // Stroke at negative coordinate (completely outside)
    expect(() => brush.applyStroke(-5, -5)).not.toThrow()
  })

  it('stroke at (0,0) with radius=1 sets only corner pixel', () => {
    const mask = makeMask(10, 10, 0)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 1
    brush.brushMode = 'add'

    brush.applyStroke(0, 0)

    expect(mask.data[0]).toBe(1) // (0,0)
    expect(mask.data[1]).toBe(1) // (1,0) distance=1
    expect(mask.data[10]).toBe(1) // (0,1) distance=1
    expect(mask.data[11]).toBe(0) // (1,1) distance=√2 > 1
  })

  it('destroy() cleans up references', () => {
    const mask = makeMask(10, 10)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.destroy()
    // After destroy, applyStroke should throw (mask is null)
    expect(() => brush.applyStroke(5, 5)).toThrow()
  })
})
