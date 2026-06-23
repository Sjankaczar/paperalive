/**
 * @file MaskStep.js
 * @description Step 2 UI — threshold slider, brush tools, undo/redo, mask preview.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-128
 */

import { applyThreshold, autoEraseBackground } from '../image/ThresholdEngine.js'
import { MaskBrush } from '../image/MaskBrush.js'
import { MaskHistory } from '../history/MaskHistory.js'

/**
 * Mask step component.
 */
export class MaskStep {
  /**
   * @param {HTMLElement} container
   * @param {Object} params
   * @param {import('../types/characterData.js').LoadedImage} params.loadedImage
   * @param {import('../types/characterData.js').BinaryMask|null} params.alphaMask
   * @param {MaskHistory|null} params.maskHistory
   * @param {Object} callbacks
   * @param {(mask: any) => void} callbacks.onMaskChange
   * @param {() => void} callbacks.onBack
   * @param {() => void} callbacks.onNext
   * @param {(history: MaskHistory) => void} callbacks.onHistoryInit
   */
  constructor(container, params, callbacks) {
    this._container = container
    this._loadedImage = params.loadedImage
    this._alphaMask = params.alphaMask
    this._maskHistory = params.maskHistory || new MaskHistory()
    this._onMaskChange = callbacks.onMaskChange
    this._onBack = callbacks.onBack
    this._onNext = callbacks.onNext
    this._onHistoryInit = callbacks.onHistoryInit

    /** @type {HTMLElement|null} */
    this._el = null
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null
    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = null
    /** @type {MaskBrush|null} */
    this._brush = null
    /** @type {number} */
    this._threshold = 30
    /** @type {boolean} */
    this._isDrawing = false

    // Undo/redo button refs
    this._undoBtn = null
    this._redoBtn = null

    // Bound handlers
    this._onKeyDown = this._handleKeyDown.bind(this)
    this._onPointerDown = this._handlePointerDown.bind(this)
    this._onPointerMove = this._handlePointerMove.bind(this)
    this._onPointerUp = this._handlePointerUp.bind(this)

    this._initMask()
    this.mount()
  }

  /**
   * Initialize the mask from the loaded image.
   */
  _initMask() {
    if (!this._alphaMask) {
      const img = this._loadedImage
      this._alphaMask = autoEraseBackground(img.imageData, this._threshold)
    }
    // Push initial mask snapshot
    this._maskHistory.push(this._alphaMask)
    if (this._onHistoryInit) {
      this._onHistoryInit(this._maskHistory)
    }
  }

