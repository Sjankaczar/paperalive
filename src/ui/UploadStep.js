/**
 * @file UploadStep.js
 * @description Step 1 UI — drag-drop, file picker, clipboard paste, load from storage.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-127
 */

import { loadImage } from '../image/ImageLoader.js'
import { hasCharacter } from '../io/CharacterStorage.js'
import { toast } from './toast.js'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Upload step component.
 *
 * Renders a drag-drop zone with file picker, clipboard paste support,
 * and a "Muat dari Penyimpanan" button.
 */
export class UploadStep {
  /**
   * @param {HTMLElement} container - Parent element to mount into
   * @param {Object} callbacks
   * @param {(loadedImage: any) => void} callbacks.onImageLoaded
   * @param {() => void} [callbacks.onLoadCharacter]
   */
  constructor(container, callbacks) {
    this._container = container
    this._onImageLoaded = callbacks.onImageLoaded
    this._onLoadCharacter = callbacks.onLoadCharacter || null

    /** @type {HTMLElement | null} */
    this._el = null

    /** @type {((e: ClipboardEvent) => void) | null} */
    this._pasteHandler = null

    this.mount()
  }

  /**
   * Mount the upload UI into the container.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-upload-step'

    // Drop zone
    const dropZone = document.createElement('div')
    dropZone.className = 'paperalive-drop-zone'
    dropZone.setAttribute('role', 'button')
    dropZone.setAttribute('tabindex', '0')
    dropZone.setAttribute('aria-label', 'Drop gambar di sini atau klik untuk memilih file')

    dropZone.innerHTML = `
      <div class="paperalive-drop-icon">📁</div>
      <p class="paperalive-drop-text">Drag & drop gambar di sini</p>
      <p class="paperalive-drop-hint">atau</p>
    `

    // File picker button
    const pickBtn = document.createElement('button')
    pickBtn.className = 'paperalive-btn paperalive-btn-primary'
    pickBtn.textContent = 'Pilih File'
    pickBtn.setAttribute('aria-label', 'Pilih file gambar')

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.png,.jpg,.jpeg,.webp,.gif'
    fileInput.className = 'paperalive-file-input'
    fileInput.setAttribute('aria-label', 'File gambar')

    pickBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this._handleFile(e.target.files[0])
    })

    dropZone.appendChild(pickBtn)

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropZone.classList.add('paperalive-drop-active')
    })
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('paperalive-drop-active')
    })
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropZone.classList.remove('paperalive-drop-active')
      if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0])
    })

    // Enter key on dropzone
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        fileInput.click()
      }
    })

    el.appendChild(dropZone)

    // Paste support
    this._pasteHandler = (e) => {
      const files = e.clipboardData?.files
      if (files && files.length > 0) {
        this._handleFile(files[0])
      }
    }
    document.addEventListener('paste', this._pasteHandler)

    // "Muat dari Penyimpanan" button
    if (hasCharacter()) {
      const loadBtn = document.createElement('button')
      loadBtn.className = 'paperalive-btn paperalive-btn-secondary paperalive-load-btn'
      loadBtn.textContent = '📂 Muat dari Penyimpanan'
      loadBtn.setAttribute('aria-label', 'Muat karakter dari penyimpanan browser')
      loadBtn.addEventListener('click', () => {
        if (this._onLoadCharacter) this._onLoadCharacter()
      })
      el.appendChild(loadBtn)
    }

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Validate and process a dropped/selected/pasted file.
   * @param {File} file
   */
  async _handleFile(file) {
    // Size validation
    if (file.size > MAX_FILE_SIZE) {
      toast('error', 'File terlalu besar (maksimal 10 MB)')
      return
    }

    // Type validation
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      toast('error', 'Format tidak didukung. Gunakan PNG, JPG, WebP, atau GIF.')
      return
    }

    try {
      const loadedImage = await loadImage(file)
      if (this._onImageLoaded) {
        this._onImageLoaded(loadedImage)
      }
    } catch (err) {
      toast('error', `Gagal memuat gambar: ${err.message}`)
    }
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._pasteHandler) {
      document.removeEventListener('paste', this._pasteHandler)
      this._pasteHandler = null
    }
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
