/**
 * @file RigEditor.test.js
 * @description Unit tests for RigEditor.js — covers TASK-046 through TASK-049, TASK-051.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RigEditor, hitTestJoint } from './RigEditor.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCanvas(width = 400, height = 400) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // jsdom returns zero-size bounding rect — mock it for pointer coordinate scaling
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: width, bottom: height,
    width, height,
    x: 0, y: 0, toJSON: () => {},
  })
  return canvas
}

function makeHumanoidJoints() {
  return [
    { id: 'head', x: 200, y: 30 },
    { id: 'neck', x: 200, y: 70 },
    { id: 'l_shoulder', x: 160, y: 80 },
    { id: 'r_shoulder', x: 240, y: 80 },
    { id: 'l_elbow', x: 140, y: 140 },
    { id: 'r_elbow', x: 260, y: 140 },
    { id: 'l_wrist', x: 130, y: 200 },
    { id: 'r_wrist', x: 270, y: 200 },
    { id: 'l_hip', x: 180, y: 220 },
    { id: 'r_hip', x: 220, y: 220 },
    { id: 'l_knee', x: 175, y: 300 },
    { id: 'r_knee', x: 225, y: 300 },
    { id: 'l_ankle', x: 170, y: 370 },
    { id: 'r_ankle', x: 230, y: 370 },
  ]
}

// ─── TASK-048: Hit Testing ──────────────────────────────────────────────────

describe('TASK-048: RigEditor — Hit Testing', () => {
  it('hitTestJoint returns jointId when within radius', () => {
    const joints = [{ id: 'head', x: 100, y: 100 }]

    const result = hitTestJoint(108, 100, joints)
    expect(result).toBe('head')
  })

  it('hitTestJoint returns null when outside radius', () => {
    const joints = [{ id: 'head', x: 100, y: 100 }]

    const result = hitTestJoint(115, 100, joints)
    expect(result).toBeNull()
  })

  it('closest joint is chosen when two are near', () => {
    const joints = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 105, y: 100 },
    ]

    const result = hitTestJoint(104, 100, joints)
    expect(result).toBe('b')
  })

  it('custom radius works', () => {
    const joints = [{ id: 'head', x: 100, y: 100 }]

    expect(hitTestJoint(106, 100, joints, 5)).toBeNull()
    expect(hitTestJoint(104, 100, joints, 5)).toBe('head')
  })
})

// ─── TASK-046: Canvas Setup & Joint Rendering ───────────────────────────────

describe('TASK-046: RigEditor — Canvas Setup & Rendering', () => {
  let canvas
  let editor

  beforeEach(() => {
    canvas = makeCanvas()
    editor = new RigEditor(canvas, makeHumanoidJoints())
  })

  it('renders 14 joints without error', () => {
    expect(() => editor.render()).not.toThrow()
  })

  it('getJointPositions returns 14 joints', () => {
    const positions = editor.getJointPositions()
    expect(positions.length).toBe(14)
  })

  it('setJointPositions updates positions', () => {
    const newJoints = makeHumanoidJoints()
    newJoints[0].x = 999

    editor.setJointPositions(newJoints)
    const positions = editor.getJointPositions()
    expect(positions[0].x).toBe(999)
  })

  it('destroy removes event listeners without error', () => {
    expect(() => editor.destroy()).not.toThrow()
  })
})

// ─── TASK-047: Drag Interaction ─────────────────────────────────────────────

describe('TASK-047: RigEditor — Drag Interaction', () => {
  let canvas
  let editor

  beforeEach(() => {
    canvas = makeCanvas()
    editor = new RigEditor(canvas, makeHumanoidJoints())
  })

  it('onJointMoved is called after drag completes', () => {
    let movedJoint = null
    let movedX = 0
    let movedY = 0
    let callCount = 0

    editor.onJointMoved = (id, x, y) => {
      movedJoint = id
      movedX = x
      movedY = y
      callCount++
    }

    // Simulate drag on head joint (at 200, 30)
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 30, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, clientY: 50, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 250, clientY: 50, pointerId: 1 }))

    expect(movedJoint).toBe('head')
    expect(movedX).toBe(250)
    expect(movedY).toBe(50)
    expect(callCount).toBe(1)
  })

  it('getJointPositions returns new position after drag', () => {
    editor.onJointMoved = () => {}

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 30, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 120, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 120, pointerId: 1 }))

    const positions = editor.getJointPositions()
    const head = positions.find(j => j.id === 'head')
    expect(head.x).toBe(150)
    expect(head.y).toBe(120)
  })

  it('no drag when pointer is not on a joint', () => {
    let moved = false
    editor.onJointMoved = () => { moved = true }

    // Click on empty area (10, 10) — far from any joint
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 50, pointerId: 1 }))

    expect(moved).toBe(false)
  })
})

// ─── TASK-049: Mesh Boundary Reference ──────────────────────────────────────

describe('TASK-049: RigEditor — Mesh Boundary Reference', () => {
  it('setMeshBoundary stores boundary without error', () => {
    const canvas = makeCanvas()
    const editor = new RigEditor(canvas, makeHumanoidJoints())

    const boundary = [
      { x: 150, y: 20 }, { x: 250, y: 20 },
      { x: 250, y: 380 }, { x: 150, y: 380 },
    ]

    expect(() => editor.setMeshBoundary(boundary)).not.toThrow()
    expect(() => editor.render()).not.toThrow()

    editor.destroy()
  })
})

// ─── TASK-051: Freeform Joint Mode ──────────────────────────────────────────

describe('TASK-051: RigEditor — Freeform Joint Mode', () => {
  it('clicking empty area in freeform mode adds a joint', () => {
    const canvas = makeCanvas()
    const joints = [
      { id: 'joint_0', x: 100, y: 100 },
      { id: 'joint_1', x: 200, y: 100 },
      { id: 'joint_2', x: 150, y: 200 },
      { id: 'joint_3', x: 300, y: 300 },
    ]
    const editor = new RigEditor(canvas, joints)
    editor.setFreeformMode(true)

    // Click on empty area (50, 50) — not near any joint
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 }))

    const positions = editor.getJointPositions()
    expect(positions.length).toBe(5)

    const newJoint = positions.find(j => j.id === 'joint_4')
    expect(newJoint).toBeDefined()
    expect(newJoint.x).toBe(50)
    expect(newJoint.y).toBe(50)

    editor.destroy()
  })

  it('cannot exceed 20 joints', () => {
    const canvas = makeCanvas()
    const joints = []
    for (let i = 0; i < 20; i++) {
      joints.push({ id: `joint_${i}`, x: i * 10, y: i * 10 })
    }
    const editor = new RigEditor(canvas, joints)
    editor.setFreeformMode(true)

    // Try to add another joint
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 350, clientY: 350, pointerId: 1 }))

    const positions = editor.getJointPositions()
    expect(positions.length).toBe(20) // still 20

    editor.destroy()
  })

  it('cannot go below 3 joints', () => {
    const canvas = makeCanvas()
    const joints = [
      { id: 'joint_0', x: 100, y: 100 },
      { id: 'joint_1', x: 200, y: 100 },
      { id: 'joint_2', x: 150, y: 200 },
    ]
    const editor = new RigEditor(canvas, joints)
    editor.setFreeformMode(true)

    // Try to remove a joint via context menu
    canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 100, clientY: 100 }))

    const positions = editor.getJointPositions()
    expect(positions.length).toBe(3) // still 3

    editor.destroy()
  })
})
