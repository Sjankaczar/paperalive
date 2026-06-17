/**
 * @file ImageStore.test.js
 * @description Unit tests for ImageStore.js — covers TASK-011, TASK-012, TASK-013.
 *   - TASK-011: open() and schema creation
 *   - TASK-012: save(), load(), delete()
 *   - TASK-013: estimateStorageUsage()
 */

import { describe, it, expect, afterEach } from 'vitest'
import { ImageStore } from './ImageStore.js'

// Use a unique DB name per test to avoid interference
let dbCounter = 0
function uniqueDbName() {
  return `paperalive_test_${Date.now()}_${++dbCounter}`
}

describe('ImageStore', () => {
  /** @type {ImageStore | null} */
  let store = null

  afterEach(() => {
    if (store) {
      store.close()
      store = null
    }
  })

  // ─── TASK-011: Open & Schema ───────────────────────────────────────────────

  describe('TASK-011: open() and schema', () => {
    it('opens IndexedDB without error', async () => {
      store = new ImageStore(uniqueDbName())
      await expect(store.open()).resolves.toBeUndefined()
    })

    it('creates the "images" object store on first run', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      // Verify by attempting a save/load cycle (no "store not found" error)
      const blob = new Blob(['test data'], { type: 'image/png' })
      await store.save('test_key', blob)
      const loaded = await store.load('test_key')
      expect(loaded).not.toBeNull()
    })

    it('does not crash on second open (database already exists)', async () => {
      const dbName = uniqueDbName()

      // First open
      const s1 = new ImageStore(dbName)
      await s1.open()
      await s1.save('persist_key', new Blob(['data']))
      s1.close()

      // Second open — should not crash
      store = new ImageStore(dbName)
      await expect(store.open()).resolves.toBeUndefined()

      // Data should persist across opens
      const loaded = await store.load('persist_key')
      expect(loaded).not.toBeNull()
    })

    it('calling open() twice is a no-op (no error)', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()
      await expect(store.open()).resolves.toBeUndefined()
    })
  })

  // ─── TASK-012: Save & Load ─────────────────────────────────────────────────

  describe('TASK-012: save(), load(), delete()', () => {
    it('save("img_001", blob) then load("img_001") returns blob with same size and type', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' })
      await store.save('img_001', blob)
      const loaded = await store.load('img_001')

      expect(loaded).not.toBeNull()
      expect(loaded.size).toBe(blob.size)
      expect(loaded.type).toBe(blob.type)
    })

    it('load("non_existent_key") returns null (not an error)', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      const result = await store.load('non_existent_key')
      expect(result).toBeNull()
    })

    it('delete("img_001") then load("img_001") returns null', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      const blob = new Blob(['some image data'], { type: 'image/jpeg' })
      await store.save('img_001', blob)
      expect(await store.load('img_001')).not.toBeNull()

      await store.delete('img_001')
      expect(await store.load('img_001')).toBeNull()
    })

    it('save with same key overwrites previous value', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      const blob1 = new Blob(['first'], { type: 'image/png' })
      const blob2 = new Blob(['second blob content'], { type: 'image/png' })

      await store.save('key_a', blob1)
      await store.save('key_a', blob2)

      const loaded = await store.load('key_a')
      expect(loaded).not.toBeNull()
      expect(loaded.size).toBe(blob2.size)
    })

    it('throws when calling save before open()', async () => {
      store = new ImageStore(uniqueDbName())
      await expect(store.save('key', new Blob(['data']))).rejects.toThrow(/not open/)
    })
  })

  // ─── TASK-013: Storage Estimate ────────────────────────────────────────────

  describe('TASK-013: estimateStorageUsage()', () => {
    it('returns { used: number, available: number } with positive values', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      const result = await store.estimateStorageUsage()
      expect(typeof result.used).toBe('number')
      expect(typeof result.available).toBe('number')
      expect(result.used).toBeGreaterThanOrEqual(0)
      expect(result.available).toBeGreaterThan(0)
    })

    it('available = quota - usage', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      // Mock navigator.storage.estimate to return known values
      const origEstimate = navigator.storage?.estimate
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: async () => ({ usage: 5000, quota: 10000 }) },
        configurable: true,
      })

      const result = await store.estimateStorageUsage()
      expect(result.used).toBe(5000)
      expect(result.available).toBe(5000)

      // Restore original
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: origEstimate || (() => Promise.resolve({ usage: 0, quota: Infinity })) },
        configurable: true,
      })
    })

    it('returns { used: 0, available: Infinity } when navigator.storage.estimate is unavailable', async () => {
      store = new ImageStore(uniqueDbName())
      await store.open()

      // Remove navigator.storage
      const origStorage = navigator.storage
      Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })

      const result = await store.estimateStorageUsage()
      expect(result.used).toBe(0)
      expect(result.available).toBe(Infinity)

      // Restore
      Object.defineProperty(navigator, 'storage', { value: origStorage, configurable: true })
    })
  })
})
