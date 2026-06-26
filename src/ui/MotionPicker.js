/**
 * @file MotionPicker.js
 * @description Dropdown + play/stop buttons for motion clip selection.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-133
 */

import { parseBVH } from '../motion/BVHParser.js'
import { retargetBVH } from '../motion/BVHRetargeter.js'

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
   * @param {(clip: import('../motion/MotionClipPlayer.js').MotionClip) => void} [callbacks.onClipImport]
   */
  constructor(container, callbacks) {
    this._container = container
    this._onClipSelected = callbacks.onClipSelected
    this._onPlay = callbacks.onPlay
    this._onStop = callbacks.onStop
    this._onClipImport = callbacks.onClipImport

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

    // BVH import (P4): hidden file input + trigger button
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.bvh'
    fileInput.style.display = 'none'
    fileInput.addEventListener('change', () => this._handleBVHFile(fileInput))
    el.appendChild(fileInput)

    const importBtn = document.createElement('button')
    importBtn.className = 'paperalive-btn paperalive-btn-small paperalive-btn-import'
    importBtn.textContent = '⬆ Impor BVH'
    importBtn.setAttribute('aria-label', 'Impor gerakan dari file BVH')
    importBtn.addEventListener('click', () => fileInput.click())
    el.appendChild(importBtn)

    this._select = select
    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Read a user-selected .bvh file, retarget it to a MotionClip, append it to
   * the dropdown, and notify via onClipImport.
   * @param {HTMLInputElement} fileInput
   */
  _handleBVHFile(fileInput) {
    const file = fileInput.files && fileInput.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const clipId = `bvh:${file.name}`
        const parsed = parseBVH(String(reader.result))
        if (!parsed.success) throw new Error(parsed.message)
        const retarget = retargetBVH(parsed.data, { id: clipId })
        if (!retarget.success) throw new Error(retarget.message)
        this._addClipOption(clipId, `BVH: ${file.name}`)
        this._onClipImport?.(retarget.data)
        if (this._select) this._select.value = clipId
        this._onClipSelected?.(clipId)
      } catch (err) {
        console.error('BVH import failed:', err)
      } finally {
        fileInput.value = ''
      }
    }
    reader.readAsText(file)
  }

  /**
   * Append (or reuse) an option in the clip dropdown.
   * @param {string} id
   * @param {string} label
   */
  _addClipOption(id, label) {
    if (!this._select) return
    let opt = this._select.querySelector(`option[value="${CSS.escape(id)}"]`)
    if (!opt) {
      opt = document.createElement('option')
      opt.value = id
      opt.textContent = label
      this._select.appendChild(opt)
    }
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
