// @main-thread
/**
 * @file buildCharacterData.js
 * @description Thin wrapper that manages the preprocessing Worker lifecycle.
 *
 * Responsibilities:
 *   - Initialize preprocessing.worker.js
 *   - Transfer alphaMask as Transferable (zero-copy)
 *   - Store image Blob to IndexedDB via ImageStore
 *   - Relay progress events to onProgress callback
 *   - Receive result → reconstruct CharacterData with CholeskyFactor instances
 *   - Handle errors from Worker
 *   - Terminate Worker after completion
 *
 * @see architecture/module_design.md — buildCharacterData.js
 */

import { CholeskyFactor } from '../arap/sparse/CholeskyFactor.js'
import { ImageStore } from '../io/ImageStore.js'

// ─── TASK-079/080: Main Thread Wrapper ───────────────────────────────────────

/**
 * Reconstruct CholeskyFactor instances from serialized plain objects
 * received via postMessage (structured clone).
 *
 * @param {Object} serialized - Plain object with lowerL_colPtr, lowerL_rowIdx, lowerL_vals, n, nnz, weightMode
 * @returns {import('../arap/sparse/CholeskyFactor.js').CholeskyFactor}
 */
export function reconstructCholeskyFactor(serialized) {
  const factor = new CholeskyFactor(
    serialized.lowerL_colPtr,
    serialized.lowerL_rowIdx,
    serialized.lowerL_vals,
    serialized.n,
  )
  factor.weightMode = serialized.weightMode
  return factor
}

/**
 * Reconstruct full CharacterData from the serialized worker result.
 * Converts plain Cholesky objects back to CholeskyFactor instances.
 *
 * @param {Object} raw - Raw charData from Worker postMessage
 * @returns {import('../types/characterData.js').CharacterData}
 */
export function reconstructCharacterData(raw) {
  raw.arap.choleskyAllPinned = reconstructCholeskyFactor(raw.arap.choleskyAllPinned)
  raw.arap.choleskyFree = reconstructCholeskyFactor(raw.arap.choleskyFree)
  return raw
}

/**
 * Build CharacterData by running the full preprocessing pipeline in a Web Worker.
 *
 * Pipeline: MorphologicalCleaner → ContourTracer → PolySimplifier →
 *           InteriorSampler → MeshBuilder → SkeletonMapper → ARAPPrecompute
 *
 * The alphaMask.buffer is transferred as a Transferable (zero-copy).
 * After this call, mask.data.byteLength === 0 — the caller MUST NOT access it again.
 *
 * @param {import('../types/characterData.js').LoadedImage} image - Loaded and decoded image
 * @param {import('../types/characterData.js').BinaryMask} mask - Binary mask (will be transferred!)
 * @param {import('../types/characterData.js').JointPositionList} jointPositions - Joint positions
 * @param {"humanoid"|"freeform"} characterType - Character type
 * @param {{ vertexBudget?: number, dpEpsilonMin?: number }} [options] - Optional settings
 * @param {function(string, number): void} [onProgress] - Progress callback (step, value)
 * @returns {Promise<import('../types/characterData.js').CharacterData>}
 */
export async function buildCharacterData(image, mask, jointPositions, characterType, options, onProgress) {
  // Create Worker using Vite's ?worker suffix resolution
  const worker = new Worker(
    new URL('./workers/preprocessing.worker.js', import.meta.url),
    { type: 'module' },
  )

  // Store image Blob to IndexedDB (TASK-079)
  const idbKey = `paperalive_${Date.now()}`
  const imageStore = new ImageStore()
  await imageStore.open()
  // Create a Blob from the image data for storage
  const imageBlob = await imageDataToBlob(image)
  await imageStore.save(idbKey, imageBlob)

  return new Promise((resolve, reject) => {
    /**
     * Handle messages from the Worker (TASK-080).
     * @param {MessageEvent} e
     */
    worker.onmessage = function (e) {
      const msg = e.data

      switch (msg.type) {
        case 'progress':
          // Relay progress to callback
          if (onProgress) {
            onProgress(msg.step, msg.value)
          }
          break

        case 'result': {
          // Reconstruct CharacterData with CholeskyFactor instances
          const charData = reconstructCharacterData(msg.charData)
          charData.image.idbKey = idbKey
          worker.terminate()
          resolve(charData)
          break
        }

        case 'error': {
          // Reject with error object containing errorCode
          const err = new Error(msg.message)
          err.errorCode = msg.errorCode
          err.affectedStep = msg.affectedStep
          worker.terminate()
          reject(err)
          break
        }

        default:
          break
      }
    }

    /**
     * Handle Worker errors (crash, load failure).
     * @param {ErrorEvent} e
     */
    worker.onerror = function (e) {
      const err = new Error(e.message || 'Worker crashed')
      err.errorCode = 'WORKER_CRASHED'
      err.affectedStep = 'worker'
      worker.terminate()
      reject(err)
    }

    // Transfer alphaMask as Transferable (zero-copy) — TASK-079
    // After this, mask.data.buffer is detached (byteLength === 0)
    const transferable = mask.data.buffer
    worker.postMessage(
      {
        alphaMask: transferable,
        jointPositions,
        imageWidth: mask.width,
        imageHeight: mask.height,
        characterType,
        options: options || {},
      },
      [transferable],
    )
  })
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Convert a LoadedImage to a Blob for IndexedDB storage.
 *
 * @param {import('../types/characterData.js').LoadedImage} image
 * @returns {Blob}
 */
function imageDataToBlob(image) {
  // Create a temporary canvas to encode ImageData as PNG Blob
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(image.imageData, 0, 0)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
