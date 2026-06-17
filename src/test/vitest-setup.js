/**
 * @file vitest-setup.js
 * @description Global test setup — polyfills for jsdom environment.
 *   - IndexedDB via fake-indexeddb
 *   - navigator.storage.estimate() stub
 *   - ImageData polyfill (jsdom doesn't expose it globally)
 */

import 'fake-indexeddb/auto'

// Polyfill ImageData for jsdom (not available as a global)
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = height
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4)
      }
    }
  }
}

// Stub navigator.storage.estimate() for storage estimate tests
if (!navigator.storage) {
  Object.defineProperty(navigator, 'storage', {
    value: {
      estimate: async () => ({ usage: 1024 * 100, quota: 1024 * 1024 * 1024 }),
    },
    configurable: true,
  })
}
