/**
 * @file ConnectedComponents.test.js
 * @description Unit tests for ConnectedComponents.js — connected-component labeling
 *              using union-find 2-pass.
 */

import { describe, it, expect } from 'vitest'
import { findLargestComponent } from './ConnectedComponents.js'

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

// ─── Test Cases ──────────────────────────────────────────────────────────────

describe('findLargestComponent', () => {
  it('single blob — returns correct pixelCount and bbox', () => {
    // 50×50 mask: single rectangle x=10..30, y=15..35
    const mask = makeMask(50, 50, (x, y) => {
      return x >= 10 && x <= 30 && y >= 15 && y <= 35
    })

    const result = findLargestComponent(mask)

    // 21×21 = 441 pixels
    expect(result.pixelCount).toBe(441)
    expect(result.bbox).toEqual({ top: 15, left: 10, width: 21, height: 21 })
    expect(countForeground(result.mask)).toBe(441)
  })

  it('multi blob — selects largest by pixelCount', () => {
    // 100×100 mask: 3 blobs of different sizes
    const mask = makeMask(100, 100, (x, y) => {
      // Small blob: 5×5 = 25 pixels at (5,5)
      if (x >= 5 && x <= 9 && y >= 5 && y <= 9) return true
      // Medium blob: 10×10 = 100 pixels at (50,50)
      if (x >= 50 && x <= 59 && y >= 50 && y <= 59) return true
      // Large blob: 20×20 = 400 pixels at (20,20)
      if (x >= 20 && x <= 39 && y >= 20 && y <= 39) return true
      return false
    })

    const result = findLargestComponent(mask)

    // Largest = 400 pixels
    expect(result.pixelCount).toBe(400)
    expect(result.bbox).toEqual({ top: 20, left: 20, width: 20, height: 20 })

    // Verify small and medium blobs are gone from result mask
    expect(result.mask.data[7 * 100 + 7]).toBe(0)   // small blob pixel
    expect(result.mask.data[55 * 100 + 55]).toBe(0)  // medium blob pixel
    // Verify large blob remains
    expect(result.mask.data[25 * 100 + 25]).toBe(1)
  })

  it('noise removal — small components removed, only largest in output', () => {
    // 80×80 mask: large character-like blob + scattered noise pixels
    const mask = makeMask(80, 80, (x, y) => {
      // Large blob: 30×40 = 1200 pixels at (20,20)
      if (x >= 20 && x <= 49 && y >= 20 && y <= 59) return true
      // Noise pixel 1: single pixel at (5,5)
      if (x === 5 && y === 5) return true
      // Noise pixel 2: single pixel at (70,70)
      if (x === 70 && y === 70) return true
      // Noise blob: 3×2 = 6 pixels at (60,10)
      if (x >= 60 && x <= 62 && y >= 10 && y <= 11) return true
      return false
    })

    const result = findLargestComponent(mask)

    expect(result.pixelCount).toBe(1200)
    // Noise removed
    expect(result.mask.data[5 * 80 + 5]).toBe(0)
    expect(result.mask.data[70 * 80 + 70]).toBe(0)
    expect(result.mask.data[10 * 80 + 61]).toBe(0)
    // Main blob preserved
    expect(result.mask.data[30 * 80 + 30]).toBe(1)
  })

  it('empty mask — returns pixelCount=0 and bbox=null', () => {
    const mask = makeMask(50, 50, () => false)

    const result = findLargestComponent(mask)

    expect(result.pixelCount).toBe(0)
    expect(result.bbox).toBeNull()
    expect(countForeground(result.mask)).toBe(0)
  })

  it('bbox accuracy — exact bbox for irregular L-shape', () => {
    // 60×60 mask: L-shaped blob
    const mask = makeMask(60, 60, (x, y) => {
      // Vertical bar: x=10..15, y=10..40
      const vertical = x >= 10 && x <= 15 && y >= 10 && y <= 40
      // Horizontal bar: x=10..40, y=35..40
      const horizontal = x >= 10 && x <= 40 && y >= 35 && y <= 40
      return vertical || horizontal
    })

    const result = findLargestComponent(mask)

    // Bbox should span the entire L-shape
    expect(result.bbox).toEqual({ top: 10, left: 10, width: 31, height: 31 })
    expect(result.pixelCount).toBeGreaterThan(0)
  })

  it('diagonal separation — diagonally connected = separate components (4-connectivity)', () => {
    // 30×30 mask: two 5×5 blocks only touching diagonally
    const mask = makeMask(30, 30, (x, y) => {
      // Block A: x=5..9, y=5..9
      const blockA = x >= 5 && x <= 9 && y >= 5 && y <= 9
      // Block B: x=10..14, y=10..14 (diagonally adjacent to A at corner (9,9)→(10,10))
      const blockB = x >= 10 && x <= 14 && y >= 10 && y <= 14
      return blockA || blockB
    })

    const result = findLargestComponent(mask)

    // Both blocks are 25 pixels each — same size, pick one deterministically
    expect(result.pixelCount).toBe(25)
    // Exactly one block in result
    const totalFg = countForeground(result.mask)
    expect(totalFg).toBe(25)
  })

  it('full foreground — entire mask foreground = one component', () => {
    // 40×40 mask: all pixels foreground
    const mask = makeMask(40, 40, () => true)

    const result = findLargestComponent(mask)

    expect(result.pixelCount).toBe(40 * 40)
    expect(result.bbox).toEqual({ top: 0, left: 0, width: 40, height: 40 })
    expect(countForeground(result.mask)).toBe(40 * 40)
  })
})
