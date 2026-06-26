// @worker-safe
/**
 * @file SkeletonEstimator.js
 * @description Estimate skeleton joint positions from a BinaryMask using
 *              bounding box and centroid heuristics (humanoid mode).
 *
 * API:
 *   - getMaskBoundingBox(mask)  → {top, left, width, height} | null
 *   - getMaskCentroid(mask)     → {cx, cy} | null
 *   - estimateSkeleton(mask)    → JointPositionList (14 joints)
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — SkeletonEstimator.js
 */

import { getMaskBoundingBox as _getMaskBoundingBox, getMaskCentroid as _getMaskCentroid } from '../utils/bbox.js'

// ─── BBox & Centroid wrappers ────────────────────────────────────────────────

/**
 * Compute the bounding box of all foreground pixels in a mask.
 * Wrapper around bbox.js utility.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
export function getMaskBoundingBox(mask) {
  return _getMaskBoundingBox(mask)
}

/**
 * Compute the centroid (center of mass) of all foreground pixels.
 * Wrapper around bbox.js utility.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{ cx: number, cy: number } | null}
 */
export function getMaskCentroid(mask) {
  return _getMaskCentroid(mask)
}

// ─── Humanoid Heuristic ──────────────────────────────────────────────────────

/**
 * Standard humanoid body proportions relative to the bounding box.
 *
 * Each entry: [id, yRatio, xOffsetRatio]
 *   - yRatio:       vertical position as fraction of bbox height (0 = top, 1 = bottom)
 *   - xOffsetRatio: horizontal offset from bbox center as fraction of bbox width
 *                   (negative = left, positive = right, 0 = center)
 *
 * Based on standard human body proportions (head ~1/8 of total height).
 */
const HUMANOID_PROPORTIONS = [
  // Head: top of bbox
  ['head',         0.05,  0.0],
  // Neck: just below head
  ['neck',         0.15,  0.0],
  // Shoulders: ~20% down, offset by ~15% of width
  ['l_shoulder',   0.20, -0.15],
  ['r_shoulder',   0.20,  0.15],
  // Elbows: ~40% down, offset by ~20% of width
  ['l_elbow',      0.40, -0.22],
  ['r_elbow',      0.40,  0.22],
  // Wrists: ~55% down, offset by ~18% of width
  ['l_wrist',      0.55, -0.18],
  ['r_wrist',      0.55,  0.18],
  // Hips: ~58% down, offset by ~10% of width
  ['l_hip',        0.58, -0.10],
  ['r_hip',        0.58,  0.10],
  // Knees: ~78% down, offset by ~8% of width
  ['l_knee',       0.78, -0.08],
  ['r_knee',       0.78,  0.08],
  // Ankles: ~95% down, offset by ~8% of width
  ['l_ankle',      0.95, -0.08],
  ['r_ankle',      0.95,  0.08],
]

/**
 * Estimate 14 humanoid skeleton joints from a BinaryMask.
 *
 * Uses bounding box proportions and centroid to place joints
 * at anatomically reasonable positions for a humanoid silhouette.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @param {{ top:number, left:number, width:number, height:number }} [bbox]
 *        Optional precomputed bbox (e.g. from ConnectedComponents P2). When
 *        omitted, the bbox is derived from the mask.
 * @returns {import('../types/characterData.js').JointPositionList}
 */
export function estimateSkeleton(mask, bbox = getMaskBoundingBox(mask)) {
  if (!bbox) return []

  const centroid = getMaskCentroid(mask)

  // Use centroid as the center-x reference (more robust than bbox center for
  // asymmetric silhouettes), but fall back to bbox center if centroid is null.
  const centerX = centroid ? centroid.cx : bbox.left + bbox.width / 2

  const joints = []

  for (const [id, yRatio, xOffsetRatio] of HUMANOID_PROPORTIONS) {
    const x = Math.round(centerX + xOffsetRatio * bbox.width)
    const y = Math.round(bbox.top + yRatio * bbox.height)

    // Clamp to image bounds
    const cx = Math.max(0, Math.min(mask.width - 1, x))
    const cy = Math.max(0, Math.min(mask.height - 1, y))

    joints.push({ id, x: cx, y: cy })
  }

  return joints
}
