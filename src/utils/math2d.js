/**
 * @file math2d.js
 * @description 2D math utilities: Vec2 operations, 2×2 matrix operations, SVD 2×2, and cotangent.
 *
 * All functions are pure — no mutation of inputs.
 * Float32Array column-major layout for matrices.
 *
 * Performance note: functions return plain Arrays ([x, y]) for Vec2.
 * Matrices are Float32Array(4) in column-major order: [m00, m10, m01, m11].
 */

// ─── Vec2 Operations ──────────────────────────────────────────────────────────

/**
 * Create a 2D vector.
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
export function vec2(x, y) {
  return [x, y]
}

/**
 * Add two 2D vectors.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]]
}

/**
 * Add two 2D vectors in-place.
 * @param {Array|Float32Array} out
 * @param {Array|Float32Array} a
 * @param {Array|Float32Array} b
 * @returns {Array|Float32Array}
 */
export function addInPlace(out, a, b) {
  out[0] = a[0] + b[0]
  out[1] = a[1] + b[1]
  return out
}

/**
 * Subtract vector b from vector a.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]]
}

/**
 * Subtract vector b from vector a in-place.
 * @param {Array|Float32Array} out
 * @param {Array|Float32Array} a
 * @param {Array|Float32Array} b
 * @returns {Array|Float32Array}
 */
export function subInPlace(out, a, b) {
  out[0] = a[0] - b[0]
  out[1] = a[1] - b[1]
  return out
}

/**
 * Scale a 2D vector by a scalar.
 * @param {[number, number]} v
 * @param {number} s
 * @returns {[number, number]}
 */
export function scale(v, s) {
  return [v[0] * s, v[1] * s]
}

/**
 * Scale a 2D vector by a scalar in-place.
 * @param {Array|Float32Array} out
 * @param {Array|Float32Array} v
 * @param {number} s
 * @returns {Array|Float32Array}
 */
export function scaleInPlace(out, v, s) {
  out[0] = v[0] * s
  out[1] = v[1] * s
  return out
}

/**
 * Euclidean length (magnitude) of a 2D vector.
 * @param {[number, number]} v
 * @returns {number}
 */
export function length(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1])
}

/**
 * Normalize a 2D vector to unit length.
 * Returns [0, 0] if the vector has zero length (avoids division by zero).
 * @param {[number, number]} v
 * @returns {[number, number]}
 */
export function normalize(v) {
  const len = length(v)
  if (len === 0) return [0, 0]
  return [v[0] / len, v[1] / len]
}

/**
 * Normalize a 2D vector to unit length in-place.
 * @param {Array|Float32Array} out
 * @param {Array|Float32Array} v
 * @returns {Array|Float32Array}
 */
export function normalizeInPlace(out, v) {
  const len = length(v)
  if (len === 0) {
    out[0] = 0
    out[1] = 0
  } else {
    out[0] = v[0] / len
    out[1] = v[1] / len
  }
  return out
}

/**
 * Dot product of two 2D vectors.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1]
}

/**
 * Linear interpolation between two 2D vectors.
 * @param {[number, number]} a  Start vector (t=0)
 * @param {[number, number]} b  End vector (t=1)
 * @param {number} t            Interpolation factor [0, 1]
 * @returns {[number, number]}
 */
export function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/**
 * Linear interpolation between two 2D vectors in-place.
 * @param {Array|Float32Array} out
 * @param {Array|Float32Array} a
 * @param {Array|Float32Array} b
 * @param {number} t
 * @returns {Array|Float32Array}
 */
export function lerpInPlace(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  return out
}

// ─── Matrix 2×2 Operations ────────────────────────────────────────────────────
//
// Column-major Float32Array(4):
//   index:  0   1   2   3
//   entry: m00 m10 m01 m11
//
// Matrix:
//   | m00  m01 |
//   | m10  m11 |

/**
 * Create a 2×2 identity matrix (column-major Float32Array).
 * @returns {Float32Array} Identity matrix
 */
export function mat2() {
  // [m00, m10, m01, m11] = [1, 0, 0, 1]
  return new Float32Array([1, 0, 0, 1])
}

/**
 * Multiply two 2×2 matrices (column-major).
 * Returns A × B.
 * @param {Float32Array} A 4-element column-major matrix
 * @param {Float32Array} B 4-element column-major matrix
 * @returns {Float32Array}
 */
export function mat2Mul(A, B) {
  // A:  [a00, a10, a01, a11]
  // B:  [b00, b10, b01, b11]
  // C = A * B:
  //   c00 = a00*b00 + a01*b10
  //   c10 = a10*b00 + a11*b10
  //   c01 = a00*b01 + a01*b11
  //   c11 = a10*b01 + a11*b11
  const a00 = A[0], a10 = A[1], a01 = A[2], a11 = A[3]
  const b00 = B[0], b10 = B[1], b01 = B[2], b11 = B[3]
  return new Float32Array([
    a00 * b00 + a01 * b10,  // c00
    a10 * b00 + a11 * b10,  // c10
    a00 * b01 + a01 * b11,  // c01
    a10 * b01 + a11 * b11,  // c11
  ])
}

