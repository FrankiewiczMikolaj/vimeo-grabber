import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { chromium } from 'playwright';

const extension = resolve(process.env.SMOKE_EXTENSION_DIR ?? 'dist');
const headed = process.env.SMOKE_HEADED === '1';
const artifacts = resolve(process.env.SMOKE_ARTIFACT_DIR ?? `artifacts/${headed ? 'headed' : 'headless'}`);
await mkdir(artifacts, { recursive: true });
// Clear old evidence so a failed run cannot appear to have a current screenshot.
for (const name of ['popup.png', 'failure.png', 'trace.zip', 'diagnostics.json']) {
  await rm(resolve(artifacts, name), { force: true });
}
const diagnostics = {
  mode: headed ? 'headed' : 'headless',
  entry: 'direct popup navigation (not a toolbar click)',
  extension,
  profile: null,
  pageErrors: [],
  consoleErrors: [],
  externalRequests: [],
  failedRequests: [],
  browserLog: [],
  cleanup: false,
};
let context;
let page;
let tracing = false;
let failure;

async function readBuild() {
  try {
    const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3, 'expected manifest_version 3');
    assert.equal(manifest.name, 'Vimeo Grabber', 'expected Vimeo Grabber');
    const popup = manifest.action?.default_popup;
    assert.equal(typeof popup, 'string', 'action.default_popup must name the built popup');
    assert.ok(popup.length > 0 && !isAbsolute(popup), 'popup must be a relative file');
    const root = await realpath(extension);
    const file = await realpath(resolve(root, popup));
    const local = relative(root, file);
    assert.ok(local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local),
      'popup must stay inside the extension build');
    await readFile(file);
    return popup;
  } catch (error) {
    throw new Error(`Invalid extension build at ${extension}: ${error.message}. Run pnpm build first.`, { cause: error });
  }
}

// Chromium's action popup is a CDP page target, but Playwright does not emit a
// BrowserContext page for it. Use a non-flattened child session for this target.
async function popupCommand(session, sessionId, method, params = {}) {
  const id = ++popupCommand.id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`${method} timed out`)), 10_000);
    const receive = event => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id !== id) return;
      finish(message.error && new Error(JSON.stringify(message.error)), message.result);
    };
    function finish(error, result) {
      clearTimeout(timer);
      session.off('Target.receivedMessageFromTarget', receive);
      if (error) reject(error);
      else resolve(result);
    }
    session.on('Target.receivedMessageFromTarget', receive);
    session.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id, method, params }),
    }).catch(finish);
  });
}
popupCommand.id = 0;

