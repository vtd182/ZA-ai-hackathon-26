import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const workspacePackages = [
  '@pm-agent/agent-core',
  '@pm-agent/canvas',
  '@pm-agent/connectors',
  '@pm-agent/domain',
  '@pm-agent/fixture-meal-ordering',
  '@pm-agent/fixture-zalo-design-system',
  '@pm-agent/persistence',
  '@pm-agent/reasoning',
  '@pm-agent/shared',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: { rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@pm-agent/domain'] })],
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    optimizeDeps: { exclude: ['@tldraw/assets', '@tldraw/assets/imports.vite'] },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
})
