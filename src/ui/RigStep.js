/**
 * @file RigStep.js
 * @description Step 3 UI — character type selector, joint drag, joint warning, undo/redo.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-129, TASK-130
 */

import { estimateSkeleton } from '../skeleton/SkeletonEstimator.js'
import { RigEditor } from '../skeleton/RigEditor.js'
import { JointHistory } from '../skeleton/JointHistory.js'

/**
 * Rig step component.
 */
export class RigStep {
  /**
   * @param {HTMLElement} container
   * @param {Object} params
   * @param {import('../types/characterData.js').LoadedImage} params.loadedImage
   * @param {import('../types/characterData.js').BinaryMask} params.alphaMask
   * @param {import('../types/characterData.js').JointPositionList|null} params.jointPositions
   * @param {'humanoid'|'freeform'} params.characterType
   * @param {JointHistory|null} params.jointHistory
   * @param {Object} callbacks
   * @param {(joints: any, type: string) => void} callbacks.onJointsChange
   * @param {(history: JointHistory) => void} callbacks.onHistoryInit
   * @param {() => void} callbacks.onBack
   * @param {() => void} callbacks.onBringToLife
   */
  constructor(container, params, callbacks) {
    this._container = container
    this._loadedImage = params.loadedImage
    this._alphaMask = params.alphaMask
    this._characterType = params.characterType || 'humanoid'
    this._jointHistory = params.jointHistory || new JointHistory()

    this._onJointsChange = callbacks.onJointsChange
    this._onHistoryInit = callbacks.onHistoryInit
    this._onBack = callbacks.onBack
    this._onBringToLife = callbacks.onBringToLife

    /** @type {import('../types/characterData.js').JointPositionList} */
    this._jointPositions = params.jointPositions || this._estimateJoints()

    /** @type {HTMLElement|null} */
    this._el = null
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null
    /** @type {RigEditor|null} */
    this._rigEditor = null
    /** @type {HTMLButtonElement|null} */
    this._bringToLifeBtn = null
    /** @type {HTMLButtonElement|null} */
    this._undoBtn = null
    /** @type {HTMLButtonElement|null} */
    this._redoBtn = null

    this._onKeyDown = this._handleKeyDown.bind(this)

    this.mount()
  }

  /**
   * Estimate joints based on current character type and mask.
   * @returns {import('../types/characterData.js').JointPositionList}
   */
  _estimateJoints() {
    if (this._characterType === 'humanoid') {
      return estimateSkeleton(this._alphaMask)
    } else {
      // Freeform mode: 4 default joints at bbox center + corners
      const mask = this._alphaMask
      const w = mask.width
      const h = mask.height
      const cx = Math.round(w / 2)
      const cy = Math.round(h / 2)
      return [
        { id: 'joint_1', x: cx, y: Math.round(h * 0.2) },
        { id: 'joint_2', x: Math.round(w * 0.3), y: cy },
        { id: 'joint_3', x: Math.round(w * 0.7), y: cy },
        { id: 'joint_4', x: cx, y: Math.round(h * 0.8) },
      ]
    }
  }

