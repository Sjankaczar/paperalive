/**
 * @file math2d.test.js
 * @description Unit tests for math2d.js — covers Vec2, Mat2x2, SVD 2×2, and cotangent.
 * Corresponds to: TASK-002 (test runner setup), TASK-004, TASK-005, TASK-006, TASK-007.
 */

import { describe, it, expect } from 'vitest'
import {
  vec2, add, addInPlace, sub, subInPlace, scale, scaleInPlace, length, normalize, normalizeInPlace, dot, lerp, lerpInPlace,
  mat2, mat2Mul, mat2MulInPlace, mat2Det,
  svd2x2, svd2x2InPlace,
  cotangent,
} from './math2d.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOLERANCE = 1e-5

function near(a, b, tol = TOLERANCE) {
  return Math.abs(a - b) < tol
}

function nearVec(a, b, tol = TOLERANCE) {
  return near(a[0], b[0], tol) && near(a[1], b[1], tol)
}

function nearMat(A, B, tol = TOLERANCE) {
  for (let i = 0; i < 4; i++) {
    if (!near(A[i], B[i], tol)) return false
  }
  return true
}

// ─── Vec2 Operations ─────────────────────────────────────────────────────────

describe('vec2', () => {
  it('creates a 2D vector', () => {
    const v = vec2(3, 4)
    expect(v).toEqual([3, 4])
  })
})

describe('add', () => {
  it('adds [1,2] + [3,4] = [4,6]', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6])
  })

  it('adds with negative values', () => {
    expect(add([-1, 2], [3, -4])).toEqual([2, -2])
  })

  it('adds zeros', () => {
    expect(add([0, 0], [5, 7])).toEqual([5, 7])
  })
})

describe('addInPlace', () => {
  it('adds two vectors into an existing out array', () => {
    const out = [0, 0]
    const result = addInPlace(out, [1, 2], [3, 4])
    expect(result).toBe(out)
    expect(out).toEqual([4, 6])
  })
})

describe('sub', () => {
  it('subtracts [3,4] - [1,2] = [2,2]', () => {
    expect(sub([3, 4], [1, 2])).toEqual([2, 2])
  })

  it('subtracts giving negatives', () => {
    expect(sub([1, 2], [3, 4])).toEqual([-2, -2])
  })
})

describe('subInPlace', () => {
  it('subtracts two vectors into an existing out array', () => {
    const out = [0, 0]
    const result = subInPlace(out, [3, 4], [1, 2])
    expect(result).toBe(out)
    expect(out).toEqual([2, 2])
  })
})

describe('scale', () => {
  it('scales by 2: [1,2] → [2,4]', () => {
    expect(scale([1, 2], 2)).toEqual([2, 4])
  })

  it('scales by 0 → zero vector', () => {
    expect(scale([5, 7], 0)).toEqual([0, 0])
  })

  it('scales by -1 negates', () => {
    expect(scale([3, -4], -1)).toEqual([-3, 4])
  })
})

describe('scaleInPlace', () => {
  it('scales a vector into an existing out array', () => {
    const out = [0, 0]
    const result = scaleInPlace(out, [1, 2], 2)
    expect(result).toBe(out)
    expect(out).toEqual([2, 4])
  })
})

describe('length', () => {
  it('length of [3,4] = 5', () => {
    expect(near(length([3, 4]), 5)).toBe(true)
  })

  it('length of [0,0] = 0 (no division by zero)', () => {
    expect(length([0, 0])).toBe(0)
  })

  it('length of unit vector = 1', () => {
    expect(near(length([1, 0]), 1)).toBe(true)
  })
})

describe('normalize', () => {
  it('normalize([3,4]) ≈ [0.6, 0.8] (tolerance 1e-6)', () => {
    const n = normalize([3, 4])
    expect(near(n[0], 0.6, 1e-6)).toBe(true)
    expect(near(n[1], 0.8, 1e-6)).toBe(true)
  })

  it('normalize([0,0]) = [0,0] (no crash)', () => {
    expect(normalize([0, 0])).toEqual([0, 0])
  })

  it('normalized vector has unit length', () => {
    const n = normalize([5, 12])
    expect(near(length(n), 1)).toBe(true)
  })
})

