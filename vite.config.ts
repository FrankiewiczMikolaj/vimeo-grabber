import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [crx({ manifest: defineManifest({
    manifest_version: 3,
    name: 'Vimeo Grabber',
    version: '0.1.0',
    description: 'List Vimeo video and audio qualities from metadata. No media downloads.',
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'src/worker.ts', type: 'module' },
    permissions: [],
    host_permissions: ['https://player.vimeo.com/*'],
    optional_host_permissions: ['https://*.vimeocdn.com/*'],
    content_scripts: [{
      matches: ['https://vimeo.com/*', 'https://www.vimeo.com/*', 'https://player.vimeo.com/*'],
      js: ['src/detect/content.ts'],
      all_frames: true,
    }],
  }) })],
});
