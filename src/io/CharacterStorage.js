/**
 * @file CharacterStorage.js
 * @description Orchestrator for dual-storage strategy:
 *   - geometry JSON → localStorage["paperalive_character_v2"]
 *   - image Blob   → IndexedDB via ImageStore
 *
 * TypedArrays are serialized as Base64 strings.
 * Maps are serialized as arrays of [key, value] pairs.
 * Workspace arrays are NOT serialized — they are reconstructed on load.
 *
 * @see architecture/module_design.md — CharacterStorage.js
 * @see architecture/characterdata.md — Storage V2
 */

import { ImageStore } from './ImageStore.js'

const LOCALSTORAGE_KEY = 'paperalive_character_v2'
const QUOTA_WARN_THRESHOLD = 20 * 1024 * 1024 // 20 MB

/** @type {ImageStore | null} */
let imageStore = null

/**
 * Lazily get the shared ImageStore instance (opens on first call).
 * @returns {Promise<ImageStore>}
 */
async function getImageStore() {
  if (!imageStore) {
    imageStore = new ImageStore()
    await imageStore.open()
  }
  return imageStore
}

// ─── Base64 encode/decode for TypedArrays ─────────────────────────────────────

/**
 * Encode a TypedArray to a Base64 string.
 * @param {Float32Array|Int32Array|Uint16Array|Uint8Array} typedArray
 * @returns {string}
 */
function typedArrayToBase64(typedArray) {
  const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decode a Base64 string to a TypedArray of the given constructor.
 * @param {string} base64
 * @param {new (buffer: ArrayBuffer) => T} Ctor  e.g. Float32Array, Int32Array
 * @returns {Float32Array|Int32Array|Uint16Array|Uint8Array}
 */
function base64ToTypedArray(base64, Ctor) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Ctor(bytes.buffer)
}

/** Map from constructor name → constructor for TypedArray deserialization. */
const TYPED_ARRAY_CTORS = {
  Float32Array,
  Int32Array,
  Uint16Array,
  Uint8Array,
  Float64Array,
}

// ─── Generic object serialization ─────────────────────────────────────────────

/**
 * Recursively serialize an object, encoding all TypedArrays as Base64.
 * Maps are converted to arrays of [key, value] pairs.
 * Arrays are traversed element-by-element.
 *
 * @param {*} obj
 * @returns {*}
 */
function serializeData(obj) {
  if (obj === null || obj === undefined) return obj

  if (ArrayBuffer.isView(obj)) {
    return { __ta: true, type: obj.constructor.name, data: typedArrayToBase64(obj) }
  }

  if (obj instanceof Map) {
    return { __map: true, entries: Array.from(obj.entries()).map(([k, v]) => [k, serializeData(v)]) }
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeData)
  }

  if (typeof obj === 'object') {
    const result = {}
    for (const key of Object.keys(obj)) {
      result[key] = serializeData(obj[key])
    }
    return result
  }

  return obj
}

/**
 * Recursively deserialize an object produced by serializeData().
 * TypedArray tokens are decoded back to the correct typed array.
 * Map tokens are restored as Map instances.
 *
 * @param {*} obj
 * @returns {*}
 */
function deserializeData(obj) {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'object' && obj.__ta) {
    const Ctor = TYPED_ARRAY_CTORS[obj.type]
    return Ctor ? base64ToTypedArray(obj.data, Ctor) : obj.data
  }

  if (typeof obj === 'object' && obj.__map) {
    return new Map(obj.entries.map(([k, v]) => [k, deserializeData(v)]))
  }

  if (Array.isArray(obj)) {
    return obj.map(deserializeData)
  }

  if (typeof obj === 'object') {
    const result = {}
    for (const key of Object.keys(obj)) {
      result[key] = deserializeData(obj[key])
    }
    return result
  }

  return obj
}

// ─── Workspace reconstruction ─────────────────────────────────────────────────

/**
 * Reconstruct pre-allocated workspace arrays from geometry metadata.
 * Workspace is never serialized — it is rebuilt from vertexCount on load.
 *
 * @param {number} vertexCount
 * @returns {{ rotations: Float32Array, rhs_x: Float64Array, rhs_y: Float64Array, outlineNormals: Float32Array, interleavedBuffer: Float32Array }}
 */
