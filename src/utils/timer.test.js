/**
 * @file timer.test.js
 * @description Unit tests for timer.js — startTimer, endTimer, getTimerLog.
 * Corresponds to: TASK-009.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  startTimer,
  endTimer,
  getTimerLog,
  clearTimerLog,
  getLastEntry,
} from './timer.js'

beforeEach(() => {
  clearTimerLog()
})

// ─── startTimer / endTimer ───────────────────────────────────────────────────

describe('startTimer / endTimer', () => {
  it('returns duration in ms after a short delay', async () => {
    startTimer('test-delay')
    // Wait at least 10ms
    await new Promise((resolve) => setTimeout(resolve, 15))
    const ms = endTimer('test-delay')
    expect(ms).toBeGreaterThanOrEqual(10)
  })

  it('returns -1 if label was never started', () => {
    const result = endTimer('nonexistent')
    expect(result).toBe(-1)
  })

  it('returns positive duration for immediate call', () => {
    startTimer('instant')
    const ms = endTimer('instant')
    expect(ms).toBeGreaterThanOrEqual(0)
  })

  it('supports multiple concurrent timers', async () => {
    startTimer('a')
    await new Promise((r) => setTimeout(r, 5))
    startTimer('b')
    await new Promise((r) => setTimeout(r, 5))

    const durB = endTimer('b')
    const durA = endTimer('a')

    // b started after a — durA should be longer
    expect(durA).toBeGreaterThan(durB)
  })

  it('overwriting an active timer resets start time', async () => {
    startTimer('reset-test')
    await new Promise((r) => setTimeout(r, 20))
    startTimer('reset-test')  // restart
    const ms = endTimer('reset-test')
    // Should be much less than 20ms since we restarted
    expect(ms).toBeLessThan(20)
  })
})

// ─── getTimerLog ─────────────────────────────────────────────────────────────

describe('getTimerLog', () => {
  it('returns empty array before any measurements', () => {
    expect(getTimerLog()).toEqual([])
  })

  it('records completed measurements', async () => {
    startTimer('recorded')
    await new Promise((r) => setTimeout(r, 5))
    endTimer('recorded')

    const log = getTimerLog()
    expect(log.length).toBe(1)
    expect(log[0].label).toBe('recorded')
    expect(log[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('accumulates multiple entries', () => {
    startTimer('first')
    endTimer('first')
    startTimer('second')
    endTimer('second')

    const log = getTimerLog()
    expect(log.length).toBe(2)
    expect(log[0].label).toBe('first')
    expect(log[1].label).toBe('second')
  })

  it('returns a copy — modifying it does not affect internal log', () => {
    startTimer('copy-test')
    endTimer('copy-test')

    const log = getTimerLog()
    log.push({ label: 'injected', startMs: 0, endMs: 0, durationMs: 0 })

    // Internal log should still have only 1 entry
    expect(getTimerLog().length).toBe(1)
  })

  it('each entry has required fields', () => {
    startTimer('fields')
    endTimer('fields')

    const entry = getTimerLog()[0]
    expect(typeof entry.label).toBe('string')
    expect(typeof entry.startMs).toBe('number')
    expect(typeof entry.endMs).toBe('number')
    expect(typeof entry.durationMs).toBe('number')
  })
})

// ─── clearTimerLog ────────────────────────────────────────────────────────────

describe('clearTimerLog', () => {
  it('empties the log', () => {
    startTimer('temp')
    endTimer('temp')
    clearTimerLog()
    expect(getTimerLog()).toEqual([])
  })
})

// ─── getLastEntry ─────────────────────────────────────────────────────────────

describe('getLastEntry', () => {
  it('returns undefined for nonexistent label', () => {
    expect(getLastEntry('missing')).toBeUndefined()
  })

  it('returns most recent entry for label', () => {
    startTimer('repeat')
    endTimer('repeat')
    startTimer('repeat')
    endTimer('repeat')

    const log = getTimerLog()
    const last = getLastEntry('repeat')
    expect(last).toBe(log[log.length - 1])
  })
})