  /**
   * Mount the mask step UI.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-mask-step'

    // Canvas area
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'paperalive-mask-canvas-wrap'

    const canvas = document.createElement('canvas')
    canvas.className = 'paperalive-mask-canvas'
    canvas.width = this._loadedImage.width
    canvas.height = this._loadedImage.height
    canvas.setAttribute('aria-label', 'Mask preview canvas')
    canvasWrap.appendChild(canvas)

    this._canvas = canvas
    this._ctx = canvas.getContext('2d')
    this._brush = new MaskBrush(canvas, this._alphaMask)

    // Pointer events for brush
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('pointerleave', this._onPointerUp)

    el.appendChild(canvasWrap)

    // Controls panel
    const controls = document.createElement('div')
    controls.className = 'paperalive-mask-controls'

    // Threshold slider
    const threshGroup = this._createSliderGroup(
      'Threshold', 0, 255, this._threshold,
      (val) => {
        this._threshold = val
        const img = this._loadedImage
        this._alphaMask = autoEraseBackground(img.imageData, val)
        this._brush = new MaskBrush(this._canvas, this._alphaMask)
        this._renderPreview()
        this._onMaskChange?.(this._alphaMask)
      }
    )
    controls.appendChild(threshGroup)

    // Brush mode toggle
    const modeGroup = document.createElement('div')
    modeGroup.className = 'paperalive-control-group'

    const modeLabel = document.createElement('label')
    modeLabel.textContent = 'Mode Kuas'
    modeGroup.appendChild(modeLabel)

    const modeBtns = document.createElement('div')
    modeBtns.className = 'paperalive-btn-group'

    const addBtn = document.createElement('button')
    addBtn.className = 'paperalive-btn paperalive-btn-small active'
    addBtn.textContent = '+ Tambah'
    addBtn.setAttribute('aria-label', 'Mode tambah mask')

    const eraseBtn = document.createElement('button')
    eraseBtn.className = 'paperalive-btn paperalive-btn-small'
    eraseBtn.textContent = '- Hapus'
    eraseBtn.setAttribute('aria-label', 'Mode hapus mask')

    addBtn.addEventListener('click', () => {
      this._brush.brushMode = 'add'
      addBtn.classList.add('active')
      eraseBtn.classList.remove('active')
    })
    eraseBtn.addEventListener('click', () => {
      this._brush.brushMode = 'erase'
      eraseBtn.classList.add('active')
      addBtn.classList.remove('active')
    })

    modeBtns.appendChild(addBtn)
    modeBtns.appendChild(eraseBtn)
    modeGroup.appendChild(modeBtns)
    controls.appendChild(modeGroup)

    // Brush size slider
    const sizeGroup = this._createSliderGroup(
      'Ukuran Kuas', 1, 50, 10,
      (val) => { this._brush.brushRadius = val }
    )
    controls.appendChild(sizeGroup)

    // Undo/Redo buttons
    const undoGroup = document.createElement('div')
    undoGroup.className = 'paperalive-control-group'

    const undoBtn = document.createElement('button')
    undoBtn.className = 'paperalive-btn paperalive-btn-small'
    undoBtn.textContent = '↩ Undo'
    undoBtn.disabled = !this._maskHistory.canUndo
    undoBtn.setAttribute('aria-label', 'Undo perubahan mask')
    undoBtn.addEventListener('click', () => this._undo())

    const redoBtn = document.createElement('button')
    redoBtn.className = 'paperalive-btn paperalive-btn-small'
    redoBtn.textContent = '↪ Redo'
    redoBtn.disabled = !this._maskHistory.canRedo
    redoBtn.setAttribute('aria-label', 'Redo perubahan mask')
    redoBtn.addEventListener('click', () => this._redo())

    this._undoBtn = undoBtn
    this._redoBtn = redoBtn

    undoGroup.appendChild(undoBtn)
    undoGroup.appendChild(redoBtn)
    controls.appendChild(undoGroup)

    el.appendChild(controls)

    // Navigation buttons
    const nav = document.createElement('div')
    nav.className = 'paperalive-step-nav'

    const backBtn = document.createElement('button')
    backBtn.className = 'paperalive-btn paperalive-btn-secondary'
    backBtn.textContent = '← Kembali'
    backBtn.setAttribute('aria-label', 'Kembali ke upload')
    backBtn.addEventListener('click', this._onBack)

    const nextBtn = document.createElement('button')
    nextBtn.className = 'paperalive-btn paperalive-btn-primary'
    nextBtn.textContent = 'Lanjut: Pasang Sendi →'
    nextBtn.setAttribute('aria-label', 'Lanjut ke langkah pasang sendi')
    nextBtn.addEventListener('click', this._onNext)

    nav.appendChild(backBtn)
    nav.appendChild(nextBtn)
    el.appendChild(nav)

    // Keyboard shortcuts
    document.addEventListener('keydown', this._onKeyDown)

    this._el = el
    this._container.appendChild(el)

    // Initial render
    this._renderPreview()
  }

  /**
   * Create a slider control group.
   * @param {string} label
   * @param {number} min
   * @param {number} max
   * @param {number} value
   * @param {(value: number) => void} onChange
   * @returns {HTMLElement}
   */
  _createSliderGroup(label, min, max, value, onChange) {
    const group = document.createElement('div')
    group.className = 'paperalive-control-group'

    const lbl = document.createElement('label')
    lbl.textContent = `${label}: ${value}`

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(min)
    slider.max = String(max)
    slider.value = String(value)
    slider.className = 'paperalive-slider'
    slider.setAttribute('aria-label', label)

    slider.addEventListener('input', () => {
      const v = Number(slider.value)
      lbl.textContent = `${label}: ${v}`
      onChange(v)
    })

    group.appendChild(lbl)
    group.appendChild(slider)
    return group
  }

