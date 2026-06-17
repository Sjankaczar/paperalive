/**
 * @file toast.js
 * @description Global toast notification system.
 *
 * - Types: success, error, info, warning, loading
 * - Appears at bottom-right
 * - Auto-dismiss after duration (default 3500ms)
 * - Max 3 toasts simultaneously (LIFO eviction)
 * - role="alert" for accessibility
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-137
 */

const MAX_TOASTS = 3
const DEFAULT_DURATION = 3500

/** @type {Array<{el: HTMLElement, timerId: number}>} */
const activeToasts = []

/** @type {HTMLElement | null} */
let container = null

/**
 * Color map for each toast type.
 * @type {Object<string, string>}
 */
const TYPE_COLORS = {
  success: '#22c55e',
  error:   '#ef4444',
  info:    '#3b82f6',
  warning: '#f59e0b',
  loading: '#6366f1',
}

/**
 * Get or create the toast container element.
 * @returns {HTMLElement}
 */
function getContainer() {
  if (!container) {
    container = document.createElement('div')
    container.className = 'paperalive-toast-container'
    container.setAttribute('aria-live', 'polite')
    document.body.appendChild(container)
  }
  return container
}

/**
 * Show a toast notification.
 *
 * @param {'success'|'error'|'info'|'warning'|'loading'} type - Toast type
 * @param {string} message - Message to display
 * @param {number} [duration=3500] - Auto-dismiss duration in ms
 * @returns {{ dismiss: () => void }} Toast handle
 */
export function toast(type, message, duration = DEFAULT_DURATION) {
  const el = document.createElement('div')
  el.className = `paperalive-toast paperalive-toast-${type}`
  el.setAttribute('role', 'alert')
  el.textContent = message

  const color = TYPE_COLORS[type] || TYPE_COLORS.info
  el.style.borderLeft = `4px solid ${color}`

  // Evict oldest if at capacity (LIFO)
  while (activeToasts.length >= MAX_TOASTS) {
    dismissToast(0)
  }

  const toastEntry = { el, timerId: 0 }
  activeToasts.push(toastEntry)
  getContainer().appendChild(el)

  // Auto-dismiss
  toastEntry.timerId = setTimeout(() => {
    dismissToast(activeToasts.indexOf(toastEntry))
  }, duration)

  return {
    dismiss() {
      dismissToast(activeToasts.indexOf(toastEntry))
    },
  }
}

/**
 * Remove toast at given index.
 * @param {number} index
 */
function dismissToast(index) {
  if (index < 0 || index >= activeToasts.length) return
  const entry = activeToasts[index]
  clearTimeout(entry.timerId)
  entry.el.remove()
  activeToasts.splice(index, 1)
}
