import { describe, it, expect } from 'vitest'
import { parseHierarchy, parseMotion } from './BVHParser.js'

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
0 0 0 0 0 90 0 0 0
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
    expect(frames[1]).toEqual([0, 0, 0, 0, 0, 90, 0, 0, 0])
  })
})
