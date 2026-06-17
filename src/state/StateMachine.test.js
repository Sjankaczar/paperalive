/**
 * @file StateMachine.test.js
 * @description Unit tests for StateMachine — transitions, guards, lifecycle, events, undo/redo.
 * @see implementation/tasks/TASK-116-126-epic10-state-machine.md — TASK-125, TASK-126
 */

import { describe, it, expect, vi } from 'vitest'
import {
  StateMachine,
  AppState,
  AppEvent,
  TRANSITIONS,
  GUARDS,
} from './StateMachine.js'

// ─── TASK-116: Constants ──────────────────────────────────────────────────────

describe('TASK-116: AppState & AppEvent Constants', () => {
  it('AppState.UPLOAD returns "UPLOAD"', () => {
    expect(AppState.UPLOAD).toBe('UPLOAD')
  })

  it('all states are present', () => {
    expect(AppState.UPLOAD).toBeDefined()
    expect(AppState.MASK).toBeDefined()
    expect(AppState.RIG).toBeDefined()
    expect(AppState.PREPROCESSING).toBeDefined()
    expect(AppState.PENTAS).toBeDefined()
    expect(AppState.EXPORTING).toBeDefined()
  })

  it('AppState is frozen', () => {
    expect(Object.isFrozen(AppState)).toBe(true)
  })

  it('AppEvent is frozen', () => {
    expect(Object.isFrozen(AppEvent)).toBe(true)
  })

  it('all events including UNDO and REDO are present', () => {
    expect(AppEvent.IMAGE_LOADED).toBeDefined()
    expect(AppEvent.PROCEED_TO_RIG).toBeDefined()
    expect(AppEvent.BRING_TO_LIFE).toBeDefined()
    expect(AppEvent.PREPROCESS_DONE).toBeDefined()
    expect(AppEvent.PREPROCESS_ERROR).toBeDefined()
    expect(AppEvent.EDIT_BACK).toBeDefined()
    expect(AppEvent.EXPORT_VIDEO).toBeDefined()
    expect(AppEvent.EXPORT_DONE).toBeDefined()
    expect(AppEvent.EXPORT_ERROR).toBeDefined()
    expect(AppEvent.CANCEL_EXPORT).toBeDefined()
    expect(AppEvent.LOAD_CHARACTER).toBeDefined()
    expect(AppEvent.BACK).toBeDefined()
    expect(AppEvent.FATAL_ERROR).toBeDefined()
    expect(AppEvent.UNDO).toBe('undo')
    expect(AppEvent.REDO).toBe('redo')
  })
})

// ─── TASK-117: Transition Table ───────────────────────────────────────────────

describe('TASK-117: Transition Table', () => {
  it('TRANSITIONS[UPLOAD][imageLoaded] → MASK', () => {
    expect(TRANSITIONS[AppState.UPLOAD][AppEvent.IMAGE_LOADED]).toBe(AppState.MASK)
  })

  it('TRANSITIONS[MASK][imageLoaded] → undefined (invalid)', () => {
    expect(TRANSITIONS[AppState.MASK][AppEvent.IMAGE_LOADED]).toBeUndefined()
  })

  it('TRANSITIONS[PENTAS][editBack] → MASK', () => {
    expect(TRANSITIONS[AppState.PENTAS][AppEvent.EDIT_BACK]).toBe(AppState.MASK)
  })
})

// ─── TASK-118: Guard Functions ────────────────────────────────────────────────

