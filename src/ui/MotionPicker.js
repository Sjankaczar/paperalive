/**
 * @file MotionPicker.js
 * @description Dropdown + play/stop buttons for motion clip selection.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-133
 */

import { parseBVH } from '../motion/BVHParser.js'
import { retargetBVH } from '../motion/BVHRetargeter.js'
import { toast } from './toast.js'

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
   * @param {(clip: object) => void} callbacks.onBVHImported
   */
  constructor(container, callbacks) {
    this._container = container
    this._onClipSelected = callbacks.onClipSelected
    this._onPlay = callbacks.onPlay
    this._onStop = callbacks.onStop
    this._onBVHImported = callbacks.onBVHImported

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

    // Hidden file input for BVH import
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.bvh'
    fileInput.style.display = 'none'
    fileInput.addEventListener('change', (e) => this._handleFile(e))
    el.appendChild(fileInput)

    // Import BVH button
    const importBtn = document.createElement('button')
    importBtn.className = 'paperalive-btn paperalive-btn-small'
    importBtn.textContent = '⬆ Import BVH'
    importBtn.setAttribute('aria-label', 'Impor file BVH')
    importBtn.addEventListener('click', () => fileInput.click())
    el.appendChild(importBtn)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Read a .bvh file, parse + retarget, append as a clip option.
   * @param {Event} e
   * @private
   */
  _handleFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseBVH(String(reader.result))
        if (!parsed.success) {
          toast('error', `Gagal baca BVH: ${parsed.message}`)
          return
        }
        const clipId = `bvh_${file.name.replace(/\.bvh$/i, '')}`
        const retarget = retargetBVH(parsed.data, { id: clipId })
        if (!retarget.success) {
          toast('error', `Gagal retarget BVH: ${retarget.message}`)
          return
        }
        const select = this._el && this._el.querySelector('select')
        const exists = select && Array.from(select.options).some(o => o.value === clipId)
        if (select && !exists) {
          const opt = document.createElement('option')
          opt.value = clipId
          opt.textContent = `BVH: ${file.name}`
          select.appendChild(opt)
          select.value = clipId
        }
        this._onBVHImported?.(retarget.data)
        toast('success', `BVH "${file.name}" diimpor`)
      } catch (err) {
        toast('error', `Gagal impor BVH: ${err.message}`)
      }
    }
    reader.onerror = () => toast('error', 'Gagal membaca file')
    reader.readAsText(file)
    e.target.value = ''   // allow re-importing the same file
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
