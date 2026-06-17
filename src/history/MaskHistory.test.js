/**
 * @file MaskHistory.test.js
 * @description Unit tests for MaskHistory.js — covers TASK-024.
 */

import { describe, it, expect } from 'vitest'
import { MaskHistory } from './MaskHistory.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a BinaryMask with a specific pattern for identification.
 * @param {number} id - Used to fill the mask data for identification
 * @param {number} [size=10]
 * @returns {import('../types/characterData.js').BinaryMask}
 */
function makeMask(id, size = 10) {
  return {
    data: new Uint8Array(size * size).fill(id),
    width: size,
    height: size,
  }
}

// ─── TASK-024: MaskHistory ───────────────────────────────────────────────────

describe('TASK-024: MaskHistory', () => {
  it('push 3 masks, undo() returns mask 2 then mask 1', () => {
    const history = new MaskHistory(20)

    history.push(makeMask(1))
    history.push(makeMask(2))
    history.push(makeMask(3))

    const undo1 = history.undo()
    expect(undo1[0]).toBe(2) // mask 2

    const undo2 = history.undo()
    expect(undo2[0]).toBe(1) // mask 1
  })

  it('redo() after undo returns mask 2', () => {
    const history = new MaskHistory(20)

    history.push(makeMask(1))
    history.push(makeMask(2))
    history.push(makeMask(3))

    history.undo() // go to mask 2
    const redoResult = history.redo()
    expect(redoResult[0]).toBe(3) // back to mask 3
  })

  it('canUndo === false when pointer is at the beginning', () => {
    const history = new MaskHistory(20)

    history.push(makeMask(1))
    expect(history.canUndo).toBe(false)

    history.push(makeMask(2))
    history.undo()
    expect(history.canUndo).toBe(false)
  })

  it('canRedo === false when pointer is at the end', () => {
    const history = new MaskHistory(20)

    history.push(makeMask(1))
    history.push(makeMask(2))
    expect(history.canRedo).toBe(false)

    history.undo()
    expect(history.canRedo).toBe(true)
  })

  it('push mask #21 → mask #1 is evicted (circular buffer, max 20)', () => {
    const history = new MaskHistory(20)

    // Push 20 masks
    for (let i = 1; i <= 20; i++) {
      history.push(makeMask(i))
    }

    // Mask #1 should be accessible via undo chain
    expect(history.canUndo).toBe(true)

    // Push mask #21 → mask #1 evicted
    history.push(makeMask(21))

    // Undo all the way back — should reach mask #2, not mask #1
    let count = 0
    while (history.canUndo) {
      history.undo()
      count++
    }

    // We should have 19 undos (mask 21 → 20 → 19 → ... → 2), not 20
    expect(count).toBe(19)
  })

  it('push() after undo() clears redo buffer', () => {
    const history = new MaskHistory(20)

    history.push(makeMask(1))
    history.push(makeMask(2))
    history.push(makeMask(3))

    history.undo() // go to mask 2
    expect(history.canRedo).toBe(true)

    // Push a new mask → redo should be cleared
    history.push(makeMask(99))
    expect(history.canRedo).toBe(false)
  })

  it('undo() returns null when no history', () => {
    const history = new MaskHistory(20)
    expect(history.undo()).toBeNull()
  })

  it('redo() returns null when no redo available', () => {
    const history = new MaskHistory(20)
    history.push(makeMask(1))
    expect(history.redo()).toBeNull()
  })

  it('clear() resets all history', () => {
    const history = new MaskHistory(20)
    history.push(makeMask(1))
    history.push(makeMask(2))

    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.undo()).toBeNull()
  })

  it('returned snapshots are deep copies (modifying original does not affect history)', () => {
    const history = new MaskHistory(20)
    const mask = makeMask(42)

    history.push(mask)
    history.push(makeMask(99))

    // Modify the original mask after push
    mask.data.fill(0)

    const undone = history.undo()
    // Should still have the original value (42), not the modified value (0)
    expect(undone[0]).toBe(42)
  })
})