/**
 * Multiply two 2×2 matrices (column-major) in-place.
 * @param {Float32Array} out 4-element column-major matrix
 * @param {Float32Array} A 4-element column-major matrix
 * @param {Float32Array} B 4-element column-major matrix
 * @returns {Float32Array} out
 */
export function mat2MulInPlace(out, A, B) {
  const a00 = A[0], a10 = A[1], a01 = A[2], a11 = A[3]
  const b00 = B[0], b10 = B[1], b01 = B[2], b11 = B[3]
  out[0] = a00 * b00 + a01 * b10
  out[1] = a10 * b00 + a11 * b10
  out[2] = a00 * b01 + a01 * b11
  out[3] = a10 * b01 + a11 * b11
  return out
}

/**
 * Determinant of a 2×2 matrix (column-major).
 * det = m00*m11 - m01*m10
 * @param {Float32Array|number[][]} m 4-element column-major matrix OR [[row0], [row1]] nested array
 * @returns {number}
 */
export function mat2Det(m) {
  // Support both Float32Array(4) and [[a,b],[c,d]] forms
  if (Array.isArray(m) && Array.isArray(m[0])) {
    // Row-major 2D array: [[m00, m01], [m10, m11]]
    return m[0][0] * m[1][1] - m[0][1] * m[1][0]
  }
  // Column-major flat: [m00, m10, m01, m11]
  return m[0] * m[3] - m[2] * m[1]
}

// ─── SVD 2×2 ─────────────────────────────────────────────────────────────────

/**
 * Compute the Singular Value Decomposition of a 2×2 matrix.
 *
 * Given M (column-major Float32Array(4)), returns {U, S, V} such that:
 *   M = U × diag(S) × V^T
 *
 * Where:
 *   - U, V are proper rotation matrices (det = +1)
 *   - S = [s0, s1] singular values with s0 ≥ |s1| (s1 may be negative after flip)
 *   - Flip logic: if det(V × U^T) < 0, negate the smallest singular value
 *
 * Algorithm: Analytic Jacobi SVD for 2×2 matrices.
 * Reference: "Computing the Singular Value Decomposition of 3x3 matrices"
 * adapted for the 2×2 case.
 *
 * @param {Float32Array} m Column-major 2×2 matrix [m00, m10, m01, m11]
 * @returns {{ U: Float32Array, S: [number, number], V: Float32Array }}
 */
export function svd2x2(m) {
  const m00 = m[0], m10 = m[1], m01 = m[2], m11 = m[3]

  // Step 1: Form M^T * M = [[e,f],[f,g]] (symmetric positive semi-definite)
  const e = m00 * m00 + m10 * m10
  const f = m00 * m01 + m10 * m11
  const g = m01 * m01 + m11 * m11

  // Step 2: Jacobi rotation to diagonalise M^T*M → find V
  // Uses stable half-angle Jacobi formula.
  let cosV, sinV
  if (Math.abs(f) < 1e-12) {
    cosV = 1; sinV = 0
  } else {
    const tau = (e - g) / (2.0 * f)
    const t = tau >= 0
      ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
      : 1.0 / (tau - Math.sqrt(1.0 + tau * tau))
    cosV = 1.0 / Math.sqrt(1.0 + t * t)
    sinV = t * cosV
  }

  // V column-major [V00,V10,V01,V11]:
  //   col0 = [cosV;  sinV]
  //   col1 = [-sinV; cosV]
  const V = new Float32Array([cosV, sinV, -sinV, cosV])

  // Step 3: B = M * V — columns of B are M applied to each eigenvector of M^T*M
  //   B col0 = M * [cosV; sinV]
  const b00 = m00 * cosV + m01 * sinV
  const b10 = m10 * cosV + m11 * sinV
  //   B col1 = M * [-sinV; cosV]
  const b01 = -m00 * sinV + m01 * cosV
  const b11 = -m10 * sinV + m11 * cosV

  // Step 4: Singular values = norms of B columns
  let s0 = Math.sqrt(b00 * b00 + b10 * b10)
  let s1 = Math.sqrt(b01 * b01 + b11 * b11)

  // Step 5: U columns = unit vectors of B columns
  let u00, u10, u01, u11
  if (s0 > 1e-10) {
    u00 = b00 / s0; u10 = b10 / s0
  } else {
    u00 = 1; u10 = 0
  }
  if (s1 > 1e-10) {
    u01 = b01 / s1; u11 = b11 / s1
  } else {
    // Orthogonal complement of column 0
    u01 = -u10; u11 = u00
  }

  const U = new Float32Array([u00, u10, u01, u11])

  // Step 6: Sort so s0 ≥ s1 (both still positive here)
  if (s0 < s1) {
    let tmp = s0; s0 = s1; s1 = tmp
    tmp = U[0]; U[0] = U[2]; U[2] = tmp
    tmp = U[1]; U[1] = U[3]; U[3] = tmp
    tmp = V[0]; V[0] = V[2]; V[2] = tmp
    tmp = V[1]; V[1] = V[3]; V[3] = tmp
  }

  // Step 7: Enforce det(V) = +1. After a column swap det changes sign.
  if (V[0] * V[3] - V[2] * V[1] < 0) {
    // Negate last column of V; compensate by negating s1
    V[2] = -V[2]; V[3] = -V[3]
    s1 = -s1
  }

  // Step 8: Enforce det(U) = +1.
  if (U[0] * U[3] - U[2] * U[1] < 0) {
    // Negate last column of U; compensate by negating s1
    U[2] = -U[2]; U[3] = -U[3]
    s1 = -s1
  }

  return { U, S: [s0, s1], V }
}