describe('TASK-118: Guard Functions', () => {
  describe('BRING_TO_LIFE guard', () => {
    const makeMask = (width, height, fill) => ({
      data: new Uint8Array(width * height).fill(fill),
      width,
      height,
    })

    it('returns false with 2 joints', () => {
      const result = GUARDS[AppEvent.BRING_TO_LIFE]({
        jointPositions: [
          { id: 'a', x: 5, y: 5 },
          { id: 'b', x: 6, y: 6 },
        ],
        alphaMask: makeMask(10, 10, 1),
      })
      expect(result).toBe(false)
    })

    it('returns true with 3 joints inside mask bbox', () => {
      const result = GUARDS[AppEvent.BRING_TO_LIFE]({
        jointPositions: [
          { id: 'a', x: 2, y: 2 },
          { id: 'b', x: 5, y: 5 },
          { id: 'c', x: 7, y: 7 },
        ],
        alphaMask: makeMask(10, 10, 1),
      })
      expect(result).toBe(true)
    })

    it('returns false when joint is outside mask bbox', () => {
      // Mask with foreground only in center region
      const mask = makeMask(20, 20, 0)
      // Set pixels in center (5-15, 5-15)
      for (let r = 5; r <= 15; r++) {
        for (let c = 5; c <= 15; c++) {
          mask.data[r * 20 + c] = 1
        }
      }

      const result = GUARDS[AppEvent.BRING_TO_LIFE]({
        jointPositions: [
          { id: 'a', x: 10, y: 10 },
          { id: 'b', x: 8, y: 8 },
          { id: 'c', x: 1, y: 1 }, // outside bbox (bbox: top=5, left=5)
        ],
        alphaMask: mask,
      })
      expect(result).toBe(false)
    })
  })

  describe('PROCEED_TO_RIG guard', () => {
    it('returns false with alphaMask all zeros', () => {
      const result = GUARDS[AppEvent.PROCEED_TO_RIG]({
        alphaMask: { data: new Uint8Array(100).fill(0), width: 10, height: 10 },
      })
      expect(result).toBe(false)
    })

    it('returns true with at least one foreground pixel', () => {
      const data = new Uint8Array(100).fill(0)
      data[50] = 1
      const result = GUARDS[AppEvent.PROCEED_TO_RIG]({
        alphaMask: { data, width: 10, height: 10 },
      })
      expect(result).toBe(true)
    })
  })

  describe('IMAGE_LOADED guard', () => {
    it('returns true with valid image data', () => {
      expect(GUARDS[AppEvent.IMAGE_LOADED]({ image: { width: 100, height: 100 } })).toBe(true)
    })

    it('returns false with null image', () => {
      expect(GUARDS[AppEvent.IMAGE_LOADED]({ image: null })).toBe(false)
    })
  })

  describe('PREPROCESS_DONE guard', () => {
    it('returns true with characterData', () => {
      expect(GUARDS[AppEvent.PREPROCESS_DONE]({ characterData: {} })).toBe(true)
    })

    it('returns false with null characterData', () => {
      expect(GUARDS[AppEvent.PREPROCESS_DONE]({ characterData: null })).toBe(false)
    })
  })
})

// ─── TASK-119/120: Core Transitions & Invalid Handling ────────────────────────

