/**
 * @file SkeletonMapper.test.js
 * @description Unit tests for SkeletonMapper.js — covers TASK-043, TASK-044, TASK-045, TASK-053.
 */

import { describe, it, expect } from 'vitest'
import { mapJointsToVertices } from './SkeletonMapper.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a Float32Array of vertices from an array of [x, y] pairs.
 */
function makeVertices(pairs) {
  const arr = new Float32Array(pairs.length * 2)
  for (let i = 0; i < pairs.length; i++) {
    arr[i * 2] = pairs[i][0]
    arr[i * 2 + 1] = pairs[i][1]
  }
  return arr
}

/**
 * Generate N vertices in a grid pattern.
 */
function makeGridVertices(cols, rows, spacing = 10) {
  const pairs = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pairs.push([c * spacing, r * spacing])
    }
  }
  return makeVertices(pairs)
}

/**
 * Generate 14 humanoid joint positions within a bbox.
 */
function makeHumanoidJoints(cx, cy, w, h) {
  return [
    { id: 'head', x: cx, y: cy - h * 0.45 },
    { id: 'neck', x: cx, y: cy - h * 0.35 },
    { id: 'l_shoulder', x: cx - w * 0.15, y: cy - h * 0.3 },
    { id: 'r_shoulder', x: cx + w * 0.15, y: cy - h * 0.3 },
    { id: 'l_elbow', x: cx - w * 0.22, y: cy - h * 0.1 },
    { id: 'r_elbow', x: cx + w * 0.22, y: cy - h * 0.1 },
    { id: 'l_wrist', x: cx - w * 0.18, y: cy + h * 0.05 },
    { id: 'r_wrist', x: cx + w * 0.18, y: cy + h * 0.05 },
    { id: 'l_hip', x: cx - w * 0.10, y: cy + h * 0.08 },
    { id: 'r_hip', x: cx + w * 0.10, y: cy + h * 0.08 },
    { id: 'l_knee', x: cx - w * 0.08, y: cy + h * 0.28 },
    { id: 'r_knee', x: cx + w * 0.08, y: cy + h * 0.28 },
    { id: 'l_ankle', x: cx - w * 0.08, y: cy + h * 0.45 },
    { id: 'r_ankle', x: cx + w * 0.08, y: cy + h * 0.45 },
  ]
}

// ─── TASK-043: Nearest-Neighbor Mapping ──────────────────────────────────────

describe('TASK-043: SkeletonMapper — Nearest-Neighbor Mapping', () => {
  it('output array length === 14 for 14 joints', () => {
    const vertices = makeGridVertices(10, 10)
    const joints = makeHumanoidJoints(45, 45, 80, 80)

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping.length).toBe(14)
  })

  it('each entry has jointId, vertexIndex, distance', () => {
    const vertices = makeGridVertices(10, 10)
    const joints = makeHumanoidJoints(45, 45, 80, 80)

    const mapping = mapJointsToVertices(vertices, joints)

    for (const entry of mapping) {
      expect(typeof entry.jointId).toBe('string')
      expect(typeof entry.vertexIndex).toBe('number')
      expect(typeof entry.distance).toBe('number')
    }
  })

  it('distance is Euclidean distance between joint and vertex', () => {
    // Simple case: 1 joint, known vertex positions
    const vertices = makeVertices([[0, 0], [10, 0], [0, 10]])
    const joints = [{ id: 'test', x: 3, y: 4 }]

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping.length).toBe(1)

    // Nearest vertex to (3,4): (0,0) at distance 5, (10,0) at ~11.66, (0,10) at ~7.81
    expect(mapping[0].vertexIndex).toBe(0)
    expect(mapping[0].distance).toBeCloseTo(5, 5)
  })

  it('no DOM access', () => {
    const vertices = makeGridVertices(5, 5)
    const joints = [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }]
    expect(() => mapJointsToVertices(vertices, joints)).not.toThrow()
  })
})

// ─── TASK-044: Uniqueness Enforcement ────────────────────────────────────────

describe('TASK-044: SkeletonMapper — Uniqueness Enforcement', () => {
  it('all 14 vertexIndex values are unique', () => {
    const vertices = makeGridVertices(10, 10)
    const joints = makeHumanoidJoints(45, 45, 80, 80)

    const mapping = mapJointsToVertices(vertices, joints)
    const indices = new Set(mapping.map(m => m.vertexIndex))

    expect(indices.size).toBe(14)
  })

  it('no duplicate vertexIndex in output', () => {
    const vertices = makeGridVertices(10, 10)
    const joints = makeHumanoidJoints(45, 45, 80, 80)

    const mapping = mapJointsToVertices(vertices, joints)
    const seen = new Set()

    for (const entry of mapping) {
      expect(seen.has(entry.vertexIndex)).toBe(false)
      seen.add(entry.vertexIndex)
    }
  })

  it('15 joints on 15-vertex mesh: each joint gets unique vertex', () => {
    const pairs = []
    for (let i = 0; i < 15; i++) {
      pairs.push([i * 10, i * 5])
    }
    const vertices = makeVertices(pairs)

    const joints = []
    for (let i = 0; i < 15; i++) {
      joints.push({ id: `j${i}`, x: i * 10 + 1, y: i * 5 + 1 })
    }

    const mapping = mapJointsToVertices(vertices, joints)
    const indices = new Set(mapping.map(m => m.vertexIndex))

    expect(indices.size).toBe(15)
  })

  it('joints clustered near same vertex: BFS finds nearest unused', () => {
    // 10 vertices all near (0,0), 14 joints all near (0,0)
    const pairs = []
    for (let i = 0; i < 10; i++) {
      pairs.push([i, 0])
    }
    // Add more spread-out vertices
    for (let i = 10; i < 20; i++) {
      pairs.push([i * 10, 0])
    }
    const vertices = makeVertices(pairs)

    const joints = []
    for (let i = 0; i < 14; i++) {
      joints.push({ id: `j${i}`, x: 0, y: 0 })
    }

    const mapping = mapJointsToVertices(vertices, joints)
    const indices = new Set(mapping.map(m => m.vertexIndex))

    // All 14 should be unique
    expect(indices.size).toBe(14)
  })
})

// ─── TASK-045: Joint Distance Warning ────────────────────────────────────────

describe('TASK-045: SkeletonMapper — Joint Distance Warning', () => {
  it('isTooFar is true when distance > 20', () => {
    const vertices = makeVertices([[25, 0]])
    const joints = [{ id: 'test', x: 0, y: 0 }]

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping[0].distance).toBe(25)
    expect(mapping[0].isTooFar).toBe(true)
  })

  it('isTooFar is false when distance <= 20', () => {
    const vertices = makeVertices([[19.9, 0]])
    const joints = [{ id: 'test', x: 0, y: 0 }]

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping[0].distance).toBeCloseTo(19.9, 5)
    expect(mapping[0].isTooFar).toBe(false)
  })

  it('isTooFar is false when distance === 20', () => {
    const vertices = makeVertices([[20, 0]])
    const joints = [{ id: 'test', x: 0, y: 0 }]

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping[0].distance).toBe(20)
    expect(mapping[0].isTooFar).toBe(false)
  })

  it('distance field is correct Euclidean distance', () => {
    const vertices = makeVertices([[3, 4]])
    const joints = [{ id: 'test', x: 0, y: 0 }]

    const mapping = mapJointsToVertices(vertices, joints)
    expect(mapping[0].distance).toBeCloseTo(5, 10)
  })
})
