/**
 * @file SaveLoadPanel.js
 * @description Save/load UI with character name input.
 *
 * @see implementation/tasks/TASK-127-145-epic11-ui.md — TASK-139
 */

import { saveCharacter, loadCharacter } from '../io/CharacterStorage.js'
import { toast } from './toast.js'

/**
 * Save/Load panel component.
 */
export class SaveLoadPanel {
  /**
   * @param {HTMLElement} container
   * @param {Object} callbacks
   * @param {() => import('../types/characterData.js').CharacterData|null} callbacks.getCharacterData
   * @param {(blob: Blob) => Blob|null} callbacks.getImageBlob
   * @param {(data: import('../types/characterData.js').CharacterData, imageBlob: Blob) => void} callbacks.onCharacterLoaded
   */
  constructor(container, callbacks) {
    this._container = container
    this._getCharacterData = callbacks.getCharacterData
    this._getImageBlob = callbacks.getImageBlob
    this._onCharacterLoaded = callbacks.onCharacterLoaded
    this._el = null
  }

  /**
   * Mount the save/load panel.
   */
  mount() {
    const el = document.createElement('div')
    el.className = 'paperalive-save-load-panel'

    // Save section
    const saveGroup = document.createElement('div')
    saveGroup.className = 'paperalive-save-group'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.placeholder = 'Nama karakter...'
    nameInput.className = 'paperalive-input paperalive-name-input'
    nameInput.setAttribute('aria-label', 'Nama karakter')

    const saveBtn = document.createElement('button')
    saveBtn.className = 'paperalive-btn paperalive-btn-primary'
    saveBtn.textContent = '💾 Simpan ke Browser'
    saveBtn.setAttribute('aria-label', 'Simpan karakter ke penyimpanan browser')
    saveBtn.addEventListener('click', async () => {
      await this._save(nameInput.value || 'Karakter Tanpa Nama')
    })

    saveGroup.appendChild(nameInput)
    saveGroup.appendChild(saveBtn)
    el.appendChild(saveGroup)

    this._el = el
    this._container.appendChild(el)
  }

  /**
   * Save the current character.
   * @param {string} name
   */
  async _save(name) {
    const charData = this._getCharacterData()
    if (!charData) {
      toast('error', 'Tidak ada karakter untuk disimpan.')
      return
    }

    const imageBlob = this._getImageBlob ? this._getImageBlob() : null

    try {
      // Add name to meta
      charData.meta = charData.meta || {}
      charData.meta.name = name
      charData.meta.savedAt = Date.now()

      await saveCharacter(charData, imageBlob)
      toast('success', 'Karakter berhasil disimpan!')
    } catch (err) {
      if (err && err.message === 'QUOTA_EXCEEDED') {
        toast('warning', 'Penyimpanan browser penuh. Karakter tidak dapat disimpan.')
      } else {
        toast('error', `Gagal menyimpan: ${err.message}`)
      }
    }
  }

  /**
   * Load a character from storage.
   */
  async load() {
    try {
      const result = await loadCharacter()
      if (!result) {
        toast('info', 'Tidak ada karakter tersimpan.')
        return
      }
      this._onCharacterLoaded?.(result.data, result.imageBlob)
      toast('success', 'Karakter berhasil dimuat!')
    } catch (err) {
      toast('error', `Gagal memuat: ${err.message}`)
    }
  }

  /**
   * Unmount and clean up.
   */
  destroy() {
    if (this._el) {
      this._el.remove()
      this._el = null
    }
  }
}