describe('TASK-119/120: Core Transitions', () => {
  it('starts in UPLOAD state', () => {
    const sm = new StateMachine()
    expect(sm.currentState).toBe(AppState.UPLOAD)
  })

  it('UPLOAD → MASK on imageLoaded with valid data', () => {
    const sm = new StateMachine()
    const result = sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.MASK)
  })

  it('invalid transition from MASK with imageLoaded → stays in MASK', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    const result = sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 200 } })
    expect(result).toBe(false)
    expect(sm.currentState).toBe(AppState.MASK)
  })

  it('does not emit stateChanged on invalid transition', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    const handler = vi.fn()
    sm.on('stateChanged', handler)

    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 200 } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('guard failure → no-op, no error', () => {
    const sm = new StateMachine()
    // Try to proceed to RIG without valid mask
    const result = sm.transition(AppEvent.PROCEED_TO_RIG, {
      alphaMask: { data: new Uint8Array(100).fill(0), width: 10, height: 10 },
    })
    // Should fail because we're in UPLOAD, not MASK
    expect(result).toBe(false)
  })

  it('MASK → RIG on proceedToRig with valid mask', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    const data = new Uint8Array(100).fill(0)
    data[50] = 1
    const result = sm.transition(AppEvent.PROCEED_TO_RIG, {
      alphaMask: { data, width: 10, height: 10 },
    })
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.RIG)
  })

  it('RIG → PREPROCESSING on bringToLife with 3+ joints inside bbox', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    const maskData = new Uint8Array(100).fill(1)
    sm.transition(AppEvent.PROCEED_TO_RIG, {
      alphaMask: { data: maskData, width: 10, height: 10 },
    })

    const result = sm.transition(AppEvent.BRING_TO_LIFE, {
      jointPositions: [
        { id: 'a', x: 2, y: 2 },
        { id: 'b', x: 5, y: 5 },
        { id: 'c', x: 7, y: 7 },
      ],
      alphaMask: { data: maskData, width: 10, height: 10 },
    })
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.PREPROCESSING)
  })

  it('RIG stays on bringToLife with 2 joints', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: { width: 100 } })
    const maskData = new Uint8Array(100).fill(1)
    sm.transition(AppEvent.PROCEED_TO_RIG, {
      alphaMask: { data: maskData, width: 10, height: 10 },
    })

    const result = sm.transition(AppEvent.BRING_TO_LIFE, {
      jointPositions: [
        { id: 'a', x: 2, y: 2 },
        { id: 'b', x: 5, y: 5 },
      ],
      alphaMask: { data: maskData, width: 10, height: 10 },
    })
    expect(result).toBe(false)
    expect(sm.currentState).toBe(AppState.RIG)
  })

  it('PREPROCESSING → PENTAS on preprocessDone', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.IMAGE_LOADED, { image: {} })
    const maskData = new Uint8Array(100).fill(1)
    sm.transition(AppEvent.PROCEED_TO_RIG, { alphaMask: { data: maskData, width: 10, height: 10 } })
    sm.transition(AppEvent.BRING_TO_LIFE, {
      jointPositions: [{ id: 'a', x: 2, y: 2 }, { id: 'b', x: 5, y: 5 }, { id: 'c', x: 7, y: 7 }],
      alphaMask: { data: maskData, width: 10, height: 10 },
    })

    const result = sm.transition(AppEvent.PREPROCESS_DONE, { characterData: { meta: {} } })
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.PENTAS)
  })

  it('PENTAS → EXPORTING on exportVideo', () => {
    const sm = new StateMachine()
    // Fast-forward to PENTAS
    sm._currentState = AppState.PENTAS
    const result = sm.transition(AppEvent.EXPORT_VIDEO)
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.EXPORTING)
  })

  it('EXPORTING → PENTAS on exportDone', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.EXPORTING
    const result = sm.transition(AppEvent.EXPORT_DONE)
    expect(result).toBe(true)
    expect(sm.currentState).toBe(AppState.PENTAS)
  })

  it('EXPORTING → PENTAS on cancelExport', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.EXPORTING
    sm.transition(AppEvent.CANCEL_EXPORT)
    expect(sm.currentState).toBe(AppState.PENTAS)
  })

  it('PENTAS → MASK on editBack', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.PENTAS
    sm.transition(AppEvent.EDIT_BACK)
    expect(sm.currentState).toBe(AppState.MASK)
  })

  it('fatalError from any state → UPLOAD', () => {
    const states = [AppState.MASK, AppState.RIG, AppState.PREPROCESSING, AppState.PENTAS, AppState.EXPORTING]
    for (const state of states) {
      const sm = new StateMachine()
      sm._currentState = state
      sm.transition(AppEvent.FATAL_ERROR)
      expect(sm.currentState).toBe(AppState.UPLOAD)
    }
  })

  it('UPLOAD → PENTAS on loadCharacter', () => {
    const sm = new StateMachine()
    sm.transition(AppEvent.LOAD_CHARACTER)
    expect(sm.currentState).toBe(AppState.PENTAS)
  })

  it('PREPROCESSING → RIG on preprocessError', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.PREPROCESSING
    sm.transition(AppEvent.PREPROCESS_ERROR)
    expect(sm.currentState).toBe(AppState.RIG)
  })

  it('EXPORTING → PENTAS on exportError', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.EXPORTING
    sm.transition(AppEvent.EXPORT_ERROR)
    expect(sm.currentState).toBe(AppState.PENTAS)
  })

  it('MASK → UPLOAD on back', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    sm.transition(AppEvent.BACK)
    expect(sm.currentState).toBe(AppState.UPLOAD)
  })

  it('RIG → MASK on back', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.RIG
    sm.transition(AppEvent.BACK)
    expect(sm.currentState).toBe(AppState.MASK)
  })
})