/**
 * Compute the Singular Value Decomposition of a 2×2 matrix in-place.
 * Allows zero-allocation SVD computation by modifying pre-allocated arrays.
 * 
 * @param {Float32Array} outU 4-element column-major matrix
 * @param {Float32Array|Array} outS 2-element array
 * @param {Float32Array} outV 4-element column-major matrix
 * @param {Float32Array} m Column-major 2×2 matrix [m00, m10, m01, m11]
 */
export function svd2x2InPlace(outU, outS, outV, m) {
  const m00 = m[0], m10 = m[1], m01 = m[2], m11 = m[3]

  const e = m00 * m00 + m10 * m10
  const f = m00 * m01 + m10 * m11
  const g = m01 * m01 + m11 * m11

  let cosV, sinV
  if (Math.abs(f) < 1e-12) {
    cosV = 1; sinV = 0
  } else {
    const tau = (e - g) / (2.0 * f)
    const t = tau >= 0
      ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
      : 1.0 / (tau - Math.sqrt(1.0 + tau * tau))
    cosV = 1.0 / Math.sqrt(1.0 + t * t)
    sinV = t * cosV
  }

  outV[0] = cosV; outV[1] = sinV
  outV[2] = -sinV; outV[3] = cosV

  const b00 = m00 * cosV + m01 * sinV
  const b10 = m10 * cosV + m11 * sinV
  const b01 = -m00 * sinV + m01 * cosV
  const b11 = -m10 * sinV + m11 * cosV

  let s0 = Math.sqrt(b00 * b00 + b10 * b10)
  let s1 = Math.sqrt(b01 * b01 + b11 * b11)

  let u00, u10, u01, u11
  if (s0 > 1e-10) {
    u00 = b00 / s0; u10 = b10 / s0
  } else {
    u00 = 1; u10 = 0
  }
  if (s1 > 1e-10) {
    u01 = b01 / s1; u11 = b11 / s1
  } else {
    u01 = -u10; u11 = u00
  }

  outU[0] = u00; outU[1] = u10
  outU[2] = u01; outU[3] = u11

  if (s0 < s1) {
    let tmp = s0; s0 = s1; s1 = tmp
    tmp = outU[0]; outU[0] = outU[2]; outU[2] = tmp
    tmp = outU[1]; outU[1] = outU[3]; outU[3] = tmp
    tmp = outV[0]; outV[0] = outV[2]; outV[2] = tmp
    tmp = outV[1]; outV[1] = outV[3]; outV[3] = tmp
  }

  if (outV[0] * outV[3] - outV[2] * outV[1] < 0) {
    outV[2] = -outV[2]; outV[3] = -outV[3]
    s1 = -s1
  }

  if (outU[0] * outU[3] - outU[2] * outU[1] < 0) {
    outU[2] = -outU[2]; outU[3] = -outU[3]
    s1 = -s1
  }

  outS[0] = s0
  outS[1] = s1
}

// ─── Cotangent ────────────────────────────────────────────────────────────────

/**
 * Compute the cotangent of the angle at vertex `a` in triangle (a, b, c).
 *
 * cot(α) = cos(α) / sin(α) = (ab · ac) / |ab × ac|
 *
 * For degenerate triangles (collinear vertices), returns a finite clamped value
 * rather than crashing.
 *
 * @param {[number, number]} a  Vertex at which to measure the angle
 * @param {[number, number]} b  Second vertex of the triangle
 * @param {[number, number]} c  Third vertex of the triangle
 * @returns {number}  Cotangent of angle at a (may be negative for obtuse angles)
 */
export function cotangent(a, b, c) {
  // Vectors from a to b and from a to c
  const abx = b[0] - a[0], aby = b[1] - a[1]
  const acx = c[0] - a[0], acy = c[1] - a[1]

  // Dot product: ab · ac = |ab||ac|cos(α)
  const dotProd = abx * acx + aby * acy

  // Cross product magnitude (2D): |ab × ac| = |ab||ac|sin(α)
  // This is the area of the parallelogram = 2 × triangle area
  const crossMag = abx * acy - aby * acx

  // For degenerate (near-zero cross product), clamp to avoid Inf/NaN
  const EPSILON = 1e-10
  if (Math.abs(crossMag) < EPSILON) {
    // Collinear — return a large but finite clamped value
    // Preserves sign based on dot product sign
    const sign = dotProd >= 0 ? 1 : -1
    return sign * 1e8
  }

  return dotProd / crossMag
}
