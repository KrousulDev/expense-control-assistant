/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In production the app is served under /expense/ by nginx reverse proxy.
  // VITE_BASE is injected at Docker build time (see app/Dockerfile ARG VITE_BASE).
  // Locally it falls back to '/' so dev server works without changes.
  base: process.env.VITE_BASE ?? '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
