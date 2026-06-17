/**
 * @file MotionClipPlayer.js
 * @description Frame interpolation and time-based advancement for motion clips.
 *
 * Loads MotionClip JSON data, interpolates between frames, and advances
 * playback based on fps and delta time. Supports looping and one-shot clips.
 *
 * @see architecture/module_design.md — MotionResolver.js (depends on MotionClipPlayer)
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-105, TASK-106
 */

/**
 * @typedef {Object} MotionClipFrame
 * @property {Object<string, {dx: number, dy: number}>} joints - Per-joint offsets from rest
 */

/**
 * @typedef {Object} MotionClip
 * @property {string} id - Clip identifier
 * @property {number} fps - Frames per second (0 = static/single-frame)
 * @property {boolean} loop - Whether clip loops
 * @property {MotionClipFrame[]} frames - Array of frame data
 */

/**
 * Motion clip player — handles frame interpolation and time advancement.
 */
export class MotionClipPlayer {
  constructor() {
    /** @type {MotionClip | null} */
    this._clip = null

    /** Normalized temporal position [0, 1] */
    this._t = 0
  }

  /**
   * Load a motion clip.
   * @param {MotionClip} clipJson
   */
  loadClip(clipJson) {
    if (!clipJson || !clipJson.frames || clipJson.frames.length === 0) {
      throw new Error('MotionClipPlayer: invalid clip — frames array required')
    }
    this._clip = clipJson
    this._t = 0
  }

  /**
   * Set temporal position.
   * @param {number} t — 0.0 = start, 1.0 = end
   */
  setFrame(t) {
    if (!this._clip) return
    this._t = Math.max(0, Math.min(1, t))
  }

  /**
   * Get current normalized temporal position.
   * @returns {number}
   */
  get t() {
    return this._t
  }

  /**
   * Get the loaded clip (or null).
   * @returns {MotionClip | null}
   */
  get clip() {
    return this._clip
  }

  /**
   * Advance playback by dt milliseconds.
   * @param {number} dt — delta time in ms
   */
  advance(dt) {
    if (!this._clip || this._clip.fps <= 0) return

    const frameCount = this._clip.frames.length
    if (frameCount <= 1) return

    const frameDuration = 1000 / this._clip.fps
    const totalDuration = frameDuration * (frameCount - 1)

    // Advance t by the fraction of total duration
    const tIncrement = dt / totalDuration
    let newT = this._t + tIncrement

    if (this._clip.loop) {
      // Wrap around
      if (newT >= 1) {
        newT = newT % 1
      }
    } else {
      // Clamp to end
      if (newT >= 1) {
        newT = 1
      }
    }

    this._t = newT
  }

  /**
   * Get interpolated joint positions at current temporal position.
   *
   * @param {Map<string, [number, number]>} restPose — rest position per joint
   * @returns {Map<string, [number, number]>} — new Map with rest + clip offsets
   */
  getCurrentJoints(restPose) {
    const result = new Map()

    if (!this._clip) {
      // No clip — return rest pose as-is
      for (const [jointId, pos] of restPose) {
        result.set(jointId, [pos[0], pos[1]])
      }
      return result
    }

    const frames = this._clip.frames
    const frameCount = frames.length

    if (frameCount === 0) {
      for (const [jointId, pos] of restPose) {
        result.set(jointId, [pos[0], pos[1]])
      }
      return result
    }

    // Compute fractional frame index
    const maxFrameIndex = frameCount - 1
    const floatFrame = this._t * maxFrameIndex
    const frameA = Math.floor(floatFrame)
    const frameB = Math.min(frameA + 1, maxFrameIndex)
    const alpha = floatFrame - frameA

    const offsetsA = frames[frameA].joints
    const offsetsB = frames[frameB].joints

    // Interpolate offsets and add to rest pose
    for (const [jointId, restPos] of restPose) {
      const offA = offsetsA[jointId]
      const offB = offsetsB[jointId]

      let dx = 0
      let dy = 0

      if (offA && offB) {
        dx = offA.dx + (offB.dx - offA.dx) * alpha
        dy = offA.dy + (offB.dy - offA.dy) * alpha
      } else if (offA) {
        dx = offA.dx
        dy = offA.dy
      } else if (offB) {
        dx = offB.dx
        dy = offB.dy
      }

      result.set(jointId, [restPos[0] + dx, restPos[1] + dy])
    }

    return result
  }
}
