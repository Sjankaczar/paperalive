/**
 * @file ThresholdEngine.test.js
 * @description Unit tests for ThresholdEngine.js — covers TASK-020, TASK-021, TASK-022.
 */

import { describe, it, expect } from 'vitest'
import { applyThreshold, applyThresholdToCanvas } from './ThresholdEngine.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an ImageData-like object from RGBA pixel data.
 * @param {number} width
 * @param {number} height
 * @param {number[]} rgba - Flat RGBA array (4 values per pixel)
 * @returns {ImageData}
 */
function makeImageData(width, height, rgba) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(rgba),
  }
}

// ─── TASK-020: Alpha Mode ────────────────────────────────────────────────────

describe('TASK-020: applyThreshold — alpha mode', () => {
  it('alpha >= threshold → foreground (1), alpha < threshold → background (0)', () => {
    // 4×1 image with alpha values [10, 30, 50, 200], threshold = 30
    const imageData = makeImageData(4, 1, [
      0, 0, 0, 10,    // pixel 0: alpha=10 < 30 → 0
      0, 0, 0, 30,    // pixel 1: alpha=30 >= 30 → 1
      0, 0, 0, 50,    // pixel 2: alpha=50 >= 30 → 1
      0, 0, 0, 200,   // pixel 3: alpha=200 >= 30 → 1
    ])

    const mask = applyThreshold(imageData, 30, 'alpha')

    expect(mask.data).toEqual(new Uint8Array([0, 1, 1, 1]))
    expect(mask.width).toBe(4)
    expect(mask.height).toBe(1)
  })

  it('output data.length === width × height', () => {
    const imageData = makeImageData(3, 2, [
      0, 0, 0, 255, 0, 0, 0, 100, 0, 0, 0, 50,
      0, 0, 0, 0,   0, 0, 0, 200, 0, 0, 0, 128,
    ])

    const mask = applyThreshold(imageData, 128, 'alpha')
    expect(mask.data.length).toBe(3 * 2)
  })

  it('output only contains values 0 or 1', () => {
    const imageData = makeImageData(4, 1, [
      0, 0, 0, 0, 0, 0, 0, 127, 0, 0, 0, 128, 0, 0, 0, 255,
    ])

    const mask = applyThreshold(imageData, 128, 'alpha')
    for (const val of mask.data) {
      expect(val === 0 || val === 1).toBe(true)
    }
  })

  it('threshold = 0 → all pixels with any alpha become foreground', () => {
    const imageData = makeImageData(2, 1, [
      0, 0, 0, 0, 0, 0, 0, 1,
    ])

    const mask = applyThreshold(imageData, 0, 'alpha')
    // alpha=0 >= 0 → 1, alpha=1 >= 0 → 1
    expect(mask.data).toEqual(new Uint8Array([1, 1]))
  })

  it('threshold = 255 → only fully opaque pixels are foreground', () => {
    const imageData = makeImageData(2, 1, [
      0, 0, 0, 254, 0, 0, 0, 255,
    ])

    const mask = applyThreshold(imageData, 255, 'alpha')
    expect(mask.data).toEqual(new Uint8Array([0, 1]))
  })
})

// ─── TASK-021: Luminance Mode ────────────────────────────────────────────────

