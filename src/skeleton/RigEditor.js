/**
 * @file RigEditor.js
 * @description Interactive canvas 2D editor for skeleton joint placement.
 *
 * Features:
 *   - Render joint handles with color coding (default/hovered/dragged/warning)
 *   - Render skeleton bone connections
 *   - Drag-and-drop joint correction via pointer events
 *   - Hit testing for joint selection
 *   - Mesh boundary reference for distance warning (isTooFar)
 *   - Freeform mode: add/remove joints, min 3 / max 20
 *
 * Main-thread only (uses canvas DOM).
 *
 * @see architecture/module_design.md — RigEditor.js
 * @see architecture/interaction_design.md — Step 3
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const JOINT_RADIUS = 8
const DRAG_RADIUS = 12
const HIT_RADIUS = 12
const TOO_FAR_THRESHOLD = 20

const COLORS = {
  default: '#FF6B6B',   // coral red
  hovered: '#FFE66D',   // yellow
  dragged: '#4ECDC4',   // teal
  warning: '#FF8C00',   // orange
  bone: '#FFFFFF',      // white bone lines
  label: '#FFFFFF',     // white labels
}

/**
 * Humanoid bone connections (parent → child from skeleton hierarchy).
 * @type {Array<[string, string]>}
 */
const HUMANOID_BONES = [
  ['neck', 'head'],
  ['neck', 'l_shoulder'],
  ['l_shoulder', 'l_elbow'],
  ['l_elbow', 'l_wrist'],
  ['neck', 'r_shoulder'],
  ['r_shoulder', 'r_elbow'],
  ['r_elbow', 'r_wrist'],
  ['neck', 'l_hip'],
  ['l_hip', 'l_knee'],
  ['l_knee', 'l_ankle'],
  ['neck', 'r_hip'],
  ['r_hip', 'r_knee'],
  ['r_knee', 'r_ankle'],
]

// ─── Hit Testing ─────────────────────────────────────────────────────────────

/**
 * Hit test to find which joint is under the cursor.
 *
 * @param {number} x - Cursor x
 * @param {number} y - Cursor y
 * @param {import('../types/characterData.js').JointPositionList} joints
 * @param {number} [radius=HIT_RADIUS]
 * @returns {string | null} jointId of the closest hit, or null
 */
export function hitTestJoint(x, y, joints, radius = HIT_RADIUS) {
  let bestId = null
  let bestDist = radius * radius + 1

  for (const joint of joints) {
    const dx = joint.x - x
    const dy = joint.y - y
    const distSq = dx * dx + dy * dy
    if (distSq <= radius * radius && distSq < bestDist) {
      bestDist = distSq
      bestId = joint.id
    }
  }

  return bestId
}

// ─── RigEditor Class ─────────────────────────────────────────────────────────

export class RigEditor {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../types/characterData.js').JointPositionList} joints
   */
  constructor(canvas, joints) {
    /** @type {HTMLCanvasElement} */
    this._canvas = canvas
    /** @type {CanvasRenderingContext2D | null} */
    this._ctx = canvas.getContext('2d')

    /** @type {import('../types/characterData.js').JointPositionList} */
    this._joints = joints.map(j => ({ id: j.id, x: j.x, y: j.y }))

    /** @type {Array<{x: number, y: number}> | null} */
    this._meshBoundary = null

    /** @type {string | null} Currently hovered joint */
    this._hoveredJoint = null
    /** @type {string | null} Currently dragged joint */
    this._draggedJoint = null
    /** @type {{x: number, y: number} | null} */
    this._dragStartPos = null

    /** @type {boolean} Freeform mode enabled */
    this._freeformMode = false
    /** @type {number} Next auto-number for freeform joints */
    this._nextJointNum = this._computeNextJointNum()

    /** @type {((jointId: string, x: number, y: number) => void) | null} */
    this.onJointMoved = null

    /** @type {((joints: import('../types/characterData.js').JointPositionList) => void) | null} */
    this.onJointsChanged = null

    // Bind event handlers
    this._onPointerDown = this._handlePointerDown.bind(this)
    this._onPointerMove = this._handlePointerMove.bind(this)
    this._onPointerUp = this._handlePointerUp.bind(this)
    this._onContextMenu = this._handleContextMenu.bind(this)

    this._canvas.addEventListener('pointerdown', this._onPointerDown)
    this._canvas.addEventListener('pointermove', this._onPointerMove)
    this._canvas.addEventListener('pointerup', this._onPointerUp)
    this._canvas.addEventListener('contextmenu', this._onContextMenu)
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Get current joint positions.
   * @returns {import('../types/characterData.js').JointPositionList}
   */
  getJointPositions() {
    return this._joints.map(j => ({ id: j.id, x: j.x, y: j.y }))
  }

  /**
   * Set joint positions (e.g., from undo/redo).
   * @param {import('../types/characterData.js').JointPositionList} joints
   */
  setJointPositions(joints) {
    this._joints = joints.map(j => ({ id: j.id, x: j.x, y: j.y }))
    this.render()
  }

  /**
   * Set mesh boundary for distance warning.
   * @param {Array<{x: number, y: number}>} boundary - SimplifiedContour
   */
  setMeshBoundary(boundary) {
    this._meshBoundary = boundary
  }

  /**
   * Enable or disable freeform mode.
   * @param {boolean} enabled
   */
  setFreeformMode(enabled) {
    this._freeformMode = enabled
  }

  /**
   * Render the skeleton overlay.
   */
  render() {
    const ctx = this._ctx
    if (!ctx) return
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)

    // Draw bone connections
    this._drawBones(ctx)

    // Draw joints
    for (const joint of this._joints) {
      this._drawJoint(ctx, joint)
    }
  }

