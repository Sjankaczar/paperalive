/**
 * @file App.js
 * @description Root application component.
 * Owns StateMachine, WizardUI, wires all sub-systems together.
 * Implements global keyboard shortcuts.
 *
 * @see architecture/module_design.md — App.js
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-140, TASK-136
 */

import { StateMachine, AppState, AppEvent } from './state/StateMachine.js'
import { WizardUI } from './ui/WizardUI.js'
import { UploadStep } from './ui/UploadStep.js'
import { MaskStep } from './ui/MaskStep.js'
import { RigStep } from './ui/RigStep.js'
import { StageStep } from './ui/StageStep.js'
import { SettingsPanel } from './ui/SettingsPanel.js'
import { SaveLoadPanel } from './ui/SaveLoadPanel.js'
import { toast } from './ui/toast.js'
import { loadCharacter } from './io/CharacterStorage.js'
import { buildCharacterData } from './character/buildCharacterData.js'
import { NPR_DEFAULTS } from './rendering/NPRRenderer.js'

const PROGRESS_LABELS = {
  cleaning: 'Membersihkan mask...',
  contouring: 'Menelusuri kontur...',
  meshing: 'Membangun mesh...',
  skeleton: 'Menghitung skeleton...',
  arap: 'Precompute ARAP...',
}

/**
 * App class — root component and StateMachine owner.
 */
export class App {
  /**
   * @param {HTMLElement} containerEl — #app element
   */
  constructor(containerEl) {
    this._container = containerEl

    /** @type {StateMachine} */
    this._sm = new StateMachine()

    /** @type {WizardUI|null} */
    this._wizard = null

    /** @type {SettingsPanel|null} */
    this._settingsPanel = null

    /** @type {SaveLoadPanel|null} */
    this._saveLoadPanel = null

    /** @type {any|null} — current step component */
    this._activeStep = null

    /** @type {((e: KeyboardEvent) => void)|null} */
    this._keyHandler = null

    this._setupStateMachineListeners()
    this._setupLifecycleHooks()
  }

  /**
   * Initialize the application.
   */
  async init() {
    // Create root element
    const root = document.createElement('div')
    root.className = 'paperalive-root'
    root.setAttribute('role', 'application')
    root.setAttribute('aria-label', 'PaperAlive — Animasi Karakter')

    // Title header
    const header = document.createElement('header')
    header.className = 'paperalive-header'
    header.innerHTML = '<h1>PaperAlive</h1>'
    root.appendChild(header)

    this._container.appendChild(root)

    // Create WizardUI
    this._wizard = new WizardUI(root)

    // Setup keyboard shortcuts (TASK-136)
    this._setupKeyboardShortcuts()

    // Render initial state
    this._renderCurrentState()
  }

  /**
   * Setup state machine event listeners.
   */
  _setupStateMachineListeners() {
    this._sm.on('stateChanged', (info) => {
      this._wizard.updateState(info.to)
      this._renderCurrentState()
    })

    this._sm.on('maskChanged', (mask) => {
      // Mask was changed via undo/redo — update alphaMask on SM
      this._sm.alphaMask = mask
    })

    this._sm.on('jointsChanged', (joints) => {
      this._sm.jointPositions = joints
    })
  }

  /**
   * Setup lifecycle hooks for each state.
   */
  _setupLifecycleHooks() {
    // UPLOAD.onEnter
    this._sm.registerHook(AppState.UPLOAD, 'onEnter', () => {
      // Reset shared state
      this._sm.loadedImage = null
      this._sm.alphaMask = null
      this._sm.jointPositions = null
      this._sm.characterData = null
      this._sm.maskHistory = null
      this._sm.jointHistory = null
    })

    // MASK.onEnter
    this._sm.registerHook(AppState.MASK, 'onEnter', () => {
      // maskHistory will be initialized by MaskStep
    })

    // MASK.onExit
    this._sm.registerHook(AppState.MASK, 'onExit', () => {
      // Cleanup handled by MaskStep.destroy()
    })

    // RIG.onEnter
    this._sm.registerHook(AppState.RIG, 'onEnter', () => {
      // jointHistory will be initialized by RigStep
    })

    // PREPROCESSING.onEnter
    this._sm.registerHook(AppState.PREPROCESSING, 'onEnter', (data) => {
      this._runPreprocessing(data)
    })

    // PREPROCESSING.onExit
    this._sm.registerHook(AppState.PREPROCESSING, 'onExit', () => {
      // Worker termination handled by buildCharacterData
    })

    // PENTAS.onEnter
    this._sm.registerHook(AppState.PENTAS, 'onEnter', () => {
      // StageStep will handle renderer init
    })

    // PENTAS.onExit
    this._sm.registerHook(AppState.PENTAS, 'onExit', () => {
      // StageStep.destroy() handles cleanup
    })
  }

