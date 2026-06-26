// @worker-safe
/**
 * @file ConnectedComponents.js
 * @description Connected-component labeling (P2) for a BinaryMask.
 *
 * Picks the largest 8-connected foreground component as "the character",
 * drops every smaller component (noise), and reports its bounding box.
 *
 * Uses classic two-pass union-find labeling.
 *
 * Worker-safe: no DOM access.
 *
 * @see docs/PEMBAGIAN_TUGAS.md — P2
 */

/**
 * @typedef {Object} ComponentResult
 * @property {import('../types/characterData.js').BinaryMask} mask - largest component only
 * @property {{ top: number, left: number, width: number, height: number }} bbox
 * @property {number} pixelCount
 */

/**
 * Keep all 8-connected foreground components whose pixel count is at least
 * `minFraction` of the total image area. Drops only tiny noise blobs.
 *
 * Use this instead of findLargestComponent when the character may have
 * disconnected body parts (hands, feet, accessories).
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @param {number} [minFraction=0.005] - min pixels as fraction of (width × height)
 * @returns {import('../types/characterData.js').BinaryMask}
 */
export function keepSignificantComponents(mask, minFraction = 0.005) {
  const { width, height } = mask
  const src = mask.data
  const size = width * height
  const minPixels = Math.max(1, Math.floor(size * minFraction))

  const labels = new Int32Array(size)
  const parent = [0]
  let nextLabel = 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (src[idx] === 0) continue
      let best = 0
      const consider = (nx, ny) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return
        const l = labels[ny * width + nx]
        if (l !== 0) {
          if (best === 0) best = l
          else union(parent, best, l)
        }
      }
      consider(x - 1, y - 1); consider(x, y - 1)
      consider(x + 1, y - 1); consider(x - 1, y)
      if (best === 0) {
        labels[idx] = nextLabel
        parent[nextLabel] = nextLabel
        nextLabel++
      } else {
        labels[idx] = best
      }
    }
  }

  const counts = new Map()
  for (let i = 0; i < size; i++) {
    if (labels[i] === 0) continue
    const root = find(parent, labels[i])
    labels[i] = root
    counts.set(root, (counts.get(root) || 0) + 1)
  }

  const keep = new Set()
  for (const [label, count] of counts) {
    if (count >= minPixels) keep.add(label)
  }

  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    if (keep.has(labels[i])) out[i] = 1
  }

  return { data: out, width, height }
}

/** Union-find: find root with path compression. */
function find(parent, x) {
  let root = x
  while (parent[root] !== root) root = parent[root]
  while (parent[x] !== root) {
    const next = parent[x]
    parent[x] = root
    x = next
  }
  return root
}

/** Union-find: union two labels. */
function union(parent, a, b) {
  const ra = find(parent, a)
  const rb = find(parent, b)
  if (ra !== rb) parent[rb] = ra
}

/**
 * Find the largest 8-connected foreground component in a mask.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {ComponentResult | null} null if the mask has no foreground pixels
 */
export function findLargestComponent(mask) {
  const { width, height } = mask
  const src = mask.data
  const size = width * height

  const labels = new Int32Array(size) // 0 = unlabeled/background
  // parent[0] unused; labels start at 1
  const parent = [0]
  let nextLabel = 1

  // ── Pass 1: provisional labels + record equivalences ──
  // Neighbors already visited (8-conn): NW, N, NE, W
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (src[idx] === 0) continue

      let best = 0
      const consider = (nx, ny) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return
        const l = labels[ny * width + nx]
        if (l !== 0) {
          if (best === 0) best = l
          else union(parent, best, l)
        }
      }
      consider(x - 1, y - 1)
      consider(x, y - 1)
      consider(x + 1, y - 1)
      consider(x - 1, y)

      if (best === 0) {
        labels[idx] = nextLabel
        parent[nextLabel] = nextLabel
        nextLabel++
      } else {
        labels[idx] = best
      }
    }
  }

  // ── Pass 2: resolve to root labels, count pixels per component ──
  const counts = new Map() // rootLabel → pixelCount
  for (let i = 0; i < size; i++) {
    if (labels[i] === 0) continue
    const root = find(parent, labels[i])
    labels[i] = root
    counts.set(root, (counts.get(root) || 0) + 1)
  }

  if (counts.size === 0) return null

  // Largest component
  let largest = 0
  let largestCount = -1
  for (const [label, count] of counts) {
    if (count > largestCount) {
      largestCount = count
      largest = label
    }
  }

  // Build output mask (largest component only) + bbox
  const out = new Uint8Array(size)
  let minRow = height, maxRow = -1, minCol = width, maxCol = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (labels[idx] === largest) {
        out[idx] = 1
        if (y < minRow) minRow = y
        if (y > maxRow) maxRow = y
        if (x < minCol) minCol = x
        if (x > maxCol) maxCol = x
      }
    }
  }

  return {
    mask: { data: out, width, height },
    bbox: {
      top: minRow,
      left: minCol,
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1,
    },
    pixelCount: largestCount,
  }
}
