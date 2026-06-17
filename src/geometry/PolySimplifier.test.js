/**
 * @file PolySimplifier.test.js
 * @description Unit tests for PolySimplifier.js — covers TASK-031, TASK-032.
 */

import { describe, it, expect } from 'vitest'
import { simplifyContour, adaptiveSimplify } from './PolySimplifier.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a circle contour with N points.
 */
function makeCircleContour(cx, cy, r, n) {
  const points = []
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
  // Close polygon
  points.push({ x: points[0].x, y: points[0].y })
  return points
}

// ─── TASK-031: Douglas-Peucker ───────────────────────────────────────────────

describe('TASK-031: PolySimplifier — Douglas-Peucker', () => {
  it('1000-point circle with epsilon=2.5 → < 200 points', () => {
    const contour = makeCircleContour(500, 500, 400, 1000)
    const simplified = simplifyContour(contour, 2.5)

    expect(simplified.length).toBeLessThan(200)
    expect(simplified.length).toBeGreaterThan(2)
  })

  it('epsilon=0: no points removed (all preserved)', () => {
    const contour = makeCircleContour(100, 100, 50, 100)
    const simplified = simplifyContour(contour, 0)

    expect(simplified.length).toBe(contour.length)
  })

  it('all output points exist in input contour', () => {
    const contour = makeCircleContour(100, 100, 50, 200)
    const simplified = simplifyContour(contour, 3.0)

    for (const p of simplified) {
      const found = contour.some(
        (q) => Math.abs(p.x - q.x) < 1e-10 && Math.abs(p.y - q.y) < 1e-10
      )
      expect(found).toBe(true)
    }
  })

  it('no DOM access', () => {
    const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }]
    expect(() => simplifyContour(contour, 1)).not.toThrow()
  })

  it('handles degenerate contour (2 points)', () => {
    const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    const simplified = simplifyContour(contour, 5)
    expect(simplified.length).toBe(2)
  })

  it('straight line simplified to 2 endpoints', () => {
    const line = []
    for (let i = 0; i <= 50; i++) {
      line.push({ x: i * 2, y: 0 })
    }
    const simplified = simplifyContour(line, 1)
    expect(simplified.length).toBe(2) // start and end
  })
})

// ─── TASK-032: Adaptive Epsilon ──────────────────────────────────────────────

describe('TASK-032: PolySimplifier — Adaptive Epsilon', () => {
  it('2000 points, maxPoints=400, minEps=1.0 → output ≤ 400 points', () => {
    const contour = makeCircleContour(500, 500, 400, 2000)
    const result = adaptiveSimplify(contour, 400, 1.0)

    expect(result.simplified.length).toBeLessThanOrEqual(400)
    expect(result.epsilonUsed).toBeGreaterThanOrEqual(1.0)
  })

  it('epsilonUsed ≥ minEps', () => {
    const contour = makeCircleContour(100, 100, 50, 500)
    const result = adaptiveSimplify(contour, 100, 2.0)

    expect(result.epsilonUsed).toBeGreaterThanOrEqual(2.0)
  })

  it('does not loop infinitely (max 20 iterations)', () => {
    // Very dense contour that's hard to simplify
    const contour = makeCircleContour(500, 500, 400, 10000)
    const result = adaptiveSimplify(contour, 50, 0.01)

    // Should terminate regardless
    expect(result.simplified.length).toBeGreaterThan(0)
    expect(result.epsilonUsed).toBeGreaterThan(0)
  })

  it('already small contour → epsilon stays at minEps', () => {
    const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }]
    const result = adaptiveSimplify(contour, 100, 1.0)

    expect(result.simplified.length).toBeLessThanOrEqual(100)
    expect(result.epsilonUsed).toBe(1.0)
  })
})
