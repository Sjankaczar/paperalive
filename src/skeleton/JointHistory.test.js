/**
 * @file JointHistory.test.js
 * @description Unit tests for JointHistory.js — covers TASK-050.
 */

import { describe, it, expect } from 'vitest'
import { JointHistory } from './JointHistory.js'

describe('TASK-050: JointHistory — Undo/Redo', () => {
  function makeJoints(x) {
    return [
      { id: 'head', x, y: 10 },
      { id: 'neck', x, y: 20 },
      { id: 'l_shoulder', x: x - 5, y: 30 },
    ]
  }

  it('undo after 3 pushes returns state from push 1', () => {
    const history = new JointHistory(10)
    history.push(makeJoints(10))
    history.push(makeJoints(20))
    history.push(makeJoints(30))

    history.undo() // back to push 2
    const state0 = history.undo() // back to push 1

    expect(state0).not.toBeNull()
    expect(state0[0].x).toBe(10)
    expect(state0[1].x).toBe(10)
  })

  it('redo after undo returns next state', () => {
    const history = new JointHistory(10)
    history.push(makeJoints(10))
    history.push(makeJoints(20))

    history.undo() // back to push 1
    const state = history.redo() // forward to push 2

    expect(state).not.toBeNull()
    expect(state[0].x).toBe(20)
  })

  it('push after undo clears redo buffer', () => {
    const history = new JointHistory(10)
    history.push(makeJoints(10))
    history.push(makeJoints(20))

    history.undo() // back to push 1
    history.push(makeJoints(50)) // new state, clears redo

    expect(history.canRedo).toBe(false)
  })

  it('push to 11th evicts 1st snapshot (max 10)', () => {
    const history = new JointHistory(10)
    for (let i = 0; i < 11; i++) {
      history.push(makeJoints(i * 10))
    }

    // After 11 pushes with max 10: buffer has pushes [1..10], _current=9
    // Undo 9 times to reach index 0 (the oldest remaining = push #2, i=1, x=10)
    let last = null
    for (let i = 0; i < 9; i++) {
      last = history.undo()
    }

    // The oldest remaining snapshot is push #2 (i=1, x=10)
    expect(last).not.toBeNull()
    expect(last[0].x).toBe(10)
    // No more undos available
    expect(history.canUndo).toBe(false)
  })

  it('canUndo is false initially', () => {
    const history = new JointHistory(10)
    expect(history.canUndo).toBe(false)
  })

  it('canRedo is false initially', () => {
    const history = new JointHistory(10)
    expect(history.canRedo).toBe(false)
  })

  it('undo returns null when no history', () => {
    const history = new JointHistory(10)
    expect(history.undo()).toBeNull()
  })

  it('redo returns null when at end', () => {
    const history = new JointHistory(10)
    history.push(makeJoints(10))
    expect(history.redo()).toBeNull()
  })

  it('clear resets all history', () => {
    const history = new JointHistory(10)
    history.push(makeJoints(10))
    history.push(makeJoints(20))
    history.clear()

    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
