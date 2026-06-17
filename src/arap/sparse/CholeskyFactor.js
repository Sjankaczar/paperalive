// @worker-safe
/**
 * @file CholeskyFactor.js
 * @description Cholesky factorization (LL^T) for sparse symmetric positive definite matrices.
 *
 * Input: SparseMatrix in CSC format.
 * Output: Lower triangular factor L in CSC format.
 * Solve via forward + backward substitution.
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — arap/sparse/CholeskyFactor.js
 */

/**
 * Cholesky factorization and solve for sparse SPD matrices.
 */
export class CholeskyFactor {
  /**
   * @private — use CholeskyFactor.factorize() instead.
   * @param {Int32Array} colPtr
   * @param {Int32Array} rowIdx
   * @param {Float64Array} vals
   * @param {number} n
   */
  constructor(colPtr, rowIdx, vals, n) {
    /** @type {Int32Array} Column pointers (length = n+1) */
    this.lowerL_colPtr = colPtr

    /** @type {Int32Array} Row indices (length = nnz) */
    this.lowerL_rowIdx = rowIdx

    /** @type {Float64Array} Values (length = nnz) */
    this.lowerL_vals = vals

    /** @type {number} Non-zero count */
    this.nnz = vals.length

    /** @type {number} Matrix dimension */
    this.n = n

    /** @type {"cotangent"|"uniform"} */
    this.weightMode = 'cotangent'
  }

  /**
   * Factorize a sparse SPD matrix into L such that A = L * L^T.
   *
   * Input must be in CSC format from SparseMatrix.toCSC().
   * Returns structured result — never throws.
   *
   * @param {{ colPtr: Int32Array, rowIdx: Int32Array, vals: Float64Array, nnz: number }} csc
   *   CSC format of a symmetric positive definite matrix (n × n).
   * @param {number} n - Matrix dimension
   * @returns {{ success: true, factor: CholeskyFactor } | { success: false, reason: string }}
   */
  static factorize(csc, n) {
    const { colPtr, rowIdx, vals } = csc

    // Build a lookup for fast access: for column j, find value at row i
    // We'll work with a dense column approach for factorization
    // Since matrices are ≤ 400×400, this is efficient enough

    // Allocate dense lower triangular storage (column-major)
    // L[i][j] stored in denseL[j * n + i] for i >= j
    const denseL = new Float64Array(n * n)

    // Copy input matrix into dense form for easy access
    // Since input is symmetric, we only need lower triangle
    for (let j = 0; j < n; j++) {
      const start = colPtr[j]
      const end = colPtr[j + 1]
      for (let k = start; k < end; k++) {
        const i = rowIdx[k]
        if (i >= j) {
          denseL[j * n + i] = vals[k]
        }
      }
    }

    // Cholesky factorization: A = L * L^T
    // L[j][j] = sqrt(A[j][j] - sum(L[j][k]^2, k=0..j-1))
    // L[i][j] = (A[i][j] - sum(L[i][k]*L[j][k], k=0..j-1)) / L[j][j]
    for (let j = 0; j < n; j++) {
      // Diagonal element
      let sumDiag = 0
      for (let k = 0; k < j; k++) {
        const ljk = denseL[k * n + j]
        sumDiag += ljk * ljk
      }

      const diag = denseL[j * n + j] - sumDiag
      if (diag <= 1e-14) {
        return {
          success: false,
          reason: `Matrix not positive definite at column ${j}: diagonal=${diag}`,
        }
      }

      const ljj = Math.sqrt(diag)
      denseL[j * n + j] = ljj

      // Off-diagonal elements (i > j)
      const invLjj = 1.0 / ljj
      for (let i = j + 1; i < n; i++) {
        let sumOff = 0
        for (let k = 0; k < j; k++) {
          sumOff += denseL[k * n + i] * denseL[k * n + j]
        }
        denseL[j * n + i] = (denseL[j * n + i] - sumOff) * invLjj
      }
    }

    // Convert dense lower triangular L to CSC format
    // Count non-zeros in each column of L
    const newColPtr = new Int32Array(n + 1)
    for (let j = 0; j < n; j++) {
      let count = 0
      for (let i = j; i < n; i++) {
        if (denseL[j * n + i] !== 0) count++
      }
      newColPtr[j + 1] = newColPtr[j] + count
    }

    const nnz = newColPtr[n]
    const newRowIdx = new Int32Array(nnz)
    const newVals = new Float64Array(nnz)

    for (let j = 0; j < n; j++) {
      let pos = newColPtr[j]
      for (let i = j; i < n; i++) {
        const val = denseL[j * n + i]
        if (val !== 0) {
          newRowIdx[pos] = i
          newVals[pos] = val
          pos++
        }
      }
    }

    return {
      success: true,
      factor: new CholeskyFactor(newColPtr, newRowIdx, newVals, n),
    }
  }

