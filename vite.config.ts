/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /piano-professor/).
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // The browser piano's samples and the bundled font must work offline too.
        globPatterns: ['**/*.{js,wasm,css,html,mp3,woff2}'],
      },
      manifest: {
        name: 'Piano Professor',
        short_name: 'Piano Prof',
        description: 'Practise piano with falling notes and a MIDI keyboard.',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#0a0c16',
        theme_color: '#0a0c16',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
