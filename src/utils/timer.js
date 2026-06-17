/**
 * @file timer.js
 * @description Performance measurement utilities using performance.now().
 *
 * Usage:
 *   startTimer("myLabel")
 *   // ... work ...
 *   const ms = endTimer("myLabel")
 *
 *   const log = getTimerLog()  // all measurements
 *   clearTimerLog()            // reset
 */

/**
 * @typedef {Object} TimerEntry
 * @property {string} label      - Timer label
 * @property {number} startMs    - performance.now() at start
 * @property {number} endMs      - performance.now() at end
 * @property {number} durationMs - elapsed time in milliseconds
 */

/** @type {Map<string, number>} Active (unended) timers: label → startMs */
const _activeTimers = new Map()

/** @type {TimerEntry[]} Completed timer measurements */
const _timerLog = []

/**
 * Start a named timer. Overwrites any existing timer with the same label.
 *
 * @param {string} label - Unique name for this measurement
 * @returns {void}
 */
export function startTimer(label) {
  _activeTimers.set(label, performance.now())
}

/**
 * End a named timer and record the measurement.
 *
 * @param {string} label - Same label used in startTimer()
 * @returns {number} Elapsed duration in milliseconds, or -1 if label not found
 */
export function endTimer(label) {
  const startMs = _activeTimers.get(label)
  if (startMs === undefined) {
    return -1
  }

  const endMs = performance.now()
  const durationMs = endMs - startMs

  _activeTimers.delete(label)

  /** @type {TimerEntry} */
  const entry = { label, startMs, endMs, durationMs }
  _timerLog.push(entry)

  return durationMs
}

/**
 * Get a copy of all recorded timer measurements.
 *
 * @returns {TimerEntry[]} Array of all completed measurements (oldest first)
 */
export function getTimerLog() {
  return _timerLog.slice()
}

/**
 * Clear all recorded measurements and any active timers.
 *
 * @returns {void}
 */
export function clearTimerLog() {
  _timerLog.length = 0
  _activeTimers.clear()
}

/**
 * Get the most recent measurement for a given label.
 *
 * @param {string} label
 * @returns {TimerEntry | undefined}
 */
export function getLastEntry(label) {
  for (let i = _timerLog.length - 1; i >= 0; i--) {
    if (_timerLog[i].label === label) return _timerLog[i]
  }
  return undefined
}