describe('normalizeInPlace', () => {
  it('normalizes a vector into an existing out array', () => {
    const out = [0, 0]
    const result = normalizeInPlace(out, [3, 4])
    expect(result).toBe(out)
    expect(nearVec(out, [0.6, 0.8])).toBe(true)
  })
})

describe('dot', () => {
  it('dot([1,0], [0,1]) = 0 (perpendicular)', () => {
    expect(dot([1, 0], [0, 1])).toBe(0)
  })

  it('dot([1,2], [3,4]) = 11', () => {
    expect(dot([1, 2], [3, 4])).toBe(11)
  })

  it('dot product with itself = squared length', () => {
    const v = [3, 4]
    expect(near(dot(v, v), 25)).toBe(true)
  })
})

describe('lerp', () => {
  it('lerp(a, b, 0) = a', () => {
    const a = [1, 2], b = [5, 6]
    expect(lerp(a, b, 0)).toEqual([1, 2])
  })

  it('lerp(a, b, 1) = b', () => {
    const a = [1, 2], b = [5, 6]
    expect(lerp(a, b, 1)).toEqual([5, 6])
  })

  it('lerp(a, b, 0.5) = midpoint', () => {
    const result = lerp([0, 0], [4, 8], 0.5)
    expect(nearVec(result, [2, 4])).toBe(true)
  })
})

describe('lerpInPlace', () => {
  it('interpolates vectors into an existing out array', () => {
    const out = [0, 0]
    const result = lerpInPlace(out, [0, 0], [4, 8], 0.5)
    expect(result).toBe(out)
    expect(nearVec(out, [2, 4])).toBe(true)
  })
})

// ─── Mat2x2 ──────────────────────────────────────────────────────────────────

describe('mat2', () => {
  it('returns identity matrix', () => {
    const I = mat2()
    // column-major: [m00, m10, m01, m11] = [1, 0, 0, 1]
    expect(I[0]).toBe(1)
    expect(I[1]).toBe(0)
    expect(I[2]).toBe(0)
    expect(I[3]).toBe(1)
  })

  it('returns a Float32Array', () => {
    expect(mat2()).toBeInstanceOf(Float32Array)
  })
})

describe('mat2Mul', () => {
  it('identity × M = M', () => {
    const I = mat2()
    const M = new Float32Array([2, 3, 4, 5])
    const result = mat2Mul(I, M)
    expect(nearMat(result, M)).toBe(true)
  })

  it('M × identity = M', () => {
    const I = mat2()
    const M = new Float32Array([2, 3, 4, 5])
    const result = mat2Mul(M, I)
    expect(nearMat(result, M)).toBe(true)
  })

  it('multiplies two matrices correctly', () => {
    // A = [[1,2],[3,4]] (col-major: [1,3,2,4])
    // B = [[5,6],[7,8]] (col-major: [5,7,6,8])
    // A*B = [[1*5+2*7, 1*6+2*8],[3*5+4*7, 3*6+4*8]] = [[19,22],[43,50]]
    // col-major: [19, 43, 22, 50]
    const A = new Float32Array([1, 3, 2, 4])
    const B = new Float32Array([5, 7, 6, 8])
    const C = mat2Mul(A, B)
    expect(near(C[0], 19)).toBe(true)
    expect(near(C[1], 43)).toBe(true)
    expect(near(C[2], 22)).toBe(true)
    expect(near(C[3], 50)).toBe(true)
  })
})

describe('mat2MulInPlace', () => {
  it('multiplies matrices into an existing out Float32Array', () => {
    const out = new Float32Array(4)
    const A = new Float32Array([1, 3, 2, 4])
    const B = new Float32Array([5, 7, 6, 8])
    const result = mat2MulInPlace(out, A, B)
    expect(result).toBe(out)
    expect(out[0]).toBe(19)
    expect(out[1]).toBe(43)
    expect(out[2]).toBe(22)
    expect(out[3]).toBe(50)
  })
})

