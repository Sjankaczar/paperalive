/**
 * @file MotionClipPlayer.test.js
 * @description Unit tests for MotionClipPlayer — frame interpolation and time advancement.
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-112
 */

import { describe, it, expect } from 'vitest'
import { MotionClipPlayer } from './MotionClipPlayer.js'

// Import clip JSON directly (Vite handles .json imports natively)
import idleClip from './clips/idle.json'
import walkClip from './clips/walk.json'
import runClip from './clips/run.json'
import jumpClip from './clips/jump.json'
import waveClip from './clips/wave.json'
import danceClip from './clips/dance.json'

const ALL_CLIPS = [idleClip, walkClip, runClip, jumpClip, waveClip, danceClip]

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Create a simple walk-like clip with 3 frames for easy math.
 */
function makeSimpleClip() {
  return {
    id: 'test_walk',
    fps: 24,
    loop: true,
    frames: [
      { joints: { head: { dx: 0, dy: 0 }, l_hand: { dx: -10, dy: 0 } } },
      { joints: { head: { dx: 0, dy: -2 }, l_hand: { dx: 0, dy: -5 } } },
      { joints: { head: { dx: 0, dy: 0 }, l_hand: { dx: 10, dy: 0 } } },
    ],
  }
}

/**
 * Create a non-looping clip with 2 frames.
 */
function makeOneShotClip() {
  return {
    id: 'test_jump',
    fps: 24,
    loop: false,
    frames: [
      { joints: { body: { dx: 0, dy: 0 } } },
      { joints: { body: { dx: 0, dy: -20 } } },
    ],
  }
}

