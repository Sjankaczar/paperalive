/**
 * @file ContourTracer.test.js
 * @description Unit tests for ContourTracer.js — covers TASK-029, TASK-030.
 */

import { describe, it, expect } from 'vitest'
import { traceContour } from './ContourTracer.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMask(width, height, fillFn) {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = fillFn(x, y) ? 1 : 0
    }
  }
  return { data, width, height }
}

// ─── TASK-029: Basic Tracing ─────────────────────────────────────────────────

describe('TASK-029: ContourTracer — Basic Tracing', () => {
  it('traces perimeter of a 20×20 square in a 50×50 mask', () => {
    const mask = makeMask(50, 50, (x, y) =>
      x >= 15 && x < 35 && y >= 15 && y < 35
    )

    const contour = traceContour(mask)

    expect(contour.length).toBeGreaterThan(0)

    // All contour points should be on the boundary of the square
    for (const p of contour) {
      expect(p.x).toBeGreaterThanOrEqual(15)
      expect(p.x).toBeLessThan(35)
      expect(p.y).toBeGreaterThanOrEqual(15)
      expect(p.y).toBeLessThan(35)
    }
  })

  it('first point === last point (closed polygon)', () => {
    const mask = makeMask(50, 50, (x, y) =>
      x >= 15 && x < 35 && y >= 15 && y < 35
    )

    const contour = traceContour(mask)
    expect(contour.length).toBeGreaterThan(2)

    const first = contour[0]
    const last = contour[contour.length - 1]
    expect(first.x).toBe(last.x)
    expect(first.y).toBe(last.y)
  })

  it('no consecutive duplicate points', () => {
    const mask = makeMask(30, 30, (x, y) =>
      x >= 10 && x < 20 && y >= 10 && y < 20
    )

    const contour = traceContour(mask)

    for (let i = 1; i < contour.length; i++) {
      const prev = contour[i - 1]
      const curr = contour[i]
      const isDuplicate = prev.x === curr.x && prev.y === curr.y
      expect(isDuplicate).toBe(false)
    }
  })

  it('no DOM access', () => {
    const mask = makeMask(10, 10, () => true)
    expect(() => traceContour(mask)).not.toThrow()
  })

  it('returns empty array for all-background mask', () => {
    const mask = makeMask(10, 10, () => false)
    const contour = traceContour(mask)
    expect(contour.length).toBe(0)
  })
})

// ─── TASK-030: Largest Component ─────────────────────────────────────────────

describe('TASK-030: ContourTracer — Largest Component', () => {
  it('traces only the 400-pixel region, ignoring the 100-pixel region', () => {
    // Two regions: small (10×10 = 100 px) and large (20×20 = 400 px)
    const mask = makeMask(80, 40, (x, y) => {
      // Small region: 10×10 at top-left (offset 2,2)
      if (x >= 2 && x < 12 && y >= 2 && y < 12) return true
      // Large region: 20×20 at bottom-right (offset 50,15)
      if (x >= 50 && x < 70 && y >= 15 && y < 35) return true
      return false
    })

    const contour = traceContour(mask)

    // All contour points should be in the large region area
    for (const p of contour) {
      const inLarge = p.x >= 50 && p.x < 70 && p.y >= 15 && p.y < 35
      const inSmall = p.x >= 2 && p.x < 12 && p.y >= 2 && p.y < 12
      expect(inLarge || inSmall).toBe(true) // sanity check
    }

    // Check that points from the large region are present
    const hasLargeRegionPoint = contour.some(p => p.x >= 50)
    expect(hasLargeRegionPoint).toBe(true)

    // Check that NO points from the small region are present
    const hasSmallRegionPoint = contour.some(p => p.x < 12 && p.y < 12)
    expect(hasSmallRegionPoint).toBe(false)
  })

  it('largest is measured by pixel count, not bounding box', () => {
    // Thin tall region: 5×40 = 200 pixels (large bbox, fewer pixels)
    // Small square: 15×15 = 225 pixels (small bbox, more pixels)
    const mask = makeMask(80, 50, (x, y) => {
      // Thin tall: 5×40 at x=5,y=5
      if (x >= 5 && x < 10 && y >= 5 && y < 45) return true
      // Small square: 15×15 at x=50,y=15
      if (x >= 50 && x < 65 && y >= 15 && y < 30) return true
      return false
    })

    const contour = traceContour(mask)

    // Should trace the 15×15 square (225 pixels > 200 pixels)
    const hasSquarePoint = contour.some(p => p.x >= 50)
    expect(hasSquarePoint).toBe(true)
  })
})
