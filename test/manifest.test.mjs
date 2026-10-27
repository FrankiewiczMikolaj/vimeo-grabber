import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));

test('the fixture uses only downloads and exact HTTPS Vimeo content-script scopes', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.equal(manifest.content_scripts.length, 1);
  const [content] = manifest.content_scripts;
  assert.deepEqual(content.matches, [
    'https://vimeo.com/*', 'https://www.vimeo.com/*', 'https://player.vimeo.com/*',
  ]);
  assert.equal(content.js.length, 1);
  assert.ok(!content.all_frames);
  assert.ok(!content.match_about_blank);
  assert.ok(!content.world || content.world === 'ISOLATED');
  assert.ok(!content.match_origin_as_fallback);
  for (const file of content.js) {
    assert.ok(!file.includes('..') && !file.includes(':'), 'bundled scripts only');
  }
  for (const field of ['host_permissions', 'optional_permissions',
    'optional_host_permissions', 'externally_connectable', 'background']) {
    assert.ok(!manifest[field] || manifest[field].length === 0, field);
  }
  assert.ok(!manifest.content_security_policy, 'use the restrictive MV3 default CSP');
});

test('the action opens a bundled popup inside the extension', async () => {
  const root = await realpath('dist');
  const popup = await realpath(resolve(root, manifest.action.default_popup));
  assert.ok(popup.startsWith(`${root}${sep}`));
  assert.match(await readFile(popup, 'utf8'), /<html lang="en">/);
});
