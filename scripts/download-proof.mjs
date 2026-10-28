import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Buffer } from 'node:buffer';

export async function downloadProof({ context, active, bootstrap, open, evaluate, waitText, key, artifacts }) {
  const directory = resolve(artifacts, 'native-downloads');
  await mkdir(directory, { recursive: true });
  const cdp = await context.newCDPSession(bootstrap);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
  const media = {};
  for (const kind of ['video', 'audio']) {
    const path = resolve(artifacts, `owned-${kind}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      kind === 'video' ? 'color=c=blue:s=64x64:r=2:d=1' : 'sine=frequency=440:duration=1',
      ...(kind === 'video' ? ['-c:v', 'libx264', '-an'] : ['-c:a', 'aac', '-vn']),
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', path]);
    const bytes = await readFile(path);
    let split = 0;
    while (split < bytes.length && bytes.toString('ascii', split + 4, split + 8) !== 'moof') split += bytes.readUInt32BE(split);
    assert.ok(split > 0 && split < bytes.length);
    media[kind] = { bytes, init: bytes.subarray(0, split), segment: bytes.subarray(split) };
  }
  let mode = 'pair';
  let release;
  let requested;
  let held;
  let heldStarted;
  const requests = [];
  const base = 'https://owned.vimeocdn.com/download/';
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="Default",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="other",NAME="Unrelated",URI="unrelated.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=64x64,CODECS="avc1.42c00a,mp4a.40.2",AUDIO="sound"\nvideo.m3u8\n';
  const config = { video: { id: 91, title: 'Owned download proof' }, request: { files: {
    hls: { cdns: { owned: { url: `${base}master.m3u8` } } },
    dash: { cdns: { protected: { url: `${base}protected.mpd` } } },
  } } };
  const route = async route => {
    const url = route.request().url();
    if (url === 'https://player.vimeo.com/video/91') return route.fulfill({ contentType: 'text/html', body: `<script type="application/json">${JSON.stringify(config)}</script>` });
    if (url === 'https://player.vimeo.com/video/91/config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) });
    if (!url.startsWith(base)) return route.fallback();
    const name = url.slice(base.length);
    requests.push(name);
    if (name === 'protected.mpd') return route.fulfill({ body: '<MPD><ContentProtection schemeIdUri="owned"/></MPD>', contentType: 'application/dash+xml' });
    if (name === 'master.m3u8') return route.fulfill({ body: mode === 'missing' ? master.replace(',URI="audio.m3u8"', '') : master, contentType: 'application/vnd.apple.mpegurl' });
    const kind = name.startsWith('audio') ? 'audio' : 'video';
    if (name === 'video.m3u8' || name === 'audio.m3u8') {
      const playlist = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:2\n${mode === 'encrypted' ? '#EXT-X-KEY:METHOD=AES-128,URI="forbidden.key"\n' : ''}#EXT-X-MAP:URI="${kind}-init.mp4"\n#EXTINF:1,\n${kind}-segment.m4s\n#EXT-X-ENDLIST\n`;
      return route.fulfill({ body: playlist, contentType: 'application/vnd.apple.mpegurl' });
    }
    if (name === 'audio-segment.m4s' && ['partial', 'cancel', 'revoke', 'invalidate'].includes(mode)) {
      requested(); await held;
      if (mode === 'partial') return route.abort('failed');
    }
    if (/^(video|audio)-(init\.mp4|segment\.m4s)$/.test(name)) return route.fulfill({
      body: name.includes('init') ? media[kind].init : media[kind].segment, contentType: `${kind}/mp4` });
    throw new Error(`Unowned download request: ${url}`);
  };
  await context.route('**/*', route);
  const native = () => bootstrap.evaluate(() => chrome.downloads.search({}));
  async function prepare(next) {
    mode = next;
    heldStarted = new Promise(resolve => { requested = resolve; });
    held = new Promise(resolve => { release = resolve; });
    await active.goto('https://player.vimeo.com/video/91');
    await open();
    await waitText('Owned download proof');
    if (!await evaluate("chrome.permissions.contains({origins:['https://owned.vimeocdn.com/*']})")) {
      await evaluate("document.querySelector('.permission button').focus(); true"); key('Return');
      await delay(700);
      if (!await bootstrap.evaluate(() => chrome.permissions.contains({ origins: ['https://owned.vimeocdn.com/*'] }))) {
        key('Tab'); key('Return');
      }
      await open();
    }
    await waitText(next === 'missing' ? 'Combined video and audio' : 'Download 64p');
    assert.equal(context.pages().filter(page => page.url().includes('/download.html')).length, 0, 'preparation must not start downloads');
  }
  async function start(label) {
    const page = context.waitForEvent('page', { predicate: page => page.url().includes('/download.html') });
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}); b.scrollIntoView(); b.focus(); return true; })()`);
    key('Return');
    const owner = await page;
    await owner.waitForLoadState();
    return owner;
  }
  async function finish(owner, text, name) {
    await owner.getByText(text, { exact: true }).waitFor({ timeout: 20000 });
    await owner.waitForFunction(() => document.querySelector('#cancel').disabled);
    await owner.screenshot({ path: resolve(artifacts, `download-${name}.png`) });
    const rows = await owner.locator('#outcomes li').evaluateAll(rows => rows.map(row => ({ text: row.textContent, state: row.dataset.state, path: row.dataset.path })));
    assert.equal(await owner.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.getDirectoryHandle('vimeo-download'); return false; } catch { return true; }
    }), true, 'owned temporary files removed');
    await owner.close();
    return rows;
  }
  const report = {};
  try {
    await prepare('pair');
    await waitText('Protected content.');
    let before = (await native()).length;
    let owner = await start('Download 64p');
    // Opening the owner closes the actual action popup. It must not own the bytes.
    report.pair = await finish(owner, 'Both files completed.', 'pair');
    await writeFile(resolve(artifacts, 'native-items.json'), JSON.stringify(await native(), null, 2));
    assert.equal((await native()).length - before, 2);
    for (const [index, kind] of ['video', 'audio'].entries()) {
      assert.equal(report.pair[index].state, 'complete');
      assert.ok(report.pair[index].path.startsWith(directory + '/'));
      assert.deepEqual(await readFile(report.pair[index].path), media[kind].bytes);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', report.pair[index].path, '-f', 'null', '-']);
    }
    assert.notEqual(report.pair[0].path, report.pair[1].path);
    await prepare('audio'); before = (await native()).length;
    owner = await start('Audio only');
    report.audio = await finish(owner, 'Audio file completed.', 'audio');
    assert.equal((await native()).length - before, 1);
    assert.deepEqual(await readFile(report.audio[0].path), media.audio.bytes);
    for (const scenario of ['partial', 'cancel', 'revoke', 'invalidate']) {
      await prepare(scenario); before = (await native()).length;
      owner = await start('Download 64p');
      await heldStarted;
      assert.equal(await owner.locator('#outcomes li[data-state="complete"]').count(), 1);
      assert.match(await owner.locator('#status').innerText(), /in progress/);
      await owner.screenshot({ path: resolve(artifacts, `download-${scenario}-running.png`) });
      if (scenario === 'cancel') await owner.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (scenario === 'revoke') await bootstrap.evaluate(() => chrome.permissions.remove({ origins: ['https://owned.vimeocdn.com/*'] }));
      if (scenario === 'invalidate') await active.goto('https://example.com/empty');
      release();
      report[scenario] = await finish(owner, 'Partial failure. The completed file is kept; the companion failed.', scenario);
      assert.equal((await native()).length - before, 1);
      assert.deepEqual(report[scenario].map(row => row.state), ['complete', 'failed']);
      assert.deepEqual(await readFile(report[scenario][0].path), media.video.bytes);
    }
    await prepare('encrypted'); before = (await native()).length;
    owner = await start('Download 64p');
    report.encrypted = await finish(owner, 'Download failed. No paired success.', 'encrypted');
    assert.equal((await native()).length, before);
    await prepare('missing');
    assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.startsWith('Download ')).length"), 0);
    report.missingSeparateAudio = true;
    assert.equal(requests.some(name => /unrelated|forbidden|license/.test(name)), false);
    report.requests = requests;
    await writeFile(resolve(artifacts, 'download-proof.json'), JSON.stringify(report, null, 2));
    return report;
  } finally { release?.(); await context.unroute('**/*', route); await cdp.detach(); }
}
