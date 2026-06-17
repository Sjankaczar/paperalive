/**
 * @file bbox.test.js
 * @description Unit tests for bbox.js — getMaskBoundingBox and getMaskCentroid.
 * Corresponds to: TASK-008.
 */

import { describe, it, expect } from 'vitest'
import { getMaskBoundingBox, getMaskCentroid } from './bbox.js'

/**
 * Create a BinaryMask object with all pixels set to 0 (background).
 * @param {number} width
 * @param {number} height
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
function createEmptyMask(width, height) {
  return {
    data: new Uint8Array(width * height),
    width,
    height,
  }
}

/**
 * Set a rectangular region to foreground (value = 255).
 * @param {{ data: Uint8Array, width: number, height: number }} mask
 * @param {number} top
 * @param {number} left
 * @param {number} right   (inclusive)
 * @param {number} bottom  (inclusive)
 */
function fillRect(mask, top, left, right, bottom) {
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      mask.data[row * mask.width + col] = 255
    }
  }
}

// ─── getMaskBoundingBox ───────────────────────────────────────────────────────

describe('getMaskBoundingBox', () => {
  it('returns correct bbox for foreground region (10,10)–(30,40)', () => {
    const mask = createEmptyMask(100, 100)
    // pixel (col=10, row=10) to (col=30, row=40)
    fillRect(mask, 10, 10, 30, 40)

    const bbox = getMaskBoundingBox(mask)
    expect(bbox).not.toBeNull()
    expect(bbox.top).toBe(10)
    expect(bbox.left).toBe(10)
    expect(bbox.width).toBe(21)   // 30 - 10 + 1 = 21
    expect(bbox.height).toBe(31)  // 40 - 10 + 1 = 31
  })

  it('returns null for empty mask (no foreground)', () => {
    const mask = createEmptyMask(100, 100)
    expect(getMaskBoundingBox(mask)).toBeNull()
  })

  it('handles single foreground pixel', () => {
    const mask = createEmptyMask(50, 50)
    mask.data[15 * 50 + 20] = 255  // row=15, col=20

    const bbox = getMaskBoundingBox(mask)
    expect(bbox.top).toBe(15)
    expect(bbox.left).toBe(20)
    expect(bbox.width).toBe(1)
    expect(bbox.height).toBe(1)
  })

  it('handles full mask', () => {
    const mask = createEmptyMask(10, 10)
    fillRect(mask, 0, 0, 9, 9)

    const bbox = getMaskBoundingBox(mask)
    expect(bbox.top).toBe(0)
    expect(bbox.left).toBe(0)
    expect(bbox.width).toBe(10)
    expect(bbox.height).toBe(10)
  })
})

// ─── getMaskCentroid ─────────────────────────────────────────────────────────

describe('getMaskCentroid', () => {
  it('returns null for empty mask', () => {
    const mask = createEmptyMask(100, 100)
    expect(getMaskCentroid(mask)).toBeNull()
  })

  it('centroid of symmetric foreground = center of bbox', () => {
    const mask = createEmptyMask(100, 100)
    fillRect(mask, 10, 10, 30, 40)

    const centroid = getMaskCentroid(mask)
    expect(centroid).not.toBeNull()
    // Centroid of uniform rectangle: avg of all pixel coords
    // cols 10..30 → average col = (10+30)/2 = 20
    // rows 10..40 → average row = (10+40)/2 = 25
    expect(Math.abs(centroid.cx - 20)).toBeLessThan(0.01)
    expect(Math.abs(centroid.cy - 25)).toBeLessThan(0.01)
  })

  it('centroid of single pixel = that pixel', () => {
    const mask = createEmptyMask(50, 50)
    mask.data[20 * 50 + 30] = 255  // row=20, col=30

    const centroid = getMaskCentroid(mask)
    expect(centroid.cx).toBe(30)
    expect(centroid.cy).toBe(20)
  })

  it('centroid of two pixels = midpoint', () => {
    const mask = createEmptyMask(50, 50)
    mask.data[0 * 50 + 0] = 255   // (col=0, row=0)
    mask.data[4 * 50 + 6] = 255   // (col=6, row=4)

    const centroid = getMaskCentroid(mask)
    expect(Math.abs(centroid.cx - 3)).toBeLessThan(0.01)
    expect(Math.abs(centroid.cy - 2)).toBeLessThan(0.01)
  })
})
