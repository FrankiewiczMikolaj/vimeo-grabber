import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));

test('the MV3 shell requests no privileges or executable remote sources', () => {
  assert.equal(manifest.manifest_version, 3);
  for (const field of ['permissions', 'host_permissions', 'optional_permissions',
    'optional_host_permissions', 'content_scripts', 'externally_connectable', 'background']) {
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
