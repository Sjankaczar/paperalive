/**
 * @file ExportPanel.js
 * @description Export UI — record button, recording overlay, timer, codec detection.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-134
 */

import { toast } from './toast.js'

/**
 * Export panel component.
 */
export class ExportPanel {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks
   * @param {() => void} callbacks.onRecordStart
   * @param {() => void} callbacks.onRecordStop
   */
  constructor(container, callbacks) {
    this._container = container
    this._onRecordStart = callbacks.onRecordStart
    this._onRecordStop = callbacks.onRecordStop

    /** @type {HTMLElement|null} */
    this._el = null
    /** @type {boolean} */
    this._isRecording = false
    /** @type {number} */
    this._timerInterval = 0
    /** @type {number} */
    this._recordStartTime = 0
    /** @type {HTMLElement|null} */
    this._timerDisplay = null
    /** @type {HTMLButtonElement|null} */
    this._recordBtn = null
    /** @type {HTMLButtonElement|null} */
    this._stopBtn = null

    this.mount()
  }

  /**
   * Mount the export panel UI.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-export-panel'

    // Record button
    const recordBtn = document.createElement('button')
    recordBtn.className = 'paperalive-btn paperalive-btn-danger'
    recordBtn.textContent = '🔴 Rekam'
    recordBtn.setAttribute('aria-label', 'Mulai merekam video')
    recordBtn.addEventListener('click', () => this._startRecording())
    this._recordBtn = recordBtn
    el.appendChild(recordBtn)

    // Stop button (hidden initially)
    const stopBtn = document.createElement('button')
    stopBtn.className = 'paperalive-btn paperalive-btn-secondary'
    stopBtn.textContent = '⏹ Stop Recording'
    stopBtn.setAttribute('aria-label', 'Hentikan perekaman')
    stopBtn.style.display = 'none'
    stopBtn.addEventListener('click', () => this._stopRecording())
    this._stopBtn = stopBtn
    el.appendChild(stopBtn)

    // Recording overlay (hidden initially)
    const overlay = document.createElement('div')
    overlay.className = 'paperalive-recording-overlay'
    overlay.style.display = 'none'

    const timer = document.createElement('span')
    timer.className = 'paperalive-recording-timer'
    timer.textContent = 'Recording... 0:00'
    overlay.appendChild(timer)

    this._timerDisplay = timer
    el.appendChild(overlay)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Start recording.
   */
  _startRecording() {
    if (this._isRecording) return
    this._isRecording = true
    this._recordStartTime = Date.now()

    // Show overlay, hide record, show stop
    if (this._recordBtn) this._recordBtn.style.display = 'none'
    if (this._stopBtn) this._stopBtn.style.display = ''
    if (this._timerDisplay?.parentElement) this._timerDisplay.parentElement.style.display = ''

    // Start timer
    this._timerInterval = setInterval(() => this._updateTimer(), 1000)
    this._updateTimer()

    toast('info', 'Kualitas direkam 30 fps. Live tetap 60 fps.')

    this._onRecordStart?.()
  }

  /**
   * Stop recording.
   */
  _stopRecording() {
    if (!this._isRecording) return
    this._isRecording = false

    clearInterval(this._timerInterval)
    this._timerInterval = 0

    // Hide overlay, show record, hide stop
    if (this._recordBtn) this._recordBtn.style.display = ''
    if (this._stopBtn) this._stopBtn.style.display = 'none'
    if (this._timerDisplay?.parentElement) this._timerDisplay.parentElement.style.display = 'none'

    this._onRecordStop?.()
  }

  /**
   * Update the timer display.
   */
  _updateTimer() {
    if (!this._timerDisplay) return
    const elapsed = Math.floor((Date.now() - this._recordStartTime) / 1000)
    const min = Math.floor(elapsed / 60)
    const sec = String(elapsed % 60).padStart(2, '0')
    this._timerDisplay.textContent = `Recording... ${min}:${sec}`
  }

  /**
   * Show codec error toast.
   */
  showCodecError() {
    toast('error', 'Browser tidak mendukung ekspor video. Coba Chrome atau Firefox.')
  }

  /**
   * Whether currently recording.
   * @returns {boolean}
   */
  get isRecording() {
    return this._isRecording
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._timerInterval) clearInterval(this._timerInterval)
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
