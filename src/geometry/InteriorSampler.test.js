/**
 * @file InteriorSampler.test.js
 * @description Unit tests for InteriorSampler.js — covers TASK-033.
 */

import { describe, it, expect } from 'vitest'
import { sampleInterior } from './InteriorSampler.js'

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

// ─── TASK-033: Normalized Grid Spacing ───────────────────────────────────────

describe('TASK-033: InteriorSampler — Normalized Grid Spacing', () => {
  it('grid spacing = max(ceil(200/20), 5) = 10 for bbox 100×200', () => {
    // 200×300 image, bbox = {top:0, left:0, width:100, height:200}
    const imgW = 200
    const imgH = 300
    const bbox = { top: 0, left: 0, width: 100, height: 200 }

    // Fill entire bbox region as foreground
    const mask = makeMask(imgW, imgH, (x, y) =>
      x >= bbox.left && x < bbox.left + bbox.width &&
      y >= bbox.top && y < bbox.top + bbox.height
    )

    const contour = [] // unused in grid sampling
    const points = sampleInterior(mask, contour, bbox)

    // Spacing should be max(ceil(200/20), 5) = max(10, 5) = 10
    // Grid: x in [0, 10, 20, ..., 90], y in [0, 10, 20, ..., 190]
    // That's 10 * 20 = 200 points (all foreground)
    expect(points.length).toBe(200)

    // Verify spacing between consecutive x-values on same row
    const firstRowY = points.filter(p => p.y === 0)
    if (firstRowY.length > 1) {
      const xGap = firstRowY[1].x - firstRowY[0].x
      expect(xGap).toBe(10)
    }
  })

  it('all output points are inside the mask (mask[y*w+x] === 1)', () => {
    const mask = makeMask(100, 100, (x, y) =>
      x >= 20 && x < 80 && y >= 20 && y < 80
    )
    const bbox = { top: 20, left: 20, width: 60, height: 60 }
    const contour = []

    const points = sampleInterior(mask, contour, bbox)

    for (const p of points) {
      expect(mask.data[p.y * mask.width + p.x]).toBe(1)
    }
  })

  it('no points outside bounding box', () => {
    const mask = makeMask(100, 100, (x, y) =>
      x >= 10 && x < 90 && y >= 10 && y < 90
    )
    const bbox = { top: 10, left: 10, width: 80, height: 80 }
    const contour = []

    const points = sampleInterior(mask, contour, bbox)

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(bbox.left)
      expect(p.x).toBeLessThan(bbox.left + bbox.width)
      expect(p.y).toBeGreaterThanOrEqual(bbox.top)
      expect(p.y).toBeLessThan(bbox.top + bbox.height)
    }
  })

  it('no DOM access', () => {
    const mask = makeMask(50, 50, () => true)
    const bbox = { top: 0, left: 0, width: 50, height: 50 }
    expect(() => sampleInterior(mask, [], bbox)).not.toThrow()
  })

  it('MIN_SPACING = 5: small bbox uses spacing 5', () => {
    // bbox 30×30 → spacing = max(ceil(30/20), 5) = max(2, 5) = 5
    const mask = makeMask(50, 50, (x, y) =>
      x >= 10 && x < 40 && y >= 10 && y < 40
    )
    const bbox = { top: 10, left: 10, width: 30, height: 30 }
    const contour = []

    const points = sampleInterior(mask, contour, bbox)

    // Grid: x in [10, 15, 20, 25, 30, 35], y in [10, 15, 20, 25, 30, 35]
    // That's 6 * 6 = 36 points
    expect(points.length).toBe(36)

    // Verify spacing = 5
    const firstRowY = points.filter(p => p.y === 10)
    if (firstRowY.length > 1) {
      const xGap = firstRowY[1].x - firstRowY[0].x
      expect(xGap).toBe(5)
    }
  })

  it('returns empty array when no foreground pixels in bbox', () => {
    const mask = makeMask(50, 50, () => false) // all background
    const bbox = { top: 0, left: 0, width: 50, height: 50 }

    const points = sampleInterior(mask, [], bbox)
    expect(points.length).toBe(0)
  })
})
