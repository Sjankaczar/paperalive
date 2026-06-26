/**
 * @file ThresholdEngine.test.js
 * @description Unit tests for ThresholdEngine.js — autoEraseBackground.
 */

import { describe, it, expect } from 'vitest'
import { autoEraseBackground } from './ThresholdEngine.js'

// ─── autoEraseBackground ─────────────────────────────────────────────────────

function makeSceneImage(width, height, bg, subject, rect) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inSubj = x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1
      const c = inSubj ? subject : bg
      const p = (y * width + x) * 4
      data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255
    }
  }
  return { width, height, data }
}

describe('autoEraseBackground (P1)', () => {
  const bg = [200, 200, 200]
  const subject = [20, 20, 20]
  const rect = { x0: 3, x1: 6, y0: 3, y1: 6 }

  it('keeps the subject as foreground and erases the border background', () => {
    const img = makeSceneImage(10, 10, bg, subject, rect)
    const mask = autoEraseBackground(img)

    expect(mask.width).toBe(10)
    expect(mask.height).toBe(10)
    // subject center is foreground
    expect(mask.data[5 * 10 + 5]).toBe(1)
    // border corners are background
    expect(mask.data[0]).toBe(0)
    expect(mask.data[9 * 10 + 9]).toBe(0)
  })

  it('returns a plausible foreground area (≈ subject size after closing)', () => {
    const img = makeSceneImage(10, 10, bg, subject, rect)
    const mask = autoEraseBackground(img)
    let fg = 0
    for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) fg++
    // subject is 4×4 = 16; closing keeps it in a reasonable band
    expect(fg).toBeGreaterThanOrEqual(12)
    expect(fg).toBeLessThanOrEqual(28)
  })

  it('does not erase an interior background-colored pixel (connectivity)', () => {
    const img = makeSceneImage(10, 10, bg, subject, rect)
    // Punch a bg-colored hole inside the subject at (5,5)
    const p = (5 * 10 + 5) * 4
    img.data[p] = bg[0]; img.data[p + 1] = bg[1]; img.data[p + 2] = bg[2]
    const mask = autoEraseBackground(img)
    // The enclosed hole is unreachable from the border → stays foreground
    expect(mask.data[5 * 10 + 5]).toBe(1)
  })
})
