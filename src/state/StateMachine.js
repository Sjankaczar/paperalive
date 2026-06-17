/**
 * @file StateMachine.js
 * @description Wizard state machine managing the full application lifecycle:
 * UPLOAD → MASK → RIG → PREPROCESSING → PENTAS → EXPORTING.
 *
 * Includes transition table, guard functions, lifecycle hooks,
 * shared state data, event emitter, and UNDO/REDO routing.
 *
 * @see architecture/statemachine.md
 * @see architecture/module_design.md — StateMachine.js
 */

import { getMaskBoundingBox } from '../utils/bbox.js'

// ─── TASK-116: State & Event Constants ────────────────────────────────────────

/**
 * Application states (frozen).
 */
export const AppState = Object.freeze({
  UPLOAD:        'UPLOAD',
  MASK:          'MASK',
  RIG:           'RIG',
  PREPROCESSING: 'PREPROCESSING',
  PENTAS:        'PENTAS',
  EXPORTING:     'EXPORTING',
})

/**
 * Application events (frozen).
 */
export const AppEvent = Object.freeze({
  IMAGE_LOADED:     'imageLoaded',
  PROCEED_TO_RIG:   'proceedToRig',
  BRING_TO_LIFE:    'bringToLife',
  PREPROCESS_DONE:  'preprocessDone',
  PREPROCESS_ERROR:  'preprocessError',
  EDIT_BACK:        'editBack',
  EXPORT_VIDEO:     'exportVideo',
  EXPORT_DONE:      'exportDone',
  EXPORT_ERROR:     'exportError',
  CANCEL_EXPORT:    'cancelExport',
  LOAD_CHARACTER:   'loadCharacter',
  BACK:             'back',
  FATAL_ERROR:      'fatalError',
  UNDO:             'undo',
  REDO:             'redo',
})

// ─── TASK-117: Transition Table ────────────────────────────────────────────────

/**
 * Transition table: TRANSITIONS[currentState][event] → targetState.
 * Undefined entries mean the transition is invalid (silently ignored).
 */
export const TRANSITIONS = {
  [AppState.UPLOAD]: {
    [AppEvent.IMAGE_LOADED]:    AppState.MASK,
    [AppEvent.LOAD_CHARACTER]:  AppState.PENTAS,
  },
  [AppState.MASK]: {
    [AppEvent.PROCEED_TO_RIG]:  AppState.RIG,
    [AppEvent.BACK]:            AppState.UPLOAD,
  },
  [AppState.RIG]: {
    [AppEvent.BRING_TO_LIFE]:   AppState.PREPROCESSING,
    [AppEvent.BACK]:            AppState.MASK,
  },
  [AppState.PREPROCESSING]: {
    [AppEvent.PREPROCESS_DONE]:   AppState.PENTAS,
    [AppEvent.PREPROCESS_ERROR]:  AppState.RIG,
  },
  [AppState.PENTAS]: {
    [AppEvent.EDIT_BACK]:     AppState.MASK,
    [AppEvent.EXPORT_VIDEO]:  AppState.EXPORTING,
  },
  [AppState.EXPORTING]: {
    [AppEvent.EXPORT_DONE]:   AppState.PENTAS,
    [AppEvent.EXPORT_ERROR]:  AppState.PENTAS,
    [AppEvent.CANCEL_EXPORT]: AppState.PENTAS,
  },
}

// ─── TASK-118: Guard Functions ─────────────────────────────────────────────────

/**
 * Check if a joint position is inside the bounding box of the alpha mask.
 * @param {{ x: number, y: number }} joint
 * @param {import('../types/characterData.js').BinaryMask} alphaMask
 * @returns {boolean}
 */
function isInsideMaskBbox(joint, alphaMask) {
  if (!alphaMask) return false
  const bbox = getMaskBoundingBox(alphaMask)
  if (!bbox) return false

  return (
    joint.x >= bbox.left &&
    joint.x < bbox.left + bbox.width &&
    joint.y >= bbox.top &&
    joint.y < bbox.top + bbox.height
  )
}

/**
 * Guard functions — return true to allow transition, false to block.
 */
export const GUARDS = {
  [AppEvent.IMAGE_LOADED]: (data) =>
    data && data.image !== null && data.image !== undefined,

  [AppEvent.PROCEED_TO_RIG]: (data) => {
    if (!data || !data.alphaMask || !data.alphaMask.data) return false
    return data.alphaMask.data.some(v => v > 0)
  },

  [AppEvent.BRING_TO_LIFE]: (data) => {
    if (!data || !data.jointPositions) return false
    const joints = data.jointPositions
    if (joints.length < 3) return false
    if (!data.alphaMask) return false
    return joints.every(j => isInsideMaskBbox(j, data.alphaMask))
  },

  [AppEvent.PREPROCESS_DONE]: (data) =>
    data && data.characterData !== null && data.characterData !== undefined,
}

