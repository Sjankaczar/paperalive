/**
 * @file VideoExporter.js
 * @description Video recording via MediaRecorder + manual gl.readPixels() frame capture.
 *
 * Codec detection order (first supported wins):
 *   1. video/webm;codecs=vp9
 *   2. video/webm;codecs=vp8
 *   3. video/webm
 *   4. video/mp4
 *
 * @see architecture/module_design.md — VideoExporter.js
 * @see architecture/rendering_pipeline.md — Recording Strategy
 */

const SUPPORTED_CODECS = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

/**
 * Detect the best supported video codec for recording.
 * Returns null if no codec is supported.
 *
 * @returns {string | null}
 */
export function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return null
  }

  for (const mimeType of SUPPORTED_CODECS) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return null
}

/**
 * Video exporter for WebGL canvas recording.
 *
 * Usage:
 *   const mimeType = VideoExporter.getSupportedMimeType()
 *   if (!mimeType) { showError("Browser tidak mendukung ekspor video"); return }
 *
 *   const exporter = new VideoExporter(canvas, gl)
 *   exporter.startRecording(30)
 *   // ... render frames, call exporter.captureFrame(gl) after each render ...
 *   const blob = await exporter.stopRecording()
 *   exporter.downloadAs('animation.webm')
 */
export class VideoExporter {
  /** @type {HTMLCanvasElement} */
  #canvas

  /** @type {WebGL2RenderingContext} */
  #gl

  /** @type {MediaRecorder | null} */
  #recorder = null

  /** @type {Blob[]} */
  #chunks = []

  /** @type {Blob | null} */
  #lastBlob = null

  /** @type {string | null} */
  #mimeType = null

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {WebGL2RenderingContext} gl
   */
  constructor(canvas, gl) {
    this.#canvas = canvas
    this.#gl = gl
  }

  /**
   * Start recording at the specified frame rate.
   * If no codec is supported, logs an error and does not start.
   *
   * @param {number} [fps=30] - Target frame rate
   */
  startRecording(fps = 30) {
    this.#mimeType = getSupportedMimeType()

    if (!this.#mimeType) {
      console.error('PaperAlive: Browser tidak mendukung ekspor video. Coba Chrome atau Firefox.')
      return
    }

    try {
      const stream = this.#canvas.captureStream(fps)
      this.#recorder = new MediaRecorder(stream, { mimeType: this.#mimeType })
      this.#chunks = []

      this.#recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.#chunks.push(e.data)
        }
      }

      this.#recorder.start()
    } catch (err) {
      console.error('PaperAlive: Gagal memulai recording:', err)
    }
  }

  /**
   * Capture a single frame from the WebGL canvas.
   * Must be called immediately after rendering, before the next frame clears the buffer.
   *
   * @param {WebGL2RenderingContext} gl
   * @returns {ImageData}
   */
  captureFrame(gl) {
    const { width, height } = this.#canvas
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Flip Y (WebGL origin is bottom-left, canvas origin is top-left)
    const rowBytes = width * 4
    for (let i = 0; i < Math.floor(height / 2); i++) {
      const topOffset = i * rowBytes
      const bottomOffset = (height - 1 - i) * rowBytes
      const temp = pixels.slice(topOffset, topOffset + rowBytes)
      pixels.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes)
      pixels.set(temp, bottomOffset)
    }

    return new ImageData(new Uint8ClampedArray(pixels.buffer), width, height)
  }

  /**
   * Stop recording and return the recorded video as a Blob.
   *
   * @returns {Promise<Blob>}
   */
  async stopRecording() {
    if (!this.#recorder || this.#recorder.state === 'inactive') {
      return new Blob([], { type: 'video/webm' })
    }

    return new Promise((resolve) => {
      this.#recorder.onstop = () => {
        this.#lastBlob = new Blob(this.#chunks, { type: this.#mimeType })
        this.#chunks = []
        resolve(this.#lastBlob)
      }

      this.#recorder.stop()
    })
  }

  /**
   * Download the last recorded video with the specified filename.
   * File extension should match the codec: .webm for WebM, .mp4 for MP4.
   *
   * @param {string} filename - e.g. "animation.webm" or "animation.mp4"
   */
  downloadAs(filename) {
    if (!this.#lastBlob) {
      console.error('PaperAlive: Tidak ada video untuk di-download. Panggil stopRecording() terlebih dahulu.')
      return
    }

    const url = URL.createObjectURL(this.#lastBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
