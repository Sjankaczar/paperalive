// @worker-safe
/**
 * @file ConnectedComponents.js
 * @description Connected-component labeling on BinaryMask using union-find 2-pass.
 *
 * - Pass 1: Scan top-left → bottom-right, assign provisional labels, union neighbors.
 * - Pass 2: Resolve labels to roots, count pixels per component.
 * - Select largest component, build clean mask, compute bbox.
 *
 * Worker-safe: no DOM access.
 */

import { getMaskBoundingBox } from '../utils/bbox.js'

// ─── Union-Find ──────────────────────────────────────────────────────────────

class UnionFind {
  constructor(n) {
    this.parent = new Int32Array(n)
    this.rank = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      this.parent[i] = i
    }
  }

  find(x) {
    let root = x
    while (this.parent[root] !== root) {
      root = this.parent[root]
    }
    // Path compression
    while (this.parent[x] !== root) {
      const next = this.parent[x]
      this.parent[x] = root
      x = next
    }
    return root
  }

  union(a, b) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    // Union by rank
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra
    } else {
      this.parent[rb] = ra
      this.rank[ra]++
    }
  }
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Find the largest connected component (4-connectivity) in a binary mask
 * using union-find 2-pass labeling.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{
 *   mask: import('../types/characterData.js').BinaryMask,
 *   bbox: { top: number, left: number, width: number, height: number } | null,
 *   pixelCount: number
 * }}
 */
export function findLargestComponent(mask) {
  const { data, width, height } = mask
  const total = width * height

  // Labels: 0 = background, 1..N = provisional labels
  const labels = new Int32Array(total)
  const uf = new UnionFind(total + 1) // worst case: every pixel is a new label
  let nextLabel = 1

  // ── Pass 1: Labeling ───────────────────────────────────────────────────────
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x

      // Skip background
      if (data[idx] === 0) continue

      // Check top neighbor (already scanned)
      const top = y > 0 ? labels[idx - width] : 0
      // Check left neighbor (already scanned)
      const left = x > 0 ? labels[idx - 1] : 0

      if (top === 0 && left === 0) {
        // No foreground neighbors → new label
        labels[idx] = nextLabel
        nextLabel++
      } else if (top !== 0 && left === 0) {
        // Only top neighbor
        labels[idx] = top
      } else if (top === 0 && left !== 0) {
        // Only left neighbor
        labels[idx] = left
      } else {
        // Both neighbors are foreground → take min, union them
        const minLabel = Math.min(top, left)
        labels[idx] = minLabel
        uf.union(top, left)
      }
    }
  }

  // No foreground at all
  if (nextLabel === 1) {
    return {
      mask: { data: new Uint8Array(total), width, height },
      bbox: null,
      pixelCount: 0,
    }
  }

  // ── Pass 2: Relabel to roots + count ───────────────────────────────────────
  const counts = new Map() // root → pixelCount
  for (let i = 0; i < total; i++) {
    if (labels[i] === 0) continue
    const root = uf.find(labels[i])
    labels[i] = root
    counts.set(root, (counts.get(root) || 0) + 1)
  }

  // ── Find largest component ─────────────────────────────────────────────────
  let largestRoot = -1
  let largestCount = 0
  for (const [root, count] of counts) {
    if (count > largestCount) {
      largestCount = count
      largestRoot = root
    }
  }

  // ── Build output mask (only largest component) ─────────────────────────────
  const resultData = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    if (labels[i] === largestRoot) {
      resultData[i] = 1
    }
  }

  const resultMask = { data: resultData, width, height }
  const bbox = getMaskBoundingBox(resultMask)

  return {
    mask: resultMask,
    bbox,
    pixelCount: largestCount,
  }
}
