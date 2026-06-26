/**
 * @file ConnectedComponents.test.js
 * @description Unit tests for ConnectedComponents.js (P2).
 */

import { describe, it, expect } from 'vitest'
import { findLargestComponent } from './ConnectedComponents.js'

function makeMask(width, height, fillFn) {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = fillFn(x, y) ? 1 : 0
    }
  }
  return { data, width, height }
}

function countForeground(mask) {
  let c = 0
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) c++
  return c
}

describe('findLargestComponent', () => {
  it('returns null for an all-background mask', () => {
    const mask = makeMask(10, 10, () => false)
    expect(findLargestComponent(mask)).toBeNull()
  })

  it('keeps the largest blob and removes noise', () => {
    // Big block x=2..7,y=2..7 (36px). Small noise blob x=9,y=9 (1px).
    const mask = makeMask(12, 12, (x, y) => {
      const big = x >= 2 && x <= 7 && y >= 2 && y <= 7
      const noise = x === 9 && y === 9
      return big || noise
    })

    const res = findLargestComponent(mask)
    expect(res).not.toBeNull()
    expect(res.pixelCount).toBe(36)
    // noise pixel must be gone
    expect(res.mask.data[9 * 12 + 9]).toBe(0)
    // output mask contains only the big blob
    expect(countForeground(res.mask)).toBe(36)
  })

  it('computes a correct bounding box for the largest component', () => {
    const mask = makeMask(20, 20, (x, y) => x >= 5 && x <= 14 && y >= 3 && y <= 12)
    const res = findLargestComponent(mask)
    expect(res.bbox).toEqual({ top: 3, left: 5, width: 10, height: 10 })
  })

  it('merges diagonally-touching pixels (8-connectivity)', () => {
    // Two 1px cells touching only diagonally → one component of 2.
    const mask = makeMask(5, 5, (x, y) => (x === 1 && y === 1) || (x === 2 && y === 2))
    const res = findLargestComponent(mask)
    expect(res.pixelCount).toBe(2)
  })

  it('output mask dimensions match input', () => {
    const mask = makeMask(8, 6, (x, y) => x >= 1 && x <= 4 && y >= 1 && y <= 4)
    const res = findLargestComponent(mask)
    expect(res.mask.width).toBe(8)
    expect(res.mask.height).toBe(6)
    expect(res.mask.data.length).toBe(48)
  })
})
