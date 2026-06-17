/**
 * @file characterData.js
 * @description JSDoc type definitions for all core PaperAlive data structures.
 *
 * Architecture V2 — CharacterData is the single source of truth for all preprocessing output.
 * These types are used throughout the codebase via @type and @param annotations.
 *
 * DO NOT add runtime logic here. This file is types-only.
 */

// ─── Primitive Types ─────────────────────────────────────────────────────────

/**
 * A binary mask stored as a flat Uint8Array.
 * Pixel at (col, row) = data[row * width + col].
 * Foreground = value > 0, background = 0.
 *
 * @typedef {Object} BinaryMask
 * @property {Uint8Array} data   - Flat pixel data (row-major)
 * @property {number}     width  - Image width in pixels
 * @property {number}     height - Image height in pixels
 */

/**
 * A loaded and decoded image, after optional resize to max 1024px.
 *
 * @typedef {Object} LoadedImage
 * @property {ImageData} imageData         - Decoded pixel data (post-resize)
 * @property {number}    width             - Width after resize (≤ 1024)
 * @property {number}    height            - Height after resize (≤ 1024)
 * @property {{ width: number, height: number }} originalSize - Dimensions before resize
 * @property {boolean}   hasAlpha          - Whether source image had an alpha channel
 */

/**
 * Valid joint ID strings for the humanoid character type.
 *
 * @typedef {"head"|"neck"|"l_shoulder"|"r_shoulder"|"l_elbow"|"r_elbow"|"l_wrist"|"r_wrist"|"l_hip"|"r_hip"|"l_knee"|"r_knee"|"l_ankle"|"r_ankle"} JointId
 */

/**
 * A single joint definition.
 *
 * @typedef {Object} Joint
 * @property {JointId|string}         id        - Unique joint identifier
 * @property {[number, number]}       position  - [x, y] pixel space (top-left origin)
 * @property {(JointId|string)[]}     children  - IDs of child joints
 * @property {JointId|string|null}    parentId  - ID of parent joint (null for root)
 */

/**
 * A single bone connecting two joints.
 *
 * @typedef {Object} Bone
 * @property {string}          id          - Bone identifier (e.g. "neck_to_head")
 * @property {JointId|string}  parentId    - Joint at the proximal end
 * @property {JointId|string}  childId     - Joint at the distal end
 * @property {number}          restLength  - Rest-pose length in pixels
 */

/**
 * Ordered list of joint positions (used before full CharacterData is built).
 * Maps jointId → {x, y} in pixel space.
 *
 * @typedef {Array<{ id: JointId|string, x: number, y: number }>} JointPositionList
 */

/**
 * Maps a joint to its nearest mesh vertex (with uniqueness enforcement).
 *
 * @typedef {Object} PinEntry
 * @property {JointId|string} jointId      - Joint identifier
 * @property {number}         vertexIndex  - Index into geometry.vertices0 (stride 2)
 * @property {number}         distance     - Pixel distance from joint to vertex (debug)
 */

/**
 * Array of pin entries, one per joint. Length = meta.jointCount.
 *
 * @typedef {PinEntry[]} PinMapping
 */

/**
 * Raw mesh output from MeshBuilder — the intermediate mesh before ARAP precompute.
 *
 * @typedef {Object} RawMesh
 * @property {Float32Array}  vertices      - [x0,y0, x1,y1, ...] rest positions (px)
 * @property {Uint16Array}   triangles     - [a0,b0,c0, a1,b1,c1, ...] CCW winding
 * @property {Float32Array}  uvCoords      - [u0,v0, u1,v1, ...] normalized 0–1
 * @property {number[][]}    neighbors     - neighbors[i] = [j1, j2, ...] vertex indices
 * @property {boolean[]}     isBoundary    - isBoundary[i] = true if boundary vertex
 * @property {number}        vertexCount   - Total vertex count (≤ 400)
 * @property {number}        triangleCount - Total triangle count
 * @property {number}        width         - Source image width (for UV normalization)
 * @property {number}        height        - Source image height (for UV normalization)
 */

// ─── ARAP Sub-types ───────────────────────────────────────────────────────────

/**
 * A Cholesky factorization factor stored in CSC (Compressed Sparse Column) format.
 *
 * @typedef {Object} CholeskyFactor
 * @property {Int32Array}   lowerL_colPtr  - Column pointer array (length = n+1)
 * @property {Int32Array}   lowerL_rowIdx  - Row indices of non-zeros (length = nnz)
 * @property {Float64Array} lowerL_vals    - Values of non-zeros (length = nnz)
 * @property {number}       nnz            - Number of non-zero elements
 * @property {number}       n              - Matrix dimension (= vertexCount)
 * @property {"cotangent"|"uniform"} weightMode - Weight strategy used
 */

