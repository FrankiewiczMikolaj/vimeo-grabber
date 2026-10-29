import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { download: 'download.html' } } },
  plugins: [crx({ manifest: defineManifest({
    manifest_version: 3,
    name: 'Vimeo Grabber',
    version: '0.3.0',
    description: 'Download separate Vimeo video and audio files with a Linux merge command.',
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'src/worker.ts', type: 'module' },
    permissions: ['downloads', 'storage'],
    host_permissions: ['<all_urls>'],
    content_scripts: [{
      matches: ['<all_urls>'],
      js: ['src/detect/content.ts'],
      all_frames: true,
    }],
  }) })],
});
