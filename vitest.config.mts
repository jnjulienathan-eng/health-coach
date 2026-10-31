import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Resolves the "@/…" path alias from tsconfig.json, so tests can import
// modules that use it (e.g. lib/oura.ts).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
})
