import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const browserEmpty = fileURLToPath(new URL('./src/lib/browser-empty.js', import.meta.url))

// Pure static build. Canvas persistence lives entirely in the browser via
// IndexedDB (see src/lib/storage.js). There is no backend middleware anymore —
// the previous Vite dev-server storage plugin existed to give the Codex MCP
// server filesystem access, which a standalone browser app does not need.
//
// `diagnostics_channel` / `async_hooks` are Node-only modules that the AI SDK
// imports conditionally inside an isNodeRuntime() guard, so they never run in
// the browser. We alias them to empty modules to keep the build clean and to
// guarantee no Node polyfill leaks into the bundle.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      diagnostics_channel: browserEmpty,
      'node:diagnostics_channel': browserEmpty
    }
  }
})