// ─── TASK-123: Event Emitter ──────────────────────────────────────────────────

describe('TASK-123: Event Emitter', () => {
  it('stateChanged handler called with {from, to} on transition', () => {
    const sm = new StateMachine()
    const handler = vi.fn()
    sm.on('stateChanged', handler)

    sm.transition(AppEvent.IMAGE_LOADED, { image: {} })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ from: AppState.UPLOAD, to: AppState.MASK })
    )
  })

  it('off() removes handler', () => {
    const sm = new StateMachine()
    const handler = vi.fn()
    sm.on('stateChanged', handler)
    sm.off('stateChanged', handler)

    sm.transition(AppEvent.IMAGE_LOADED, { image: {} })
    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple handlers for same event all called', () => {
    const sm = new StateMachine()
    const h1 = vi.fn()
    const h2 = vi.fn()
    sm.on('stateChanged', h1)
    sm.on('stateChanged', h2)

    sm.transition(AppEvent.IMAGE_LOADED, { image: {} })

    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })
})

// ─── TASK-122: Lifecycle Hooks ────────────────────────────────────────────────

describe('TASK-122: Lifecycle Hooks', () => {
  it('onExit called before onEnter during transition', () => {
    const sm = new StateMachine()
    const callOrder = []

    sm.registerHook(AppState.UPLOAD, 'onExit', () => callOrder.push('exit_UPLOAD'))
    sm.registerHook(AppState.MASK, 'onEnter', () => callOrder.push('enter_MASK'))

    sm.transition(AppEvent.IMAGE_LOADED, { image: {} })

    expect(callOrder).toEqual(['exit_UPLOAD', 'enter_MASK'])
  })

  it('PREPROCESSING.onExit → worker.terminate() called', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.PREPROCESSING
    const mockWorker = { terminate: vi.fn() }
    sm.activeWorker = mockWorker

    sm.registerHook(AppState.PREPROCESSING, 'onExit', () => {
      if (sm.activeWorker) sm.activeWorker.terminate()
    })

    sm.transition(AppEvent.PREPROCESS_DONE, { characterData: {} })

    expect(mockWorker.terminate).toHaveBeenCalled()
  })

  it('PENTAS.onEnter hook is called on transition to PENTAS', () => {
    const sm = new StateMachine()
    const onEnterPentas = vi.fn()
    sm.registerHook(AppState.PENTAS, 'onEnter', onEnterPentas)

    sm._currentState = AppState.PREPROCESSING
    sm.transition(AppEvent.PREPROCESS_DONE, { characterData: {} })

    expect(onEnterPentas).toHaveBeenCalled()
  })
})

// ─── TASK-124: Shared State Data ──────────────────────────────────────────────

