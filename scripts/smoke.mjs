import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const extension = resolve('dist');
const artifacts = resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(resolve(artifacts, 'chromium-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 340, height: 320 },
  });
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  const card = page.locator('extensions-item').filter({ hasText: 'Vimeo Grabber' });
  await card.waitFor();
  const id = await card.getAttribute('id');
  assert.match(id, /^[a-p]{32}$/);
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(`chrome-extension://${id}/`)) externalRequests.push(request.url());
  });
  await page.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);
  await page.getByRole('heading', { name: 'Vimeo Grabber', exact: true }).waitFor();
  assert.equal(await page.title(), 'Vimeo Grabber');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.match(await page.locator('main').innerText(), /detection and downloads are not available yet/);
  await page.screenshot({ path: resolve(artifacts, 'popup.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(`PASS: unpacked MV3 popup ${id}; no page errors or external requests; artifacts/popup.png`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
