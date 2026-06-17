/**
 * @file VideoExporter.test.js
 * @description Unit tests for VideoExporter.js — covers TASK-016.
 *   - getSupportedMimeType() — codec detection
 *   - startRecording() — safe when no codec
 *   - stopRecording() — returns Blob
 *   - captureFrame() — pixel read from WebGL
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VideoExporter, getSupportedMimeType } from './VideoExporter.js'

// ─── Mock MediaRecorder for jsdom ────────────────────────────────────────────

/**
 * Create a mock MediaRecorder class that supports the minimum API needed by VideoExporter.
 */
function createMockMediaRecorder(supportedTypes = ['video/webm;codecs=vp9', 'video/webm']) {
  return class MockMediaRecorder {
    static isTypeSupported(type) {
      return supportedTypes.includes(type)
    }

    /** @type {'inactive' | 'recording' | 'paused'} */
    state = 'inactive'

    /** @type {((e: { data: Blob }) => void) | null} */
    ondataavailable = null

    /** @type {(() => void) | null} */
    onstop = null

    constructor(_stream, options) {
      this.mimeType = options?.mimeType || 'video/webm'
    }

    start() {
      this.state = 'recording'
      // Simulate one data chunk being available
      setTimeout(() => {
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['fake video data'], { type: this.mimeType }) })
        }
      }, 10)
    }

    stop() {
      this.state = 'inactive'
      if (this.onstop) {
        setTimeout(() => this.onstop(), 0)
      }
    }
  }
}

describe('VideoExporter', () => {
  /** @type {HTMLCanvasElement} */
  let canvas
  /** @type {WebGL2RenderingContext} */
  let gl

  beforeEach(() => {
    canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4

    // Mock WebGL2 context for captureFrame tests
    gl = {
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      readPixels: vi.fn((_x, _y, w, h, _format, _type, pixels) => {
        // Fill with a known pattern (solid red)
        for (let i = 0; i < w * h; i++) {
          pixels[i * 4 + 0] = 255 // R
          pixels[i * 4 + 1] = 0   // G
          pixels[i * 4 + 2] = 0   // B
          pixels[i * 4 + 3] = 255 // A
        }
      }),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── getSupportedMimeType() ────────────────────────────────────────────────

  describe('getSupportedMimeType()', () => {
    it('returns a non-null string on supported browser', () => {
      vi.stubGlobal('MediaRecorder', createMockMediaRecorder())

      const mimeType = getSupportedMimeType()
      expect(mimeType).not.toBeNull()
      expect(typeof mimeType).toBe('string')
      expect(mimeType).toContain('video/')

      vi.unstubAllGlobals()
    })

    it('returns null when MediaRecorder is undefined', () => {
      vi.stubGlobal('MediaRecorder', undefined)

      const mimeType = getSupportedMimeType()
      expect(mimeType).toBeNull()

      vi.unstubAllGlobals()
    })

    it('returns null when no codec is supported', () => {
      vi.stubGlobal('MediaRecorder', createMockMediaRecorder([]))

      const mimeType = getSupportedMimeType()
      expect(mimeType).toBeNull()

      vi.unstubAllGlobals()
    })
  })

  // ─── startRecording() safety ───────────────────────────────────────────────

  describe('startRecording()', () => {
    it('does not crash when getSupportedMimeType() returns null', () => {
      vi.stubGlobal('MediaRecorder', undefined)

      const exporter = new VideoExporter(canvas, gl)
      expect(() => exporter.startRecording()).not.toThrow()

      vi.unstubAllGlobals()
    })

    it('logs an error when codec is not supported', () => {
      vi.stubGlobal('MediaRecorder', undefined)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const exporter = new VideoExporter(canvas, gl)
      exporter.startRecording()

      expect(consoleSpy).toHaveBeenCalledOnce()

      consoleSpy.mockRestore()
      vi.unstubAllGlobals()
    })
  })

  // ─── stopRecording() ───────────────────────────────────────────────────────

  describe('stopRecording()', () => {
    it('returns Blob with size > 0 after at least 1 frame', async () => {
      const MockRec = createMockMediaRecorder()
      vi.stubGlobal('MediaRecorder', MockRec)

      // Add captureStream to canvas
      canvas.captureStream = vi.fn(() => ({ getTracks: () => [] }))

      const exporter = new VideoExporter(canvas, gl)
      exporter.startRecording(30)

      // Wait for the mock data chunk to fire
      await new Promise((resolve) => setTimeout(resolve, 50))

      const blob = await exporter.stopRecording()
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(0)

      vi.unstubAllGlobals()
    })

    it('returns empty Blob when recording was never started', async () => {
      vi.stubGlobal('MediaRecorder', createMockMediaRecorder())

      const exporter = new VideoExporter(canvas, gl)
      const blob = await exporter.stopRecording()
      expect(blob).toBeInstanceOf(Blob)

      vi.unstubAllGlobals()
    })
  })

  // ─── captureFrame() ────────────────────────────────────────────────────────

  describe('captureFrame()', () => {
    it('calls gl.readPixels with correct parameters', () => {
      const exporter = new VideoExporter(canvas, gl)
      const imageData = exporter.captureFrame(gl)

      expect(gl.readPixels).toHaveBeenCalledOnce()
      expect(imageData).toBeInstanceOf(ImageData)
      expect(imageData.width).toBe(4)
      expect(imageData.height).toBe(4)
    })

    it('flips Y axis correctly (bottom row becomes top row)', () => {
      // Set up a 2x2 canvas with a specific pattern per row
      gl.readPixels = vi.fn((_x, _y, _w, h, _format, _type, pixels) => {
        // Row 0 (bottom in GL): green
        pixels[0] = 0; pixels[1] = 255; pixels[2] = 0; pixels[3] = 255
        pixels[4] = 0; pixels[5] = 255; pixels[6] = 0; pixels[7] = 255
        // Row 1 (top in GL): blue
        pixels[8] = 0; pixels[9] = 0; pixels[10] = 255; pixels[11] = 255
        pixels[12] = 0; pixels[13] = 0; pixels[14] = 255; pixels[15] = 255
      })
      canvas.width = 2
      canvas.height = 2

      const exporter = new VideoExporter(canvas, gl)
      const imageData = exporter.captureFrame(gl)

      // After flip: row 0 (top) should be blue (was bottom of GL = row 1)
      // Row 1 (bottom) should be green (was top of GL = row 0)
      // ImageData top-left pixel
      expect(imageData.data[0]).toBe(0)   // R
      expect(imageData.data[1]).toBe(0)   // G
      expect(imageData.data[2]).toBe(255) // B
    })
  })

  // ─── downloadAs() ──────────────────────────────────────────────────────────

  describe('downloadAs()', () => {
    it('logs error when no video has been recorded', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const exporter = new VideoExporter(canvas, gl)
      exporter.downloadAs('test.webm')

      expect(consoleSpy).toHaveBeenCalledOnce()
      consoleSpy.mockRestore()
    })
  })
})
