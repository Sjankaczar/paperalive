/**
 * @file MaskHistory.js
 * @description Circular buffer undo/redo for mask edits.
 *
 * Stores deep-copied snapshots of BinaryMask after each brush gesture.
 * Maximum 20 snapshots by default (configurable). When capacity is exceeded,
 * the oldest snapshot is evicted (circular buffer behavior).
 *
 * Push after undo clears the redo buffer.
 *
 * @see architecture/module_design.md — MaskHistory.js
 */

const DEFAULT_MAX_SNAPSHOTS = 20

/**
 * Circular buffer for mask undo/redo history.
 *
 * Usage:
 *   const history = new MaskHistory(20)
 *   history.push(mask)       // save snapshot after gesture
 *   const prev = history.undo()   // go back
 *   const next = history.redo()   // go forward
 */
export class MaskHistory {
  /** @type {number} */
  #maxSnapshots

  /** @type {Uint8Array[]} */
  #snapshots

  /** @type {number} Index of current state (-1 = no state) */
  #pointer

  /**
   * @param {number} [maxSnapshots=20] - Maximum number of snapshots to retain
   */
  constructor(maxSnapshots = DEFAULT_MAX_SNAPSHOTS) {
    this.#maxSnapshots = maxSnapshots
    this.#snapshots = []
    this.#pointer = -1
  }

  /**
   * Save a deep copy of the current mask state.
   * Called after each brush gesture completes (pointerup/touchend).
   *
   * If the user has undone some states and then pushes a new one,
   * all redo states are discarded.
   *
   * If the buffer is at capacity, the oldest snapshot is evicted.
   *
   * @param {import('../types/characterData.js').BinaryMask} mask
   */
  push(mask) {
    // Deep copy the mask data
    const snapshot = new Uint8Array(mask.data.buffer.slice(0))

    // Discard any redo states beyond the current pointer
    if (this.#pointer < this.#snapshots.length - 1) {
      this.#snapshots.length = this.#pointer + 1
    }

    // Add new snapshot
    this.#snapshots.push(snapshot)
    this.#pointer = this.#snapshots.length - 1

    // Evict oldest if over capacity (circular buffer)
    if (this.#snapshots.length > this.#maxSnapshots) {
      this.#snapshots.shift()
      this.#pointer--
    }
  }

  /**
   * Undo: return the previous mask snapshot, or null if at the beginning.
   *
   * @returns {Uint8Array | null} Deep copy of the previous mask data
   */
  undo() {
    if (!this.canUndo) return null
    this.#pointer--
    return new Uint8Array(this.#snapshots[this.#pointer].buffer.slice(0))
  }

  /**
   * Redo: return the next mask snapshot, or null if at the end.
   *
   * @returns {Uint8Array | null} Deep copy of the next mask data
   */
  redo() {
    if (!this.canRedo) return null
    this.#pointer++
    return new Uint8Array(this.#snapshots[this.#pointer].buffer.slice(0))
  }

  /**
   * Whether undo is available (pointer > 0).
   * @returns {boolean}
   */
  get canUndo() {
    return this.#pointer > 0
  }

  /**
   * Whether redo is available (pointer < last snapshot).
   * @returns {boolean}
   */
  get canRedo() {
    return this.#pointer < this.#snapshots.length - 1
  }

  /**
   * Clear all history.
   */
  clear() {
    this.#snapshots.length = 0
    this.#pointer = -1
  }
}
