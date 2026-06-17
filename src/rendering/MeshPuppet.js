/**
 * @file MeshPuppet.js
 * @description WebGL mesh renderer for the main character.
 *
 * Responsibilities:
 *   - Create and manage character VBO (DYNAMIC_DRAW), EBO (STATIC_DRAW), VAO
 *   - Upload character texture to GPU
 *   - Zero-allocation position updates via pre-allocated workspace.interleavedBuffer
 *   - Draw character mesh with any compatible shader program
 *
 * VBO Layout (V2): [x, y, u, v] per vertex = 4 floats = 16 bytes/vertex
 *
 * @see architecture/module_design.md — MeshPuppet.js
 */

/** Floats per vertex in the interleaved VBO: x, y, u, v */
const FLOATS_PER_VERTEX = 4

/** Bytes per float */
const BYTES_PER_FLOAT = 4

/** Stride in bytes for one interleaved vertex */
const VERTEX_STRIDE = FLOATS_PER_VERTEX * BYTES_PER_FLOAT

class MeshPuppet {
  /**
   * @param {WebGL2RenderingContext} gl - WebGL2 context
   * @param {import('../types/characterData.js').CharacterData} charData - Character data
   */
  constructor(gl, charData) {
    /** @type {WebGL2RenderingContext} */
    this.gl = gl

    /** @type {import('../types/characterData.js').CharacterData} */
    this.charData = charData

    /** @type {number} */
    this.vertexCount = charData.geometry.vertexCount

    /** @type {number} */
    this.triangleCount = charData.geometry.triangleCount

    /** @type {WebGLBuffer|null} */
    this.vbo = null

    /** @type {WebGLBuffer|null} */
    this.ebo = null

    /** @type {WebGLVertexArrayObject|null} */
    this.vao = null

    /** @type {WebGLTexture|null} */
    this.texture = null
  }

  /**
   * Initialize WebGL buffers and VAO for the character mesh.
   *
   * Creates:
   *   - Character VBO (DYNAMIC_DRAW) — interleaved [x, y, u, v] per vertex
   *   - Character EBO (STATIC_DRAW) — triangle indices
   *   - VAO with attribute bindings
   *
   * TASK-090: VBO size = 4 floats × 4 bytes × vertexCount (16 bytes/vertex)
   *
   * @returns {void}
   */
  init() {
    const gl = this.gl
    const geo = this.charData.geometry
    const workspace = this.charData.arap.workspace

    // ─── Character VBO (DYNAMIC_DRAW) ────────────────────────────────────────
    // Populate interleavedBuffer with rest-pose positions and UVs
    const interleaved = workspace.interleavedBuffer
    for (let i = 0; i < this.vertexCount; i++) {
      interleaved[i * FLOATS_PER_VERTEX] = geo.vertices0[i * 2]
      interleaved[i * FLOATS_PER_VERTEX + 1] = geo.vertices0[i * 2 + 1]
      interleaved[i * FLOATS_PER_VERTEX + 2] = geo.uvCoords[i * 2]
      interleaved[i * FLOATS_PER_VERTEX + 3] = geo.uvCoords[i * 2 + 1]
    }

    this.vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW)

    // ─── Character EBO (STATIC_DRAW) ─────────────────────────────────────────
    this.ebo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.triangles, gl.STATIC_DRAW)

    // ─── VAO ──────────────────────────────────────────────────────────────────
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo)

    // a_position (location 0) — vec2 at offset 0
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VERTEX_STRIDE, 0)

    // a_uv (location 1) — vec2 at offset 8 bytes
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, VERTEX_STRIDE, 2 * BYTES_PER_FLOAT)

    gl.bindVertexArray(null)
  }

  /**
   * Upload character image to GPU as a texture.
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement|ImageBitmap} imageData - Image source
   * @returns {WebGLTexture} The created texture
   */
  uploadTexture(imageData) {
    const gl = this.gl

    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData,
    )

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    return this.texture
  }

  /**
   * Update vertex positions in the VBO using pre-allocated workspace buffer.
   *
   * TASK-091: Zero-allocation — writes positions directly into
   * workspace.interleavedBuffer (pre-allocated during preprocessing),
   * then uploads via gl.bufferSubData(). No new arrays created.
   *
   * @param {Float32Array} deformedVertices - [x0,y0, x1,y1, ...] deformed positions
   * @returns {void}
   */
  updatePositions(deformedVertices) {
    const gl = this.gl
    const interleaved = this.charData.arap.workspace.interleavedBuffer

    // Write new positions into interleaved buffer (UVs remain unchanged)
    for (let i = 0; i < this.vertexCount; i++) {
      interleaved[i * FLOATS_PER_VERTEX] = deformedVertices[i * 2]
      interleaved[i * FLOATS_PER_VERTEX + 1] = deformedVertices[i * 2 + 1]
    }

    // Upload via bufferSubData (partial update, no new allocation)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, interleaved)
  }

  /**
   * Draw the character mesh using the given shader program.
   *
   * @param {WebGLProgram} shaderProgram - Compiled and linked shader program
   * @returns {void}
   */
  draw(shaderProgram) {
    const gl = this.gl
    gl.useProgram(shaderProgram)
    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.triangleCount * 3, gl.UNSIGNED_SHORT, 0)
    gl.bindVertexArray(null)
  }

  /**
   * Release all WebGL resources.
   *
   * @returns {void}
   */
  dispose() {
    const gl = this.gl

    if (this.vbo) {
      gl.deleteBuffer(this.vbo)
      this.vbo = null
    }
    if (this.ebo) {
      gl.deleteBuffer(this.ebo)
      this.ebo = null
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao)
      this.vao = null
    }
    if (this.texture) {
      gl.deleteTexture(this.texture)
      this.texture = null
    }
  }
}

export { MeshPuppet, FLOATS_PER_VERTEX, VERTEX_STRIDE }
