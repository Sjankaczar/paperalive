/**
 * @file IKDragHandler.js
 * @description Pointer hit-test and drag tracking for IK joint manipulation.
 *
 * Provides hit-testing against joint positions (within 20px radius) and
 * tracks the active drag target for the MotionResolver to consume.
 *
 * @see architecture/module_design.md — MotionResolver.js
 * @see architecture/interaction_design.md — hitTestJoint
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-107, TASK-108
 */

/** Hit-test radius in pixels. */
const HIT_RADIUS = 50

/**
 * IK drag handler — manages joint hit-testing and drag tracking.
 */
export class IKDragHandler {
  constructor() {
    /**
     * Current joint positions (interleaved x,y from ARAP solver).
     * Updated each frame via setCurrentPositions.
     * @type {Float32Array | null}
     */
    this._currentPositions = null

    /**
     * Active drag target, or null if not dragging.
     * @type {{ jointId: string, x: number, y: number } | null}
     */
    this._activeTarget = null
  }

  /**
   * Update current vertex positions from the ARAP solver.
   * @param {Float32Array} positions — interleaved [x0, y0, x1, y1, ...]
   */
  setCurrentPositions(positions) {
    this._currentPositions = positions
  }

  /**
   * Hit-test: find the closest joint within HIT_RADIUS of the pointer.
   *
   * @param {number} pointerX — pointer x in pixel space
   * @param {number} pointerY — pointer y in pixel space
   * @param {import('../types/characterData.js').PinMapping} pinMapping — joint-to-vertex mapping
   * @returns {string | null} — jointId of closest joint, or null if none in range
   */
  hitTest(pointerX, pointerY, pinMapping) {
    const positions = this._currentPositions
    if (!positions) return null

    let closestId = null
    let closestDistSq = HIT_RADIUS * HIT_RADIUS

    for (const pin of pinMapping) {
      const vIdx = pin.vertexIndex
      const vx = positions[vIdx * 2]
      const vy = positions[vIdx * 2 + 1]

      const dx = pointerX - vx
      const dy = pointerY - vy
      const distSq = dx * dx + dy * dy

      if (distSq <= closestDistSq) {
        closestDistSq = distSq
        closestId = pin.jointId
      }
    }

    return closestId
  }

  /**
   * Start dragging a joint.
   * @param {string} jointId
   * @param {number} x — initial pointer x
   * @param {number} y — initial pointer y
   */
  startDrag(jointId, x, y) {
    this._activeTarget = { jointId, x, y }
  }

  /**
   * Update drag target position.
   * @param {number} x
   * @param {number} y
   */
  updateDrag(x, y) {
    if (this._activeTarget) {
      this._activeTarget.x = x
      this._activeTarget.y = y
    }
  }

  /**
   * End the current drag.
   */
  endDrag() {
    this._activeTarget = null
  }

  /**
   * Get the active drag target.
   * @returns {{ jointId: string, x: number, y: number } | null}
   */
  getActiveTarget() {
    return this._activeTarget
  }
}
