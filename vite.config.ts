import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __ROFE_WEB_VERSION__: JSON.stringify(commit ? `${version}+${commit}` : version) },
  build: { outDir: process.env.ROFE_BUILD_OUT_DIR || 'dist' },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000', '/health': 'http://127.0.0.1:3000', '/ready': 'http://127.0.0.1:3000' },
    // Vite's project root includes the backend and private local data. Never serve them.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/backend/**', '**/.rofe-local/**'] },
    watch: { ignored: ['**/.rofe-local/**', '**/.rofe-e2e-dist/**'] },
  },
})