function reconstructWorkspace(vertexCount) {
  return {
    rotations: new Float32Array(4 * vertexCount),
    rhs_x: new Float64Array(vertexCount),
    rhs_y: new Float64Array(vertexCount),
    outlineNormals: new Float32Array(2 * vertexCount),
    interleavedBuffer: new Float32Array(6 * vertexCount),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save CharacterData to dual storage:
 *   1. Check quota (< 20MB → log warning)
 *   2. Serialize geometry/skeleton/meta/pinMapping to JSON (TypedArrays → Base64)
 *   3. Save JSON to localStorage["paperalive_character_v2"]
 *   4. Save image Blob to IndexedDB via ImageStore
 *
 * @param {import('../types/characterData.js').CharacterData} data
 * @param {Blob}  imageBlob  - The image Blob to store in IndexedDB
 * @param {string} [name]    - Optional character name (defaults to data.meta.name)
 * @returns {Promise<void>}
 */
export async function saveCharacter(data, imageBlob, name) {
  const store = await getImageStore()

  // 1. Quota check
  const estimate = await store.estimateStorageUsage()
  if (estimate.available !== Infinity && estimate.available < QUOTA_WARN_THRESHOLD) {
    console.warn(
      'PaperAlive: Storage hampir penuh. Karakter mungkin tidak tersimpan.',
      `Available: ${(estimate.available / 1024 / 1024).toFixed(1)} MB`
    )
  }

  // 2. Build storage object and serialize
  const storageObj = {
    meta: { ...data.meta, name: name || data.meta?.name || 'Character' },
    image: data.image,
    geometry: data.geometry,
    skeleton: data.skeleton,
    pinMapping: data.pinMapping,
    partGroups: data.partGroups,
    arap: data.arap
      ? {
          cotWeightsFlat: data.arap.cotWeightsFlat,
          neighborOffsets: data.arap.neighborOffsets,
          neighborList: data.arap.neighborList,
          laplacianSparse: data.arap.laplacianSparse,
          pinnedVertices: data.arap.pinnedVertices,
          choleskyAllPinned: data.arap.choleskyAllPinned,
          choleskyFree: data.arap.choleskyFree,
        }
      : null,
  }

  const json = JSON.stringify(serializeData(storageObj))

  // 3. Save geometry JSON to localStorage
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, json)
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      throw new Error('QUOTA_EXCEEDED')
    }
    throw err
  }

  // 4. Save image Blob to IndexedDB
  if (data.image?.idbKey && imageBlob) {
    await store.save(data.image.idbKey, imageBlob)
  }
}

/**
 * Load CharacterData from dual storage:
 *   1. Read JSON from localStorage
 *   2. Deserialize Base64 → TypedArrays, restore Maps
 *   3. Load image Blob from IndexedDB via ImageStore
 *   4. Reconstruct workspace arrays from geometry vertexCount
 *   5. Return CharacterData (or null if nothing saved)
 *
 * @returns {Promise<{ data: import('../types/characterData.js').CharacterData, imageBlob: Blob } | null>}
 */
export async function loadCharacter() {
  const json = localStorage.getItem(LOCALSTORAGE_KEY)
  if (!json) return null

  let raw
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }

  const parsed = deserializeData(raw)

  // Reconstruct workspace arrays from vertexCount
  const vertexCount = parsed.geometry?.vertexCount || 0
  parsed.arap = parsed.arap || {}
  parsed.arap.workspace = reconstructWorkspace(vertexCount)

  // Load image Blob from IndexedDB
  const store = await getImageStore()
  let imageBlob = null
  if (parsed.image?.idbKey) {
    imageBlob = await store.load(parsed.image.idbKey)
  }

  return { data: parsed, imageBlob }
}

/**
 * Synchronously check whether a saved character exists in localStorage.
 * @returns {boolean}
 */
export function hasCharacter() {
  return localStorage.getItem(LOCALSTORAGE_KEY) !== null
}

/**
 * Delete saved character from both localStorage and IndexedDB.
 * @returns {Promise<void>}
 */
export async function deleteCharacter() {
  const json = localStorage.getItem(LOCALSTORAGE_KEY)

  if (json) {
    try {
      const raw = JSON.parse(json)
      const parsed = deserializeData(raw)
      if (parsed.image?.idbKey) {
        const store = await getImageStore()
        await store.delete(parsed.image.idbKey)
      }
    } catch {
      // Ignore parse errors — still remove localStorage entry
    }
  }

  localStorage.removeItem(LOCALSTORAGE_KEY)
}
