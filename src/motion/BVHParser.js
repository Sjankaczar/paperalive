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

/**
 * Parse the MOTION block.
 * @param {string[]} lines
 * @param {number} motionStart - first data-line index (from parseHierarchy)
 * @returns {{ frames: number[][], frameTime: number }}
 */
export function parseMotion(lines, motionStart) {
  // "Frame Time:" is on the line just before motionStart
  let frameTime = 1 / 30
  const ftLine = lines[motionStart - 1]
  if (ftLine && /Frame Time/i.test(ftLine)) {
    frameTime = parseFloat(ftLine.split(':')[1])
  }

  const frames = []
  for (let i = motionStart; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    frames.push(line.split(/\s+/).map(Number))
  }
  return { frames, frameTime }
}

// ─── 4×4 matrix helpers (row-major, plain Array(16)) ────────────────────────

const DEG2RAD = Math.PI / 180

function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
}

function mat4Mul(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[r*4+c] = a[r*4+0]*b[0*4+c] + a[r*4+1]*b[1*4+c] + a[r*4+2]*b[2*4+c] + a[r*4+3]*b[3*4+c]
    }
  }
  return out
}

function mat4Translate(x, y, z) {
  return [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1]
}

function mat4RotX(deg) {
  const c = Math.cos(deg*DEG2RAD), s = Math.sin(deg*DEG2RAD)
  return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]
}

function mat4RotY(deg) {
  const c = Math.cos(deg*DEG2RAD), s = Math.sin(deg*DEG2RAD)
  return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]
}

function mat4RotZ(deg) {
  const c = Math.cos(deg*DEG2RAD), s = Math.sin(deg*DEG2RAD)
  return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]
}

/**
 * Forward Kinematics: world position of every joint, every frame.
 * @param {BVHJoint[]} joints
 * @param {number[][]} frames - flat channel values per frame
 * @returns {Array<Array<{x:number,y:number,z:number}>>}
 */
export function computeFK(joints, frames) {
  // Precompute channel start index for each joint within a frame row.
  const chanStart = []
  let acc = 0
  for (const j of joints) {
    chanStart.push(acc)
    acc += j.channels.length
  }

  const out = []
  for (const frame of frames) {
    const world = new Array(joints.length)
    const positions = new Array(joints.length)

    for (let ji = 0; ji < joints.length; ji++) {
      const j = joints[ji]
      let tx = j.offset[0], ty = j.offset[1], tz = j.offset[2]
      let rot = mat4Identity()

      const base = chanStart[ji]
      for (let ci = 0; ci < j.channels.length; ci++) {
        const val = frame[base + ci]
        switch (j.channels[ci]) {
          case 'Xposition': tx += val; break
          case 'Yposition': ty += val; break
          case 'Zposition': tz += val; break
          case 'Xrotation': rot = mat4Mul(rot, mat4RotX(val)); break
          case 'Yrotation': rot = mat4Mul(rot, mat4RotY(val)); break
          case 'Zrotation': rot = mat4Mul(rot, mat4RotZ(val)); break
        }
      }

      const local = mat4Mul(mat4Translate(tx, ty, tz), rot)
      const m = j.parent === -1 ? local : mat4Mul(world[j.parent], local)
      world[ji] = m
      // translation column = world position (row-major indices 3,7,11)
      positions[ji] = { x: m[3], y: m[7], z: m[11] }
    }
    out.push(positions)
  }
  return out
}

/**
 * Parse a full .bvh document.
 * @param {string} text
 * @returns {{success:true,data:{joints:BVHJoint[],framesFK:Array<Array<{x,y,z}>>,frameTime:number}}
 *          |{success:false,error:string,message:string}}
 */
export function parseBVH(text) {
  if (!text || text.trim() === '') {
    return { success: false, error: 'EMPTY_INPUT', message: 'BVH text kosong' }
  }
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = norm.split('\n')

  if (!/^\s*MOTION\s*$/m.test(norm)) {
    return { success: false, error: 'NO_MOTION_SECTION', message: 'Tidak ada blok MOTION' }
  }

  const { joints, motionStart } = parseHierarchy(lines)
  if (joints.length === 0) {
    return { success: false, error: 'MALFORMED_HIERARCHY', message: 'Tidak ada joint' }
  }

  const { frames, frameTime } = parseMotion(lines, motionStart)
  if (frames.length === 0) {
    return { success: false, error: 'FRAME_COUNT_MISMATCH', message: 'Tidak ada data frame' }
  }

  const framesFK = computeFK(joints, frames)
  return { success: true, data: { joints, framesFK, frameTime } }
}