  /**
   * Solve L * L^T * x = b using forward + backward substitution.
   *
   * Solves in-place: modifies `out` array.
   *
   * @param {CholeskyFactor} factor - Pre-computed Cholesky factor
   * @param {Float64Array} b - Right-hand side vector (length = n)
   * @param {Float64Array} [out] - Output buffer (length = n). If not provided, creates new.
   * @returns {Float64Array} Solution vector x
   */
  static solve(factor, b, out) {
    const n = factor.n
    const colPtr = factor.lowerL_colPtr
    const rowIdx = factor.lowerL_rowIdx
    const vals = factor.lowerL_vals

    if (!out) {
      out = new Float64Array(n)
    }

    // Forward substitution: L * y = b
    // L is lower triangular in CSC format
    // y[j] = (b[j] - sum(L[i][j]*y[i], i=0..j-1)) / L[j][j]
    // But in CSC, column j gives us L[i][j] for i >= j
    // So we need row-based access. Build temporary dense column extraction.

    // Copy b into y
    for (let i = 0; i < n; i++) {
      out[i] = b[i]
    }

    // Forward solve: L * y = b (column-by-column)
    for (let j = 0; j < n; j++) {
      const start = colPtr[j]
      const end = colPtr[j + 1]

      // Find diagonal element L[j][j]
      let diagVal = 0
      for (let k = start; k < end; k++) {
        if (rowIdx[k] === j) {
          diagVal = vals[k]
          break
        }
      }

      out[j] /= diagVal

      // Subtract L[i][j] * y[j] from remaining entries (i > j)
      for (let k = start; k < end; k++) {
        const i = rowIdx[k]
        if (i > j) {
          out[i] -= vals[k] * out[j]
        }
      }
    }

    // Backward solve: L^T * x = y (column-by-column, reverse)
    // L^T[i][j] = L[j][i], so L^T is upper triangular
    for (let j = n - 1; j >= 0; j--) {
      const start = colPtr[j]
      const end = colPtr[j + 1]

      // Subtract L^T[j][i] * x[i] for i > j, i.e., L[i][j] * x[i]
      for (let k = start; k < end; k++) {
        const i = rowIdx[k]
        if (i > j) {
          out[j] -= vals[k] * out[i]
        }
      }

      // Divide by diagonal L^T[j][j] = L[j][j]
      let diagVal = 0
      for (let k = start; k < end; k++) {
        if (rowIdx[k] === j) {
          diagVal = vals[k]
          break
        }
      }
      out[j] /= diagVal
    }

    return out
  }

  /**
   * Check if the Cholesky factor contains NaN or Infinity values.
   *
   * @param {CholeskyFactor} factor
   * @returns {boolean} true if NaN or Infinity found, false if all values are normal
   */
  static checkNaN(factor) {
    const vals = factor.lowerL_vals
    for (let i = 0; i < vals.length; i++) {
      if (Number.isNaN(vals[i]) || !Number.isFinite(vals[i])) {
        return true
      }
    }
    return false
  }
}
