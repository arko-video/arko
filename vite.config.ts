// Configuration de Vite (serveur de dev, build) et de Vitest (tests).
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { env } from 'node:process';
import { defaultClientConditions } from 'vite';

export default defineConfig({
  base: '/arko/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Arko',
        short_name: 'Arko',
        description: 'Monte tes clips de jeu en TikTok, directement sur ton téléphone.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0F1115',
        background_color: '#0F1115',
        start_url: './',
        scope: './',
        // « Partager → Arko » (Android, Arko installé) : le téléphone envoie les sons à ./partager,
        // reçus par public/partage-sw.js (ajouté au service worker ci-dessous).
        share_target: {
          action: './partager',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'sons',
                accept: ['audio/*', '.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.zip', 'application/zip'],
              },
            ],
          },
        },
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ogg}'],
        // Jamais pré-cachés : le moteur ONNX (14 Mo, gardé au 1er usage ci-dessous), les modèles (le détecteur de voix,
        // 2,2 Mo, est gardé VÉRIFIÉ par auto/modeles/modeles.ts dans « arko-modeles » : pas de 2ᵉ copie) et les musiques
        // de Kevin MacLeod (13 Mo, gardées à la demande par auto/son/musiques-arko.ts dans « arko-musiques »).
        globIgnores: ['ort/**', 'modeles/**', 'musiques/**'],
        // Réception des sons partagés vers Arko (Web Share Target).
        importScripts: ['partage-sw.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Moteur des sous-titres (14 Mo) : gardé au premier usage seulement, puis disponible sans internet.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/ort/'),
            handler: 'CacheFirst',
            options: { cacheName: 'arko-ort', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  // Sous-titres : onnxruntime-web SANS son WASM intégré (26 Mo inutiles) ; Arko fournit le sien dans public/ort/.
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions] },
  // En dev, transformers.js n'est importé que dans un Worker : on le prépare d'avance (sinon Vite recharge la page).
  optimizeDeps: { include: ['@huggingface/transformers'] },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  // Banc d'essai des sous-titres : ajouté au build SEULEMENT pour le test e2e (playwright.sous-titres.config.ts).
  ...(env.ARKO_BANC_SOUS_TITRES === '1'
    ? { build: { rolldownOptions: { input: { main: 'index.html', banc: 'tests/harness-sous-titres/index.html' } } } }
    : {}),
});