  /**
   * Mount the rig step UI.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-rig-step'

    // Canvas area (overlay on image)
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'paperalive-rig-canvas-wrap'

    // Create an inner container to enforce proper stacking
    const innerContainer = document.createElement('div')
    innerContainer.style.position = 'relative'
    innerContainer.style.display = 'inline-block'

    // Background image canvas
    const imgCanvas = document.createElement('canvas')
    imgCanvas.className = 'paperalive-rig-image-canvas'
    imgCanvas.width = this._loadedImage.width
    imgCanvas.height = this._loadedImage.height
    imgCanvas.style.position = 'relative'
    imgCanvas.style.display = 'block'
    const imgCtx = imgCanvas.getContext('2d')
    if (imgCtx) {
      imgCtx.putImageData(this._loadedImage.imageData, 0, 0)
    }
    innerContainer.appendChild(imgCanvas)

    // Rig overlay canvas
    const canvas = document.createElement('canvas')
    canvas.className = 'paperalive-rig-overlay-canvas'
    canvas.width = this._loadedImage.width
    canvas.height = this._loadedImage.height
    canvas.setAttribute('aria-label', 'Skeleton overlay canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    innerContainer.appendChild(canvas)

    this._canvas = canvas
    canvasWrap.appendChild(innerContainer)
    el.appendChild(canvasWrap)

    // Controls
    const controls = document.createElement('div')
    controls.className = 'paperalive-rig-controls'

    // Character type selector
    const typeGroup = document.createElement('div')
    typeGroup.className = 'paperalive-control-group'

    const typeLabel = document.createElement('label')
    typeLabel.textContent = 'Tipe Karakter'
    typeGroup.appendChild(typeLabel)

    const radioWrap = document.createElement('div')
    radioWrap.className = 'paperalive-radio-group'

    const humanRadio = this._createRadio('characterType', 'humanoid', 'Manusia', this._characterType === 'humanoid')
    const freeRadio = this._createRadio('characterType', 'freeform', 'Hewan / Lainnya', this._characterType === 'freeform')

    humanRadio.input.addEventListener('change', () => this._switchType('humanoid'))
    freeRadio.input.addEventListener('change', () => this._switchType('freeform'))

    radioWrap.appendChild(humanRadio.label)
    radioWrap.appendChild(freeRadio.label)
    typeGroup.appendChild(radioWrap)
    controls.appendChild(typeGroup)

    // Undo/Redo
    const undoGroup = document.createElement('div')
    undoGroup.className = 'paperalive-control-group'

    const undoBtn = document.createElement('button')
    undoBtn.className = 'paperalive-btn paperalive-btn-small'
    undoBtn.textContent = '↩ Undo'
    undoBtn.disabled = !this._jointHistory.canUndo
    undoBtn.setAttribute('aria-label', 'Undo perubahan joint')
    undoBtn.addEventListener('click', () => this._undo())

    const redoBtn = document.createElement('button')
    redoBtn.className = 'paperalive-btn paperalive-btn-small'
    redoBtn.textContent = '↪ Redo'
    redoBtn.disabled = !this._jointHistory.canRedo
    redoBtn.setAttribute('aria-label', 'Redo perubahan joint')
    redoBtn.addEventListener('click', () => this._redo())

    this._undoBtn = undoBtn
    this._redoBtn = redoBtn

    undoGroup.appendChild(undoBtn)
    undoGroup.appendChild(redoBtn)
    controls.appendChild(undoGroup)

    el.appendChild(controls)

    // Navigation
    const nav = document.createElement('div')
    nav.className = 'paperalive-step-nav'

    const backBtn = document.createElement('button')
    backBtn.className = 'paperalive-btn paperalive-btn-secondary'
    backBtn.textContent = '← Kembali'
    backBtn.setAttribute('aria-label', 'Kembali ke mask')
    backBtn.addEventListener('click', this._onBack)

    const bringBtn = document.createElement('button')
    bringBtn.className = 'paperalive-btn paperalive-btn-primary'
    bringBtn.textContent = '🎭 Bring to Life!'
    bringBtn.disabled = this._jointPositions.length < 3
    bringBtn.setAttribute('aria-label', 'Hidupkan karakter')
    bringBtn.addEventListener('click', this._onBringToLife)

    this._bringToLifeBtn = bringBtn

    nav.appendChild(backBtn)
    nav.appendChild(bringBtn)
    el.appendChild(nav)

    // Initialize RigEditor
    this._initRigEditor()

    // Keyboard shortcuts
    document.addEventListener('keydown', this._onKeyDown)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Initialize or reinitialize the RigEditor.
   */
  _initRigEditor() {
    if (this._rigEditor) {
      this._rigEditor.destroy()
    }

    this._rigEditor = new RigEditor(this._canvas, this._jointPositions)

    if (this._characterType === 'freeform') {
      this._rigEditor.setFreeformMode(true)
    }

    // Wire onJointMoved to history push
    this._rigEditor.onJointMoved = () => {
      this._jointPositions = this._rigEditor.getJointPositions()
      this._jointHistory.push(this._jointPositions)
      this._updateUndoRedoButtons()
      this._updateBringToLifeButton()
      this._onJointsChange?.(this._jointPositions, this._characterType)
    }

    this._rigEditor.render()
  }

  /**
   * Switch character type and re-estimate joints.
   * @param {'humanoid'|'freeform'} type
   */
  _switchType(type) {
    this._characterType = type
    this._jointPositions = this._estimateJoints()
    this._jointHistory = new JointHistory()
    this._jointHistory.push(this._jointPositions)
    if (this._onHistoryInit) {
      this._onHistoryInit(this._jointHistory)
    }
    this._initRigEditor()
    this._updateBringToLifeButton()
    this._updateUndoRedoButtons()
    this._onJointsChange?.(this._jointPositions, this._characterType)
  }

  /**
   * Create a radio input + label.
   */
  _createRadio(name, value, text, checked) {
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = name
    input.value = value
    input.checked = checked
    input.className = 'paperalive-radio-input'

    const label = document.createElement('label')
    label.className = 'paperalive-radio-label'
    label.appendChild(input)
    label.appendChild(document.createTextNode(` ${text}`))

    return { input, label }
  }

  /**
   * Undo joint placement.
   */
  _undo() {
    const prev = this._jointHistory.undo()
    if (prev) {
      this._jointPositions = prev
      this._rigEditor.setJointPositions(prev)
      this._updateUndoRedoButtons()
      this._updateBringToLifeButton()
      this._onJointsChange?.(this._jointPositions, this._characterType)
    }
  }

  /**
   * Redo joint placement.
   */
  _redo() {
    const next = this._jointHistory.redo()
    if (next) {
      this._jointPositions = next
      this._rigEditor.setJointPositions(next)
      this._updateUndoRedoButtons()
      this._updateBringToLifeButton()
      this._onJointsChange?.(this._jointPositions, this._characterType)
    }
  }

  /**
   * Update undo/redo button states.
   */
  _updateUndoRedoButtons() {
    if (this._undoBtn) this._undoBtn.disabled = !this._jointHistory.canUndo
    if (this._redoBtn) this._redoBtn.disabled = !this._jointHistory.canRedo
  }

  /**
   * Update bring to life button state.
   */
  _updateBringToLifeButton() {
    if (this._bringToLifeBtn) {
      this._bringToLifeBtn.disabled = this._jointPositions.length < 3
    }
  }

  /**
   * Handle keyboard shortcuts.
   */
  _handleKeyDown(e) {
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
    if (this._rigEditor) {
      this._rigEditor.destroy()
      this._rigEditor = null
    }
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
