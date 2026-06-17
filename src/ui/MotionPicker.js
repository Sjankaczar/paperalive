/**
 * @file MotionPicker.js
 * @description Dropdown + play/stop buttons for motion clip selection.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-133
 */

const CLIPS = [
  { id: 'idle',  label: 'Diam' },
  { id: 'walk',  label: 'Jalan' },
  { id: 'run',   label: 'Lari' },
  { id: 'jump',  label: 'Lompat' },
  { id: 'wave',  label: 'Lambaian' },
  { id: 'dance', label: 'Menari' },
]

/**
 * Motion picker component for PENTAS stage.
 */
export class MotionPicker {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks
   * @param {(clipId: string) => void} callbacks.onClipSelected
   * @param {() => void} callbacks.onPlay
   * @param {() => void} callbacks.onStop
   */
  constructor(container, callbacks) {
    this._container = container
    this._onClipSelected = callbacks.onClipSelected
    this._onPlay = callbacks.onPlay
    this._onStop = callbacks.onStop

    /** @type {HTMLElement|null} */
    this._el = null

    this.mount()
  }

  /**
   * Mount the motion picker UI.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-motion-picker'

    // Dropdown
    const select = document.createElement('select')
    select.className = 'paperalive-select'
    select.setAttribute('aria-label', 'Pilih gerakan')

    for (const clip of CLIPS) {
      const opt = document.createElement('option')
      opt.value = clip.id
      opt.textContent = clip.label
      select.appendChild(opt)
    }

    select.addEventListener('change', () => {
      this._onClipSelected?.(select.value)
    })

    el.appendChild(select)

    // Play button
    const playBtn = document.createElement('button')
    playBtn.className = 'paperalive-btn paperalive-btn-small paperalive-btn-play'
    playBtn.textContent = '▶ Play'
    playBtn.setAttribute('aria-label', 'Putar animasi')
    playBtn.addEventListener('click', () => this._onPlay?.())
    el.appendChild(playBtn)

    // Stop button
    const stopBtn = document.createElement('button')
    stopBtn.className = 'paperalive-btn paperalive-btn-small paperalive-btn-stop'
    stopBtn.textContent = '⏹ Stop'
    stopBtn.setAttribute('aria-label', 'Hentikan animasi')
    stopBtn.addEventListener('click', () => this._onStop?.())
    el.appendChild(stopBtn)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Select a clip by id (programmatic).
   * @param {string} clipId
   */
  selectClip(clipId) {
    if (this._el) {
      const select = this._el.querySelector('select')
      if (select) select.value = clipId
    }
    this._onClipSelected?.(clipId)
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
