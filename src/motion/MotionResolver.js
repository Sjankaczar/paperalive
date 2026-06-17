/**
 * @file MotionResolver.js
 * @description Single interface that combines motion clip playback, IK drag,
 * and idle rest pose into a unified per-frame joint target resolver.
 *
 * Modes (priority order):
 * 1. Drag mode — dragged joint follows pointer, others follow clip/rest
 * 2. Clip mode — joints follow motion clip interpolation
 * 3. Idle mode — all joints at rest positions
 *
 * @see architecture/module_design.md — MotionResolver.js
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-109, TASK-110, TASK-111
 */

import { MotionClipPlayer } from './MotionClipPlayer.js'
import { IKDragHandler } from './IKDragHandler.js'

/**
 * Motion resolver — combines clip, drag, and idle into per-frame joint targets.
 */
export class MotionResolver {
  /**
   * @param {import('../types/characterData.js').CharacterData} charData
   */
  constructor(charData) {
    /** @type {import('../types/characterData.js').CharacterData} */
    this._charData = charData

    /** @type {MotionClipPlayer} */
    this._clipPlayer = new MotionClipPlayer()

    /** @type {IKDragHandler} */
    this._dragHandler = new IKDragHandler()

    /** @type {Map<string, [number, number]>} — cached rest pose from pinMapping */
    this._restPose = new Map()

    /** @type {Map<string, MotionClip>} — loaded clip cache */
    this._clipCache = new Map()

    /** Current mode: 'idle' | 'clip' */
    this._mode = 'idle'

    // Build rest pose from pinMapping + geometry.vertices0
    this._buildRestPose()
  }

  /**
   * Build the rest pose Map from CharacterData.
   * @private
   */
  _buildRestPose() {
    const vertices0 = this._charData.geometry.vertices0
    for (const pin of this._charData.pinMapping) {
      const vIdx = pin.vertexIndex
      this._restPose.set(pin.jointId, [
        vertices0[vIdx * 2],
        vertices0[vIdx * 2 + 1],
      ])
    }
  }

  /**
   * Get the rest pose Map.
   * @returns {Map<string, [number, number]>}
   */
  get restPose() {
    return this._restPose
  }

  /**
   * Get the clip player.
   * @returns {MotionClipPlayer}
   */
  get clipPlayer() {
    return this._clipPlayer
  }

  /**
   * Get the drag handler.
   * @returns {IKDragHandler}
   */
  get dragHandler() {
    return this._dragHandler
  }

  /**
   * Get the current mode.
   * @returns {'idle' | 'clip'}
   */
  get mode() {
    return this._mode
  }

  /**
   * Get the pinMapping from CharacterData.
   * @returns {import('../types/characterData.js').PinMapping}
   */
  get pinMapping() {
    return this._charData.pinMapping
  }

  // ─── Architecture API ──────────────────────────────────────────────────────

  /**
   * Register a clip for later playback.
   * @param {string} clipId
   * @param {Object} clipData — MotionClip JSON
   */
  registerClip(clipId, clipData) {
    this._clipCache.set(clipId, clipData)
  }

  /**
   * Play a motion clip by ID.
   * @param {string} clipId
   */
  playClip(clipId) {
    const clipData = this._clipCache.get(clipId)
    if (!clipData) {
      throw new Error(`MotionResolver: clip "${clipId}" not registered`)
    }
    this._clipPlayer.loadClip(clipData)
    this._mode = 'clip'
  }

  /**
   * Stop the current clip and return to idle.
   */
  stopClip() {
    this._clipPlayer.loadClip({ id: '__idle', fps: 0, loop: true, frames: [{ joints: {} }] })
    this._mode = 'idle'
  }

  /**
   * Set a drag target for a specific joint (architecture API).
   * @param {string} jointId
   * @param {number} x
   * @param {number} y
   */
  setDragTarget(jointId, x, y) {
    this._dragHandler.startDrag(jointId, x, y)
  }

  /**
   * Clear the drag target (architecture API).
   */
  clearDragTarget() {
    this._dragHandler.endDrag()
  }

  // ─── Task API (aliases) ────────────────────────────────────────────────────

  /**
   * Set the active clip (or null for idle).
   * @param {string | null} clipId
   */
  setClip(clipId) {
    if (clipId === null) {
      this.stopClip()
    } else {
      this.playClip(clipId)
    }
  }

  /**
   * Start dragging a joint.
   * @param {string} jointId
   * @param {number} x
   * @param {number} y
   */
  startDrag(jointId, x, y) {
    this._dragHandler.startDrag(jointId, x, y)
  }

  /**
   * Update the drag position.
   * @param {number} x
   * @param {number} y
   */
  updateDrag(x, y) {
    this._dragHandler.updateDrag(x, y)
  }

  /**
   * End the current drag.
   */
  endDrag() {
    this._dragHandler.endDrag()
  }

  // ─── Resolve ───────────────────────────────────────────────────────────────

  /**
   * Resolve joint targets for the current frame.
   *
   * Priority: drag > clip > idle.
   * - Drag: dragged joint at target position, others at clip/rest.
   * - Clip: all joints follow clip interpolation.
   * - Idle: all joints at rest positions.
   *
   * @param {number} dt — delta time in ms
   * @returns {Map<string, [number, number]>}
   */
  resolve(dt) {
    // Advance clip player if in clip mode
    if (this._mode === 'clip') {
      this._clipPlayer.advance(dt)
    }

    // Get base positions from clip or idle
    let targets
    if (this._mode === 'clip') {
      targets = this._clipPlayer.getCurrentJoints(this._restPose)
    } else {
      // Idle: return rest pose copies
      targets = new Map()
      for (const [jointId, pos] of this._restPose) {
        targets.set(jointId, [pos[0], pos[1]])
      }
    }

    // Override with drag target if active
    const dragTarget = this._dragHandler.getActiveTarget()
    if (dragTarget) {
      targets.set(dragTarget.jointId, [dragTarget.x, dragTarget.y])
    }

    return targets
  }
}