// ─── TASK-119–124: StateMachine Class ──────────────────────────────────────────

/**
 * Application state machine.
 *
 * Manages wizard flow, shared state, lifecycle hooks, event emission,
 * and UNDO/REDO routing.
 */
export class StateMachine {
  constructor() {
    /** @type {string} Current application state */
    this._currentState = AppState.UPLOAD

    /** @type {Map<string, Function[]>} Event listener map */
    this._listeners = new Map()

    // ── Shared State Data ──────────────────────────────────────────────────

    /** @type {any} Loaded image data */
    this.loadedImage = null

    /** @type {import('../types/characterData.js').BinaryMask | null} */
    this.alphaMask = null

    /** @type {number} */
    this.thresholdValue = 30

    /** @type {import('../history/MaskHistory.js').MaskHistory | null} */
    this.maskHistory = null

    /** @type {import('../types/characterData.js').JointPositionList | null} */
    this.jointPositions = null

    /** @type {'humanoid' | 'freeform'} */
    this.characterType = 'humanoid'

    /** @type {import('../skeleton/JointHistory.js').JointHistory | null} */
    this.jointHistory = null

    /** @type {import('../types/characterData.js').CharacterData | null} */
    this.characterData = null

    /** @type {string | null} */
    this.activeClip = null

    /** @type {any} NPRRenderer reference */
    this.renderer = null

    /** @type {any} MeshPuppet reference */
    this.puppet = null

    /** @type {any} ARAPSolver reference */
    this.solver = null

    /** @type {any} MotionResolver reference */
    this.motionResolver = null

    /** @type {any} Preprocessing worker reference */
    this.activeWorker = null

    /** @type {number} */
    this.preprocessProgress = 0

    // ── Lifecycle Hooks ────────────────────────────────────────────────────

    /**
     * Lifecycle hooks per state. Each entry can have onEnter and onExit.
     * @type {Object<string, { onEnter?: Function, onExit?: Function }>}
     */
    this._hooks = {
      [AppState.UPLOAD]:        { onEnter: null, onExit: null },
      [AppState.MASK]:          { onEnter: null, onExit: null },
      [AppState.RIG]:           { onEnter: null, onExit: null },
      [AppState.PREPROCESSING]: { onEnter: null, onExit: null },
      [AppState.PENTAS]:        { onEnter: null, onExit: null },
      [AppState.EXPORTING]:     { onEnter: null, onExit: null },
    }
  }

  /**
   * Current application state.
   * @type {string}
   */
  get currentState() {
    return this._currentState
  }

  // ─── TASK-123: Event Emitter ───────────────────────────────────────────────

