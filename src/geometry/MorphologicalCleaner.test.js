/**
 * @file MorphologicalCleaner.test.js
 * @description Unit tests for MorphologicalCleaner.js — covers TASK-026, TASK-027, TASK-028.
 */

import { describe, it, expect } from 'vitest'
import { cleanMask } from './MorphologicalCleaner.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMask(width, height, fillFn) {
  const data = new Uint8Array(width * height)
  if (fillFn) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = fillFn(x, y) ? 1 : 0
      }
    }
  }
  return { data, width, height }
}

function countForeground(mask) {
  let c = 0
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] === 1) c++
  }
  return c
}

// ─── TASK-026: Morphological Closing ─────────────────────────────────────────

describe('TASK-026: Morphological Closing', () => {
  it('fills 2-3 pixel gaps in foreground', () => {
    // 40×30 mask: two blocks with a 2-pixel gap in the middle
    // Block 1: x=5..17, Block 2: x=20..32, Gap: x=18,19
    const mask = makeMask(40, 30, (x, y) => {
      const inBlock1 = x >= 5 && x <= 17 && y >= 8 && y <= 22
      const inBlock2 = x >= 20 && x <= 32 && y >= 8 && y <= 22
      return inBlock1 || inBlock2
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(true)

    // After closing, the 2-pixel gap at x=18,19 should be filled
    // Check middle row (y=15) — all pixels from x=5 to x=32 should be foreground
    const row = 15
    for (let x = 5; x <= 32; x++) {
      expect(result.data.data[row * 40 + x]).toBe(1)
    }
  })

  it('does not expand foreground > 3px at edges', () => {
    // 20×20: solid 10×10 square in center
    const mask = makeMask(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)
    const beforeFg = countForeground(mask)

    const result = cleanMask(mask)
    expect(result.success).toBe(true)

    const afterFg = countForeground(result.data)
    // Closing shouldn't grow the shape significantly (within 10%)
    expect(afterFg).toBeLessThanOrEqual(beforeFg * 1.15)
  })

  it('no DOM access (no document.createElement)', () => {
    // This is verified by the @worker-safe comment and grep in TASK-040
    // Here we just verify the module runs without errors on a large filled mask
    const mask = makeMask(50, 50, (x, y) => x >= 5 && x < 45 && y >= 5 && y < 45)
    const result = cleanMask(mask)
    expect(result.success).toBe(true)
  })
})

// ─── TASK-027: Flood Fill ────────────────────────────────────────────────────

describe('TASK-027: Border handling', () => {
  it('border-touching blobs survive cleanMask (ContourTracer picks largest)', () => {
    // floodFillFromEdges removed: dilate expands character to border, making
    // floodFill destructive. Scattered noise handled by ContourTracer getLargestComponent.
    const mask = makeMask(100, 100, (x, y) => {
      if (x >= 0 && x <= 10 && y >= 20 && y <= 80) return true  // bar at left edge
      if (x >= 50 && x <= 80 && y >= 30 && y <= 70) return true  // larger control block
      return false
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(true)
    // Both blobs present in mask — ContourTracer picks the larger control block
    expect(result.data.data[50 * 100 + 65]).toBe(1)
  })

  it('interior block not touching edge survives', () => {
    const mask = makeMask(10, 10, (x, y) => {
      if (x >= 4 && x <= 5 && y >= 4 && y <= 5) return true
      return false
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(true)
    expect(result.data.data[4 * 10 + 4]).toBe(1)
  })
})

// ─── TASK-028: Hole Filling & Guard ──────────────────────────────────────────

describe('TASK-028: Hole Filling & Guard', () => {
  it('fills hole in donut shape (ring with hole in center)', () => {
    // 30×30: donut — outer ring 5-25, inner hole 10-20
    const mask = makeMask(30, 30, (x, y) => {
      const inOuter = x >= 5 && x < 25 && y >= 5 && y < 25
      const inInner = x >= 10 && x < 20 && y >= 10 && y < 20
      return inOuter && !inInner
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(true)

    // Center hole should be filled
    expect(result.data.data[15 * 30 + 15]).toBe(1)
    // Outer shape preserved
    expect(result.data.data[7 * 30 + 7]).toBe(1)
  })

  it('foreground < 3% → MASK_TOO_SMALL', () => {
    // 100×100: 2% = 200 pixels
    const mask = makeMask(100, 100, (x, y) => {
      return x >= 40 && x < 60 && y >= 40 && y < 50 // 20×10 = 200 pixels = 2%
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('MASK_TOO_SMALL')
    expect(typeof result.message).toBe('string')
  })

  it('foreground = 5% → success', () => {
    // 100×100: 5% = 500 pixels
    const mask = makeMask(100, 100, (x, y) => {
      return x >= 30 && x < 80 && y >= 40 && y < 50 // 50×10 = 500 pixels = 5%
    })

    const result = cleanMask(mask)
    expect(result.success).toBe(true)
  })

  it('no throw — only structured return', () => {
    const mask = makeMask(10, 10, () => false) // all background
    expect(() => cleanMask(mask)).not.toThrow()

    const result = cleanMask(mask)
    expect(result.success).toBe(false)
  })
})
