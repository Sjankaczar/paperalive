import { describe, it, expect } from 'vitest'
import { projectFrames, stripRoot } from './BVHRetargeter.js'

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
