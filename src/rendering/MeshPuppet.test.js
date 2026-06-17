/**
 * @file MeshPuppet.test.js
 * @description Tests for MeshPuppet — WebGL mesh renderer.
 *
 * TASK-090: WebGL Initialization & Buffers
 * TASK-091: updatePositions (Zero-Allocation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MeshPuppet, FLOATS_PER_VERTEX, VERTEX_STRIDE } from './MeshPuppet.js'

// ─── Mock WebGL2 Context ────────────────────────────────────────────────────

function createMockGL() {
  const bufferDataStore = new Map()
  return {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    DYNAMIC_DRAW: 0x88E8,
    STATIC_DRAW: 0x88E4,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    TRIANGLES: 0x0004,
    TEXTURE_2D: 0x0DE1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812F,
    _bufferDataStore: bufferDataStore,

    createBuffer: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(function (_target, data) {
      bufferDataStore.set('lastData', data)
    }),
    bufferSubData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindVertexArray: vi.fn(),
    drawElements: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    useProgram: vi.fn(),
    getError: vi.fn(() => 0),
    getParameter: vi.fn((pname) => {
      if (pname === 0x0D57) return 8 // STENCIL_BITS
      return 0
    }),
  }
}

// ─── CharacterData Fixture ──────────────────────────────────────────────────

function makeCharData(vertexCount, triangleCount) {
  const vertices0 = new Float32Array(vertexCount * 2)
  const uvCoords = new Float32Array(vertexCount * 2)
  const triangles = new Uint16Array(triangleCount * 3)

  // Simple triangle mesh
  for (let i = 0; i < vertexCount; i++) {
    vertices0[i * 2] = i * 10
    vertices0[i * 2 + 1] = i * 20
    uvCoords[i * 2] = i / vertexCount
    uvCoords[i * 2 + 1] = i / vertexCount
  }

  for (let i = 0; i < triangleCount; i++) {
    triangles[i * 3] = 0
    triangles[i * 3 + 1] = 1
    triangles[i * 3 + 2] = Math.min(2, vertexCount - 1)
  }

  return {
    geometry: {
      vertices0,
      verticesCurrent: new Float32Array(vertices0),
      vertexCount,
      triangles,
      triangleCount,
      uvCoords,
      neighbors: [],
      isBoundary: [],
    },
    arap: {
      workspace: {
        interleavedBuffer: new Float32Array(vertexCount * 4),
        outlineNormals: new Float32Array(vertexCount * 2),
        rotations: new Float32Array(vertexCount * 4),
        rhs_x: new Float64Array(vertexCount),
        rhs_y: new Float64Array(vertexCount),
      },
    },
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MeshPuppet', () => {
  let gl
  let charData

  beforeEach(() => {
    gl = createMockGL()
    charData = makeCharData(10, 5)
  })

  describe('TASK-090: WebGL Initialization & Buffers', () => {
    it('creates VBO, EBO, and VAO on init()', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      expect(gl.createBuffer).toHaveBeenCalledTimes(2) // VBO + EBO
      expect(gl.createVertexArray).toHaveBeenCalledTimes(1)
      expect(puppet.vbo).toBeDefined()
      expect(puppet.ebo).toBeDefined()
      expect(puppet.vao).toBeDefined()
    })

    it('populates interleavedBuffer with positions and UVs', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const ib = charData.arap.workspace.interleavedBuffer
      // Check first vertex: [x0, y0, u0, v0]
      expect(ib[0]).toBe(charData.geometry.vertices0[0])
      expect(ib[1]).toBe(charData.geometry.vertices0[1])
      expect(ib[2]).toBe(charData.geometry.uvCoords[0])
      expect(ib[3]).toBe(charData.geometry.uvCoords[1])
    })

    it('VBO data size = 4 floats × 4 bytes × vertexCount', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const expectedSize = FLOATS_PER_VERTEX * 4 * charData.geometry.vertexCount
      expect(expectedSize).toBe(16 * 10) // 160 bytes for 10 vertices

      // Verify bufferData was called with the interleaved buffer
      expect(gl.bufferData).toHaveBeenCalledWith(
        gl.ARRAY_BUFFER,
        charData.arap.workspace.interleavedBuffer,
        gl.DYNAMIC_DRAW,
      )
    })

    it('sets up vertex attribute pointers correctly', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      // a_position: location 0, 2 floats, stride 16, offset 0
      expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 2, gl.FLOAT, false, VERTEX_STRIDE, 0)

      // a_uv: location 1, 2 floats, stride 16, offset 8
      expect(gl.vertexAttribPointer).toHaveBeenCalledWith(1, 2, gl.FLOAT, false, VERTEX_STRIDE, 8)

      expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(0)
      expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(1)
    })

    it('EBO is STATIC_DRAW with triangle indices', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      expect(gl.bufferData).toHaveBeenCalledWith(
        gl.ELEMENT_ARRAY_BUFFER,
        charData.geometry.triangles,
        gl.STATIC_DRAW,
      )
    })

    it('uploadTexture creates texture with correct parameters', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const mockImageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 }
      puppet.uploadTexture(mockImageData)

      expect(gl.createTexture).toHaveBeenCalledTimes(1)
      expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, puppet.texture)
      expect(gl.texImage2D).toHaveBeenCalled()
      expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    })

    it('has no GL errors after init', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      expect(gl.getError()).toBe(0)
    })
  })

  describe('TASK-091: updatePositions (Zero-Allocation)', () => {
    it('writes deformed positions into pre-allocated interleavedBuffer', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const deformed = new Float32Array(charData.geometry.vertexCount * 2)
      for (let i = 0; i < charData.geometry.vertexCount; i++) {
        deformed[i * 2] = i * 100
        deformed[i * 2 + 1] = i * 200
      }

      puppet.updatePositions(deformed)

      const ib = charData.arap.workspace.interleavedBuffer
      expect(ib[0]).toBe(0)       // x0
      expect(ib[1]).toBe(0)       // y0
      expect(ib[4]).toBe(100)     // x1
      expect(ib[5]).toBe(200)     // y1
    })

    it('preserves UV data in interleavedBuffer', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      // Store original UVs
      const ib = charData.arap.workspace.interleavedBuffer
      const origU0 = ib[2]
      const origV0 = ib[3]

      const deformed = new Float32Array(charData.geometry.vertexCount * 2)
      puppet.updatePositions(deformed)

      // UVs should be unchanged
      expect(ib[2]).toBe(origU0)
      expect(ib[3]).toBe(origV0)
    })

    it('calls bufferSubData (not bufferData) for updates', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      gl.bufferSubData.mockClear()

      const deformed = new Float32Array(charData.geometry.vertexCount * 2)
      puppet.updatePositions(deformed)

      expect(gl.bufferSubData).toHaveBeenCalledTimes(1)
      expect(gl.bufferSubData).toHaveBeenCalledWith(
        gl.ARRAY_BUFFER,
        0,
        charData.arap.workspace.interleavedBuffer,
      )
    })

    it('works correctly when called 100 times (no allocation)', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const deformed = new Float32Array(charData.geometry.vertexCount * 2)

      for (let iter = 0; iter < 100; iter++) {
        for (let i = 0; i < charData.geometry.vertexCount; i++) {
          deformed[i * 2] = iter + i
          deformed[i * 2 + 1] = iter * 2 + i
        }
        puppet.updatePositions(deformed)
      }

      expect(gl.bufferSubData).toHaveBeenCalledTimes(100)
    })
  })

  describe('draw() and dispose()', () => {
    it('draw() binds VAO and draws elements', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()

      const mockProgram = {}
      puppet.draw(mockProgram)

      expect(gl.useProgram).toHaveBeenCalledWith(mockProgram)
      expect(gl.bindVertexArray).toHaveBeenCalledWith(puppet.vao)
      expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 15, gl.UNSIGNED_SHORT, 0)
    })

    it('dispose() cleans up all GL resources', () => {
      const puppet = new MeshPuppet(gl, charData)
      puppet.init()
      puppet.uploadTexture({})

      // Save references before dispose nulls them
      const savedVbo = puppet.vbo
      const savedEbo = puppet.ebo
      const savedVao = puppet.vao
      const savedTex = puppet.texture

      puppet.dispose()

      expect(gl.deleteBuffer).toHaveBeenCalledWith(savedVbo)
      expect(gl.deleteBuffer).toHaveBeenCalledWith(savedEbo)
      expect(gl.deleteVertexArray).toHaveBeenCalledWith(savedVao)
      expect(gl.deleteTexture).toHaveBeenCalledWith(savedTex)
      expect(puppet.vbo).toBeNull()
      expect(puppet.ebo).toBeNull()
      expect(puppet.vao).toBeNull()
      expect(puppet.texture).toBeNull()
    })
  })

  describe('Constants', () => {
    it('FLOATS_PER_VERTEX is 4 (x, y, u, v)', () => {
      expect(FLOATS_PER_VERTEX).toBe(4)
    })

    it('VERTEX_STRIDE is 16 bytes', () => {
      expect(VERTEX_STRIDE).toBe(16)
    })
  })
})
