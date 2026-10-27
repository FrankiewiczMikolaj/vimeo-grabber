import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [crx({ manifest: defineManifest({
    manifest_version: 3,
    name: 'Vimeo Grabber',
    version: '0.1.0',
    description: 'List and download one synthetic Vimeo fixture stream.',
    action: { default_popup: 'popup.html' },
    permissions: ['downloads'],
    content_scripts: [{
      matches: ['https://vimeo.com/*', 'https://www.vimeo.com/*', 'https://player.vimeo.com/*'],
      js: ['src/detect/content.ts'],
    }],
  }) })],
});
