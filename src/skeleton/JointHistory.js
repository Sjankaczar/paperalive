/**
 * @file JointHistory.js
 * @description Undo/redo circular buffer for joint placement.
 *
 * Stores deep-cloned snapshots of JointPositionList.
 * Max capacity: configurable (default 10).
 *
 * @see architecture/module_design.md — JointHistory.js
 */

/**
 * Circular buffer for joint position history (undo/redo).
 */
export class JointHistory {
  /**
   * @param {number} [maxSnapshots=10] - Maximum number of snapshots to store
   */
  constructor(maxSnapshots = 10) {
    /** @type {number} */
    this._maxSnapshots = maxSnapshots

    /** @type {import('../types/characterData.js').JointPositionList[]} */
    this._buffer = []

    /** @type {number} Index of the current state (-1 = no history) */
    this._current = -1
  }

  /**
   * Push a new snapshot. Deep-clones the joint positions.
   * Clears any redo history.
   *
   * @param {import('../types/characterData.js').JointPositionList} joints
   */
  push(joints) {
    // Deep clone
    const snapshot = joints.map(j => ({ id: j.id, x: j.x, y: j.y }))

    // If we're not at the end, truncate redo history
    if (this._current < this._buffer.length - 1) {
      this._buffer = this._buffer.slice(0, this._current + 1)
    }

    this._buffer.push(snapshot)

    // Evict oldest if over capacity
    if (this._buffer.length > this._maxSnapshots) {
      this._buffer.shift()
      // _current stays the same (it now points to the new last element)
    } else {
      this._current++
    }
  }

  /**
   * Undo: go back one step.
   *
   * @returns {import('../types/characterData.js').JointPositionList | null}
   */
  undo() {
    if (!this.canUndo) return null
    this._current--
    return this._deepClone(this._buffer[this._current])
  }

  /**
   * Redo: go forward one step.
   *
   * @returns {import('../types/characterData.js').JointPositionList | null}
   */
  redo() {
    if (!this.canRedo) return null
    this._current++
    return this._deepClone(this._buffer[this._current])
  }

  /**
   * Whether undo is available.
   * @type {boolean}
   */
  get canUndo() {
    return this._current > 0
  }

  /**
   * Whether redo is available.
   * @type {boolean}
   */
  get canRedo() {
    return this._current < this._buffer.length - 1
  }

  /**
   * Clear all history.
   */
  clear() {
    this._buffer = []
    this._current = -1
  }

  /**
   * Deep clone a JointPositionList.
   * @param {import('../types/characterData.js').JointPositionList} joints
   * @returns {import('../types/characterData.js').JointPositionList}
   */
  _deepClone(joints) {
    return joints.map(j => ({ id: j.id, x: j.x, y: j.y }))
  }
}