describe('mat2Det', () => {
  it('det([[1,0],[0,1]]) = 1 (identity)', () => {
    // For 2D array row-major form
    expect(near(mat2Det([[1, 0], [0, 1]]), 1)).toBe(true)
  })

  it('det([[2,3],[4,5]]) = -2', () => {
    expect(near(mat2Det([[2, 3], [4, 5]]), -2, 1e-6)).toBe(true)
  })

  it('det of identity (Float32Array) = 1', () => {
    expect(near(mat2Det(mat2()), 1)).toBe(true)
  })

  it('det of zero matrix = 0', () => {
    const Z = new Float32Array([0, 0, 0, 0])
    expect(mat2Det(Z)).toBe(0)
  })
})

// ─── SVD 2×2 ─────────────────────────────────────────────────────────────────

describe('svd2x2', () => {
  // Helper: reconstruct M = U * diag(S) * V^T
  function reconstruct(U, S, V) {
    // M = U * [[s0, 0], [0, s1]] * V^T
    // V^T col-major: V^T[i][j] = V[j][i]
    // V^T = [V[0], V[2], V[1], V[3]] in col-major
    const VT = new Float32Array([V[0], V[2], V[1], V[3]])
    // diag(S) col-major: [S[0], 0, 0, S[1]]
    const DS = new Float32Array([S[0], 0, 0, S[1]])
    return mat2Mul(mat2Mul(U, DS), VT)
  }

  it('diagonal matrix [[2,0],[0,1]] → S ≈ [2,1]', () => {
    // col-major: [2, 0, 0, 1]
    const m = new Float32Array([2, 0, 0, 1])
    const { U, S, V } = svd2x2(m)

    expect(near(Math.abs(S[0]), 2, 1e-5)).toBe(true)
    expect(near(Math.abs(S[1]), 1, 1e-5)).toBe(true)

    // U and V should be close to identity
    expect(near(Math.abs(U[0] * U[3] - U[2] * U[1]), 1, 1e-4)).toBe(true)
    expect(near(Math.abs(V[0] * V[3] - V[2] * V[1]), 1, 1e-4)).toBe(true)
  })

  it('reconstruction: U × diag(S) × V^T ≈ M (tolerance 1e-5)', () => {
    const m = new Float32Array([2, 0, 0, 1])
    const { U, S, V } = svd2x2(m)
    const rec = reconstruct(U, S, V)
    expect(nearMat(rec, m, 1e-5)).toBe(true)
  })

  it('rotation 45°: S ≈ [1,1], U and V are orthogonal', () => {
    const angle = Math.PI / 4
    const c = Math.cos(angle), s = Math.sin(angle)
    // Rotation matrix col-major: [c, s, -s, c]
    const m = new Float32Array([c, s, -s, c])
    const { U, S, V } = svd2x2(m)

    // Singular values should both be ~1 (rotation is isometry)
    expect(near(Math.abs(S[0]), 1, 1e-5)).toBe(true)
    expect(near(Math.abs(S[1]), 1, 1e-5)).toBe(true)

    // U and V must be orthogonal: det = ±1
    const detU = Math.abs(U[0] * U[3] - U[2] * U[1])
    const detV = Math.abs(V[0] * V[3] - V[2] * V[1])
    expect(near(detU, 1, 1e-4)).toBe(true)
    expect(near(detV, 1, 1e-4)).toBe(true)
  })

  it('reconstruction for rotation 45° ≈ M (tolerance 1e-5)', () => {
    const angle = Math.PI / 4
    const c = Math.cos(angle), s = Math.sin(angle)
    const m = new Float32Array([c, s, -s, c])
    const { U, S, V } = svd2x2(m)
    const rec = reconstruct(U, S, V)
    expect(nearMat(rec, m, 1e-5)).toBe(true)
  })

  it('det(U) ≈ +1 (proper rotation, not reflection)', () => {
    const m = new Float32Array([3, 1, 2, 4])
    const { U } = svd2x2(m)
    const detU = U[0] * U[3] - U[2] * U[1]
    expect(near(detU, 1, 1e-4)).toBe(true)
  })

  it('det(V) ≈ +1 (proper rotation, not reflection)', () => {
    const m = new Float32Array([3, 1, 2, 4])
    const { V } = svd2x2(m)
    const detV = V[0] * V[3] - V[2] * V[1]
    expect(near(detV, 1, 1e-4)).toBe(true)
  })

  it('reconstruction for general matrix ≈ M (tolerance 1e-5)', () => {
    const m = new Float32Array([3, 1, 2, 4])
    const { U, S, V } = svd2x2(m)
    const rec = reconstruct(U, S, V)
    expect(nearMat(rec, m, 1e-5)).toBe(true)
  })

  it('handles near-zero matrix without NaN', () => {
    const m = new Float32Array([1e-12, 0, 0, 1e-12])
    const { U, S, V } = svd2x2(m)
    expect(isNaN(S[0])).toBe(false)
    expect(isNaN(S[1])).toBe(false)
    for (let i = 0; i < 4; i++) {
      expect(isNaN(U[i])).toBe(false)
      expect(isNaN(V[i])).toBe(false)
    }
  })
})

