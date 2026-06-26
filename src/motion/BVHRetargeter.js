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

/**
 * App joint id → candidate BVH joint names (priority order).
 * NOTE: l_shoulder maps to 'LeftArm' (the shoulder joint), NOT 'LeftShoulder'
 * (the clavicle). CMU and Mixamo differ — candidates cover both.
 * Last group of candidates is the Daz/Poser naming (lShldr, lThigh, ...),
 * used by the cgspeed CMU BVH release and the three.js sample BVH.
 */
export const JOINT_MAP = {
  head:       ['Head','mixamorig:Head','head'],
  neck:       ['Neck','mixamorig:Neck','neck'],
  l_shoulder: ['LeftArm','mixamorig:LeftArm','LeftUpArm','lShldr'],
  r_shoulder: ['RightArm','mixamorig:RightArm','RightUpArm','rShldr'],
  l_elbow:    ['LeftForeArm','mixamorig:LeftForeArm','LeftLowArm','lForeArm'],
  r_elbow:    ['RightForeArm','mixamorig:RightForeArm','RightLowArm','rForeArm'],
  l_wrist:    ['LeftHand','mixamorig:LeftHand','lHand'],
  r_wrist:    ['RightHand','mixamorig:RightHand','rHand'],
  l_hip:      ['LeftUpLeg','mixamorig:LeftUpLeg','LHipJoint','LeftHip','lThigh'],
  r_hip:      ['RightUpLeg','mixamorig:RightUpLeg','RHipJoint','RightHip','rThigh'],
  l_knee:     ['LeftLeg','mixamorig:LeftLeg','LeftKnee','lShin'],
  r_knee:     ['RightLeg','mixamorig:RightLeg','RightKnee','rShin'],
  l_ankle:    ['LeftFoot','mixamorig:LeftFoot','LeftAnkle','lFoot'],
  r_ankle:    ['RightFoot','mixamorig:RightFoot','RightAnkle','rFoot'],
}

/**
 * Resolve each app joint id to a BVH joint index (or -1 if absent).
 * @param {import('./BVHParser.js').BVHJoint[]} joints
 * @returns {Object<string, number>}
 */
function resolveJointIndices(joints) {
  const byName = new Map(joints.map((j, i) => [j.name, i]))
  const out = {}
  for (const [appId, candidates] of Object.entries(JOINT_MAP)) {
    out[appId] = -1
    for (const c of candidates) {
      if (byName.has(c)) { out[appId] = byName.get(c); break }
    }
  }
  return out
}

/**
 * Convert ParsedBVH into a MotionClip.
 * @param {{joints,framesFK,frameTime}} parsedBVH
 * @param {{projection?:'side'|'front',fps?:number,loop?:boolean,id?:string,targetHeight?:number}} [options]
 * @returns {{success:true,data:object}|{success:false,error:string,message:string}}
 */
export function retargetBVH(parsedBVH, options = {}) {
  if (!parsedBVH || !parsedBVH.framesFK || parsedBVH.framesFK.length === 0) {
    return { success: false, error: 'INVALID_PARSED_BVH', message: 'ParsedBVH kosong/invalid' }
  }
  const projection = options.projection || 'side'
  const fps = options.fps || 24
  const loop = options.loop !== undefined ? options.loop : true
  const id = options.id || 'bvh_import'
  // ponytail: targetHeight is the calibration knob — tune if motion looks too big/small
  const targetHeight = options.targetHeight || 40

  const idx = resolveJointIndices(parsedBVH.joints)
  const mappedIds = Object.keys(idx).filter(k => idx[k] !== -1)
  if (mappedIds.length === 0) {
    return { success: false, error: 'NO_MAPPABLE_JOINTS', message: 'Tidak ada joint BVH yang cocok dengan 14 joint app' }
  }

  // project + strip root
  let frames2d = projectFrames(parsedBVH.framesFK, projection)
  frames2d = stripRoot(frames2d, 0)

  // scale: map skeleton height (rest frame) to targetHeight
  const rest = frames2d[0]
  let minY = Infinity, maxY = -Infinity
  for (const aid of mappedIds) {
    const p = rest[idx[aid]]
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const bvhHeight = Math.max(maxY - minY, 1e-6)
  const scale = targetHeight / bvhHeight

  // rest reference per mapped joint (scaled)
  const restPos = {}
  for (const aid of mappedIds) {
    const p = rest[idx[aid]]
    restPos[aid] = { x: p.x * scale, y: p.y * scale }
  }

  // downsample
  const srcFps = 1 / parsedBVH.frameTime
  const ratio = Math.max(srcFps / fps, 1)
  const srcCount = frames2d.length
  const outCount = Math.max(Math.round(srcCount / ratio), 1)

  const frames = []
  for (let i = 0; i < outCount; i++) {
    const srcIdx = Math.min(Math.round(i * ratio), srcCount - 1)
    const frame = frames2d[srcIdx]
    const joints = {}
    for (const aid of mappedIds) {
      const p = frame[idx[aid]]
      joints[aid] = {
        dx: p.x * scale - restPos[aid].x,
        dy: p.y * scale - restPos[aid].y,
      }
    }
    frames.push({ joints })
  }

  return { success: true, data: { id, fps, loop, frames } }
}
