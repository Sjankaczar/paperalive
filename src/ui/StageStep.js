/**
 * @file StageStep.js
 * @description Step 4 (Pentas) UI — WebGL canvas, NPRRenderer, MotionResolver, IKDragHandler.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-131, TASK-132
 */

import { NPRRenderer } from '../rendering/NPRRenderer.js'
import { MeshPuppet } from '../rendering/MeshPuppet.js'
import { ARAPSolver } from '../arap/ARAPSolver.js'
import { MotionResolver } from '../motion/MotionResolver.js'
import { MotionPicker } from './MotionPicker.js'
import { ExportPanel } from './ExportPanel.js'
import { VideoExporter, getSupportedMimeType } from '../io/VideoExporter.js'
import { ImageStore } from '../io/ImageStore.js'
import { toast } from './toast.js'

// Import clip data
import idleClip from '../motion/clips/idle.json'
import walkClip from '../motion/clips/walk.json'
import runClip from '../motion/clips/run.json'
import jumpClip from '../motion/clips/jump.json'
import waveClip from '../motion/clips/wave.json'
import danceClip from '../motion/clips/dance.json'

const ALL_CLIPS = { idle: idleClip, walk: walkClip, run: runClip, jump: jumpClip, wave: waveClip, dance: danceClip }

/**
 * Stage step (Pentas) component.
 */
export class StageStep {
  /**
   * @param {HTMLElement} container
   * @param {Object} params
   * @param {import('../types/characterData.js').CharacterData} params.characterData
   * @param {Object} callbacks
   * @param {() => void} callbacks.onEditBack
   * @param {(clipId: string) => void} [callbacks.onClipChange]
   */
  constructor(container, params, callbacks) {
    this._container = container
    this._charData = params.characterData
    this._onEditBack = callbacks.onEditBack
    this._onClipChange = callbacks.onClipChange

    /** @type {HTMLElement|null} */
    this._el = null
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null
    /** @type {NPRRenderer|null} */
    this._renderer = null
    /** @type {MeshPuppet|null} */
    this._puppet = null
    /** @type {ARAPSolver|null} */
    this._solver = null
    /** @type {MotionResolver|null} */
    this._motionResolver = null
    /** @type {MotionPicker|null} */
    this._motionPicker = null
    /** @type {ExportPanel|null} */
    this._exportPanel = null
    /** @type {VideoExporter|null} */
    this._videoExporter = null
    /** @type {number|null} */
    this._rafId = null
    /** @type {number} */
    this._lastTimestamp = 0
    /** @type {number} */
    this._frameCount = 0
    /** @type {boolean} */
    this._isDragging = false
    /** @type {boolean} */
    this._isPlaying = false
    /** @type {string} */
    this._currentClipId = 'idle'

    // Bound handlers
    this._onPointerDown = this._handlePointerDown.bind(this)
    this._onPointerMove = this._handlePointerMove.bind(this)
    this._onPointerUp = this._handlePointerUp.bind(this)

    this.mount()
  }

  /**
   * Mount the stage UI.
   */
  async mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-stage-step'

    // Canvas
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'paperalive-stage-canvas-wrap'

    const canvas = document.createElement('canvas')
    canvas.className = 'paperalive-stage-canvas'
    canvas.width = this._charData.geometry.vertices0[0]
      ? Math.max(640, this._charData.image?.width || 640)
      : 640
    canvas.height = this._charData.image?.height || 480
    canvas.setAttribute('aria-label', 'Animasi karakter')
    canvasWrap.appendChild(canvas)

    this._canvas = canvas
    el.appendChild(canvasWrap)

    // Toolbar
    const toolbar = document.createElement('div')
    toolbar.className = 'paperalive-stage-toolbar'

    // Motion picker
    this._motionPicker = new MotionPicker(toolbar, {
      onClipSelected: (clipId) => this._selectClip(clipId),
      onPlay: () => this._playClip(),
      onStop: () => this._stopClip(),
      onClipImport: (clip) => this._importClip(clip),
    })

