/**
 * @file CholeskyFactor.test.js
 * @description Unit tests for CholeskyFactor.js — covers TASK-056, 057, 058 and TASK-069.
 */

import { describe, it, expect } from 'vitest'
import { SparseMatrix } from './SparseMatrix.js'
import { CholeskyFactor } from './CholeskyFactor.js'

describe('TASK-056/069: CholeskyFactor — Factorization', () => {
  /**
   * Build a known SPD 5×5 tridiagonal matrix:
   *   [4 -1  0  0  0]
   *   [-1  4 -1  0  0]
   *   [0 -1  4 -1  0]
   *   [0  0 -1  4 -1]
   *   [0  0  0 -1  4]
   * This is strictly diagonally dominant → SPD.
   */
  function makeSPD5() {
    const m = new SparseMatrix(5, 5)
    for (let i = 0; i < 5; i++) {
      m.set(i, i, 4)
      if (i > 0) m.set(i, i - 1, -1)
      if (i < 4) m.set(i, i + 1, -1)
    }
    return m
  }

  it('factorize SPD 5×5 returns success: true', () => {
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)

    expect(result.success).toBe(true)
    expect(result.factor).toBeDefined()
    expect(result.factor.n).toBe(5)
  })

  it('factor L is lower triangular', () => {
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)
    const factor = result.factor

    // Walk CSC of L: all row indices must be >= column index
    for (let j = 0; j < factor.n; j++) {
      for (let k = factor.lowerL_colPtr[j]; k < factor.lowerL_colPtr[j + 1]; k++) {
        const i = factor.lowerL_rowIdx[k]
        expect(i).toBeGreaterThanOrEqual(j) // lower triangular: row >= col
      }
    }
  })

  it('L * L^T ≈ A (reconstruction test)', () => {
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)
    const L = result.factor

    // Reconstruct dense L from CSC
    const n = L.n
    const denseL = new Float64Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let k = L.lowerL_colPtr[j]; k < L.lowerL_colPtr[j + 1]; k++) {
        const i = L.lowerL_rowIdx[k]
        denseL[i * n + j] = L.lowerL_vals[k]
      }
    }

    // Compute L * L^T
    const product = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0
        for (let k = 0; k < n; k++) {
          // L[i][k] * L^T[k][j] = L[i][k] * L[j][k]
          sum += denseL[i * n + k] * denseL[j * n + k]
        }
        product[i * n + j] = sum
      }
    }

    // Compare with A
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const aij = A.get(i, j)
        expect(product[i * n + j]).toBeCloseTo(aij, 8)
      }
    }
  })

  it('factorize singular matrix returns success: false with reason', () => {
    // Singular: all zeros on diagonal → not SPD
    const m = new SparseMatrix(3, 3)
    m.set(0, 1, 1)
    m.set(1, 0, 1)
    m.set(0, 2, 1)
    m.set(2, 0, 1)
    // Diagonal is 0 → not positive definite

    const csc = m.toCSC()
    const result = CholeskyFactor.factorize(csc, 3)

    expect(result.success).toBe(false)
    expect(result.reason).toBeDefined()
    expect(typeof result.reason).toBe('string')
  })

  it('no throw on pathological input', () => {
    const m = new SparseMatrix(2, 2)
    m.set(0, 0, -1) // negative diagonal
    m.set(1, 1, -1)

    const csc = m.toCSC()
    const result = CholeskyFactor.factorize(csc, 2)

    expect(result.success).toBe(false)
  })

  it('no DOM access', () => {
    // Runs in Node env — if it accessed DOM it would fail
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)
    expect(result.success).toBe(true)
  })
})

describe('TASK-057/069: CholeskyFactor — Back Substitution', () => {
  function makeSPD5() {
    const m = new SparseMatrix(5, 5)
    for (let i = 0; i < 5; i++) {
      m.set(i, i, 4)
      if (i > 0) m.set(i, i - 1, -1)
      if (i < 4) m.set(i, i + 1, -1)
    }
    return m
  }

  it('solve(A, b) produces x with ||x - x_true|| < 1e-6', () => {
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)
    const factor = result.factor

    // Known solution: x = [1, 2, 3, 4, 5]
    const xTrue = new Float64Array([1, 2, 3, 4, 5])

    // Compute b = A * x_true
    const b = new Float64Array(5)
    for (let i = 0; i < 5; i++) {
      let sum = 0
      for (let j = 0; j < 5; j++) {
        sum += A.get(i, j) * xTrue[j]
      }
      b[i] = sum
    }

    // Solve
    const x = CholeskyFactor.solve(factor, b)

    // Check
    for (let i = 0; i < 5; i++) {
      expect(x[i]).toBeCloseTo(xTrue[i], 6)
    }
  })

  it('in-place operation on pre-allocated buffer', () => {
    const A = makeSPD5()
    const csc = A.toCSC()
    const result = CholeskyFactor.factorize(csc, 5)
    const factor = result.factor

    const b = new Float64Array([1, 0, 0, 0, 0])
    const out = new Float64Array(5)

    const returned = CholeskyFactor.solve(factor, b, out)

    // Should be the same buffer
    expect(returned).toBe(out)
    // Verify it's a valid solution (non-zero)
    expect(out[0]).not.toBeCloseTo(0, 10)
  })
})

describe('TASK-058/069: CholeskyFactor — NaN Sentinel', () => {
  it('checkNaN returns false for normal factor', () => {
    const m = new SparseMatrix(3, 3)
    m.set(0, 0, 4); m.set(1, 1, 4); m.set(2, 2, 4)
    m.set(0, 1, -1); m.set(1, 0, -1)
    m.set(1, 2, -1); m.set(2, 1, -1)

    const csc = m.toCSC()
    const result = CholeskyFactor.factorize(csc, 3)
    expect(result.success).toBe(true)
    expect(CholeskyFactor.checkNaN(result.factor)).toBe(false)
  })

  it('checkNaN returns true for factor with NaN value', () => {
    // Manually create a factor with NaN
    const factor = new CholeskyFactor(
      new Int32Array([0, 1, 2, 3]),
      new Int32Array([0, 1, 2]),
      new Float64Array([1.0, NaN, 2.0]),
      3,
    )
    expect(CholeskyFactor.checkNaN(factor)).toBe(true)
  })

  it('checkNaN returns true for factor with Infinity value', () => {
    const factor = new CholeskyFactor(
      new Int32Array([0, 1, 2, 3]),
      new Int32Array([0, 1, 2]),
      new Float64Array([1.0, Infinity, 2.0]),
      3,
    )
    expect(CholeskyFactor.checkNaN(factor)).toBe(true)
  })

  it('checkNaN returns true for factor with -Infinity value', () => {
    const factor = new CholeskyFactor(
      new Int32Array([0, 1]),
      new Int32Array([0]),
      new Float64Array([-Infinity]),
      1,
    )
    expect(CholeskyFactor.checkNaN(factor)).toBe(true)
  })
})
