/**
 * @file ImageStore.js
 * @description IndexedDB wrapper for image Blobs.
 * Part of the dual-storage strategy (geometry JSON → localStorage, image Blob → IndexedDB).
 *
 * Database: "paperalive_images"
 * Object store: "images" (keyPath: "key")
 *
 * @see architecture/module_design.md — ImageStore.js
 * @see architecture/characterdata.md — Storage V2
 */

const DEFAULT_DB_NAME = 'paperalive_images'
const STORE_NAME = 'images'
const DB_VERSION = 1

/**
 * IndexedDB wrapper for storing and retrieving image Blobs.
 *
 * Usage:
 *   const store = new ImageStore()
 *   await store.open()
 *   await store.save('img_001', blob)
 *   const blob = await store.load('img_001')
 *   await store.delete('img_001')
 */
export class ImageStore {
  /** @type {IDBDatabase | null} */
  #db = null

  /** @type {string} */
  #dbName

  /**
   * @param {string} [dbName] - IndexedDB database name (default: "paperalive_images")
   */
  constructor(dbName = DEFAULT_DB_NAME) {
    this.#dbName = dbName
  }

  /**
   * Open the IndexedDB database. Creates the object store on first run.
   * Safe to call multiple times — returns immediately if already open.
   *
   * @returns {Promise<void>}
   */
  async open() {
    if (this.#db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        this.#db = request.result
        resolve()
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * Save an image Blob under the given key.
   * Overwrites any existing entry with the same key.
   *
   * @param {string} key  - Unique key (e.g. "img_char_001_1718000000")
   * @param {Blob}   blob - Image Blob to store
   * @returns {Promise<void>}
   */
  async save(key, blob) {
    this.#ensureOpen()

    // Convert Blob to ArrayBuffer for reliable structured-clone across environments
    const buffer = await blob.arrayBuffer()
    const type = blob.type || ''

    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      store.put({ key, buffer, type })

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  /**
   * Load an image Blob by key.
   *
   * @param {string} key - Key to look up
   * @returns {Promise<Blob | null>} Blob if found, null if key does not exist
   */
  async load(key) {
    this.#ensureOpen()

    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)

      const getRequest = store.get(key)

      getRequest.onsuccess = () => {
        const record = getRequest.result
        if (record && record.buffer) {
          resolve(new Blob([record.buffer], { type: record.type || '' }))
        } else {
          resolve(null)
        }
      }

      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  /**
   * Delete an image Blob by key.
   * No error if the key does not exist.
   *
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async delete(key) {
    this.#ensureOpen()

    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      store.delete(key)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  /**
   * Estimate storage usage and available quota.
   * Uses navigator.storage.estimate() if available.
   *
   * @returns {Promise<{ used: number, available: number }>}
   *   used: bytes currently consumed,
   *   available: bytes remaining (quota - usage), or Infinity if API unavailable
   */
  async estimateStorageUsage() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return { used: 0, available: Infinity }
    }

    try {
      const estimate = await navigator.storage.estimate()
      const used = typeof estimate.usage === 'number' ? estimate.usage : 0
      const quota = typeof estimate.quota === 'number' ? estimate.quota : Infinity
      return { used, available: quota - used }
    } catch {
      return { used: 0, available: Infinity }
    }
  }

  /**
   * Close the database connection.
   * After closing, all operations will throw until open() is called again.
   */
  close() {
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
  }

  /**
   * @private
   * Throws if the database has not been opened.
   */
  #ensureOpen() {
    if (!this.#db) {
      throw new Error('ImageStore: database not open. Call open() first.')
    }
  }
}
