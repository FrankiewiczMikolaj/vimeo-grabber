import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';

test('offline Chromium observes real Vimeo windows, deduplicates and stops', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: 'src/detect/observe.ts', formats: ['es'] }, write: false,
  } });
  const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`;
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext();
  const proof = process.env.OBSERVER_PROOF_DIR;
  const requests = [];
  try {
    if (proof) { await mkdir(proof, { recursive: true }); await context.tracing.start({ snapshots: true }); }
    await context.route('**/*', route => {
      requests.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Owned offline frame</title>' });
    });
    const page = await context.newPage();
    await page.goto('https://player.vimeo.com/video/910017?h=owned');
    const resource = 'https://player.vimeo.com/video/910017/config?sig=dummy%2f&x=&x=2';
    // Resource timing already buffered before startup must not be lost.
    await page.evaluate(url => globalThis.fetch(url).then(response => response.text()), resource);
    await page.evaluate(async moduleUrl => {
      const { observePage } = await import(moduleUrl);
      const w = globalThis;
      w.disconnected = { mutation: 0, performance: 0 };
      w.MutationObserver = class extends w.MutationObserver {
        disconnect() { w.disconnected.mutation++; super.disconnect(); }
      };
      w.PerformanceObserver = class extends w.PerformanceObserver {
        disconnect() { w.disconnected.performance++; super.disconnect(); }
      };
      w.reports = [];
      w.other = [];
      w.observation = observePage(w);
      w.unsubscribe = w.observation.subscribe(value => w.reports.push(value));
      w.unother = w.observation.subscribe(value => w.other.push(value));
      w.insert = title => {
        const script = w.document.createElement('script');
        script.type = 'application/json';
        script.textContent = JSON.stringify({ video: { id: '910017', title }, request: {
          files: { hls: { cdns: { owned: { url: 'https://fixture.vimeocdn.com/master.m3u8' } } } },
        } });
        w.document.body.append(script);
      };
    }, moduleUrl);
    const initial = await page.evaluate(() => globalThis.reports);
    assert.deepEqual(initial, [{ videos: [], configUrls: [resource,
      'https://player.vimeo.com/video/910017/config?h=owned'] }]);
    await page.evaluate(() => { globalThis.insert('Late owned config'); globalThis.insert('Late owned config'); });
    await page.waitForFunction(() => globalThis.reports.length === 2);
    assert.equal(await page.evaluate(() => globalThis.reports[1].videos[0].title), 'Late owned config');
    const later = 'https://player.vimeo.com/video/910017/config?sig=later%2f+%20';
    await page.evaluate(url => globalThis.fetch(url).then(response => response.text()), later);
    await page.waitForFunction(url => globalThis.reports.at(-1).configUrls.includes(url), later);
    const afterResource = await page.evaluate(() => globalThis.reports.length);
    await page.evaluate(async url => {
      await globalThis.fetch(url);
      const w = globalThis;
      // Moving identical alternatives and repeating resources must not add reports.
      w.document.body.prepend(w.document.querySelector('script'));
      w.document.body.append(w.document.querySelector('script').cloneNode(true));
      const frame = w.document.createElement('iframe');
      frame.src = 'https://player.vimeo.com/video/910018?h=frame';
      w.document.body.append(frame);
    }, later);
    await page.waitForFunction(() => globalThis.reports.at(-1).configUrls
      .includes('https://player.vimeo.com/video/910018/config?h=frame'));
    assert.equal(await page.evaluate(() => globalThis.reports.length), afterResource + 1);
    await page.evaluate(() => {
      for (const priority of ['first', 'second']) {
        const script = globalThis.document.createElement('script');
        script.type = 'application/json';
        script.id = priority;
        script.textContent = JSON.stringify({ player: {
          config_url: `https://player.vimeo.com/video/910017/config?priority=${priority}`,
        } });
        globalThis.document.body.append(script);
      }
    });
    await page.waitForFunction(() => globalThis.reports.at(-1).configUrls[0]?.endsWith('priority=first'));
    const beforeReorder = await page.evaluate(() => globalThis.reports.length);
    await page.evaluate(() => globalThis.document.body.prepend(globalThis.document.getElementById('second')));
    await page.waitForFunction(() => globalThis.reports.at(-1).configUrls[0]?.endsWith('priority=second'));
    assert.equal(await page.evaluate(() => globalThis.reports.length), beforeReorder + 1);
    await page.evaluate(() => {
      globalThis.unother();
      // Character data and src attribute changes must also trigger discovery.
      globalThis.document.querySelectorAll('script').forEach(script => {
        const config = JSON.parse(script.textContent);
        if (!config.video) return;
        config.video.title = 'Edited config';
        script.firstChild.data = JSON.stringify(config);
      });
      globalThis.document.querySelector('iframe').src = 'https://player.vimeo.com/video/910019?h=changed';
    });
    await page.waitForFunction(() => globalThis.reports.at(-1).videos[0].title === 'Edited config');
    const beforeStop = await page.evaluate(() => ({ reports: globalThis.reports, other: globalThis.other }));
    assert.equal(beforeStop.other.length, beforeStop.reports.length - 1);
    assert.ok(beforeStop.reports.at(-1).configUrls.includes('https://player.vimeo.com/video/910019/config?h=changed'));
    assert.ok(!beforeStop.reports.at(-1).configUrls.includes('https://player.vimeo.com/video/910018/config?h=frame'));
    await page.evaluate(() => {
      globalThis.unsubscribe();
      globalThis.insert('Unsubscribed');
    });
    // A fresh subscriber sees the new snapshot, not stale cached state.
    await page.evaluate(() => new Promise(resolve => globalThis.setTimeout(resolve, 0)));
    assert.equal(await page.evaluate(() => {
      let title;
      globalThis.observation.subscribe(value => { title = value.videos.at(-1)?.title; })();
      return title;
    }), 'Unsubscribed');
    await page.evaluate(async () => {
      globalThis.stoppedReports = [];
      globalThis.observation.subscribe(value => globalThis.stoppedReports.push(value));
      globalThis.insert('Queued before stop');
      await Promise.resolve(); // Let MutationObserver queue its discovery task.
      globalThis.observation.stop();
      globalThis.observation.subscribe(() => { throw new Error('Stopped subscription reported'); });
      globalThis.insert('After stop');
      await globalThis.fetch('/video/910017/config?after=stop');
    });
    await page.evaluate(() => new Promise(resolve => globalThis.setTimeout(resolve, 50)));
    assert.deepEqual(await page.evaluate(() => ({ reports: globalThis.reports, other: globalThis.other })), beforeStop);
    assert.deepEqual(await page.evaluate(() => globalThis.disconnected), { mutation: 1, performance: 1 });
    assert.equal(await page.evaluate(() => globalThis.stoppedReports.length), 1);
    const rejected = [];
    for (const origin of ['https://unrelated.example', 'https://player.vimeo.com.evil.example',
      'http://vimeo.com', 'https://player.vimeo.com:444']) {
      await page.goto(`${origin}/`);
      rejected.push(await page.evaluate(async moduleUrl => {
        const { observePage } = await import(moduleUrl);
        globalThis.document.body.innerHTML = '<script type="application/json">{"player":{"config_url":"https://player.vimeo.com/video/1/config"}}</script>';
        let inspected = false;
        const original = globalThis.document.querySelectorAll;
        globalThis.document.querySelectorAll = () => { inspected = true; throw new Error('Inspected unsupported DOM'); };
        try { observePage(globalThis); return { refused: false, inspected }; }
        catch (error) { return { refused: error.message === 'Unsupported frame origin', inspected }; }
        finally { globalThis.document.querySelectorAll = original; }
      }, moduleUrl));
    }
    assert.deepEqual(rejected, Array(4).fill({ refused: true, inspected: false }));
    assert.ok(requests.every(url => ['player.vimeo.com', 'vimeo.com', 'unrelated.example',
      'player.vimeo.com.evil.example'].includes(new globalThis.URL(url).hostname)));
    if (proof) {
      await writeFile(resolve(proof, 'results.json'), JSON.stringify({ initial, beforeStop, rejected, requests }, null, 2));
      await context.tracing.stop({ path: resolve(proof, 'trace.zip') });
    }
  } finally { await browser.close(); }
});
