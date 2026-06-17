/**
 * @file CharacterStorage.test.js
 * @description Unit tests for CharacterStorage.js — covers TASK-014, TASK-015.
 *   - TASK-014: saveCharacter() — geometry JSON → localStorage, image Blob → IndexedDB
 *   - TASK-015: loadCharacter() — deserialize and reconstruct workspace
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveCharacter, loadCharacter, hasCharacter, deleteCharacter } from './CharacterStorage.js'

const LS_KEY = 'paperalive_character_v2'

/**
 * Build a minimal CharacterData fixture that satisfies the storage contract.
 */
function makeFixture() {
  return {
    meta: {
      version: '2.0',
      characterType: 'humanoid',
      jointCount: 18,
      name: 'TestChar',
      stats: { vertexCount: 4, triangleCount: 2, contourLength: 8 },
    },
    image: {
      idbKey: `img_test_${Date.now()}`,
      width: 100,
      height: 100,
      displayWidth: 50,
      displayHeight: 50,
      offsetX: 0,
      offsetY: 0,
    },
    geometry: {
      vertexCount: 4,
      vertices0: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      verticesCurrent: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      triangles: new Uint16Array([0, 1, 2, 0, 2, 3]),
      uvCoords: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      isBoundary: new Uint8Array([1, 1, 1, 1]),
      neighbors: [
        [1, 3],
        [0, 2],
        [1, 3],
        [0, 2],
      ],
      centroid: [0.5, 0.5],
    },
    skeleton: {
      joints: new Map([
        ['hip', { id: 'hip', name: 'Hip', restPosition: [0.5, 0.5], position: [0.5, 0.5], parentId: null, childIds: ['spine'] }],
        ['spine', { id: 'spine', name: 'Spine', restPosition: [0.5, 0.7], position: [0.5, 0.7], parentId: 'hip', childIds: [] }],
      ]),
      bones: new Map([
        ['hip_spine', { id: 'hip_spine', fromId: 'hip', toId: 'spine' }],
      ]),
      hierarchy: { root: 'hip' },
    },
    pinMapping: [
      { vertexIndex: 0, jointId: 'hip', weight: 1.0 },
      { vertexIndex: 1, jointId: 'hip', weight: 0.8 },
      { vertexIndex: 2, jointId: 'spine', weight: 0.9 },
    ],
    partGroups: { torso: [0, 1, 2, 3] },
    arap: {
      cotWeightsFlat: new Float32Array([1.0, 2.0, 3.0, 4.0]),
      neighborOffsets: new Int32Array([0, 2, 4, 6, 8]),
      neighborList: new Int32Array([1, 3, 0, 2, 1, 3, 0, 2]),
      laplacianSparse: null,
      pinnedVertices: null,
      choleskyAllPinned: {
        lower: new Float32Array([2.0, -1.0, 2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0]),
        vertexIndices: new Int32Array([0, 1, 2, 3]),
        n: 4,
      },
      choleskyFree: {
        lower: new Float32Array([2.0, -1.0, 2.0]),
        vertexIndices: new Int32Array([0, 1, 2]),
        n: 3,
      },
    },
  }
}

