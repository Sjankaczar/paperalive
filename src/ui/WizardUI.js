/**
 * @file WizardUI.js
 * @description 4-step wizard container with step indicator.
 * Mount/unmount each step based on StateMachine state.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-135
 */

import { AppState } from '../state/StateMachine.js'

const STEPS = [
  { state: AppState.UPLOAD, label: 'Upload', number: 1 },
  { state: AppState.MASK, label: 'Mask', number: 2 },
  { state: AppState.RIG, label: 'Rig', number: 3 },
  { state: AppState.PREPROCESSING, label: 'Proses', number: 4 },
]

/**
 * WizardUI — 4-step wizard container with step indicator.
 */
export class WizardUI {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this._container = container

    /** @type {HTMLElement|null} */
    this._el = null
    /** @type {HTMLElement|null} */
    this._stepContainer = null
    /** @type {HTMLElement|null} */
    this._indicatorEl = null
    /** @type {HTMLElement|null} */
    this._contentEl = null
    /** @type {any|null} */
    this._activeStepComponent = null
    /** @type {string} */
    this._currentState = AppState.UPLOAD

    this.mount()
  }

  /**
   * Mount the wizard container.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-wizard'

    // Step indicator
    const indicator = document.createElement('div')
    indicator.className = 'paperalive-step-indicator'
    indicator.setAttribute('role', 'navigation')
    indicator.setAttribute('aria-label', 'Step wizard')

    for (const step of STEPS) {
      const dot = document.createElement('div')
      dot.className = 'paperalive-step-dot'
      dot.dataset.step = String(step.number)
      dot.dataset.state = step.state

      const num = document.createElement('span')
      num.className = 'paperalive-step-number'
      num.textContent = String(step.number)

      const label = document.createElement('span')
      label.className = 'paperalive-step-label'
      label.textContent = step.label

      dot.appendChild(num)
      dot.appendChild(label)
      indicator.appendChild(dot)
    }

    this._indicatorEl = indicator
    el.appendChild(indicator)

    // Content area
    const content = document.createElement('div')
    content.className = 'paperalive-step-content'
    this._contentEl = content
    el.appendChild(content)

    this._el = el
    this._stepContainer = el
    this._container.appendChild(el)
  }

  /**
   * Update the wizard to reflect the current state.
   * @param {string} currentState
   */
  updateState(currentState) {
    this._currentState = currentState
    this._updateIndicator()
  }

  /**
   * Update the step indicator to show the active step.
   */
  _updateIndicator() {
    if (!this._indicatorEl) return

    const dots = this._indicatorEl.querySelectorAll('.paperalive-step-dot')
    dots.forEach((dot) => {
      const state = dot.dataset.state
      const stepNum = Number(dot.dataset.step)

      dot.classList.remove('active', 'completed')

      // Find the current step number
      const currentStepNum = STEPS.find(s => s.state === this._currentState)?.number || 1

      if (state === this._currentState) {
        dot.classList.add('active')
      } else if (stepNum < currentStepNum) {
        dot.classList.add('completed')
      }
    })
  }

  /**
   * Get the content container for mounting step components.
   * @returns {HTMLElement|null}
   */
  getContentContainer() {
    return this._contentEl
  }

  /**
   * Set the active step component (mounts it into the content area).
   * @param {any} stepComponent — step component with destroy() method, or null
   */
  setActiveStep(stepComponent) {
    // Destroy previous step
    if (this._activeStepComponent && this._activeStepComponent.destroy) {
      this._activeStepComponent.destroy()
    }
    this._activeStepComponent = stepComponent
  }

  /**
   * Show a progress bar (for PREPROCESSING state).
   * @param {string} label
   * @param {number} progress — 0.0 to 1.0
   */
  showProgress(label, progress) {
    if (!this._contentEl) return

    let progressEl = this._contentEl.querySelector('.paperalive-preprocessing-progress')
    if (!progressEl) {
      progressEl = document.createElement('div')
      progressEl.className = 'paperalive-preprocessing-progress'
      progressEl.innerHTML = `
        <p class="paperalive-progress-label">Memproses...</p>
        <div class="paperalive-progress-bar-wrap">
          <div class="paperalive-progress-bar"></div>
        </div>
        <p class="paperalive-progress-step"></p>
      `
      this._contentEl.appendChild(progressEl)
    }

    const bar = progressEl.querySelector('.paperalive-progress-bar')
    const stepLabel = progressEl.querySelector('.paperalive-progress-step')
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`
    if (stepLabel) stepLabel.textContent = label
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._activeStepComponent && this._activeStepComponent.destroy) {
      this._activeStepComponent.destroy()
      this._activeStepComponent = null
    }
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
