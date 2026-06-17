/**
 * @file SparseMatrix.test.js
 * @description Unit tests for SparseMatrix.js — covers TASK-054 and TASK-068.
 */

import { describe, it, expect } from 'vitest'
import { SparseMatrix } from './SparseMatrix.js'

describe('TASK-054/068: SparseMatrix — COO Construction', () => {
  it('set(0, 2, 3.14) then get(0, 2) returns 3.14', () => {
    const m = new SparseMatrix(5, 5)
    m.set(0, 2, 3.14)
    expect(m.get(0, 2)).toBe(3.14)
  })

  it('get(1, 1) returns 0.0 (default)', () => {
    const m = new SparseMatrix(5, 5)
    expect(m.get(1, 1)).toBe(0.0)
  })

  it('add(0, 2, 1.0) after set accumulates: get(0, 2) = 4.14', () => {
    const m = new SparseMatrix(5, 5)
    m.set(0, 2, 3.14)
    m.add(0, 2, 1.0)
    expect(m.get(0, 2)).toBeCloseTo(4.14, 10)
  })

  it('no DOM access — no window/document references', () => {
    // SparseMatrix is a pure data structure
    const m = new SparseMatrix(3, 3)
    m.set(0, 0, 1)
    expect(m.get(0, 0)).toBe(1)
    // If it accessed DOM, it would fail in this Node env without jsdom DOM setup
  })

  it('SparseMatrix.build accumulates duplicate triplets', () => {
    const m = SparseMatrix.build(3, 3, [
      [0, 1, 2.0],
      [0, 1, 3.0],
      [1, 2, 5.0],
    ])
    expect(m.get(0, 1)).toBe(5.0)
    expect(m.get(1, 2)).toBe(5.0)
  })

  it('rows and cols properties are correct', () => {
    const m = new SparseMatrix(7, 9)
    expect(m.rows).toBe(7)
    expect(m.cols).toBe(9)
  })
})

describe('TASK-055/068: SparseMatrix — CSC Conversion & Symmetry', () => {
  it('isSymmetric returns true for symmetric matrix', () => {
    const m = new SparseMatrix(3, 3)
    m.set(0, 0, 2)
    m.set(1, 1, 3)
    m.set(2, 2, 4)
    m.set(0, 1, 1)
    m.set(1, 0, 1)
    m.set(1, 2, 0.5)
    m.set(2, 1, 0.5)
    expect(m.isSymmetric()).toBe(true)
  })

  it('isSymmetric returns false for non-symmetric matrix', () => {
    const m = new SparseMatrix(3, 3)
    m.set(0, 1, 1)
    m.set(1, 0, 2) // different from (0,1)
    expect(m.isSymmetric()).toBe(false)
  })

  it('isSymmetric returns false for non-square matrix', () => {
    const m = new SparseMatrix(2, 3)
    m.set(0, 0, 1)
    expect(m.isSymmetric()).toBe(false)
  })

  it('toCSC produces correct colPtr, rowIdx, vals', () => {
    const m = new SparseMatrix(3, 3)
    m.set(0, 0, 1)
    m.set(1, 0, 2)
    m.set(0, 1, 3)
    m.set(2, 2, 4)

    const csc = m.toCSC()

    // Column 0: rows [0, 1] → vals [1, 2]
    expect(csc.colPtr[0]).toBe(0)
    expect(csc.colPtr[1]).toBe(2)
    // Column 1: row [0] → val [3]
    expect(csc.colPtr[2]).toBe(3)
    // Column 2: row [2] → val [4]
    expect(csc.colPtr[3]).toBe(4)
    expect(csc.nnz).toBe(4)

    // Verify values
    expect(csc.rowIdx[0]).toBe(0)
    expect(csc.vals[0]).toBe(1)
    expect(csc.rowIdx[1]).toBe(1)
    expect(csc.vals[1]).toBe(2)
    expect(csc.rowIdx[2]).toBe(0)
    expect(csc.vals[2]).toBe(3)
    expect(csc.rowIdx[3]).toBe(2)
    expect(csc.vals[3]).toBe(4)
  })

  it('reconstruction from CSC reproduces original values', () => {
    const m = new SparseMatrix(4, 4)
    m.set(0, 0, 10)
    m.set(1, 1, 20)
    m.set(2, 2, 30)
    m.set(3, 3, 40)
    m.set(0, 2, 5)
    m.set(2, 0, 5)

    const csc = m.toCSC()

    // Reconstruct: walk CSC to get values
    for (let j = 0; j < 4; j++) {
      for (let k = csc.colPtr[j]; k < csc.colPtr[j + 1]; k++) {
        const i = csc.rowIdx[k]
        const v = csc.vals[k]
        expect(m.get(i, j)).toBeCloseTo(v, 10)
      }
    }
  })

  it('toCSC sorts row indices within each column', () => {
    const m = new SparseMatrix(3, 3)
    m.set(2, 0, 3) // row 2 first
    m.set(0, 0, 1) // row 0 second
    m.set(1, 0, 2) // row 1 third

    const csc = m.toCSC()

    // Column 0 should be sorted: row 0, 1, 2
    expect(csc.rowIdx[0]).toBe(0)
    expect(csc.vals[0]).toBe(1)
    expect(csc.rowIdx[1]).toBe(1)
    expect(csc.vals[1]).toBe(2)
    expect(csc.rowIdx[2]).toBe(2)
    expect(csc.vals[2]).toBe(3)
  })
})