  /**
   * Render the image with mask overlay on the canvas.
   */
  _renderPreview() {
    const ctx = this._ctx
    if (!ctx) return
    const img = this._loadedImage
    const mask = this._alphaMask

    // Draw image
    ctx.putImageData(img.imageData, 0, 0)

    // Draw mask overlay (green semi-transparent)
    const overlay = ctx.getImageData(0, 0, img.width, img.height)
    const src = overlay.data
    const maskData = mask.data

    for (let i = 0; i < maskData.length; i++) {
      if (maskData[i] > 0) {
        const pi = i * 4
        // Blend green overlay
        src[pi] = Math.round(src[pi] * 0.6)
        src[pi + 1] = Math.round(src[pi + 1] * 0.6 + 80)
        src[pi + 2] = Math.round(src[pi + 2] * 0.6)
        src[pi + 3] = 255
      }
    }

    ctx.putImageData(overlay, 0, 0)
  }

  /**
   * Handle pointer down for brush drawing.
   */
  _handlePointerDown(e) {
    this._isDrawing = true
    const rect = this._canvas.getBoundingClientRect()
    const scaleX = this._canvas.width / rect.width
    const scaleY = this._canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    this._brush.applyStroke(x, y)
    this._renderPreview()
  }

  /**
   * Handle pointer move for brush drawing.
   */
  _handlePointerMove(e) {
    if (!this._isDrawing) return
    const rect = this._canvas.getBoundingClientRect()
    const scaleX = this._canvas.width / rect.width
    const scaleY = this._canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    this._brush.applyStroke(x, y)
    this._renderPreview()
  }

  /**
   * Handle pointer up — take snapshot for undo.
   */
  _handlePointerUp() {
    if (this._isDrawing) {
      this._isDrawing = false
      this._maskHistory.push(this._alphaMask)
      this._updateUndoRedoButtons()
      this._onMaskChange?.(this._alphaMask)
    }
  }

  /**
   * Undo mask edit.
   */
  _undo() {
    const prev = this._maskHistory.undo()
    if (prev) {
      this._alphaMask = { data: prev, width: this._alphaMask.width, height: this._alphaMask.height }
      this._brush = new MaskBrush(this._canvas, this._alphaMask)
      this._renderPreview()
      this._updateUndoRedoButtons()
      this._onMaskChange?.(this._alphaMask)
    }
  }

  /**
   * Redo mask edit.
   */
  _redo() {
    const next = this._maskHistory.redo()
    if (next) {
      this._alphaMask = { data: next, width: this._alphaMask.width, height: this._alphaMask.height }
      this._brush = new MaskBrush(this._canvas, this._alphaMask)
      this._renderPreview()
      this._updateUndoRedoButtons()
      this._onMaskChange?.(this._alphaMask)
    }
  }

  /**
   * Update undo/redo button disabled state.
   */
  _updateUndoRedoButtons() {
    if (this._undoBtn) this._undoBtn.disabled = !this._maskHistory.canUndo
    if (this._redoBtn) this._redoBtn.disabled = !this._maskHistory.canRedo
  }

  /**
   * Handle keyboard shortcuts for undo/redo.
   */
  _handleKeyDown(e) {
    // Skip if focus is on input/select/textarea
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      this._undo()
    }
    if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
      e.preventDefault()
      this._redo()
    }
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    document.removeEventListener('keydown', this._onKeyDown)
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown)
      this._canvas.removeEventListener('pointermove', this._onPointerMove)
      this._canvas.removeEventListener('pointerup', this._onPointerUp)
      this._canvas.removeEventListener('pointerleave', this._onPointerUp)
    }
    if (this._brush) {
      this._brush.destroy()
    }
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
