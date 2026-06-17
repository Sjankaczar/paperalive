/**
 * @file SkeletonEstimator.test.js
 * @description Unit tests for SkeletonEstimator.js — covers TASK-041, TASK-042, TASK-052.
 */

import { describe, it, expect } from 'vitest'
import { getMaskBoundingBox, getMaskCentroid, estimateSkeleton } from './SkeletonEstimator.js'

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

// ─── TASK-041: BBox & Centroid ──────────────────────────────────────────────

describe('TASK-041: SkeletonEstimator — BBox & Centroid', () => {
  it('getMaskBoundingBox returns correct bbox for region (20,30)–(180,280)', () => {
    const mask = makeMask(200, 300, (x, y) =>
      x >= 20 && x <= 180 && y >= 30 && y <= 280
    )

    const bbox = getMaskBoundingBox(mask)
    expect(bbox).not.toBeNull()
    expect(bbox.top).toBe(30)
    expect(bbox.left).toBe(20)
    expect(bbox.width).toBe(161)
    expect(bbox.height).toBe(251)
  })

  it('getMaskCentroid returns center of region', () => {
    const mask = makeMask(200, 300, (x, y) =>
      x >= 20 && x <= 180 && y >= 30 && y <= 280
    )

    const centroid = getMaskCentroid(mask)
    expect(centroid).not.toBeNull()
    // Center of x: (20+180)/2 = 100, center of y: (30+280)/2 = 155
    expect(centroid.cx).toBeCloseTo(100, 0)
    expect(centroid.cy).toBeCloseTo(155, 0)
  })

  it('returns null for all-background mask', () => {
    const mask = makeMask(10, 10, () => false)
    expect(getMaskBoundingBox(mask)).toBeNull()
    expect(getMaskCentroid(mask)).toBeNull()
  })
})

// ─── TASK-042 & TASK-052: Humanoid Heuristic ────────────────────────────────

describe('TASK-042 & TASK-052: SkeletonEstimator — Humanoid Heuristic', () => {
  it('estimateSkeleton returns 14 joints for humanoid silhouette', () => {
    // Vertical oval-ish mask (humanoid silhouette)
    const mask = makeMask(100, 200, (x, y) => {
      // Simple humanoid: oval body
      const cx = 50, cy = 100
      const rx = 25, ry = 80
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      return dx * dx + dy * dy <= 1
    })

    const joints = estimateSkeleton(mask)
    expect(joints.length).toBe(14)
  })

  it('all 14 joint IDs are present', () => {
    const mask = makeMask(100, 200, (x, y) => {
      const cx = 50, cy = 100
      const dx = (x - cx) / 25
      const dy = (y - cy) / 80
      return dx * dx + dy * dy <= 1
    })

    const joints = estimateSkeleton(mask)
    const ids = new Set(joints.map(j => j.id))

    const expectedIds = [
      'head', 'neck', 'l_shoulder', 'r_shoulder',
      'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist',
      'l_hip', 'r_hip', 'l_knee', 'r_knee',
      'l_ankle', 'r_ankle',
    ]

    for (const id of expectedIds) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('all joint positions inside bbox', () => {
    const mask = makeMask(100, 200, (x, y) => {
      const cx = 50, cy = 100
      const dx = (x - cx) / 25
      const dy = (y - cy) / 80
      return dx * dx + dy * dy <= 1
    })

    const joints = estimateSkeleton(mask)

    for (const j of joints) {
      expect(j.x).toBeGreaterThanOrEqual(0)
      expect(j.x).toBeLessThan(mask.width)
      expect(j.y).toBeGreaterThanOrEqual(0)
      expect(j.y).toBeLessThan(mask.height)
    }
  })

  it('joint vertical order is correct: head.y < neck.y < l_shoulder.y', () => {
    const mask = makeMask(100, 200, (x, y) => {
      const cx = 50, cy = 100
      const dx = (x - cx) / 25
      const dy = (y - cy) / 80
      return dx * dx + dy * dy <= 1
    })

    const joints = estimateSkeleton(mask)
    const jointMap = new Map(joints.map(j => [j.id, j]))

    const head = jointMap.get('head')
    const neck = jointMap.get('neck')
    const lShoulder = jointMap.get('l_shoulder')

    expect(head.y).toBeLessThan(neck.y)
    expect(neck.y).toBeLessThanOrEqual(lShoulder.y)
  })

  it('l_shoulder.x < neck.x (left shoulder is to the left of neck)', () => {
    const mask = makeMask(100, 200, (x, y) => {
      const cx = 50, cy = 100
      const dx = (x - cx) / 25
      const dy = (y - cy) / 80
      return dx * dx + dy * dy <= 1
    })

    const joints = estimateSkeleton(mask)
    const jointMap = new Map(joints.map(j => [j.id, j]))

    const lShoulder = jointMap.get('l_shoulder')
    const neck = jointMap.get('neck')

    expect(lShoulder.x).toBeLessThan(neck.x)
  })

  it('returns empty array for all-background mask', () => {
    const mask = makeMask(10, 10, () => false)
    const joints = estimateSkeleton(mask)
    expect(joints.length).toBe(0)
  })
})