const REST_POSE = new Map([
  ['head', [100, 50]],
  ['l_hand', [60, 120]],
  ['body', [100, 100]],
])

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('MotionClipPlayer', () => {
  describe('loadClip', () => {
    it('should load a valid clip and reset t to 0', () => {
      const player = new MotionClipPlayer()
      const clip = makeSimpleClip()
      player.loadClip(clip)

      expect(player.clip).toBe(clip)
      expect(player.t).toBe(0)
    })

    it('should throw on invalid clip (no frames)', () => {
      const player = new MotionClipPlayer()
      expect(() => player.loadClip({ id: 'bad', fps: 24, loop: true, frames: [] }))
        .toThrow('frames array required')
    })

    it('should throw on null clip', () => {
      const player = new MotionClipPlayer()
      expect(() => player.loadClip(null)).toThrow()
    })
  })

  describe('setFrame', () => {
    it('should set t to 0 (start)', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(0)
      expect(player.t).toBe(0)
    })

    it('should set t to 1 (end)', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(1)
      expect(player.t).toBe(1)
    })

    it('should clamp t to [0, 1]', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(-0.5)
      expect(player.t).toBe(0)
      player.setFrame(1.5)
      expect(player.t).toBe(1)
    })

    it('should do nothing if no clip loaded', () => {
      const player = new MotionClipPlayer()
      player.setFrame(0.5)
      expect(player.t).toBe(0)
    })
  })

  describe('getCurrentJoints — frame interpolation', () => {
    it('should return rest + frame 0 offsets at t=0', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(0)

      const joints = player.getCurrentJoints(REST_POSE)

      // Frame 0: head dx=0,dy=0 → rest (100,50)
      expect(joints.get('head')).toEqual([100, 50])
      // Frame 0: l_hand dx=-10,dy=0 → rest (60,120) + (-10,0) = (50,120)
      expect(joints.get('l_hand')).toEqual([50, 120])
    })

    it('should interpolate at t=0.5 between frame 1 and frame 2', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(0.5)

      const joints = player.getCurrentJoints(REST_POSE)

      // At t=0.5: floatFrame = 0.5 * 2 = 1.0 → frameA=1, frameB=1, alpha=0
      // Frame 1: head dy=-2, l_hand dx=0, dy=-5
      expect(joints.get('head')).toEqual([100, 48])
      expect(joints.get('l_hand')).toEqual([60, 115])
    })

    it('should interpolate between frame 0 and frame 1 at t=0.25', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())
      player.setFrame(0.25)

      const joints = player.getCurrentJoints(REST_POSE)

      // floatFrame = 0.25 * 2 = 0.5 → frameA=0, frameB=1, alpha=0.5
      // head: dx = 0 + (0-0)*0.5 = 0, dy = 0 + (-2-0)*0.5 = -1
      expect(joints.get('head')[0]).toBeCloseTo(100)
      expect(joints.get('head')[1]).toBeCloseTo(49)

      // l_hand: dx = -10 + (0-(-10))*0.5 = -5, dy = 0 + (-5-0)*0.5 = -2.5
      expect(joints.get('l_hand')[0]).toBeCloseTo(55)
      expect(joints.get('l_hand')[1]).toBeCloseTo(117.5)
    })

    it('should return rest pose when no clip loaded', () => {
      const player = new MotionClipPlayer()
      const joints = player.getCurrentJoints(REST_POSE)

      expect(joints.get('head')).toEqual([100, 50])
      expect(joints.get('l_hand')).toEqual([60, 120])
    })

    it('should handle joints not present in clip offsets (keep rest)', () => {
      const player = new MotionClipPlayer()
      player.loadClip({
        id: 'partial',
        fps: 24,
        loop: true,
        frames: [{ joints: { head: { dx: 5, dy: 0 } } }],
      })
      player.setFrame(0)

      const joints = player.getCurrentJoints(REST_POSE)

      // head has offset → (105, 50)
      expect(joints.get('head')).toEqual([105, 50])
      // l_hand not in clip → rest (60, 120)
      expect(joints.get('l_hand')).toEqual([60, 120])
    })
  })

  describe('advance — time-based playback', () => {
    it('should advance t based on fps and dt', () => {
      const player = new MotionClipPlayer()
      // 3 frames, 24fps → totalDuration = (1000/24) * 2 = 83.33ms
      player.loadClip(makeSimpleClip())

      // Advance by half the total duration → t should be ~0.5
      const totalDuration = (1000 / 24) * 2
      player.advance(totalDuration * 0.5)

      expect(player.t).toBeCloseTo(0.5, 1)
    })

    it('should wrap to start when loop=true and t exceeds 1', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())

      const totalDuration = (1000 / 24) * 2
      // Advance past the end
      player.advance(totalDuration * 1.5)

      // t should wrap: 1.5 % 1 = 0.5
      expect(player.t).toBeCloseTo(0.5, 1)
    })

    it('should clamp to 1 when loop=false and t exceeds 1', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeOneShotClip())

      const totalDuration = (1000 / 24) * 1 // 2 frames = 1 interval
      player.advance(totalDuration * 2) // advance well past end

      expect(player.t).toBe(1)
    })

    it('should not advance when fps=0 (idle clip)', () => {
      const player = new MotionClipPlayer()
      player.loadClip({ id: 'idle', fps: 0, loop: true, frames: [{ joints: {} }] })

      player.advance(1000)
      expect(player.t).toBe(0)
    })

    it('should return to t=0 after advancing exactly one full loop cycle', () => {
      const player = new MotionClipPlayer()
      player.loadClip(makeSimpleClip())

      const totalDuration = (1000 / 24) * 2
      player.advance(totalDuration)

      // t = 1.0 which wraps to 0.0 for loop=true
      expect(player.t).toBeCloseTo(0, 5)
    })

    it('advance past end with loop=true wraps to start (acceptance)', () => {
      const player = new MotionClipPlayer()
      // 24 frames, 24fps → 1 second total
      const frames = Array.from({ length: 24 }, (_, i) => ({
        joints: { x: { dx: i, dy: 0 } },
      }))
      player.loadClip({ id: 'full', fps: 24, loop: true, frames })

      const frameDuration = 1000 / 24
      // Advance 24 times by one frame duration
      for (let i = 0; i < 24; i++) {
        player.advance(frameDuration)
      }

      // After 24 frame-advances (1 full cycle), should wrap back near 0
      expect(player.t).toBeLessThan(0.05)
    })

    it('advance past end with loop=false stops at last frame (acceptance)', () => {
      const player = new MotionClipPlayer()
      const frames = Array.from({ length: 24 }, (_, i) => ({
        joints: { x: { dx: i, dy: 0 } },
      }))
      player.loadClip({ id: 'oneshot', fps: 24, loop: false, frames })

      const frameDuration = 1000 / 24
      for (let i = 0; i < 30; i++) {
        player.advance(frameDuration)
      }

      // Should be clamped at t=1 (last frame)
      expect(player.t).toBe(1)
    })
  })

  describe('MotionClip JSON validation', () => {
    it('walk.json should have loop=true, fps=24, ≥24 frames', () => {
      expect(walkClip.loop).toBe(true)
      expect(walkClip.fps).toBe(24)
      expect(walkClip.frames.length).toBeGreaterThanOrEqual(24)
    })

    it('idle.json should have fps=0, single frame with empty joints', () => {
      expect(idleClip.fps).toBe(0)
      expect(idleClip.frames.length).toBe(1)
      expect(idleClip.frames[0].joints).toEqual({})
    })

    it('jump.json should have loop=false', () => {
      expect(jumpClip.loop).toBe(false)
    })

    it('all clips should have id, fps, loop, and frames array', () => {
      for (const clip of ALL_CLIPS) {
        expect(clip).toHaveProperty('id')
        expect(clip).toHaveProperty('fps')
        expect(clip).toHaveProperty('loop')
        expect(clip).toHaveProperty('frames')
        expect(Array.isArray(clip.frames)).toBe(true)
      }
    })

    it('all dx/dy offsets should be in [-50, 50] range', () => {
      for (const clip of ALL_CLIPS) {
        for (const frame of clip.frames) {
          for (const offset of Object.values(frame.joints)) {
            expect(offset.dx).toBeGreaterThanOrEqual(-50)
            expect(offset.dx).toBeLessThanOrEqual(50)
            expect(offset.dy).toBeGreaterThanOrEqual(-50)
            expect(offset.dy).toBeLessThanOrEqual(50)
          }
        }
      }
    })
  })
})