/**
 * ARAP precomputed data — created once during preprocessing, used every frame.
 *
 * @typedef {Object} ARAPData
 * @property {Float32Array}  cotWeightsFlat   - All cotangent weights, flat CSR
 * @property {Int32Array}    neighborOffsets  - Start index per vertex (length = vertexCount+1)
 * @property {Int32Array}    neighborList     - Neighbor vertex indices (length = total edges × 2)
 * @property {{ rows: Int32Array, cols: Int32Array, vals: Float64Array, n: number }} laplacianSparse
 * @property {boolean[]}     pinnedVertices   - Which vertices are currently pinned
 * @property {CholeskyFactor} choleskyAllPinned - Factor for motion-clip mode (all joints pinned)
 * @property {CholeskyFactor} choleskyFree      - Factor for IK-drag mode (no constraints)
 * @property {{
 *   rotations:         Float32Array,
 *   rhs_x:             Float64Array,
 *   rhs_y:             Float64Array,
 *   outlineNormals:    Float32Array,
 *   interleavedBuffer: Float32Array
 * }} workspace
 */

// ─── Main CharacterData ───────────────────────────────────────────────────────

/**
 * The central runtime data structure for a processed character.
 * Created once during "Bring to Life" preprocessing.
 * Passed to all runtime systems (ARAP solver, renderer, motion system).
 *
 * @typedef {Object} CharacterData
 *
 * @property {{
 *   version:       string,
 *   createdAt:     number,
 *   characterType: "humanoid"|"freeform",
 *   jointCount:    number,
 *   stats: {
 *     vertexCount:   number,
 *     triangleCount: number,
 *     contourPoints: number,
 *     dpEpsilon:     number,
 *     preprocessMs:  number
 *   },
 *   name: string
 * }} meta - Metadata and statistics
 *
 * @property {{
 *   idbKey: string,
 *   width:  number,
 *   height: number
 * }} image - Reference to IndexedDB image (not raw data)
 *
 * @property {{
 *   vertices0:       Float32Array,
 *   verticesCurrent: Float32Array,
 *   vertexCount:     number,
 *   triangles:       Uint16Array,
 *   triangleCount:   number,
 *   uvCoords:        Float32Array,
 *   neighbors:       number[][],
 *   isBoundary:      boolean[]
 * }} geometry - Mesh topology and position data
 *
 * @property {{
 *   joints:           Map<JointId|string, Joint>,
 *   bones:            Map<string, Bone>,
 *   rootId:           JointId|string,
 *   currentPositions: Map<JointId|string, [number, number]>
 * }} skeleton - Skeleton hierarchy
 *
 * @property {PinMapping} pinMapping - Joint-to-vertex mapping (one per joint)
 *
 * @property {{
 *   triangleGroups: string[],
 *   groupToTriangles: Map<string, number[]>
 * }} partGroups - Body part segmentation per triangle
 *
 * @property {ARAPData} arap - All ARAP precomputed data
 */

// ─── Error Handling Types ─────────────────────────────────────────────────────

/**
 * Structured error codes returned by preprocessing modules.
 * No preprocessing module should throw an unhandled exception.
 *
 * @typedef {"CHOLESKY_FAILED"|"DEGENERATE_MESH"|"MESH_TOO_SPARSE"|"MASK_TOO_SMALL"|"WORKER_CRASHED"} PreprocessErrorCode
 */

/**
 * Structured result type for all preprocessing operations.
 * Either a success with data, or a failure with an error code.
 *
 * @template T
 * @typedef {({ success: true; data: T }) | ({ success: false; errorCode: PreprocessErrorCode; message: string; affectedStep: string })} PreprocessResult
 */

// ─── Exports (runtime-usable constants) ──────────────────────────────────────

/**
 * All valid PreprocessErrorCode values, for runtime validation.
 * @type {PreprocessErrorCode[]}
 */
export const PREPROCESS_ERROR_CODES = Object.freeze([
  'CHOLESKY_FAILED',
  'DEGENERATE_MESH',
  'MESH_TOO_SPARSE',
  'MASK_TOO_SMALL',
  'WORKER_CRASHED',
])

/**
 * Current CharacterData format version.
 * @type {string}
 */
export const CHARACTER_DATA_VERSION = '2.0'

/**
 * All valid humanoid joint IDs.
 * @type {JointId[]}
 */
export const HUMANOID_JOINT_IDS = Object.freeze([
  'head',
  'neck',
  'l_shoulder', 'r_shoulder',
  'l_elbow', 'r_elbow',
  'l_wrist', 'r_wrist',
  'l_hip', 'r_hip',
  'l_knee', 'r_knee',
  'l_ankle', 'r_ankle',
])

/**
 * Valid body part group names.
 * @type {string[]}
 */
export const BODY_PARTS = Object.freeze([
  'trunk',
  'l_upper_arm', 'r_upper_arm',
  'l_lower_arm', 'r_lower_arm',
  'l_upper_leg', 'r_upper_leg',
  'l_lower_leg', 'r_lower_leg',
  'generic',
])
