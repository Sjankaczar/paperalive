// @worker-safe
/**
 * @file SparseMatrix.js
 * @description Sparse matrix in COO (Coordinate) format with CSC conversion and symmetry check.
 *
 * COO stores triplets (row, col, val). Duplicate entries are summed during CSC conversion.
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — arap/sparse/SparseMatrix.js
 */

/**
 * Sparse matrix in COO (Coordinate) format.
 * Triplets (row, col, val) with duplicate accumulation on CSC conversion.
 */
export class SparseMatrix {
  /**
   * @param {number} rows - Number of rows
   * @param {number} cols - Number of columns
   */
  constructor(rows, cols) {
    /** @type {number} */
    this._rows = rows

    /** @type {number} */
    this._cols = cols

    /**
     * Internal storage: Map<rowKey, Map<colKey, value>>
     * Allows O(1) get/set/add with accumulation of duplicates.
     * @type {Map<number, Map<number, number>>}
     */
    this._data = new Map()
  }

  /** Number of rows. */
  get rows() {
    return this._rows
  }

  /** Number of columns. */
  get cols() {
    return this._cols
  }

  /**
   * Set value at (i, j).
   *
   * @param {number} i - Row index
   * @param {number} j - Column index
   * @param {number} val - Value to set
   */
  set(i, j, val) {
    let rowMap = this._data.get(i)
    if (!rowMap) {
      rowMap = new Map()
      this._data.set(i, rowMap)
    }
    rowMap.set(j, val)
  }

  /**
   * Get value at (i, j). Returns 0 if not set.
   *
   * @param {number} i - Row index
   * @param {number} j - Column index
   * @returns {number}
   */
  get(i, j) {
    const rowMap = this._data.get(i)
    if (!rowMap) return 0
    const val = rowMap.get(j)
    return val === undefined ? 0 : val
  }

  /**
   * Add delta to (i, j). Accumulates if entry already exists.
   *
   * @param {number} i - Row index
   * @param {number} j - Column index
   * @param {number} delta - Value to add
   */
  add(i, j, delta) {
    let rowMap = this._data.get(i)
    if (!rowMap) {
      rowMap = new Map()
      this._data.set(i, rowMap)
    }
    const current = rowMap.get(j) || 0
    rowMap.set(j, current + delta)
  }

  /**
   * Convert COO to Compressed Sparse Column (CSC) format.
   *
   * Returns:
   *   colPtr: Int32Array(n+1) — column pointers
   *   rowIdx: Int32Array(nnz) — row indices
   *   vals:   Float64Array(nnz) — values
   *
   * @returns {{ colPtr: Int32Array, rowIdx: Int32Array, vals: Float64Array, nnz: number }}
   */
  toCSC() {
    const n = this._cols

    // Count entries per column
    const colCounts = new Int32Array(n)
    for (const [, rowMap] of this._data) {
      for (const [j] of rowMap) {
        colCounts[j]++
      }
    }

    // Build column pointers
    const colPtr = new Int32Array(n + 1)
    for (let j = 0; j < n; j++) {
      colPtr[j + 1] = colPtr[j] + colCounts[j]
    }

    const nnz = colPtr[n]
    const rowIdx = new Int32Array(nnz)
    const vals = new Float64Array(nnz)

    // Fill row indices and values, column by column
    const colPos = new Int32Array(n) // current write position per column
    for (let j = 0; j < n; j++) {
      colPos[j] = colPtr[j]
    }

    for (const [i, rowMap] of this._data) {
      for (const [j, val] of rowMap) {
        const pos = colPos[j]
        rowIdx[pos] = i
        vals[pos] = val
        colPos[j]++
      }
    }

    // Sort each column by row index for canonical CSC
    for (let j = 0; j < n; j++) {
      const start = colPtr[j]
      const end = colPtr[j + 1]
      // Simple insertion sort (columns are typically small)
      for (let a = start + 1; a < end; a++) {
        const tmpRow = rowIdx[a]
        const tmpVal = vals[a]
        let b = a - 1
        while (b >= start && rowIdx[b] > tmpRow) {
          rowIdx[b + 1] = rowIdx[b]
          vals[b + 1] = vals[b]
          b--
        }
        rowIdx[b + 1] = tmpRow
        vals[b + 1] = tmpVal
      }
    }

    return { colPtr, rowIdx, vals, nnz }
  }

  /**
   * Check if the matrix is symmetric: A[i][j] === A[j][i] for all i, j.
   *
   * @returns {boolean}
   */
  isSymmetric() {
    if (this._rows !== this._cols) return false

    for (const [i, rowMap] of this._data) {
      for (const [j, val] of rowMap) {
        if (this.get(j, i) !== val) return false
      }
    }

    return true
  }

  /**
   * Build a SparseMatrix from a list of triplets.
   * Duplicate (i, j) entries are accumulated (summed).
   *
   * @param {number} rows - Number of rows
   * @param {number} cols - Number of columns
   * @param {Array<[number, number, number]>} triplets - [row, col, val] triplets
   * @returns {SparseMatrix}
   */
  static build(rows, cols, triplets) {
    const m = new SparseMatrix(rows, cols)
    for (const [i, j, val] of triplets) {
      m.add(i, j, val)
    }
    return m
  }
}