  /**
   * Render the current state's step component.
   */
  _renderCurrentState() {
    const state = this._sm.currentState
    const content = this._wizard.getContentContainer()
    if (!content) return

    // Clear content
    content.innerHTML = ''

    // Destroy old settings/save panels when leaving PENTAS
    if (state !== AppState.PENTAS) {
      if (this._settingsPanel) {
        this._settingsPanel.destroy()
        this._settingsPanel = null
      }
      if (this._saveLoadPanel) {
        this._saveLoadPanel.destroy()
        this._saveLoadPanel = null
      }
    }

    switch (state) {
      case AppState.UPLOAD:
        this._renderUploadStep(content)
        break
      case AppState.MASK:
        this._renderMaskStep(content)
        break
      case AppState.RIG:
        this._renderRigStep(content)
        break
      case AppState.PREPROCESSING:
        this._renderPreprocessingStep(content)
        break
      case AppState.PENTAS:
        this._renderPentasStep(content)
        break
      case AppState.EXPORTING:
        // Exporting is handled within PENTAS
        break
    }
  }

  /**
   * Render the Upload step.
   * @param {HTMLElement} content
   */
  _renderUploadStep(content) {
    this._activeStep = new UploadStep(content, {
      onImageLoaded: (loadedImage) => {
        this._sm.transition(AppEvent.IMAGE_LOADED, { image: loadedImage })
      },
      onLoadCharacter: async () => {
        try {
          const result = await loadCharacter()
          if (result) {
            this._sm.characterData = result.data
            this._sm.transition(AppEvent.LOAD_CHARACTER)
          } else {
            toast('info', 'Tidak ada karakter tersimpan.')
          }
        } catch (err) {
          toast('error', `Gagal memuat: ${err.message}`)
        }
      },
    })
    this._wizard.setActiveStep(this._activeStep)
  }

  /**
   * Render the Mask step.
   * @param {HTMLElement} content
   */
  _renderMaskStep(content) {
    this._activeStep = new MaskStep(content, {
      loadedImage: this._sm.loadedImage,
      alphaMask: this._sm.alphaMask,
      maskHistory: this._sm.maskHistory,
    }, {
      onMaskChange: (mask) => {
        this._sm.alphaMask = mask
      },
      onHistoryInit: (history) => {
        this._sm.maskHistory = history
      },
      onBack: () => {
        this._sm.transition(AppEvent.BACK)
      },
      onNext: () => {
        this._sm.transition(AppEvent.PROCEED_TO_RIG, {
          alphaMask: this._sm.alphaMask,
        })
      },
    })
    this._wizard.setActiveStep(this._activeStep)
  }

  /**
   * Render the Rig step.
   * @param {HTMLElement} content
   */
  _renderRigStep(content) {
    this._activeStep = new RigStep(content, {
      loadedImage: this._sm.loadedImage,
      alphaMask: this._sm.alphaMask,
      jointPositions: this._sm.jointPositions,
      characterType: this._sm.characterType,
      jointHistory: this._sm.jointHistory,
    }, {
      onJointsChange: (joints, type) => {
        this._sm.jointPositions = joints
        this._sm.characterType = type
      },
      onHistoryInit: (history) => {
        this._sm.jointHistory = history
      },
      onBack: () => {
        this._sm.transition(AppEvent.BACK)
      },
      onBringToLife: () => {
        this._sm.transition(AppEvent.BRING_TO_LIFE, {
          jointPositions: this._sm.jointPositions,
          alphaMask: this._sm.alphaMask,
        })
      },
    })
    this._wizard.setActiveStep(this._activeStep)
  }

  /**
   * Render the Preprocessing step.
   * @param {HTMLElement} content
   */
  _renderPreprocessingStep(content) {
    const progressContainer = document.createElement('div')
    progressContainer.className = 'paperalive-preprocessing-step'
    content.appendChild(progressContainer)

    this._wizard.showProgress('Memproses...', 0)
  }

  /**
   * Run the preprocessing pipeline.
   */
  async _runPreprocessing() {
    try {
      const charData = await buildCharacterData(
        this._sm.loadedImage,
        { data: new Uint8Array(this._sm.alphaMask.data), width: this._sm.alphaMask.width, height: this._sm.alphaMask.height },
        this._sm.jointPositions,
        this._sm.characterType,
        {},
        (step, value) => {
          const label = PROGRESS_LABELS[step] || step
          this._wizard.showProgress(label, value)
        },
      )

      this._sm.characterData = charData
      this._sm.transition(AppEvent.PREPROCESS_DONE, { characterData: charData })
    } catch (err) {
      toast('error', `Preprocessing gagal: ${err.message}`)
      this._sm.transition(AppEvent.PREPROCESS_ERROR)
    }
  }

