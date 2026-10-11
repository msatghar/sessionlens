import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The demo build is hosted as a static site (GitHub Pages) and only ever shows
// the bundled sample sessions. The normal build is served by the local CLI.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? './' : '/',
  define: {
    __DEMO__: JSON.stringify(mode === 'demo'),
  },
  build: {
    outDir: mode === 'demo' ? 'demo-dist' : 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
}))
