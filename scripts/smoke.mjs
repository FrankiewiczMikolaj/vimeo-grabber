import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { chromium } from 'playwright';

const extension = resolve(process.env.SMOKE_EXTENSION_DIR ?? 'dist');
const headed = process.env.SMOKE_HEADED === '1';
const artifacts = resolve(process.env.SMOKE_ARTIFACT_DIR ?? `artifacts/${headed ? 'headed' : 'headless'}`);
await mkdir(artifacts, { recursive: true });
// Clear old evidence so a failed run cannot appear to have a current screenshot.
for (const name of ['popup.png', 'unsupported.png', 'failure.png', 'failure-tab.png', 'trace.zip', 'diagnostics.json', 'download.json', 'vimeo-grabber-synthetic.txt']) {
  await rm(resolve(artifacts, name), { force: true });
}
const diagnostics = {
  mode: headed ? 'headed' : 'headless',
  entry: 'chrome.action.openPopup (not a physical toolbar click)',
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
let actionCommand;
let downloads;
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

async function exerciseAction(popupUrl, activeTab, supported) {
  const session = await context.newCDPSession(page);
  await session.send('Browser.setDownloadBehavior', { behavior: 'default' });
  diagnostics.chromium = await session.send('Browser.getVersion');
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
  actionCommand = command;
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  // Wait for the asynchronous content-script reply, not a fixed rendering delay.
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (document.querySelector('#status')?.textContent &&
          !document.querySelector('#status').textContent.startsWith('Looking')) return resolve(true);
      if (Date.now() >= deadline) return reject(new Error('Popup did not settle'));
      setTimeout(check, 20);
    };
    check();
  })`);
  const state = await evaluate(`({
    title: document.querySelector('#streams h2')?.textContent,
    buttons: document.querySelectorAll('button').length,
    isPopup: chrome.extension.getViews({type: 'popup'}).includes(window),
    text: document.querySelector('main').innerText
  })`);
  diagnostics[supported ? 'fixturePopup' : 'unsupportedPopup'] = state;
  // Chromium can expose the DOM before sizing the native action surface.
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (innerWidth >= 300 && innerHeight >= 100) return resolve(true);
      if (Date.now() >= deadline) return reject(new Error('Action surface did not resize'));
      setTimeout(check, 20);
    };
    check();
  })`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, supported ? 'popup.png' : 'unsupported.png'),
    Buffer.from(screenshot.data, 'base64'));
  assert.equal(state.isPopup, true, 'target must be an actual extension popup view');
  if (supported) {
    assert.equal(state.title, 'Synthetic Vimeo dummy stream');
    assert.equal(state.buttons, 1);
    await evaluate("document.querySelector('button').click()");
    // waitForFunction treats an async predicate's Promise as truthy before it settles.
    const item = await page.evaluate(() => new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        globalThis.chrome.downloads.onCreated.removeListener(check);
        globalThis.chrome.downloads.onChanged.removeListener(check);
      };
      const check = async () => {
        try {
          const items = await globalThis.chrome.downloads.search({});
          if (items.length === 1 && items[0].state === 'complete') {
            cleanup();
            resolve(items[0]);
          }
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Native download did not complete within 10 seconds'));
      }, 10_000);
      globalThis.chrome.downloads.onCreated.addListener(check);
      globalThis.chrome.downloads.onChanged.addListener(check);
      void check();
    }));
    assert.equal(item.filename, resolve(downloads, 'vimeo-grabber-synthetic.txt'));
    assert.equal(item.state, 'complete');
    const bytes = await readFile(item.filename);
    assert.deepEqual(bytes, Buffer.from('Vimeo Grabber owned synthetic fixture.\n'));
    assert.equal(bytes.length, 39);
    // Retain a byte-for-byte evidence copy; item.filename above proves the native path.
    await writeFile(resolve(artifacts, 'vimeo-grabber-synthetic.txt'), bytes);
    diagnostics.download = { ...item, bytes: bytes.length, content: bytes.toString() };
    await writeFile(resolve(artifacts, 'download.json'), `${JSON.stringify(diagnostics.download, null, 2)}\n`);
  } else {
    assert.equal(state.title, undefined);
    assert.equal(state.buttons, 0);
    assert.equal(await page.evaluate(async () => (await globalThis.chrome.downloads.search({})).length), 1);
    assert.deepEqual(await readdir(downloads), ['vimeo-grabber-synthetic.txt']);
    assert.deepEqual(await readFile(resolve(downloads, 'vimeo-grabber-synthetic.txt')),
      Buffer.from('Vimeo Grabber owned synthetic fixture.\n'));
  }
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
  actionCommand = undefined;
}

try {
  const popup = await readBuild();
  diagnostics.profile = await mkdtemp(resolve(artifacts, 'chromium-'));
  downloads = await mkdtemp(resolve(artifacts, 'downloads-'));
  await mkdir(resolve(diagnostics.profile, 'Default'));
  await writeFile(resolve(diagnostics.profile, 'Default/Preferences'), JSON.stringify({
    download: { default_directory: downloads, prompt_for_download: false },
  }));
  context = await chromium.launchPersistentContext(diagnostics.profile, {
    channel: 'chromium',
    headless: !headed,
    acceptDownloads: false,
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
  for (const tab of context.pages()) {
    tab.on('pageerror', error => diagnostics.pageErrors.push(error.message));
    tab.on('console', message => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    });
    tab.on('requestfailed', request => diagnostics.failedRequests.push({
      url: request.url(), error: request.failure()?.errorText,
    }));
  }
  const fixture = await readFile('test/fixtures/synthetic-vimeo.html', 'utf8');
  // Fulfill only owned HTML. Every other external request is blocked and fails the run.
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url === 'https://vimeo.com/fixture' || url === 'https://example.com/fixture') {
      return route.fulfill({ contentType: 'text/html', body: fixture });
    }
    diagnostics.externalRequests.push(url);
    return route.abort();
  });
  await page.goto(`${origin}${popup}`);
  const activeTab = context.pages()[0];
  await activeTab.goto('https://vimeo.com/fixture');
  await exerciseAction(`${origin}${popup}`, activeTab, true);
  await activeTab.goto('https://example.com/fixture');
  await exerciseAction(`${origin}${popup}`, activeTab, false);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.externalRequests, []);
  assert.deepEqual(diagnostics.failedRequests, []);
} catch (error) {
  failure = error;
  diagnostics.error = error.stack;
  if (actionCommand) {
    await actionCommand('Page.captureScreenshot', { format: 'png' })
      .then(image => writeFile(resolve(artifacts, 'failure.png'), Buffer.from(image.data, 'base64')))
      .catch(error => { diagnostics.actionScreenshotError = error.message; });
  }
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(artifacts, 'failure-tab.png'), timeout: 3_000 })
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
      if (downloads) await rm(downloads, { recursive: true, force: true });
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
  console.log(`PASS: ${diagnostics.mode} fixture → real action popup → native 39-byte download; unsupported page blocked; ${artifacts}`);
}