  /**
   * Clean up event listeners.
   */
  destroy() {
    this._canvas.removeEventListener('pointerdown', this._onPointerDown)
    this._canvas.removeEventListener('pointermove', this._onPointerMove)
    this._canvas.removeEventListener('pointerup', this._onPointerUp)
    this._canvas.removeEventListener('contextmenu', this._onContextMenu)
  }

  // ─── Rendering ─────────────────────────────────────────────────────────

  /**
   * Draw bone connections between joints.
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawBones(ctx) {
    const jointMap = new Map()
    for (const j of this._joints) {
      jointMap.set(j.id, j)
    }

    ctx.strokeStyle = COLORS.bone
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.7

    // Use humanoid bones if we have standard joints, otherwise connect sequentially
    const bones = this._isHumanoid() ? HUMANOID_BONES : this._buildFreeformBones()

    for (const [parentId, childId] of bones) {
      const parent = jointMap.get(parentId)
      const child = jointMap.get(childId)
      if (!parent || !child) continue

      ctx.beginPath()
      ctx.moveTo(parent.x, parent.y)
      ctx.lineTo(child.x, child.y)
      ctx.stroke()
    }

    ctx.globalAlpha = 1.0
  }

  /**
   * Draw a single joint handle.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ id: string, x: number, y: number }} joint
   */
  _drawJoint(ctx, joint) {
    const isHovered = this._hoveredJoint === joint.id
    const isDragged = this._draggedJoint === joint.id
    const isTooFar = this._computeIsTooFar(joint)

    // Determine color
    let color = COLORS.default
    if (isDragged) color = COLORS.dragged
    else if (isHovered) color = COLORS.hovered
    else if (isTooFar) color = COLORS.warning

    const radius = isDragged ? DRAG_RADIUS : JOINT_RADIUS

    // Draw circle
    ctx.beginPath()
    ctx.arc(joint.x, joint.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw label on hover or drag
    if (isHovered || isDragged) {
      ctx.font = '12px Inter, sans-serif'
      ctx.fillStyle = COLORS.label
      ctx.fillText(joint.id, joint.x + 14, joint.y - 6)
    }

    // Draw tooltip for too-far joints on hover
    if (isTooFar && isHovered) {
      this._drawTooltip(ctx, joint.x, joint.y - 20, 'Joint terlalu jauh dari karakter')
    }
  }

  /**
   * Draw a tooltip above a joint.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {string} text
   */
  _drawTooltip(ctx, x, y, text) {
    ctx.font = '11px Inter, sans-serif'
    const metrics = ctx.measureText(text)
    const padding = 4
    const w = metrics.width + padding * 2
    const h = 18

    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillRect(x - w / 2, y - h, w, h)

    ctx.fillStyle = '#FF8C00'
    ctx.textAlign = 'center'
    ctx.fillText(text, x, y - 4)
    ctx.textAlign = 'start'
  }

  // ─── Event Handlers ────────────────────────────────────────────────────

  /**
   * Helper to get scaled pointer coordinates.
   * @param {PointerEvent|MouseEvent} e
   * @returns {{x: number, y: number}}
   */
  _getScaledPointerPos(e) {
    const rect = this._canvas.getBoundingClientRect()
    // Compute scaling factor between physical CSS size and logical canvas size
    const scaleX = this._canvas.width / rect.width
    const scaleY = this._canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  /**
   * @param {PointerEvent} e
   */
  _handlePointerDown(e) {
    const { x, y } = this._getScaledPointerPos(e)

    const hitId = hitTestJoint(x, y, this._joints)

    if (hitId) {
      this._draggedJoint = hitId
      this._dragStartPos = { x, y }
      if (this._canvas.setPointerCapture) {
        this._canvas.setPointerCapture(e.pointerId)
      }
    } else if (this._freeformMode) {
      // Add new joint in freeform mode
      this._addJoint(x, y)
    }
  }

  /**
   * @param {PointerEvent} e
   */
  _handlePointerMove(e) {
    const { x, y } = this._getScaledPointerPos(e)

    // Update hover state
    this._hoveredJoint = hitTestJoint(x, y, this._joints)

    // Update dragged joint position
    if (this._draggedJoint) {
      const joint = this._joints.find(j => j.id === this._draggedJoint)
      if (joint) {
        joint.x = x
        joint.y = y
      }
    }

    this.render()
  }

  /**
   * @param {PointerEvent} e
   */
  _handlePointerUp(e) {
    if (this._draggedJoint) {
      const joint = this._joints.find(j => j.id === this._draggedJoint)
      if (joint && this.onJointMoved) {
        this.onJointMoved(joint.id, joint.x, joint.y)
      }
      this._draggedJoint = null
      this._dragStartPos = null
      if (this._canvas.releasePointerCapture) {
        this._canvas.releasePointerCapture(e.pointerId)
      }
    }

    this.render()
  }

  /**
   * @param {MouseEvent} e
   */
  _handleContextMenu(e) {
    if (!this._freeformMode) return

    e.preventDefault()

    const { x, y } = this._getScaledPointerPos(e)

    const hitId = hitTestJoint(x, y, this._joints)
    if (hitId) {
      this._removeJoint(hitId)
    }
  }

  // ─── Freeform Mode ─────────────────────────────────────────────────────

  /**
   * Add a new joint in freeform mode.
   * @param {number} x
   * @param {number} y
   */
  _addJoint(x, y) {
    if (this._joints.length >= 20) return // max 20

    const id = `joint_${this._nextJointNum}`
    this._nextJointNum++
    this._joints.push({ id, x, y })

    if (this.onJointsChanged) {
      this.onJointsChanged(this.getJointPositions())
    }
    this.render()
  }

  /**
   * Remove a joint in freeform mode.
   * @param {string} jointId
   */
  _removeJoint(jointId) {
    if (this._joints.length <= 3) return // min 3

    this._joints = this._joints.filter(j => j.id !== jointId)

    if (this.onJointsChanged) {
      this.onJointsChanged(this.getJointPositions())
    }
    this.render()
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Check if the current joints represent a humanoid skeleton.
   * @returns {boolean}
   */
  _isHumanoid() {
    const ids = new Set(this._joints.map(j => j.id))
    return ids.has('head') && ids.has('neck') && ids.has('l_shoulder')
  }

  /**
   * Compute the next auto-number for freeform joints based on existing IDs.
   * @returns {number}
   */
  _computeNextJointNum() {
    let max = -1
    for (const j of this._joints) {
      const match = j.id.match(/^joint_(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > max) max = num
      }
    }
    return max + 1
  }

  /**
   * Build simple sequential bones for freeform mode.
   * @returns {Array<[string, string]>}
   */
  _buildFreeformBones() {
    const bones = []
    for (let i = 0; i < this._joints.length - 1; i++) {
      bones.push([this._joints[i].id, this._joints[i + 1].id])
    }
    return bones
  }

  /**
   * Compute whether a joint is too far from the mesh boundary.
   * @param {{ x: number, y: number }} joint
   * @returns {boolean}
   */
  _computeIsTooFar(joint) {
    if (!this._meshBoundary || this._meshBoundary.length === 0) return false

    let minDist = Infinity
    for (const bp of this._meshBoundary) {
      const dx = joint.x - bp.x
      const dy = joint.y - bp.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) minDist = d
    }

    return minDist > TOO_FAR_THRESHOLD
  }
}
