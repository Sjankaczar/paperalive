/**
 * @file ImageLoader.test.js
 * @description Unit tests for ImageLoader.js — covers TASK-017, TASK-018, TASK-019, TASK-025.
 *
 * Since jsdom doesn't have createImageBitmap or OffscreenCanvas, we mock them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadImage } from './ImageLoader.js'

// ─── Mock Helpers ────────────────────────────────────────────────────────────

/**
 * Create a mock ImageBitmap with specified dimensions.
 */
function mockBitmap(width, height) {
  return {
    width,
    height,
    close: vi.fn(),
  }
}

/**
 * Create a mock ImageData with specified dimensions and optional pixel data.
 */
function mockImageData(width, height, alphaValue = 255) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 3; i < data.length; i += 4) {
    data[i] = alphaValue
  }
  return { width, height, data }
}

/**
 * Create a mock OffscreenCanvas that returns controlled ImageData.
 */
function mockOffscreenCanvas(imageData) {
  return class {
    constructor() {
      this._ctx = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => imageData),
      }
    }
    getContext() { return this._ctx }
  }
}

// ─── Setup & Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: createImageBitmap returns a bitmap matching the blob's "natural" size
  // We'll override per test as needed
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── TASK-017: File Decode ───────────────────────────────────────────────────

describe('TASK-017: loadImage — File Decode', () => {
  it('PNG with alpha → LoadedImage with hasAlpha: true', async () => {
    const pngBlob = new Blob(['fake png'], { type: 'image/png' })

    // Mock createImageBitmap: returns 200×300 bitmap
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(mockBitmap(200, 300))))

    // Mock OffscreenCanvas: returns ImageData with alpha < 255
    const imgData = mockImageData(200, 300, 128)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(pngBlob)

    expect(result.hasAlpha).toBe(true)
    expect(result.originalSize.width).toBe(200)
    expect(result.originalSize.height).toBe(300)
    expect(result.width).toBe(200)
    expect(result.height).toBe(300)
    expect(result.imageData).toBeDefined()
    expect(result.imageData.width).toBe(200)
  })

  it('JPEG without alpha → hasAlpha: false', async () => {
    const jpgBlob = new Blob(['fake jpg'], { type: 'image/jpeg' })

    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(mockBitmap(200, 300))))

    // All pixels fully opaque
    const imgData = mockImageData(200, 300, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(jpgBlob)
    expect(result.hasAlpha).toBe(false)
  })

  it('invalid file type → rejected with clear message', async () => {
    const bmpBlob = new Blob(['fake bmp'], { type: 'image/bmp' })

    await expect(loadImage(bmpBlob)).rejects.toThrow(/Unsupported file type/)
  })

  it('null source → rejected with clear message', async () => {
    await expect(loadImage(null)).rejects.toThrow(/No valid image source/)
  })

  it('undefined source → rejected with clear message', async () => {
    await expect(loadImage(undefined)).rejects.toThrow(/No valid image source/)
  })

  it('non-Blob, non-string source → rejected', async () => {
    await expect(loadImage(12345)).rejects.toThrow(/Unsupported source type/)
  })
})

// ─── TASK-018: Resize to Max 1024px ─────────────────────────────────────────

describe('TASK-018: loadImage — Resize to Max 1024px', () => {
  it('2000×1500 → resized to 1024×768', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })

    // First call: returns original 2000×1500 bitmap
    // Second call: returns resized 1024×768 bitmap
    vi.stubGlobal('createImageBitmap', vi.fn((_blob, options) => {
      if (options) {
        // Resize call
        return Promise.resolve(mockBitmap(options.resizeWidth, options.resizeHeight))
      }
      // Original decode
      return Promise.resolve(mockBitmap(2000, 1500))
    }))

    const imgData = mockImageData(1024, 768, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(blob)

    expect(result.width).toBe(1024)
    expect(result.height).toBe(768)
    expect(result.originalSize.width).toBe(2000)
    expect(result.originalSize.height).toBe(1500)
  })

  it('500×300 → not resized (already < 1024)', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })

    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(mockBitmap(500, 300))))

    const imgData = mockImageData(500, 300, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(blob)

    expect(result.width).toBe(500)
    expect(result.height).toBe(300)
    expect(result.originalSize.width).toBe(500)
    expect(result.originalSize.height).toBe(300)
  })

  it('800×1200 → resized to 683×1024', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })

    vi.stubGlobal('createImageBitmap', vi.fn((_blob, options) => {
      if (options) {
        return Promise.resolve(mockBitmap(options.resizeWidth, options.resizeHeight))
      }
      return Promise.resolve(mockBitmap(800, 1200))
    }))

    const imgData = mockImageData(683, 1024, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(blob)

    expect(result.width).toBe(683)
    expect(result.height).toBe(1024)
    expect(result.originalSize.width).toBe(800)
    expect(result.originalSize.height).toBe(1200)
  })

  it('originalSize always stores pre-resize dimensions', async () => {
    const blob = new Blob(['fake'], { type: 'image/webp' })

    vi.stubGlobal('createImageBitmap', vi.fn((_blob, options) => {
      if (options) {
        return Promise.resolve(mockBitmap(options.resizeWidth, options.resizeHeight))
      }
      return Promise.resolve(mockBitmap(3000, 2000))
    }))

    const imgData = mockImageData(1024, 683, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(blob)

    expect(result.originalSize).toEqual({ width: 3000, height: 2000 })
    expect(result.width).toBe(1024)
    expect(result.height).toBe(683)
  })
})

// ─── TASK-019: GIF Support ───────────────────────────────────────────────────

describe('TASK-019: loadImage — GIF Support', () => {
  it('animated GIF → decoded as single frame (frame 0)', async () => {
    const gifBlob = new Blob(['fake gif'], { type: 'image/gif' })

    // createImageBitmap naturally decodes only frame 0
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(mockBitmap(100, 100))))

    const imgData = mockImageData(100, 100, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(gifBlob)

    expect(result.width).toBe(100)
    expect(result.height).toBe(100)
    expect(result.imageData).toBeDefined()
    // No error, single frame decoded
  })
})

// ─── TASK-025: Clipboard Paste ───────────────────────────────────────────────

describe('TASK-025: loadImage — Clipboard Paste', () => {
  it('File from clipboard (PNG type) → LoadedImage produced normally', async () => {
    // Simulate a File from clipboard (File extends Blob)
    const clipboardFile = new File(['fake png data'], 'pasted.png', { type: 'image/png' })

    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(mockBitmap(300, 200))))

    const imgData = mockImageData(300, 200, 255)
    vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas(imgData))

    const result = await loadImage(clipboardFile)

    expect(result.width).toBe(300)
    expect(result.height).toBe(200)
    expect(result.hasAlpha).toBe(false)
  })

  it('loadImage(null) → rejected with clear message (clipboard has text, not file)', async () => {
    await expect(loadImage(null)).rejects.toThrow(/No valid image source/)
  })
})