describe('svd2x2InPlace', () => {
  it('computes SVD into existing Float32Arrays', () => {
    const m = new Float32Array([2, 0, 0, 1])
    const outU = new Float32Array(4)
    const outS = [0, 0]
    const outV = new Float32Array(4)
    
    svd2x2InPlace(outU, outS, outV, m)
    
    expect(near(Math.abs(outS[0]), 2, 1e-5)).toBe(true)
    expect(near(Math.abs(outS[1]), 1, 1e-5)).toBe(true)
  })
})

// ─── Cotangent ────────────────────────────────────────────────────────────────

describe('cotangent', () => {
  it('equilateral triangle, 60° angle → cot ≈ 1/√3 ≈ 0.577', () => {
    // Equilateral triangle with side length 1:
    // a = [0, 0], b = [1, 0], c = [0.5, √3/2]
    const a = [0, 0]
    const b = [1, 0]
    const c = [0.5, Math.sqrt(3) / 2]
    const cot = cotangent(a, b, c)
    expect(near(cot, 1 / Math.sqrt(3), 1e-4)).toBe(true)
  })

  it('obtuse angle (>90°) → negative cotangent', () => {
    // Right angle at b, angle at a is >90° by using obtuse configuration
    // Triangle: a=[0,0], b=[2,0], c=[0.1, 0.1]
    // Angle at a: vectors [2,0] and [0.1,0.1] → ~45° (not obtuse at a)
    // Use: a=[0,0], b=[-3,0], c=[0, 0.1]
    // Angle at a between ab=[-3,0] and ac=[0,0.1]: dot=0, cross=(-3)(0.1)-(0)(0)=-0.3
    // cot = dot/cross = 0 / -0.3 = 0
    // Let's use a properly obtuse angle at a:
    // a=[0,0], b=[1,0], c=[-1,0.1] → angle > 90°
    const a = [0, 0]
    const b = [1, 0]
    const c = [-1, 0.1]
    const cot = cotangent(a, b, c)
    expect(cot).toBeLessThan(0)
  })

  it('degenerate (collinear) triangle → does not crash, returns finite value', () => {
    // a, b, c all on x-axis
    const a = [0, 0]
    const b = [1, 0]
    const c = [2, 0]
    const cot = cotangent(a, b, c)
    expect(isFinite(cot)).toBe(true)
    expect(isNaN(cot)).toBe(false)
  })

  it('right angle (90°) → cotangent ≈ 0', () => {
    // Right angle at a: b=[1,0], c=[0,1]
    const a = [0, 0]
    const b = [1, 0]
    const c = [0, 1]
    const cot = cotangent(a, b, c)
    expect(near(cot, 0, 1e-4)).toBe(true)
  })
})
