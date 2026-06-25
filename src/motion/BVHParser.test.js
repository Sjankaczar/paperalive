import { describe, it, expect } from 'vitest'
import { parseHierarchy, parseMotion, computeFK, parseBVH } from './BVHParser.js'

const MINI_BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0.0 0.0 0.0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Child
  {
    OFFSET 0.0 10.0 0.0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0.0 5.0 0.0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
0 0 0 0 0 0 0 0 0
0 0 0 0 90 0 0 0 0
`

describe('parseHierarchy', () => {
  it('parses joints, offsets, channels, parent indices', () => {
    const lines = MINI_BVH.split('\n')
    const { joints } = parseHierarchy(lines)

    expect(joints[0].name).toBe('Hips')
    expect(joints[0].parent).toBe(-1)
    expect(joints[0].offset).toEqual([0, 0, 0])
    expect(joints[0].channels).toEqual(['Xposition','Yposition','Zposition','Zrotation','Xrotation','Yrotation'])

    expect(joints[1].name).toBe('Child')
    expect(joints[1].parent).toBe(0)
    expect(joints[1].offset).toEqual([0, 10, 0])
    expect(joints[1].channels).toEqual(['Zrotation','Xrotation','Yrotation'])

    // End Site = joint with no channels, parent Child
    expect(joints[2].name).toBe('__End')
    expect(joints[2].parent).toBe(1)
    expect(joints[2].channels).toEqual([])
    expect(joints[2].offset).toEqual([0, 5, 0])
  })

  it('reports motionStart at the data line after Frame Time', () => {
    const lines = MINI_BVH.split('\n')
    const { motionStart } = parseHierarchy(lines)
    expect(lines[motionStart].trim()).toBe('0 0 0 0 0 0 0 0 0')
  })
})

describe('parseMotion', () => {
  it('parses Frame Time and per-frame channel values', () => {
    const lines = MINI_BVH.split('\n')
    const { motionStart } = parseHierarchy(lines)
    const { frames, frameTime } = parseMotion(lines, motionStart)

    expect(frameTime).toBeCloseTo(0.0333333, 6)
    expect(frames.length).toBe(2)
    expect(frames[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(frames[1]).toEqual([0, 0, 0, 0, 90, 0, 0, 0, 0])
  })
})

describe('computeFK', () => {
  it('places child at parent offset when no rotation', () => {
    const lines = MINI_BVH.split('\n')
    const { joints, motionStart } = parseHierarchy(lines)
    const { frames } = parseMotion(lines, motionStart)
    const fk = computeFK(joints, frames)

    // frame 0: all rotations 0 → Child at its offset (0,10,0)
    expect(fk[0][0].x).toBeCloseTo(0, 5)   // Hips at origin
    expect(fk[0][0].y).toBeCloseTo(0, 5)
    expect(fk[0][1].x).toBeCloseTo(0, 5)   // Child
    expect(fk[0][1].y).toBeCloseTo(10, 5)
    expect(fk[0][1].z).toBeCloseTo(0, 5)
  })

  it('applies parent rotation to child position (X-rotation 90deg)', () => {
    const lines = MINI_BVH.split('\n')
    const { joints, motionStart } = parseHierarchy(lines)
    const { frames } = parseMotion(lines, motionStart)
    const fk = computeFK(joints, frames)

    // frame 1: Hips Xrotation=90 → child offset (0,10,0) rotates y→z
    expect(fk[1][1].x).toBeCloseTo(0, 4)
    expect(fk[1][1].y).toBeCloseTo(0, 4)
    expect(fk[1][1].z).toBeCloseTo(10, 4)
  })
})

describe('parseBVH', () => {
  it('returns success with ParsedBVH shape', () => {
    const res = parseBVH(MINI_BVH)
    expect(res.success).toBe(true)
    expect(res.data.joints.length).toBe(3)
    expect(res.data.framesFK.length).toBe(2)
    expect(res.data.frameTime).toBeCloseTo(0.0333333, 6)
  })

  it('normalizes CRLF line endings', () => {
    const res = parseBVH(MINI_BVH.replace(/\n/g, '\r\n'))
    expect(res.success).toBe(true)
    expect(res.data.framesFK.length).toBe(2)
  })

  it('fails with NO_MOTION_SECTION when MOTION missing', () => {
    const noMotion = MINI_BVH.split('MOTION')[0]
    const res = parseBVH(noMotion)
    expect(res.success).toBe(false)
    expect(res.error).toBe('NO_MOTION_SECTION')
  })

  it('fails with EMPTY_INPUT on blank text', () => {
    const res = parseBVH('   ')
    expect(res.success).toBe(false)
    expect(res.error).toBe('EMPTY_INPUT')
  })
})
