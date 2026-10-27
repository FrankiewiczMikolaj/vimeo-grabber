import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [crx({ manifest: defineManifest({
    manifest_version: 3,
    name: 'Vimeo Grabber',
    version: '0.1.0',
    description: 'A Vimeo-only extension shell. Detection and downloads are not available yet.',
    action: { default_popup: 'popup.html' },
  }) })],
});
