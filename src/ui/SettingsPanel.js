/**
 * @file SettingsPanel.js
 * @description Settings panel overlay with NPR rendering parameters.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-138
 */

import { NPR_DEFAULTS } from '../rendering/NPRRenderer.js'

/**
 * Settings panel component.
 */
export class SettingsPanel {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks
   * @param {(key: string, value: any) => void} callbacks.onSettingChange
   * @param {() => void} callbacks.onReset
   */
  constructor(container, callbacks) {
    this._container = container
    this._onSettingChange = callbacks.onSettingChange
    this._onReset = callbacks.onReset
    this._el = null
    this._visible = false
  }

  /**
   * Toggle visibility.
   */
  toggle() {
    this._visible ? this.hide() : this.show()
  }

  /**
   * Show the settings panel.
   */
  show() {
    if (this._visible) return
    this._visible = true
    this._mount()
  }

  /**
   * Hide the settings panel.
   */
  hide() {
    if (!this._visible) return
    this._visible = false
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }

  /**
   * Mount the settings panel.
   */
  _mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-settings-panel'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-label', 'Pengaturan rendering')

    const header = document.createElement('div')
    header.className = 'paperalive-settings-header'

    const title = document.createElement('h3')
    title.textContent = '⚙ Pengaturan Rendering'
    header.appendChild(title)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'paperalive-btn paperalive-btn-small'
    closeBtn.textContent = '✕'
    closeBtn.setAttribute('aria-label', 'Tutup pengaturan')
    closeBtn.addEventListener('click', () => this.hide())
    header.appendChild(closeBtn)

    el.appendChild(header)

    // Settings grid
    const grid = document.createElement('div')
    grid.className = 'paperalive-settings-grid'

    // Paper color
    this._addColorSetting(grid, 'paperColor', 'Warna Kertas', NPR_DEFAULTS.paperColor)
    // Outline scale
    this._addSlider(grid, 'outlineScale', 'Skala Outline', 0.95, 1.10, 0.005, NPR_DEFAULTS.outlineScale)
    // Outline color
    this._addColorSetting(grid, 'outlineColor', 'Warna Outline', NPR_DEFAULTS.outlineColor)
    // Outline opacity
    this._addSlider(grid, 'outlineOpacity', 'Opasitas Outline', 0, 1, 0.05, NPR_DEFAULTS.outlineOpacity)
    // Shadow opacity
    this._addSlider(grid, 'shadowOpacity', 'Opasitas Bayangan', 0, 1, 0.05, NPR_DEFAULTS.shadowOpacity)
    // Shadow offset X
    this._addSlider(grid, 'shadowOffsetX', 'Bayangan X', -50, 50, 1, NPR_DEFAULTS.shadowOffsetX)
    // Shadow offset Y
    this._addSlider(grid, 'shadowOffsetY', 'Bayangan Y', -50, 50, 1, NPR_DEFAULTS.shadowOffsetY)
    // Wiggle amplitude
    this._addSlider(grid, 'wiggleAmplitude', 'Amplitudo Wiggle', 0, 0.01, 0.0005, NPR_DEFAULTS.wiggleAmplitude)
    // Wiggle frequency
    this._addSlider(grid, 'wiggleFrequency', 'Frekuensi Wiggle', 0, 10, 0.5, NPR_DEFAULTS.wiggleFrequency)
    // Brightness
    this._addSlider(grid, 'brightness', 'Kecerahan', 0.5, 1.5, 0.05, NPR_DEFAULTS.brightness)
    // Saturation
    this._addSlider(grid, 'saturation', 'Saturasi', 0.5, 1.5, 0.05, NPR_DEFAULTS.saturation)

    el.appendChild(grid)

    // Reset button
    const resetBtn = document.createElement('button')
    resetBtn.className = 'paperalive-btn paperalive-btn-secondary paperalive-settings-reset'
    resetBtn.textContent = 'Reset ke Default'
    resetBtn.setAttribute('aria-label', 'Reset semua pengaturan ke default')
    resetBtn.addEventListener('click', () => {
      this._onReset?.()
      // Remount with default values
      el.remove()
      this._el = null
      this._mount()
    })
    el.appendChild(resetBtn)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Add a slider setting to the grid.
   */
  _addSlider(grid, key, label, min, max, step, defaultValue) {
    const group = document.createElement('div')
    group.className = 'paperalive-setting-item'

    const lbl = document.createElement('label')
    lbl.textContent = `${label}: ${this._formatValue(defaultValue)}`

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(min)
    slider.max = String(max)
    slider.step = String(step)
    slider.value = String(defaultValue)
    slider.className = 'paperalive-slider'
    slider.setAttribute('aria-label', label)

    slider.addEventListener('input', () => {
      const val = Number(slider.value)
      lbl.textContent = `${label}: ${this._formatValue(val)}`
      this._onSettingChange?.(key, val)
    })

    group.appendChild(lbl)
    group.appendChild(slider)
    grid.appendChild(group)
  }

  /**
   * Add a color setting to the grid.
   */
  _addColorSetting(grid, key, label, defaultRgb) {
    const group = document.createElement('div')
    group.className = 'paperalive-setting-item'

    const lbl = document.createElement('label')
    lbl.textContent = label

    const input = document.createElement('input')
    input.type = 'color'
    input.className = 'paperalive-color-input'
    input.setAttribute('aria-label', label)

    // Convert RGB array to hex
    const toHex = (rgb) => {
      const r = Math.round(rgb[0] * 255)
      const g = Math.round(rgb[1] * 255)
      const b = Math.round(rgb[2] * 255)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }
    input.value = toHex(defaultRgb)

    input.addEventListener('input', () => {
      const hex = input.value
      const r = parseInt(hex.slice(1, 3), 16) / 255
      const g = parseInt(hex.slice(3, 5), 16) / 255
      const b = parseInt(hex.slice(5, 7), 16) / 255
      this._onSettingChange?.(key, [r, g, b])
    })

    group.appendChild(lbl)
    group.appendChild(input)
    grid.appendChild(group)
  }

  /**
   * Format a value for display.
   * @param {number} val
   * @returns {string}
   */
  _formatValue(val) {
    return val < 0.01 ? val.toFixed(4) : val < 1 ? val.toFixed(2) : val.toFixed(1)
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._el) {
      this._el.remove()
      this._el = null
    }
    this._visible = false
  }
}