describe('CharacterStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(async () => {
    await deleteCharacter().catch(() => {})
  })

  // ─── TASK-014: saveCharacter ───────────────────────────────────────────────

  describe('TASK-014: saveCharacter()', () => {
    it('localStorage contains valid JSON after save', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['fake image'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')

      const json = localStorage.getItem(LS_KEY)
      expect(json).not.toBeNull()

      const parsed = JSON.parse(json)
      expect(typeof parsed).toBe('object')
    })

    it('JSON contains image.idbKey, geometry.vertices0 (Base64), meta.version "2.0"', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['fake image'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')

      const parsed = JSON.parse(localStorage.getItem(LS_KEY))
      expect(parsed.meta.version).toBe('2.0')
      expect(parsed.image.idbKey).toBe(fixture.image.idbKey)

      // vertices0 is stored as Base64 in a __ta wrapper
      expect(parsed.geometry.vertices0.__ta).toBe(true)
      expect(parsed.geometry.vertices0.type).toBe('Float32Array')
      expect(typeof parsed.geometry.vertices0.data).toBe('string')
    })

    it('ImageStore.load(idbKey) returns the saved image Blob', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['fake image data'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')

      // loadCharacter will pull the blob from IndexedDB
      const result = await loadCharacter()
      expect(result).not.toBeNull()
      expect(result.imageBlob).not.toBeNull()
      expect(result.imageBlob.size).toBe(imageBlob.size)
      expect(result.imageBlob.type).toBe(imageBlob.type)
    })

    it('hasCharacter() returns true after save', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      expect(hasCharacter()).toBe(false)
      await saveCharacter(fixture, imageBlob, 'TestChar')
      expect(hasCharacter()).toBe(true)
    })
  })

  // ─── TASK-015: loadCharacter ───────────────────────────────────────────────

  describe('TASK-015: loadCharacter()', () => {
    it('returns CharacterData with vertices0.length matching the saved data', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      expect(result).not.toBeNull()
      expect(result.data.geometry.vertices0.length).toBe(fixture.geometry.vertices0.length)
    })

    it('meta.version === "2.0" after load', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      expect(result.data.meta.version).toBe('2.0')
    })

    it('image.idbKey matches the saved key', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      expect(result.data.image.idbKey).toBe(fixture.image.idbKey)
    })

    it('workspace.rotations.length === 4 × vertexCount (reconstructed, not from storage)', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      const vertexCount = fixture.geometry.vertexCount
      expect(result.data.arap.workspace.rotations.length).toBe(4 * vertexCount)
      expect(result.data.arap.workspace.rhs_x.length).toBe(vertexCount)
      expect(result.data.arap.workspace.rhs_y.length).toBe(vertexCount)
    })

    it('returns null if localStorage is empty', async () => {
      expect(hasCharacter()).toBe(false)
      const result = await loadCharacter()
      expect(result).toBeNull()
    })

    it('skeleton Map is correctly reconstructed', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      expect(result.data.skeleton.joints).toBeInstanceOf(Map)
      expect(result.data.skeleton.joints.has('hip')).toBe(true)
      expect(result.data.skeleton.joints.has('spine')).toBe(true)
      expect(result.data.skeleton.joints.get('hip').name).toBe('Hip')

      expect(result.data.skeleton.bones).toBeInstanceOf(Map)
      expect(result.data.skeleton.bones.has('hip_spine')).toBe(true)
    })

    it('TypedArray values match the original fixture after round-trip', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      await saveCharacter(fixture, imageBlob, 'TestChar')
      const result = await loadCharacter()

      const loaded = result.data

      // Float32Array
      expect(loaded.geometry.vertices0).toBeInstanceOf(Float32Array)
      expect(Array.from(loaded.geometry.vertices0)).toEqual(Array.from(fixture.geometry.vertices0))

      // Uint16Array
      expect(loaded.geometry.triangles).toBeInstanceOf(Uint16Array)
      expect(Array.from(loaded.geometry.triangles)).toEqual(Array.from(fixture.geometry.triangles))

      // ARAP Float32Array
      expect(loaded.arap.cotWeightsFlat).toBeInstanceOf(Float32Array)
      expect(Array.from(loaded.arap.cotWeightsFlat)).toEqual(Array.from(fixture.arap.cotWeightsFlat))

      // ARAP Int32Array
      expect(loaded.arap.neighborOffsets).toBeInstanceOf(Int32Array)
      expect(Array.from(loaded.arap.neighborOffsets)).toEqual(Array.from(fixture.arap.neighborOffsets))
    })
  })

  // ─── TASK-157: QuotaExceededError Handling ─────────────────────────────────

  describe('TASK-157: QuotaExceededError handling', () => {
    it('does not crash when localStorage.setItem throws QuotaExceededError', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      // Mock localStorage.setItem to throw QuotaExceededError
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new Error('Quota exceeded')
        err.name = 'QuotaExceededError'
        throw err
      })

      let thrownError = null
      try {
        await saveCharacter(fixture, imageBlob, 'TestChar')
      } catch (err) {
        thrownError = err
      }

      setItemSpy.mockRestore()

      // Should throw a QUOTA_EXCEEDED error, not crash
      expect(thrownError).not.toBeNull()
      expect(thrownError.message).toBe('QUOTA_EXCEEDED')
    })

    it('throws QUOTA_EXCEEDED error that caller can detect', async () => {
      const fixture = makeFixture()
      const imageBlob = new Blob(['img'], { type: 'image/png' })

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new Error('Quota exceeded')
        err.name = 'QuotaExceededError'
        throw err
      })

      let isQuotaError = false
      try {
        await saveCharacter(fixture, imageBlob, 'TestChar')
      } catch (err) {
        isQuotaError = err.message === 'QUOTA_EXCEEDED'
      }

      setItemSpy.mockRestore()
      expect(isQuotaError).toBe(true)
    })
  })
})