describe('TASK-021: applyThreshold — luminance mode', () => {
  it('red pixel (255,0,0): L ≈ 76.25, threshold=128 → foreground (1)', () => {
    const imageData = makeImageData(1, 1, [255, 0, 0, 255])

    const mask = applyThreshold(imageData, 128, 'luminance')
    // L = 0.299×255 + 0.587×0 + 0.114×0 = 76.245 < 128 → 1
    expect(mask.data[0]).toBe(1)
  })

  it('white pixel (255,255,255): L = 255, threshold=128 → background (0)', () => {
    const imageData = makeImageData(1, 1, [255, 255, 255, 255])

    const mask = applyThreshold(imageData, 128, 'luminance')
    // L = 0.299×255 + 0.587×255 + 0.114×255 = 255 > 128 → 0
    expect(mask.data[0]).toBe(0)
  })

  it('black pixel (0,0,0): L = 0, threshold=1 → foreground (1)', () => {
    const imageData = makeImageData(1, 1, [0, 0, 0, 255])

    const mask = applyThreshold(imageData, 1, 'luminance')
    // L = 0 < 1 → 1
    expect(mask.data[0]).toBe(1)
  })

  it('green pixel (0,255,0): L ≈ 150, threshold=128 → background (0)', () => {
    const imageData = makeImageData(1, 1, [0, 255, 0, 255])

    const mask = applyThreshold(imageData, 128, 'luminance')
    // L = 0.587×255 ≈ 149.7 > 128 → 0
    expect(mask.data[0]).toBe(0)
  })

  it('blue pixel (0,0,255): L ≈ 29, threshold=128 → foreground (1)', () => {
    const imageData = makeImageData(1, 1, [0, 0, 255, 255])

    const mask = applyThreshold(imageData, 128, 'luminance')
    // L = 0.114×255 ≈ 29.07 < 128 → 1
    expect(mask.data[0]).toBe(1)
  })

  it('multi-pixel image: mixed luminance values', () => {
    // 2×2: red, white, black, dark-gray(100)
    const imageData = makeImageData(2, 2, [
      255, 0, 0, 255,     // red: L ≈ 76 < 128 → 1
      255, 255, 255, 255, // white: L = 255 > 128 → 0
      0, 0, 0, 255,       // black: L = 0 < 128 → 1
      100, 100, 100, 255, // dark gray: L = 100 < 128 → 1
    ])

    const mask = applyThreshold(imageData, 128, 'luminance')
    expect(mask.data).toEqual(new Uint8Array([1, 0, 1, 1]))
  })
})

// ─── TASK-022: Canvas Preview ────────────────────────────────────────────────

describe('TASK-022: applyThresholdToCanvas', () => {
  it('foreground pixels get rgba(0, 200, 100, ~102) and background pixels are transparent', () => {
    // 2×1 image: pixel 0 has alpha=200 (fg), pixel 1 has alpha=10 (bg)
    const imageData = makeImageData(2, 1, [
      255, 0, 0, 200,
      0, 255, 0, 10,
    ])

    // Mock canvas context
    let putData = null
    const mockCtx = {
      createImageData(w, h) {
        return new ImageData(w, h)
      },
      putImageData(imgData) {
        putData = imgData
      },
    }

    applyThresholdToCanvas(imageData, 30, 'alpha', mockCtx)

    expect(putData).not.toBeNull()
    expect(putData.width).toBe(2)
    expect(putData.height).toBe(1)

    // Pixel 0 (foreground): rgba(0, 200, 100, 102)
    expect(putData.data[0]).toBe(0)    // R
    expect(putData.data[1]).toBe(200)  // G
    expect(putData.data[2]).toBe(100)  // B
    expect(putData.data[3]).toBe(102)  // A ≈ 0.4 × 255

    // Pixel 1 (background): transparent
    expect(putData.data[4]).toBe(0)    // R
    expect(putData.data[5]).toBe(0)    // G
    expect(putData.data[6]).toBe(0)    // B
    expect(putData.data[7]).toBe(0)    // A
  })

  it('background pixels have alpha = 0', () => {
    const imageData = makeImageData(1, 1, [0, 0, 0, 0])

    let putData = null
    const mockCtx = {
      createImageData(w, h) { return new ImageData(w, h) },
      putImageData(imgData) { putData = imgData },
    }

    applyThresholdToCanvas(imageData, 128, 'alpha', mockCtx)

    // All pixels background → alpha = 0
    expect(putData.data[3]).toBe(0)
  })
})

// ─── Error handling ──────────────────────────────────────────────────────────

describe('applyThreshold — error handling', () => {
  it('throws on unknown mode', () => {
    const imageData = makeImageData(1, 1, [0, 0, 0, 255])
    expect(() => applyThreshold(imageData, 128, 'invalid')).toThrow(/Unknown mode/)
  })
})