  /**
   * Register an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    this._listeners.get(event).push(handler)
  }

  /**
   * Remove an event listener.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const handlers = this._listeners.get(event)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx !== -1) {
      handlers.splice(idx, 1)
    }
  }

  /**
   * Emit an event with optional data.
   * @param {string} event
   * @param {*} [data]
   */
  emit(event, data) {
    const handlers = this._listeners.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      handler(data)
    }
  }

  // ─── TASK-122: Lifecycle Hooks ─────────────────────────────────────────────

  /**
   * Register a lifecycle hook for a state.
   * @param {string} state — AppState value
   * @param {'onEnter' | 'onExit'} hook
   * @param {Function} fn
   */
  registerHook(state, hook, fn) {
    if (this._hooks[state]) {
      this._hooks[state][hook] = fn
    }
  }

  // ─── TASK-119/120: Core Transition Logic ────────────────────────────────────

  /**
   * Attempt a state transition.
   *
   * 1. Look up target state in TRANSITIONS table
   * 2. Run guard (if exists) — block if returns false
   * 3. Run onExit for current state
   * 4. Update currentState
   * 5. Run onEnter for new state
   * 6. Emit 'stateChanged' event
   *
   * Invalid transitions and failed guards are silently ignored (no-op).
   *
   * @param {string} event — AppEvent value
   * @param {*} [data] — optional data payload
   * @returns {boolean} true if transition occurred, false otherwise
   */
  transition(event, data) {
    // Handle fatalError from any state → UPLOAD
    if (event === AppEvent.FATAL_ERROR) {
      return this._doTransition(AppState.UPLOAD, event, data)
    }

    // UNDO/REDO are not state transitions — they're routed separately
    if (event === AppEvent.UNDO || event === AppEvent.REDO) {
      return false
    }

    const stateTransitions = TRANSITIONS[this._currentState]
    if (!stateTransitions) return false

    const targetState = stateTransitions[event]
    if (targetState === undefined) {
      // Invalid transition — silently ignore
      return false
    }

    // Run guard if one exists
    const guard = GUARDS[event]
    if (guard) {
      const guardResult = guard(data)
      if (!guardResult) {
        // Guard failed — no-op
        return false
      }
    }

    return this._doTransition(targetState, event, data)
  }

  /**
   * Execute the actual state transition.
   * @param {string} targetState
   * @param {string} event
   * @param {*} [data]
   * @returns {boolean}
   * @private
   */
  _doTransition(targetState, event, data) {
    const fromState = this._currentState

    // Run onExit for current state
    const exitHook = this._hooks[fromState]?.onExit
    if (exitHook) {
      exitHook(data)
    }

    // Update state
    this._currentState = targetState

    // Store transition data on the shared state
    this._applyTransitionData(event, data)

    // Run onEnter for new state
    const enterHook = this._hooks[targetState]?.onEnter
    if (enterHook) {
      enterHook(data)
    }

    // Emit stateChanged
    this.emit('stateChanged', { from: fromState, to: targetState, event, data })

    return true
  }

  /**
   * Apply transition-specific data to shared state.
   * @param {string} event
   * @param {*} data
   * @private
   */
  _applyTransitionData(event, data) {
    if (!data) return

    switch (event) {
      case AppEvent.IMAGE_LOADED:
        if (data.image) this.loadedImage = data.image
        break
      case AppEvent.PROCEED_TO_RIG:
        if (data.alphaMask) this.alphaMask = data.alphaMask
        break
      case AppEvent.BRING_TO_LIFE:
        if (data.jointPositions) this.jointPositions = data.jointPositions
        break
      case AppEvent.PREPROCESS_DONE:
        if (data.characterData) this.characterData = data.characterData
        break
      default:
        break
    }
  }

  // ─── TASK-121: UNDO/REDO Routing ───────────────────────────────────────────

  /**
   * Handle undo — routes to the active step's history.
   */
  handleUndo() {
    switch (this._currentState) {
      case AppState.MASK:
        if (this.maskHistory && this.maskHistory.canUndo) {
          const prevMask = this.maskHistory.undo()
          if (prevMask) {
            this.alphaMask = { data: prevMask, width: this.alphaMask?.width, height: this.alphaMask?.height }
            this.emit('maskChanged', this.alphaMask)
          }
        }
        break

      case AppState.RIG:
        if (this.jointHistory && this.jointHistory.canUndo) {
          const prevJoints = this.jointHistory.undo()
          if (prevJoints) {
            this.jointPositions = prevJoints
            this.emit('jointsChanged', this.jointPositions)
          }
        }
        break

      // PENTAS, EXPORTING, UPLOAD, PREPROCESSING — no undo action
      default:
        break
    }
  }

  /**
   * Handle redo — routes to the active step's history.
   */
  handleRedo() {
    switch (this._currentState) {
      case AppState.MASK:
        if (this.maskHistory && this.maskHistory.canRedo) {
          const nextMask = this.maskHistory.redo()
          if (nextMask) {
            this.alphaMask = { data: nextMask, width: this.alphaMask?.width, height: this.alphaMask?.height }
            this.emit('maskChanged', this.alphaMask)
          }
        }
        break

      case AppState.RIG:
        if (this.jointHistory && this.jointHistory.canRedo) {
          const nextJoints = this.jointHistory.redo()
          if (nextJoints) {
            this.jointPositions = nextJoints
            this.emit('jointsChanged', this.jointPositions)
          }
        }
        break

      default:
        break
    }
  }

  /**
   * Whether undo is available in the current state.
   * @returns {boolean}
   */
  get canUndo() {
    switch (this._currentState) {
      case AppState.MASK:
        return this.maskHistory ? this.maskHistory.canUndo : false
      case AppState.RIG:
        return this.jointHistory ? this.jointHistory.canUndo : false
      default:
        return false
    }
  }

  /**
   * Whether redo is available in the current state.
   * @returns {boolean}
   */
  get canRedo() {
    switch (this._currentState) {
      case AppState.MASK:
        return this.maskHistory ? this.maskHistory.canRedo : false
      case AppState.RIG:
        return this.jointHistory ? this.jointHistory.canRedo : false
      default:
        return false
    }
  }
}
