// @worker-safe
/**
 * @file BVHParser.js
 * @description Parse .bvh (Biovision Hierarchy) motion capture text into
 * ParsedBVH: joint hierarchy + Forward-Kinematics world positions per frame.
 *
 * No throw — parseBVH returns a structured result. No DOM access.
 *
 * @see docs/superpowers/specs/2026-06-25-bvh-parser-retargeter-design.md
 */

/**
 * @typedef {Object} BVHJoint
 * @property {string} name
 * @property {[number,number,number]} offset
 * @property {string[]} channels
 * @property {number} parent  - index into joints[], -1 for root
 */

/**
 * Parse the HIERARCHY block.
 * @param {string[]} lines
 * @returns {{ joints: BVHJoint[], motionStart: number }}
 */
export function parseHierarchy(lines) {
  const joints = []
  const stack = []        // stack of joint indices (open braces)
  let motionStart = -1

  for (let i = 0; i < lines.length; i++) {
    const tok = lines[i].trim().split(/\s+/)
    const kw = tok[0]

    if (kw === 'ROOT' || kw === 'JOINT') {
      const parent = stack.length ? stack[stack.length - 1] : -1
      joints.push({ name: tok[1], offset: [0, 0, 0], channels: [], parent })
    } else if (kw === 'End') {
      // "End Site" — leaf endpoint, no channels
      const parent = stack.length ? stack[stack.length - 1] : -1
      joints.push({ name: '__End', offset: [0, 0, 0], channels: [], parent })
      // handle "End Site {" all on one line
      if (tok[2] === '{') {
        stack.push(joints.length - 1)
      }
    } else if (kw === '{') {
      stack.push(joints.length - 1)
    } else if (kw === '}') {
      stack.pop()
    } else if (kw === 'OFFSET') {
      const j = joints[joints.length - 1]
      j.offset = [parseFloat(tok[1]), parseFloat(tok[2]), parseFloat(tok[3])]
    } else if (kw === 'CHANNELS') {
      const j = joints[joints.length - 1]
      const n = parseInt(tok[1], 10)
      j.channels = tok.slice(2, 2 + n)
    } else if (kw === 'MOTION') {
      // find the "Frame Time:" line; data starts on the next line
      let k = i + 1
      while (k < lines.length && !/^\s*Frame Time/i.test(lines[k])) k++
      motionStart = k + 1
      break
    }
  }

  return { joints, motionStart }
}