describe('TASK-124: Shared State Data', () => {
  it('loadedImage is null initially', () => {
    const sm = new StateMachine()
    expect(sm.loadedImage).toBeNull()
  })

  it('loadedImage is set on imageLoaded transition', () => {
    const sm = new StateMachine()
    const img = { width: 200, height: 100 }
    sm.transition(AppEvent.IMAGE_LOADED, { image: img })
    expect(sm.loadedImage).toBe(img)
  })

  it('characterData is set on preprocessDone', () => {
    const sm = new StateMachine()
    const charData = { meta: { jointCount: 14 } }
    sm._currentState = AppState.PREPROCESSING
    sm.transition(AppEvent.PREPROCESS_DONE, { characterData: charData })
    expect(sm.characterData).toBe(charData)
  })

  it('characterType defaults to humanoid', () => {
    const sm = new StateMachine()
    expect(sm.characterType).toBe('humanoid')
  })
})

// ─── TASK-126: UNDO/REDO Routing ─────────────────────────────────────────────

describe('TASK-126: UNDO/REDO Routing', () => {
  it('handleUndo in MASK → maskHistory.undo() called', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    sm.alphaMask = { data: new Uint8Array([1, 1, 0, 0]), width: 2, height: 2 }

    const mockHistory = {
      canUndo: true,
      undo: vi.fn().mockReturnValue(new Uint8Array([0, 0, 1, 1])),
    }
    sm.maskHistory = mockHistory

    sm.handleUndo()

    expect(mockHistory.undo).toHaveBeenCalled()
  })

  it('handleUndo in MASK emits maskChanged', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    sm.alphaMask = { data: new Uint8Array([1, 1, 0, 0]), width: 2, height: 2 }

    const mockHistory = {
      canUndo: true,
      undo: vi.fn().mockReturnValue(new Uint8Array([0, 0, 1, 1])),
    }
    sm.maskHistory = mockHistory

    const handler = vi.fn()
    sm.on('maskChanged', handler)

    sm.handleUndo()

    expect(handler).toHaveBeenCalled()
  })

  it('handleUndo in RIG → jointHistory.undo() called', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.RIG

    const mockHistory = {
      canUndo: true,
      undo: vi.fn().mockReturnValue([{ id: 'a', x: 10, y: 20 }]),
    }
    sm.jointHistory = mockHistory

    sm.handleUndo()

    expect(mockHistory.undo).toHaveBeenCalled()
  })

  it('handleUndo in PENTAS → no action', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.PENTAS

    const handler = vi.fn()
    sm.on('maskChanged', handler)
    sm.on('jointsChanged', handler)

    sm.handleUndo()

    expect(handler).not.toHaveBeenCalled()
  })

  it('handleRedo in MASK → maskHistory.redo() called', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    sm.alphaMask = { data: new Uint8Array([0, 0, 1, 1]), width: 2, height: 2 }

    const mockHistory = {
      canRedo: true,
      redo: vi.fn().mockReturnValue(new Uint8Array([1, 1, 1, 1])),
    }
    sm.maskHistory = mockHistory

    sm.handleRedo()

    expect(mockHistory.redo).toHaveBeenCalled()
  })

  it('handleRedo in RIG → jointHistory.redo() called', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.RIG

    const mockHistory = {
      canRedo: true,
      redo: vi.fn().mockReturnValue([{ id: 'a', x: 30, y: 40 }]),
    }
    sm.jointHistory = mockHistory

    sm.handleRedo()

    expect(mockHistory.redo).toHaveBeenCalled()
  })

  it('canUndo reflects maskHistory state in MASK', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    expect(sm.canUndo).toBe(false)

    sm.maskHistory = { canUndo: true }
    expect(sm.canUndo).toBe(true)
  })

  it('canRedo reflects jointHistory state in RIG', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.RIG
    expect(sm.canRedo).toBe(false)

    sm.jointHistory = { canRedo: true }
    expect(sm.canRedo).toBe(true)
  })

  it('handleUndo without maskHistory in MASK → no error', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.MASK
    sm.maskHistory = null
    expect(() => sm.handleUndo()).not.toThrow()
  })

  it('handleRedo without jointHistory in RIG → no error', () => {
    const sm = new StateMachine()
    sm._currentState = AppState.RIG
    sm.jointHistory = null
    expect(() => sm.handleRedo()).not.toThrow()
  })
})
