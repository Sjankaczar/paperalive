/**
 * @file NPRRenderer.js
 * @description Non-Photorealistic Rendering orchestrator.
 *
 * Manages 5 render passes:
 *   PASS 1: Paper Background — FBO blit of pre-baked paper texture
 *   PASS 2: Drop Shadow — flattened, offset shadow mesh
 *   PASS 3+4: Character + Outline — stencil-based outline (4 steps A-D)
 *   PASS 5: Wiggle Post-Process — UV distortion via dual sine
 *
 * Also handles:
 *   - WebGL context loss/restore (TASK-092)
 *   - Paper FBO baking (TASK-093)
 *   - Auto-save interval 60s (TASK-097)
 *
 * @see architecture/rendering_pipeline.md
 * @see architecture/shader_design.md
 */

import characterVertSrc from './shaders/character.vert.glsl?raw'
import characterFragSrc from './shaders/character.frag.glsl?raw'
import stencilFragSrc from './shaders/stencil.frag.glsl?raw'
import outlineScaleVertSrc from './shaders/outline_scale.vert.glsl?raw'
import outlineFragSrc from './shaders/outline.frag.glsl?raw'
import paperVertSrc from './shaders/paper.vert.glsl?raw'
import paperFragSrc from './shaders/paper.frag.glsl?raw'
import blitVertSrc from './shaders/blit.vert.glsl?raw'
import blitFragSrc from './shaders/blit.frag.glsl?raw'
import shadowVertSrc from './shaders/shadow.vert.glsl?raw'
import shadowFragSrc from './shaders/shadow.frag.glsl?raw'
import wiggleVertSrc from './shaders/wiggle.vert.glsl?raw'
import wiggleFragSrc from './shaders/wiggle.frag.glsl?raw'

// ─── NPR Default Settings ───────────────────────────────────────────────────

const NPR_DEFAULTS = Object.freeze({
  paperColor:      [0.96, 0.93, 0.87],
  noiseScale:      4.0,
  noiseStrength:   0.04,
  outlineScale:    1.02,
  outlineColor:    [0.10, 0.08, 0.05],
  outlineOpacity:  0.9,
  shadowOpacity:   0.35,
  shadowOffsetX:   8,
  shadowOffsetY:   -35,
  shadowScaleY:    0.15,
  wiggleAmplitude: 0.003,
  wiggleFrequency: 3.0,
  wiggleSpatial:   8.0,
  brightness:      1.0,
  saturation:      1.0,
})

const AUTO_SAVE_INTERVAL = 60_000

// ─── Shader Compilation Helpers ─────────────────────────────────────────────

/**
 * Compile a single WebGL shader from source.
 * @param {WebGL2RenderingContext} gl
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source - GLSL source code
 * @returns {WebGLShader}
 */
function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }

  return shader
}

/**
 * Link a vertex shader and fragment shader into a program.
 * @param {WebGL2RenderingContext} gl
 * @param {string} vertSrc - Vertex shader source
 * @param {string} fragSrc - Fragment shader source
 * @returns {WebGLProgram}
 */
function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)

  const program = gl.createProgram()
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    throw new Error(`Program link error: ${info}`)
  }

  // Shaders can be detached after successful linking
  gl.deleteShader(vert)
  gl.deleteShader(frag)

  return program
}

// ─── NPRRenderer Class ──────────────────────────────────────────────────────

class NPRRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - Target canvas element
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas

    /** @type {WebGL2RenderingContext|null} */
    this.gl = null

    /** @type {import('./MeshPuppet.js').MeshPuppet|null} */
    this.puppet = null

    // ─── Shader Programs ───────────────────────────────────────────────────
    this.characterProgram = null
    this.stencilProgram = null
    this.outlineScaleProgram = null
    this.paperProgram = null
    this.blitProgram = null
    this.shadowProgram = null
    this.wiggleProgram = null

    // ─── FBOs and Textures ─────────────────────────────────────────────────
    this.paperFBO = null
    this.paperTexture = null
    this.sceneFBO = null
    this.sceneFBOTexture = null
    this.stencilRenderbuffer = null

    // ─── Buffers ───────────────────────────────────────────────────────────
    this.quadVAO = null
    this.quadVBO = null

    // ─── Character Data ────────────────────────────────────────────────────
    this.charData = null

    /** @type {Float32Array} Mesh centroid [cx, cy] in pixel space */
    this.meshCentroid = new Float32Array(2)

    // ─── Rendering Settings (mutable) ──────────────────────────────────────
    this.paperColor = new Float32Array(NPR_DEFAULTS.paperColor)
    this.noiseScale = NPR_DEFAULTS.noiseScale
    this.noiseStrength = NPR_DEFAULTS.noiseStrength
    this.outlineScale = NPR_DEFAULTS.outlineScale
    this.outlineColor = new Float32Array(NPR_DEFAULTS.outlineColor)
    this.outlineOpacity = NPR_DEFAULTS.outlineOpacity
    this.shadowOpacity = NPR_DEFAULTS.shadowOpacity
    this.shadowOffsetX = NPR_DEFAULTS.shadowOffsetX
    this.shadowOffsetY = NPR_DEFAULTS.shadowOffsetY
    this.shadowScaleY = NPR_DEFAULTS.shadowScaleY
    this.wiggleAmplitude = NPR_DEFAULTS.wiggleAmplitude
    this.wiggleFrequency = NPR_DEFAULTS.wiggleFrequency
    this.wiggleSpatial = NPR_DEFAULTS.wiggleSpatial
    this.brightness = NPR_DEFAULTS.brightness
    this.saturation = NPR_DEFAULTS.saturation

    // ─── Feature Toggles ──────────────────────────────────────────────────
    this.wiggleEnabled = true
    this.shadowEnabled = true
    this.outlineEnabled = true
    this.paperEnabled = true

    // ─── State ────────────────────────────────────────────────────────────
    this._rafId = null
    this._contextLost = false
    this._autoSaveIntervalId = null
    this._paperDirty = true

    // ─── Bound callbacks ──────────────────────────────────────────────────
    this._onContextLost = this._handleContextLoss.bind(this)
    this._onContextRestored = this._handleContextRestore.bind(this)
    this._onFrame = this._rafCallback.bind(this)
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  /**
   * Initialize the renderer: create WebGL2 context, compile shaders, create FBOs.
   *
   * @param {import('../types/characterData.js').CharacterData} [charData] - Optional character data
   * @returns {Promise<void>}
   */
  async init(charData) {
    if (charData) {
      this.charData = charData
    }

    // ─── WebGL2 Context ──────────────────────────────────────────────────
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: true,
    })

    if (!gl) {
      throw new Error('WebGL2 not supported')
    }

    this.gl = gl

    // ─── Context Loss Handlers (TASK-092) ────────────────────────────────
    this.canvas.addEventListener('webglcontextlost', this._onContextLost)
    this.canvas.addEventListener('webglcontextrestored', this._onContextRestored)

    // ─── Compile All Shader Programs ─────────────────────────────────────
    this._createAllPrograms()

    // ─── Create Fullscreen Quad ──────────────────────────────────────────
    this._createQuadVAO()

    // ─── Create FBOs ─────────────────────────────────────────────────────
    this._createPaperFBO()
    this._createSceneFBO()

    // ─── Bake Paper Texture (TASK-093) ───────────────────────────────────
    this.bakePaperTexture()

    // ─── Auto-Save Interval (TASK-097) ───────────────────────────────────
    this._startAutoSave()
  }

  /**
   * Compile all 7 shader programs and cache uniform locations.
   * @private
   */
  _createAllPrograms() {
    const gl = this.gl

    // Character program (STEP D: texture render)
    this.characterProgram = createProgram(gl, characterVertSrc, characterFragSrc)

    // Stencil program (STEP B: stencil write, no color)
    this.stencilProgram = createProgram(gl, characterVertSrc, stencilFragSrc)

    // Outline scale program (STEP C: scaled mesh for outline)
    this.outlineScaleProgram = createProgram(gl, outlineScaleVertSrc, outlineFragSrc)

    // Paper program (baking only)
    this.paperProgram = createProgram(gl, paperVertSrc, paperFragSrc)

    // Blit program (paper FBO blit + simple scene blit)
    this.blitProgram = createProgram(gl, blitVertSrc, blitFragSrc)

    // Shadow program
    this.shadowProgram = createProgram(gl, shadowVertSrc, shadowFragSrc)

    // Wiggle program
    this.wiggleProgram = createProgram(gl, wiggleVertSrc, wiggleFragSrc)
  }

  /**
   * Create the fullscreen quad VAO/VBO used for paper blit, wiggle, etc.
   * @private
   */
  _createQuadVAO() {
    const gl = this.gl

    const quadVertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ])

    this.quadVAO = gl.createVertexArray()
    this.quadVBO = gl.createBuffer()

    gl.bindVertexArray(this.quadVAO)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO)
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)

    // a_position (location 0)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    gl.bindVertexArray(null)
  }

  /**
   * Create the paper FBO and its color texture attachment.
   * @private
   */
  _createPaperFBO() {
    const gl = this.gl
    const w = this.canvas.width
    const h = this.canvas.height

    // Color texture
    this.paperTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.paperTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // FBO
    this.paperFBO = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.paperFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.paperTexture, 0)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /**
   * Create the scene FBO with color texture and stencil renderbuffer.
   * @private
   */
  _createSceneFBO() {
    const gl = this.gl
    const w = this.canvas.width
    const h = this.canvas.height

    // Color texture (NEAREST for pixel-perfect)
    this.sceneFBOTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBOTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Stencil renderbuffer (DEPTH_STENCIL for compatibility)
    this.stencilRenderbuffer = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencilRenderbuffer)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h)

    // FBO
    this.sceneFBO = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneFBOTexture, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.stencilRenderbuffer)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ─── Paper Baking (TASK-093) ────────────────────────────────────────────

  /**
   * Bake paper texture to paperFBO using the procedural paper shader.
   * Called once at startup, and whenever paper settings change or canvas resizes.
   *
   * @returns {void}
   */
  bakePaperTexture() {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.paperFBO)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.paperProgram)

    gl.uniform1f(gl.getUniformLocation(this.paperProgram, 'u_noiseScale'), this.noiseScale)
    gl.uniform1f(gl.getUniformLocation(this.paperProgram, 'u_noiseStrength'), this.noiseStrength)
    gl.uniform3fv(gl.getUniformLocation(this.paperProgram, 'u_paperColor'), this.paperColor)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    this._paperDirty = false
  }

  /**
   * Invalidate the baked paper texture, triggering a rebake.
   * Called when paper settings change or canvas resizes.
   *
   * @returns {void}
   */
  invalidatePaperTexture() {
    this._paperDirty = true
    this.bakePaperTexture()
  }

  // ─── Character Management ──────────────────────────────────────────────

  /**
   * Attach a MeshPuppet to this renderer.
   *
   * @param {import('./MeshPuppet.js').MeshPuppet} puppet
   * @returns {void}
   */
  attachCharacter(puppet) {
    this.puppet = puppet
    this.charData = puppet.charData
    this._computeMeshCentroid()
  }

  /**
   * Compute mesh centroid from rest-pose vertices.
   * @private
   */
  _computeMeshCentroid() {
    const verts = this.charData.geometry.vertices0
    const count = this.charData.geometry.vertexCount
    let cx = 0
    let cy = 0
    for (let i = 0; i < count; i++) {
      cx += verts[i * 2]
      cy += verts[i * 2 + 1]
    }
    this.meshCentroid[0] = cx / count
    this.meshCentroid[1] = cy / count
  }

  // ─── Render Loop ───────────────────────────────────────────────────────

  /**
   * Start the requestAnimationFrame render loop.
   * @returns {void}
   */
  start() {
    if (this._rafId !== null) return
    this._rafId = requestAnimationFrame(this._onFrame)
  }

  /**
   * Stop the requestAnimationFrame render loop.
   * @returns {void}
   */
  stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  /**
   * rAF callback — draws one complete frame.
   * @param {number} timestamp
   * @private
   */
  _rafCallback(timestamp) {
    if (this._contextLost) return
    this.drawFrame(timestamp)
    this._rafId = requestAnimationFrame(this._onFrame)
  }

  /**
   * Draw one complete frame (all 5 passes).
   *
   * @param {number} timestamp - Frame timestamp from rAF (ms)
   * @returns {void}
   */
  drawFrame(timestamp) {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    // PASS 1: Paper Background
    if (this.paperEnabled) {
      this.drawPaper()
    }

    // PASS 2: Drop Shadow
    if (this.shadowEnabled && this.puppet) {
      this.drawShadow()
    }

    // PASS 3+4: Character + Outline (renders to sceneFBO)
    if (this.puppet) {
      this.drawCharacterAndOutline()
    }

    // PASS 5: Wiggle (blits sceneFBO to canvas, with optional distortion)
    this.drawWiggle(timestamp)
  }

  // ─── PASS 1: Paper Background ─────────────────────────────────────────

  /**
   * Blit pre-baked paper FBO texture to canvas.
   * This is a simple textured quad draw — takes < 1ms per frame.
   *
   * @returns {void}
   */
  drawPaper() {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.blitProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.paperTexture)
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'u_source'), 0)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  // ─── PASS 2: Drop Shadow (TASK-094) ───────────────────────────────────

  /**
   * Render flattened, offset shadow mesh beneath the character.
   *
   * @returns {void}
   */
  drawShadow() {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.shadowProgram)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.uniform2f(gl.getUniformLocation(this.shadowProgram, 'u_canvasSize'), this.canvas.width, this.canvas.height)
    gl.uniform2f(gl.getUniformLocation(this.shadowProgram, 'u_shadowOffset'), this.shadowOffsetX, this.shadowOffsetY)
    gl.uniform1f(gl.getUniformLocation(this.shadowProgram, 'u_shadowScaleY'), this.shadowScaleY)
    gl.uniform1f(gl.getUniformLocation(this.shadowProgram, 'u_shadowOpacity'), this.shadowOpacity)

    gl.bindVertexArray(this.puppet.vao)
    gl.drawElements(gl.TRIANGLES, this.puppet.triangleCount * 3, gl.UNSIGNED_SHORT, 0)

    gl.disable(gl.BLEND)
  }

  // ─── PASS 3+4: Character + Outline (TASK-095) ─────────────────────────

  /**
   * Stencil-based character + outline rendering.
   *
   * 4 steps:
   *   A. Clear stencil to 0 (done via gl.clear)
   *   B. Render mesh → stencil = 1 (no color output)
   *   C. Render mesh ×1.02 where stencil = 0 → outline color
   *   D. Render mesh texture where stencil = 1 → character
   *
   * @returns {void}
   */
  drawCharacterAndOutline() {
    const gl = this.gl
    const triCount = this.puppet.triangleCount * 3

    // Bind to scene FBO (has stencil attachment)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)

    // No depth test — stencil manages ordering
    gl.disable(gl.DEPTH_TEST)

    // ─── STEP B: Write stencil = 1 for character interior ────────────────
    gl.enable(gl.STENCIL_TEST)
    gl.stencilFunc(gl.ALWAYS, 1, 0xFF)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
    gl.colorMask(false, false, false, false)

    gl.useProgram(this.stencilProgram)
    gl.uniform2f(gl.getUniformLocation(this.stencilProgram, 'u_canvasSize'), this.canvas.width, this.canvas.height)

    gl.bindVertexArray(this.puppet.vao)
    gl.drawElements(gl.TRIANGLES, triCount, gl.UNSIGNED_SHORT, 0)

    gl.colorMask(true, true, true, true)

    // ─── STEP C: Render scaled mesh (outline) where stencil = 0 ──────────
    if (this.outlineEnabled) {
      gl.stencilFunc(gl.EQUAL, 0, 0xFF)
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)

      gl.useProgram(this.outlineScaleProgram)
      gl.uniform2f(gl.getUniformLocation(this.outlineScaleProgram, 'u_canvasSize'), this.canvas.width, this.canvas.height)
      gl.uniform2fv(gl.getUniformLocation(this.outlineScaleProgram, 'u_meshCenter'), this.meshCentroid)
      gl.uniform1f(gl.getUniformLocation(this.outlineScaleProgram, 'u_outlineScale'), this.outlineScale)
      gl.uniform3fv(gl.getUniformLocation(this.outlineScaleProgram, 'u_outlineColor'), this.outlineColor)
      gl.uniform1f(gl.getUniformLocation(this.outlineScaleProgram, 'u_outlineOpacity'), this.outlineOpacity)

      gl.bindVertexArray(this.puppet.vao)
      gl.drawElements(gl.TRIANGLES, triCount, gl.UNSIGNED_SHORT, 0)
    }

    // ─── STEP D: Render character texture where stencil = 1 ──────────────
    gl.stencilFunc(gl.EQUAL, 1, 0xFF)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)

    gl.useProgram(this.characterProgram)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.puppet.texture)
    gl.uniform1i(gl.getUniformLocation(this.characterProgram, 'u_texture'), 0)
    gl.uniform2f(gl.getUniformLocation(this.characterProgram, 'u_canvasSize'), this.canvas.width, this.canvas.height)
    gl.uniform1f(gl.getUniformLocation(this.characterProgram, 'u_brightness'), this.brightness)
    gl.uniform1f(gl.getUniformLocation(this.characterProgram, 'u_saturation'), this.saturation)

    gl.bindVertexArray(this.puppet.vao)
    gl.drawElements(gl.TRIANGLES, triCount, gl.UNSIGNED_SHORT, 0)

    gl.disable(gl.BLEND)
    gl.disable(gl.STENCIL_TEST)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ─── PASS 5: Wiggle (TASK-096) ────────────────────────────────────────

  /**
   * Apply wiggle UV distortion to sceneFBO and blit to canvas.
   * If wiggleEnabled is false, simple blit without distortion.
   *
   * @param {number} timestamp - Frame timestamp from rAF (ms)
   * @returns {void}
   */
  drawWiggle(timestamp) {
    const gl = this.gl

    if (!this.wiggleEnabled) {
      // Simple blit without distortion
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(this.blitProgram)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.sceneFBOTexture)
      gl.uniform1i(gl.getUniformLocation(this.blitProgram, 'u_source'), 0)

      gl.bindVertexArray(this.quadVAO)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return
    }

    // Wiggle distortion pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.wiggleProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBOTexture)
    gl.uniform1i(gl.getUniformLocation(this.wiggleProgram, 'u_scene'), 0)
    gl.uniform1f(gl.getUniformLocation(this.wiggleProgram, 'u_time'), timestamp / 1000.0)
    gl.uniform1f(gl.getUniformLocation(this.wiggleProgram, 'u_amplitude'), this.wiggleAmplitude)
    gl.uniform1f(gl.getUniformLocation(this.wiggleProgram, 'u_frequency'), this.wiggleFrequency)
    gl.uniform1f(gl.getUniformLocation(this.wiggleProgram, 'u_spatialFreq'), this.wiggleSpatial)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.disable(gl.BLEND)
  }

  // ─── Context Loss Handling (TASK-092) ───────────────────────────────────

  /**
   * Handle webglcontextlost event.
   * @param {Event} e
   * @private
   */
  _handleContextLoss(e) {
    e.preventDefault()
    this._contextLost = true
    this.stop()

    // Clear auto-save to prevent duplicates after restore
    if (this._autoSaveIntervalId !== null) {
      clearInterval(this._autoSaveIntervalId)
      this._autoSaveIntervalId = null
    }

    // Show overlay notification
    this._showOverlay('Koneksi GPU hilang. Klik untuk memulihkan.')
  }

  /**
   * Handle webglcontextrestored event.
   * @private
   */
  _handleContextRestore() {
    this._contextLost = false
    this._recreateAllWebGLObjects()
    this._hideOverlay()

    // Restart auto-save (no duplicate — was cleared in context loss)
    this._startAutoSave()

    // Restart render loop
    this.start()
  }

  /**
   * Recreate all WebGL resources after context restore.
   * @private
   */
  _recreateAllWebGLObjects() {
    // Re-create shader programs
    this._createAllPrograms()

    // Re-create quad VAO
    this._createQuadVAO()

    // Re-create FBOs
    this._createPaperFBO()
    this._createSceneFBO()

    // Re-create puppet buffers if character is attached
    if (this.puppet) {
      this.puppet.init()
      // Re-upload texture if image data is available
      if (this.charData && this.charData.image) {
        this.puppet.uploadTexture(this.canvas)
      }
    }

    // Re-bake paper
    this.bakePaperTexture()
  }

  /**
   * Show a notification overlay on the canvas.
   * @param {string} message
   * @private
   */
  _showOverlay(message) {
    if (!this.canvas.parentNode) return
    const overlay = document.createElement('div')
    overlay.className = 'paperalive-gpu-overlay'
    overlay.textContent = message
    overlay.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(0,0,0,0.8);color:#fff;padding:20px;border-radius:8px;cursor:pointer;z-index:1000;'
    overlay.addEventListener('click', () => {
      const ext = this.gl.getExtension('WEBGL_lose_context')
      if (ext) ext.restoreContext()
    })
    this.canvas.parentNode.style.position = 'relative'
    this.canvas.parentNode.appendChild(overlay)
  }

  /**
   * Remove the notification overlay.
   * @private
   */
  _hideOverlay() {
    if (!this.canvas.parentNode) return
    const overlay = this.canvas.parentNode.querySelector('.paperalive-gpu-overlay')
    if (overlay) overlay.remove()
  }

  // ─── Auto-Save (TASK-097) ──────────────────────────────────────────────

  /**
   * Start the auto-save interval (60 seconds).
   * Clears any existing interval first to prevent duplicates.
   * @private
   */
  _startAutoSave() {
    if (this._autoSaveIntervalId !== null) {
      clearInterval(this._autoSaveIntervalId)
    }
    this._autoSaveIntervalId = setInterval(() => {
      if (this.charData) {
        try {
          localStorage.setItem('paperalive_autosave', JSON.stringify({
            geometry: {
              vertices0: Array.from(this.charData.geometry.vertices0),
              triangles: Array.from(this.charData.geometry.triangles),
              uvCoords: Array.from(this.charData.geometry.uvCoords),
              vertexCount: this.charData.geometry.vertexCount,
              triangleCount: this.charData.geometry.triangleCount,
            },
            skeleton: this.charData.skeleton,
            pinMapping: this.charData.pinMapping,
            meta: this.charData.meta,
            image: { idbKey: this.charData.image.idbKey },
          }))
        } catch {
          // localStorage might be full — silently ignore
        }
      }
    }, AUTO_SAVE_INTERVAL)
  }

  // ─── Resize ────────────────────────────────────────────────────────────

  /**
   * Handle canvas resize — update viewport, resize FBOs, rebake paper.
   *
   * @param {number} newWidth
   * @param {number} newHeight
   * @returns {void}
   */
  onResize(newWidth, newHeight) {
    this.canvas.width = newWidth
    this.canvas.height = newHeight

    const gl = this.gl
    gl.viewport(0, 0, newWidth, newHeight)

    // Resize paper FBO texture
    gl.bindTexture(gl.TEXTURE_2D, this.paperTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, newWidth, newHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

    // Resize scene FBO texture
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBOTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, newWidth, newHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

    // Resize stencil renderbuffer
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencilRenderbuffer)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, newWidth, newHeight)

    // Rebake paper
    this.invalidatePaperTexture()
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  /**
   * Release all WebGL resources and stop rendering.
   *
   * @returns {void}
   */
  dispose() {
    this.stop()

    if (this._autoSaveIntervalId !== null) {
      clearInterval(this._autoSaveIntervalId)
      this._autoSaveIntervalId = null
    }

    this.canvas.removeEventListener('webglcontextlost', this._onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored)

    const gl = this.gl
    if (gl) {
      // Delete shader programs
      const programs = [
        this.characterProgram, this.stencilProgram, this.outlineScaleProgram,
        this.paperProgram, this.blitProgram, this.shadowProgram, this.wiggleProgram,
      ]
      for (const p of programs) {
        if (p) gl.deleteProgram(p)
      }

      // Delete FBOs
      if (this.paperFBO) gl.deleteFramebuffer(this.paperFBO)
      if (this.sceneFBO) gl.deleteFramebuffer(this.sceneFBO)

      // Delete textures
      if (this.paperTexture) gl.deleteTexture(this.paperTexture)
      if (this.sceneFBOTexture) gl.deleteTexture(this.sceneFBOTexture)

      // Delete renderbuffer
      if (this.stencilRenderbuffer) gl.deleteRenderbuffer(this.stencilRenderbuffer)

      // Delete quad buffers
      if (this.quadVBO) gl.deleteBuffer(this.quadVBO)
      if (this.quadVAO) gl.deleteVertexArray(this.quadVAO)
    }

    // Dispose puppet
    if (this.puppet) {
      this.puppet.dispose()
    }
  }
}

export { NPRRenderer, NPR_DEFAULTS, AUTO_SAVE_INTERVAL, createProgram, compileShader }
