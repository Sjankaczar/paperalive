import { describe, it, expect } from 'vitest'
import { projectFrames, stripRoot, retargetBVH, JOINT_MAP } from './BVHRetargeter.js'

describe('projectFrames', () => {
  const fk = [
    [ { x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 } ],
  ]

  it('side projection uses z as x and flips y', () => {
    const out = projectFrames(fk, 'side')
    expect(out[0][0]).toEqual({ x: 3, y: -2 })
    expect(out[0][1]).toEqual({ x: 6, y: -5 })
  })

  it('front projection uses x as x and flips y', () => {
    const out = projectFrames(fk, 'front')
    expect(out[0][0]).toEqual({ x: 1, y: -2 })
    expect(out[0][1]).toEqual({ x: 4, y: -5 })
  })
})

describe('stripRoot', () => {
  it('makes the root joint sit at origin every frame', () => {
    const frames = [
      [ { x: 0, y: 0 }, { x: 5, y: 5 } ],
      [ { x: 2, y: 3 }, { x: 7, y: 8 } ],   // root drifted by (2,3)
    ]
    const out = stripRoot(frames, 0)
    expect(out[0][0]).toEqual({ x: 0, y: 0 })
    expect(out[1][0]).toEqual({ x: 0, y: 0 })   // root pinned
    expect(out[1][1]).toEqual({ x: 5, y: 5 })   // child drift removed
  })
})

// Build a ParsedBVH stub: root Hips + the 14 mappable joints, 2 frames.
function makeStub() {
  const names = [
    'Hips',
    'Head','Neck','LeftArm','RightArm','LeftForeArm','RightForeArm',
    'LeftHand','RightHand','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg',
    'LeftFoot','RightFoot',
  ]
  const joints = names.map((name, i) => ({
    name, offset: [0,0,0], channels: [], parent: i === 0 ? -1 : 0,
  }))
  // frame 0 rest: spread joints along y. frame 1: whole body drifts +10x, plus LeftHand +4y.
  const rest = names.map((_, i) => ({ x: 0, y: i * 5, z: 0 }))
  const f1 = rest.map(p => ({ x: p.x + 10, y: p.y, z: p.z }))
  const handIdx = names.indexOf('LeftHand')
  f1[handIdx] = { x: f1[handIdx].x, y: f1[handIdx].y + 4, z: 0 }
  return { joints, framesFK: [rest, f1], frameTime: 1/24 }
}

describe('retargetBVH', () => {
  it('produces a MotionClip with {dx,dy} for the 14 joints', () => {
    const res = retargetBVH(makeStub(), { projection: 'front', fps: 24 })
    expect(res.success).toBe(true)
    const clip = res.data
    expect(clip.fps).toBe(24)
    expect(clip.loop).toBe(true)
    const j0 = clip.frames[0].joints
    for (const id of ['head','neck','l_shoulder','r_shoulder','l_elbow','r_elbow','l_wrist','r_wrist','l_hip','r_hip','l_knee','r_knee','l_ankle','r_ankle']) {
      expect(j0[id]).toBeDefined()
      expect(typeof j0[id].dx).toBe('number')
      expect(typeof j0[id].dy).toBe('number')
    }
  })

  it('strips root drift: a joint that only moved with the root has ~0 offset', () => {
    const res = retargetBVH(makeStub(), { projection: 'front', fps: 24 })
    // head only moved because root drifted +10x → after strip, dx ≈ 0
    expect(Math.abs(res.data.frames[1].joints.head.dx)).toBeLessThan(1e-6)
  })

  it('fails with NO_MAPPABLE_JOINTS when no joint names match', () => {
    const stub = { joints: [{ name: 'Foo', offset:[0,0,0], channels:[], parent:-1 }], framesFK: [[{x:0,y:0,z:0}]], frameTime: 1/24 }
    const res = retargetBVH(stub, {})
    expect(res.success).toBe(false)
    expect(res.error).toBe('NO_MAPPABLE_JOINTS')
  })

  it('downsamples a 48fps source to 24fps (~half the frames)', () => {
    const stub = makeStub()
    stub.framesFK = [stub.framesFK[0], stub.framesFK[1], stub.framesFK[0], stub.framesFK[1]]
    stub.frameTime = 1/48
    const res = retargetBVH(stub, { fps: 24 })
    expect(res.success).toBe(true)
    expect(res.data.frames.length).toBe(2)
  })
})