async function exerciseAction(popupUrl) {
  diagnostics.entry = 'chrome.action.openPopup (not a physical click or keyboard action)';
  const session = await context.newCDPSession(page);
  diagnostics.chromium = await session.send('Browser.getVersion');
  diagnostics.activation = await page.evaluate(async () => {
    try {
      return { commands: await globalThis.chrome.commands.getAll() };
    } catch (error) {
      return { keyboardProbeError: error.message };
    }
  });
  const activeTab = context.pages()[0];
  await activeTab.bringToFront();
  const before = await session.send('Target.getTargets');
  // Retain the exact API exception on unsupported platforms. Never fall back to navigation.
  diagnostics.actionApi = await session.send('Runtime.evaluate', {
    expression: 'chrome.action.openPopup().then(() => "opened")',
    awaitPromise: true, returnByValue: true, userGesture: false,
  });
  assert.equal(diagnostics.actionApi.exceptionDetails, undefined, 'action API failed; see diagnostics');
  assert.equal(diagnostics.actionApi.result.value, 'opened');
  const after = await session.send('Target.getTargets');
  const target = after.targetInfos.find(target => target.url === popupUrl &&
    !before.targetInfos.some(previous => previous.targetId === target.targetId));
  assert.ok(target, 'openPopup must create a new target, not reuse the bootstrap tab');
  diagnostics.popupTarget = target;
  const { sessionId } = await session.send('Target.attachToTarget', {
    targetId: target.targetId, flatten: false,
  });
  const command = (method, params) => popupCommand(session, sessionId, method, params);
  const rendered = await command('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title, lang: document.documentElement.lang,
      heading: document.querySelector('h1')?.textContent,
      text: document.querySelector('main')?.innerText,
      popupViews: chrome.extension.getViews({type: 'popup'}).length,
      isPopup: chrome.extension.getViews({type: 'popup'}).includes(window),
      width: innerWidth, height: innerHeight
    })`, returnByValue: true,
  });
  diagnostics.popup = JSON.parse(rendered.result.value);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, 'popup.png'), Buffer.from(screenshot.data, 'base64'));
  assert.equal(diagnostics.popup.title, 'Vimeo Grabber');
  assert.equal(diagnostics.popup.lang, 'en');
  assert.equal(diagnostics.popup.heading, 'Vimeo Grabber');
  assert.equal(diagnostics.popup.isPopup, true, 'target must be an actual extension popup view');
  assert.equal(diagnostics.popup.popupViews, 1);
  // Focus another tab: a real action popup must disappear, unlike the bootstrap tab.
  await session.send('Target.setDiscoverTargets', { discover: true });
  const destroyed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.off('Target.targetDestroyed', listener);
      reject(new Error('action popup did not close on focus change'));
    }, 5_000);
    const listener = event => {
      if (event.targetId !== target.targetId) return;
      clearTimeout(timer);
      session.off('Target.targetDestroyed', listener);
      resolve(event);
    };
    session.on('Target.targetDestroyed', listener);
  });
  [diagnostics.popupDestroyed] = await Promise.all([destroyed, page.bringToFront()]);
  assert.equal(await page.evaluate(() => globalThis.chrome.extension.getViews({ type: 'popup' }).length), 0);
  diagnostics.bootstrapSurvived = !page.isClosed();
  await session.detach();
}

try {
  const popup = await readBuild();
  diagnostics.profile = await mkdtemp(resolve(artifacts, 'chromium-'));
  context = await chromium.launchPersistentContext(diagnostics.profile, {
    channel: 'chromium',
    headless: !headed,
    timeout: 15_000,
    logger: {
      isEnabled: () => true,
      log: (name, severity, message) => diagnostics.browserLog.push({ name, severity, message }),
    },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 340, height: 320 },
  });
  context.setDefaultTimeout(10_000);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracing = true;
  page = await context.newPage();
  await page.goto('chrome://extensions/');
  const card = page.locator('extensions-item').filter({ hasText: 'Vimeo Grabber' });
  await card.waitFor();
  const id = await card.getAttribute('id');
  assert.match(id, /^[a-p]{32}$/);
  diagnostics.extensionId = id;
  const origin = `chrome-extension://${id}/`;
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => diagnostics.failedRequests.push({
    url: request.url(), error: request.failure()?.errorText,
  }));
  // Block external traffic as well as detecting it; this harness never needs Vimeo.
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin)) return route.continue();
    diagnostics.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${origin}${popup}`);
  if (headed) {
    await exerciseAction(`${origin}${popup}`);
  } else {
    await page.getByRole('heading', { name: 'Vimeo Grabber', exact: true }).waitFor();
    assert.equal(await page.title(), 'Vimeo Grabber');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.screenshot({ path: resolve(artifacts, 'popup.png'), fullPage: true });
  }
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.externalRequests, []);
  assert.deepEqual(diagnostics.failedRequests, []);
} catch (error) {
  failure = error;
  diagnostics.error = error.stack;
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(artifacts, 'failure.png'), timeout: 3_000 })
      .catch(error => { diagnostics.screenshotError = error.message; });
  }
} finally {
  try {
    if (tracing) await context.tracing.stop({ path: resolve(artifacts, 'trace.zip') });
  } catch (error) {
    diagnostics.traceError = error.message;
    failure ??= error;
  }
  try {
    await context?.close();
  } catch (error) {
    diagnostics.closeError = error.message;
    failure ??= error;
  } finally {
    try {
      if (diagnostics.profile) await rm(diagnostics.profile, { recursive: true, force: true });
      diagnostics.cleanup = true;
    } catch (error) {
      diagnostics.cleanupError = error.message;
      failure ??= error;
    }
    await writeFile(resolve(artifacts, 'diagnostics.json'), `${JSON.stringify(diagnostics, null, 2)}\n`);
  }
}
if (failure) {
  console.error(`FAIL: ${failure.message}\nDiagnostics: ${artifacts}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${diagnostics.mode} unpacked MV3 popup; ${diagnostics.entry}; ${artifacts}/popup.png`);
}