  /**
   * Render the Pentas (Stage) step.
   * @param {HTMLElement} content
   */
  _renderPentasStep(content) {
    if (!this._sm.characterData) {
      toast('error', 'CharacterData tidak tersedia.')
      this._sm.transition(AppEvent.FATAL_ERROR)
      return
    }

    this._activeStep = new StageStep(content, {
      characterData: this._sm.characterData,
    }, {
      onEditBack: () => {
        this._sm.transition(AppEvent.EDIT_BACK)
      },
      onClipChange: (clipId) => {
        this._sm.activeClip = clipId
      },
    })

    // Store renderer references on SM
    this._sm.renderer = this._activeStep._renderer
    this._sm.puppet = this._activeStep._puppet
    this._sm.solver = this._activeStep._solver
    this._sm.motionResolver = this._activeStep._motionResolver

    this._wizard.setActiveStep(this._activeStep)

    // Add settings & save/load panels
    this._settingsPanel = new SettingsPanel(content, {
      onSettingChange: (key, value) => {
        if (this._sm.renderer) {
          if (key === 'paperColor') {
            this._sm.renderer.paperColor = new Float32Array(value)
            this._sm.renderer.invalidatePaperTexture()
          } else if (key === 'outlineColor') {
            this._sm.renderer.outlineColor = new Float32Array(value)
          } else if (key in this._sm.renderer) {
            this._sm.renderer[key] = value
          }
        }
      },
      onReset: () => {
        if (this._sm.renderer) {
          this._sm.renderer.paperColor = new Float32Array(NPR_DEFAULTS.paperColor)
          this._sm.renderer.outlineScale = NPR_DEFAULTS.outlineScale
          this._sm.renderer.outlineColor = new Float32Array(NPR_DEFAULTS.outlineColor)
          this._sm.renderer.outlineOpacity = NPR_DEFAULTS.outlineOpacity
          this._sm.renderer.shadowOpacity = NPR_DEFAULTS.shadowOpacity
          this._sm.renderer.shadowOffsetX = NPR_DEFAULTS.shadowOffsetX
          this._sm.renderer.shadowOffsetY = NPR_DEFAULTS.shadowOffsetY
          this._sm.renderer.wiggleAmplitude = NPR_DEFAULTS.wiggleAmplitude
          this._sm.renderer.wiggleFrequency = NPR_DEFAULTS.wiggleFrequency
          this._sm.renderer.brightness = NPR_DEFAULTS.brightness
          this._sm.renderer.saturation = NPR_DEFAULTS.saturation
          this._sm.renderer.invalidatePaperTexture()
        }
      },
    })

    this._saveLoadPanel = new SaveLoadPanel(content, {
      getCharacterData: () => this._sm.characterData,
      getImageBlob: () => null,
      onCharacterLoaded: (data) => {
        this._sm.characterData = data
      },
    })
    this._saveLoadPanel.mount()

    // Settings toggle button
    const settingsBtn = document.createElement('button')
    settingsBtn.className = 'paperalive-btn paperalive-btn-icon paperalive-settings-toggle'
    settingsBtn.textContent = '⚙'
    settingsBtn.setAttribute('aria-label', 'Buka pengaturan rendering')
    settingsBtn.addEventListener('click', () => {
      this._settingsPanel.toggle()
    })
    content.appendChild(settingsBtn)
  }

  /**
   * Setup global keyboard shortcuts (TASK-136).
   */
  _setupKeyboardShortcuts() {
    this._keyHandler = (e) => {
      // Skip if focus is on input/select/textarea
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Ctrl+Z → Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        this._sm.handleUndo()
        return
      }

      // Ctrl+Shift+Z / Ctrl+Y → Redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault()
        this._sm.handleRedo()
        return
      }

      // PENTAS-only shortcuts
      if (this._sm.currentState === AppState.PENTAS && this._activeStep) {
        // Space → play/pause
        if (e.key === ' ') {
          e.preventDefault()
          this._activeStep.togglePlay()
          return
        }

        // 1-6 → select clip
        if (e.key >= '1' && e.key <= '6') {
          const clips = ['idle', 'walk', 'run', 'jump', 'wave', 'dance']
          const idx = Number(e.key) - 1
          if (idx < clips.length && this._activeStep._motionPicker) {
            this._activeStep._motionPicker.selectClip(clips[idx])
          }
          return
        }

        // R → toggle record
        if (e.key === 'r' || e.key === 'R') {
          if (this._activeStep._exportPanel) {
            if (this._activeStep._exportPanel.isRecording) {
              this._activeStep._exportPanel._stopRecording()
            } else {
              this._activeStep._exportPanel._startRecording()
            }
          }
          return
        }

        // Escape → stop drag / cancel export
        if (e.key === 'Escape') {
          this._activeStep.cancelDrag()
          if (this._activeStep._exportPanel?.isRecording) {
            this._activeStep._exportPanel._stopRecording()
          }
          return
        }
      }
    }

    document.addEventListener('keydown', this._keyHandler)
  }

  /**
   * Destroy the application and clean up.
   */
  destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }

    if (this._wizard) {
      this._wizard.destroy()
      this._wizard = null
    }

    if (this._settingsPanel) {
      this._settingsPanel.destroy()
      this._settingsPanel = null
    }

    if (this._saveLoadPanel) {
      this._saveLoadPanel.destroy()
      this._saveLoadPanel = null
    }
  }
}
