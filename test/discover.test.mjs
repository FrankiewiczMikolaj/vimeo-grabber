import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';

// Compile the actual module and exercise real DOM nodes, with fixture scripts inert.
test('offline Chromium discovery retains alternatives and sees later DOM/config resources', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: 'src/detect/discover.ts', formats: ['es'] }, write: false,
  } });
  const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`;
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext();
  const proof = process.env.DISCOVERY_PROOF_DIR;
  try {
    if (proof) { await mkdir(proof, { recursive: true }); await context.tracing.start({ screenshots: true, snapshots: true }); }
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const discover = async (html, frameUrl, observed = []) => page.evaluate(async args => {
      const { discoverPage } = await import(args.moduleUrl);
      const doc = new globalThis.DOMParser().parseFromString(args.html, 'text/html');
      return discoverPage(doc, args.frameUrl, args.observed);
    }, { moduleUrl, html, frameUrl, observed });
    const pageHtml = await readFile('test/fixtures/discovery-page.html', 'utf8');
    const pageResult = await discover(pageHtml, 'https://vimeo.com/910001/owned?source=%2f+%20');
    assert.equal(pageResult.videos[0].title, 'Owned {river} "study" \\ end');
    assert.equal(pageResult.videos[0].manifests[0].url, 'https://fixture.vimeocdn.com/master.m3u8?sig=dummy%2f&x=&x=2');
    assert.deepEqual(pageResult.configUrls, [
      'https://player.vimeo.com/video/910001/config?h=owned&sig=dummy%2f&x=&x=2',
      'https://player.vimeo.com/video/910001/config?source=%2f+%20&h=owned',
      'https://player.vimeo.com/video/910001/config?h=owned&quality=auto',
    ]);
    const player = await discover(await readFile('test/fixtures/discovery-player.html', 'utf8'),
      'https://player.vimeo.com/video/910002?h=unlisted');
    assert.deepEqual(player.videos.map(video => video.status), ['unavailable', 'found']);
    assert.equal(player.videos[1].title, 'Later } \\" { title');
    assert.deepEqual(player.configUrls, ['https://player.vimeo.com/video/910002/config?h=explicit&sig=%2f+%20',
      'https://player.vimeo.com/video/910002/config?h=unlisted']);
    const late = await page.evaluate(async moduleUrl => {
      const { discoverPage } = await import(moduleUrl);
      const doc = globalThis.document;
      const before = discoverPage(doc, 'https://unrelated.example/');
      const script = doc.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify({ video: { id: '910099', title: 'Inserted' }, request: {
        files: { hls: { cdns: { late: { url: 'https://fixture.vimeocdn.com/late.m3u8' } } } },
      } });
      doc.body.append(script, script.cloneNode(true));
      const frame = doc.createElement('iframe');
      frame.src = 'https://player.vimeo.com/video/910099?h=late';
      doc.body.append(frame);
      const observed = ['https://player.vimeo.com/video/910099/config?sig=a',
        'https://player.vimeo.com/video/910099/config?sig=b'];
      const hostile = ['https://player.vimeo.com.evil.example/video/1/config', 'javascript:alert(1)',
        'https://user@player.vimeo.com/video/1/config', 'http://player.vimeo.com/video/1/config',
        'https://player.vimeo.com:444/video/1/config', 'https://vimeo.com/video/1/config',
        'https://player.vimeo.com/video/1/config/extra', 'https://player.vimeo.com/other'];
      return { before, after: discoverPage(doc, 'https://unrelated.example/', [...observed, ...observed, ...hostile]) };
    }, moduleUrl);
    assert.deepEqual(late.before, { videos: [], configUrls: [] });
    assert.equal(late.after.videos.length, 1);
    assert.equal(late.after.videos[0].title, 'Inserted');
    assert.equal(late.after.videos[0].status, 'found');
    assert.deepEqual(late.after.configUrls, ['https://player.vimeo.com/video/910099/config?sig=a',
      'https://player.vimeo.com/video/910099/config?sig=b', 'https://player.vimeo.com/video/910099/config?h=late']);
    assert.equal(await page.evaluate(() => globalThis.discoveryPageExecuted), undefined);
    if (proof) {
      await writeFile(resolve(proof, 'results.json'), JSON.stringify({ pageResult, player, late }, null, 2));
      await page.evaluate(results => {
        const pre = globalThis.document.createElement('pre');
        pre.textContent = JSON.stringify(results, null, 2);
        globalThis.document.body.replaceChildren(pre);
      }, { pageResult, player, late });
      await page.screenshot({ path: resolve(proof, 'dom.png'), fullPage: true });
      await context.tracing.stop({ path: resolve(proof, 'trace.zip') });
    }
  } finally { await browser.close(); }
});
