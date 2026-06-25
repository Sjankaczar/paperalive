// @worker-safe
/**
 * @file BVHRetargeter.js
 * @description Convert ParsedBVH (3D FK positions) into a 2D MotionClip
 * (`{dx,dy}` offsets) compatible with MotionClipPlayer.
 *
 * @see docs/superpowers/specs/2026-06-25-bvh-parser-retargeter-design.md
 */

/**
 * Project 3D FK frames to 2D.
 * @param {Array<Array<{x,y,z}>>} framesFK
 * @param {'side'|'front'} projection
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function projectFrames(framesFK, projection) {
  return framesFK.map(frame =>
    frame.map(p => projection === 'front'
      ? { x: p.x, y: -p.y }   // flip Y: BVH y-up → screen y-down
      : { x: p.z, y: -p.y })  // 'side'
  )
}

/**
 * Subtract the root joint position from every joint, every frame.
 * Removes global translation so motion plays in-place.
 * @param {Array<Array<{x,y}>>} frames2d
 * @param {number} rootIndex
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function stripRoot(frames2d, rootIndex) {
  return frames2d.map(frame => {
    const r = frame[rootIndex]
    return frame.map(p => ({ x: p.x - r.x, y: p.y - r.y }))
  })
}