    // Export panel
    this._exportPanel = new ExportPanel(toolbar, {
      onRecordStart: () => this._startRecording(),
      onRecordStop: () => this._stopRecording(),
    })

    // Edit back button
    const editBackBtn = document.createElement('button')
    editBackBtn.className = 'paperalive-btn paperalive-btn-secondary'
    editBackBtn.textContent = '← Edit'
    editBackBtn.setAttribute('aria-label', 'Kembali untuk mengedit')
    editBackBtn.addEventListener('click', () => this._onEditBack?.())
    toolbar.appendChild(editBackBtn)

    el.appendChild(toolbar)
    this._el = el
    this._container.appendChild(el)

    // Initialize WebGL + rendering
    await this._initRenderer()

    // Pointer events for IK drag
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('pointerleave', this._onPointerUp)

    // Start animation loop
    this._lastTimestamp = performance.now()
    this._startLoop()
  }

  /**
   * Initialize the NPR renderer, puppet, ARAP solver, and motion resolver.
   */
  async _initRenderer() {
    const canvas = this._canvas
    this._renderer = new NPRRenderer(canvas)

    try {
      await this._renderer.init(this._charData)
    } catch (err) {
      toast('error', `WebGL init gagal: ${err.message}`)
      return
    }

    // Create puppet
    const gl = this._renderer.gl
    if (!gl) return

    this._puppet = new MeshPuppet(gl, this._charData)
    this._puppet.init()

    // Upload texture from IndexedDB (or fallback to imageData if present)
    try {
      if (this._charData.image?.idbKey) {
        const imageStore = new ImageStore()
        await imageStore.open()
        const blob = await imageStore.load(this._charData.image.idbKey)
        if (blob) {
          const bmp = await createImageBitmap(blob)
          this._puppet.uploadTexture(bmp)
        } else {
          toast('warning', 'Gagal memuat tekstur karakter dari database.')
        }
      } else if (this._charData.image?.imageData) {
        this._puppet.uploadTexture(this._charData.image.imageData)
      }
    } catch (err) {
      console.error('Texture upload failed:', err)
      toast('warning', 'Terjadi kesalahan saat memuat tekstur.')
    }

    this._renderer.attachCharacter(this._puppet)

    // Create ARAP solver
    this._solver = new ARAPSolver(this._charData)

    // Create motion resolver
    this._motionResolver = new MotionResolver(this._charData)

    // Register all clips
    for (const [id, clip] of Object.entries(ALL_CLIPS)) {
      this._motionResolver.registerClip(id, clip)
    }

    // Start auto-save
    this._renderer._startAutoSave()
  }

  /**
   * Start the animation loop.
   */
  _startLoop() {
    const frame = (timestamp) => {
      if (!this._canvas) return

      const dt = timestamp - this._lastTimestamp
      this._lastTimestamp = timestamp
      this._frameCount++

      this._updateFrame(dt)

      if (this._renderer && this._renderer.gl) {
        this._renderer.drawFrame(timestamp)

        // If recording, capture frame
        if (this._videoExporter && this._videoExporter._recorder) {
          this._videoExporter.captureFrame(this._renderer.gl)
        }
      }

      this._rafId = requestAnimationFrame(frame)
    }
    this._rafId = requestAnimationFrame(frame)
  }

  /**
   * Update frame — resolve motion, apply ARAP, update puppet.
   * @param {number} dt
   */
  _updateFrame(dt) {
    if (!this._motionResolver || !this._solver || !this._puppet) return

    // Resolve joint targets
    const targets = this._motionResolver.resolve(dt)

    // Set handles on solver
    const pinMapping = this._charData.pinMapping
    this._solver.setHandles(targets, pinMapping)

    // Step solver
    this._solver.step(2)

    // Update puppet positions
    const positions = this._solver.currentPositions
    if (positions && this._puppet) {
      this._puppet.updatePositions(positions)
    }
  }

  /**
   * Select a clip (no playback until Play is pressed).
   * @param {string} clipId
   */
  _selectClip(clipId) {
    this._currentClipId = clipId
    this._onClipChange?.(clipId)
  }

  /**
   * Register an imported BVH clip and make it the active selection (P4).
   * @param {import('../motion/MotionClipPlayer.js').MotionClip} clip
   */
  _importClip(clip) {
    if (!this._motionResolver || !clip || !clip.id) return
    this._motionResolver.registerClip(clip.id, clip)
    this._currentClipId = clip.id
    this._onClipChange?.(clip.id)
  }

  /**
   * Play the selected clip.
   */
  _playClip() {
    if (!this._motionResolver) return
    this._motionResolver.playClip(this._currentClipId)
    this._isPlaying = true
  }

  /**
   * Stop clip playback.
   */
  _stopClip() {
    if (!this._motionResolver) return
    this._motionResolver.stopClip()
    this._isPlaying = false
  }

  /**
   * Handle pointer down — hit test for IK drag.
   */
  _handlePointerDown(e) {
    if (!this._motionResolver || !this._solver) return

    const rect = this._canvas.getBoundingClientRect()
    const scaleX = this._canvas.width / rect.width
    const scaleY = this._canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // Set current positions for hit testing
    const positions = this._solver.currentPositions
    if (positions) {
      this._motionResolver.dragHandler.setCurrentPositions(positions)
    }

    const hitJoint = this._motionResolver.dragHandler.hitTest(x, y, this._charData.pinMapping)
    if (hitJoint) {
      this._isDragging = true
      this._motionResolver.startDrag(hitJoint, x, y)
    }
  }

  /**
   * Handle pointer move — update drag.
   */
  _handlePointerMove(e) {
    if (!this._isDragging || !this._motionResolver) return
    const rect = this._canvas.getBoundingClientRect()
    const scaleX = this._canvas.width / rect.width
    const scaleY = this._canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    this._motionResolver.updateDrag(x, y)
  }

  /**
   * Handle pointer up — end drag.
   */
  _handlePointerUp() {
    if (this._isDragging && this._motionResolver) {
      this._motionResolver.endDrag()
      this._isDragging = false
    }
  }

  /**
   * Start video recording.
   */
  _startRecording() {
    if (!this._renderer || !this._renderer.gl) return

    const mimeType = getSupportedMimeType()
    if (!mimeType) {
      this._exportPanel?.showCodecError()
      return
    }

    this._videoExporter = new VideoExporter(this._canvas, this._renderer.gl)
    this._videoExporter.startRecording(30)
  }

  /**
   * Stop video recording.
   */
  async _stopRecording() {
    if (!this._videoExporter) return

    try {
      const blob = await this._videoExporter.stopRecording()
      if (blob) {
        this._videoExporter.downloadAs('paperalive-recording.webm')
        toast('success', 'Video berhasil direkam!')
      }
    } catch (err) {
      toast('error', `Rekaman gagal: ${err.message}`)
    }

    this._videoExporter = null
  }

  /**
   * Toggle play/pause (for keyboard shortcut).
   */
  togglePlay() {
    if (this._isPlaying) {
      this._stopClip()
    } else {
      this._playClip()
    }
  }

  /**
   * Stop drag (for Escape key).
   */
  cancelDrag() {
    if (this._isDragging && this._motionResolver) {
      this._motionResolver.endDrag()
      this._isDragging = false
    }
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }

    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown)
      this._canvas.removeEventListener('pointermove', this._onPointerMove)
      this._canvas.removeEventListener('pointerup', this._onPointerUp)
      this._canvas.removeEventListener('pointerleave', this._onPointerUp)
    }

    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    if (this._motionPicker) {
      this._motionPicker.destroy()
      this._motionPicker = null
    }

    if (this._exportPanel) {
      this._exportPanel.destroy()
      this._exportPanel = null
    }

    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
