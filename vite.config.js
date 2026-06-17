import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // Explicit build entry (suppresses "could not auto-determine entry point" warning)
  build: {
    rollupOptions: {
      input: './index.html',
    },
  },

  // Vitest configuration embedded in Vite config
  test: {
    // Use jsdom environment because the app heavily relies on browser APIs (Canvas, IndexedDB, etc)
    environment: 'jsdom',
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },
    // Global setup file (IndexedDB polyfill, navigator stubs, etc.)
    setupFiles: ['src/test/vitest-setup.js'],
    // Include test files
    include: ['src/**/*.test.js'],
  },
})
