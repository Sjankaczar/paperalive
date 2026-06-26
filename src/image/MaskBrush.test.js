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
  it('mode="add" (Tandai BG): pixels within radius become 0 (background)', () => {
    const mask = makeMask(100, 100, 1) // all character
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'add'

    brush.applyStroke(50, 50)

    expect(mask.data[50 * 100 + 50]).toBe(0) // center → background
    expect(mask.data[50 * 100 + 55]).toBe(0) // 5px right inside radius → background
    expect(mask.data[45 * 100 + 50]).toBe(0) // 5px up inside radius → background
    expect(mask.data[50 * 100 + 61]).toBe(1) // 11px right outside radius → unchanged
    expect(mask.data[39 * 100 + 50]).toBe(1) // 11px up outside radius → unchanged
  })

  it('pixels outside radius unchanged', () => {
    const mask = makeMask(100, 100, 1) // all character
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 5
    brush.brushMode = 'add'

    brush.applyStroke(50, 50)

    let bgCount = 0
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i] === 0) bgCount++
    }

    // Should be roughly π × 5² ≈ 78 pixels
    expect(bgCount).toBeGreaterThan(50)
    expect(bgCount).toBeLessThan(100)

    expect(mask.data[0]).toBe(1) // top-left corner unchanged
    expect(mask.data[99 * 100 + 99]).toBe(1) // bottom-right corner unchanged
  })

  it('mode="erase" (Pulihkan): pixels within radius become 1 (character)', () => {
    const mask = makeMask(100, 100, 0) // all background
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'erase'

    brush.applyStroke(50, 50)

    expect(mask.data[50 * 100 + 50]).toBe(1) // center → character
    expect(mask.data[50 * 100 + 55]).toBe(1) // within radius → character
    expect(mask.data[50 * 100 + 70]).toBe(0) // outside radius → unchanged
  })

  it('stroke at edge of image does not crash (boundary check)', () => {
    const mask = makeMask(100, 100, 1) // all character
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 10
    brush.brushMode = 'add'

    expect(() => brush.applyStroke(0, 0)).not.toThrow()
    expect(mask.data[0]).toBe(0) // center → background

    expect(() => brush.applyStroke(99, 99)).not.toThrow()
    expect(mask.data[99 * 100 + 99]).toBe(0)

    expect(() => brush.applyStroke(-5, -5)).not.toThrow()
  })

  it('stroke at (0,0) with radius=1 marks correct pixels', () => {
    const mask = makeMask(10, 10, 1) // all character
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.brushRadius = 1
    brush.brushMode = 'add'

    brush.applyStroke(0, 0)

    expect(mask.data[0]).toBe(0)  // (0,0) → background
    expect(mask.data[1]).toBe(0)  // (1,0) distance=1 → background
    expect(mask.data[10]).toBe(0) // (0,1) distance=1 → background
    expect(mask.data[11]).toBe(1) // (1,1) distance=√2 > 1 → unchanged
  })

  it('destroy() cleans up references', () => {
    const mask = makeMask(10, 10)
    const brush = new MaskBrush(document.createElement('canvas'), mask)
    brush.destroy()
    // After destroy, applyStroke should throw (mask is null)
    expect(() => brush.applyStroke(5, 5)).toThrow()
  })
})
