import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { segmentRequests } from './segment-requests.mjs';
import { requestLifetimeProof } from './request-lifetime-proof.mjs';
import { filenameStem, trackFilename } from '../src/download/filename.ts';
import { access } from 'node:fs/promises';

export async function downloadProof({ context, active, bootstrap, open, evaluate, waitText, capture, key, artifacts }) {
  const directory = resolve(artifacts, 'native-downloads');
  await mkdir(directory, { recursive: true });
  await requestLifetimeProof(context, artifacts);
  const cdp = await context.newCDPSession(bootstrap);
  const automatic = () => cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
  await automatic();
  const media = {};
  for (const kind of ['video', 'audio']) {
    const path = resolve(artifacts, `owned-${kind}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      kind === 'video' ? 'testsrc2=s=1920x1080:r=10:d=6' : 'sine=frequency=440:duration=6',
      ...(kind === 'video' ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '24M', '-minrate', '24M', '-maxrate', '24M', '-bufsize', '24M', '-x264-params', 'nal-hrd=cbr:filler=1', '-g', '10', '-an'] : ['-c:a', 'aac', '-vn']),
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', path]);
    const bytes = await readFile(path);
    const offsets = [];
    for (let offset = 0; offset < bytes.length; offset += bytes.readUInt32BE(offset)) {
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'moof') offsets.push(offset);
    }
    assert.ok(offsets.length >= 6);
    const segments = offsets.map((offset, index) => bytes.subarray(offset, offsets[index + 1] ?? bytes.length));
    media[kind] = { bytes, init: bytes.subarray(0, offsets[0]), segments };
    if (kind === 'video') assert.ok(segments.some(segment => segment.length > 2 * 1024 ** 2), 'real multi-MiB segment');
  }
  const combinedPath = resolve(artifacts, 'owned-combined.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-stream_loop', '3', '-i', resolve(artifacts, 'owned-video.mp4'),
    '-stream_loop', '3', '-i', resolve(artifacts, 'owned-audio.mp4'), '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', combinedPath]);
  const combined = await readFile(combinedPath);
  assert.ok(combined.length > 64 * 1024 ** 2, 'whole MP4 exceeds the segment cap');
  let mode = 'pair';
  let release;
  let requested;
  let held;
  let heldStarted;
  const requests = [];
  let recoveryHold;
  let recoveryFault;
  const segments = segmentRequests(context, request => /^https:\/\/owned\.vimeocdn\.com\/download\/(?:video|audio)-\d+\.m4s$/.test(request.url()));
  let attempts = new Map();
  let completionOrder = [];
  const retryTimes = [];
  const base = 'https://owned.vimeocdn.com/download/';
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS="wvtt"\n/drm/subtitle.vtt\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="/drm/subtitle.vtt"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="Default",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="other",NAME="Unrelated",URI="unrelated.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=24000000,RESOLUTION=1920x1080,CODECS="avc1.42c00a,mp4a.40.2",AUDIO="sound"\nvideo.m3u8\n';
  const hostileTitle = "Owned ' $(touch PWNED) ; `touch PWNED` /\\:*?\"<>|\n proof";
  const config = { video: { id: 91, title: hostileTitle }, request: { drm: { widevine: true }, files: {
    hls: { cdns: { owned: { url: `${base}master.m3u8` } } },
    dash: { cdns: { protected: { url: `${base}protected.mpd` } } },
    hls_cenc: { cdns: { owned: { url: `${base}unrelated-drm.m3u8` } } },
  } } };
  const dashConfig = { ...config, request: { files: { dash: { cdns: { owned: { url: `${base}clear.json` } } } } } };
  const progressive = { mime: 'video/mp4', height: 1080, width: 1920, size: combined.length,
    url: `${base}combined.mp4?sig=owned%2f+&x=&x=2` };
  const route = async route => {
    const url = route.request().url();
    const selectedConfig = mode.startsWith('progressive') ? { ...config, request: { files: {
      ...(mode === 'progressive-mixed' ? config.request.files : {}),
      progressive: [null, { ...progressive, url: 'https://unrelated.invalid/forbidden.mp4' },
        { ...progressive, encrypted: true, url: `${base}protected.mp4` },
        { ...progressive, ...(mode === 'progressive-limit' ? { size: 4 * 1024 ** 3 + 1 } : {}) },
        { ...progressive, height: 720, size: undefined,
          url: 'https://vod-progressive.akamaized.net/owned/unknown.mp4' }],
    } } } : mode === 'dash' ? dashConfig : mode === 'drm-config' ?
      { ...config, request: { ...config.request, drm: { hls: { fairplay: true } } } } : mode === 'drm-master' ?
        { ...config, request: { ...config.request, files: { hls: { cdns: { owned: { url: `${base}drm/cbcs,master.m3u8` } } } } } } : config;
    if (url === 'https://player.vimeo.com/video/91') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script type="application/json">${JSON.stringify(selectedConfig)}</script>` });
    if (url === 'https://player.vimeo.com/video/91/config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(selectedConfig) });
    if (url === 'https://vod-progressive.akamaized.net/owned/unknown.mp4') {
      requests.push('unknown.mp4');
      return route.fulfill({ contentType: 'video/mp4', body: combined });
    }
    if (!url.startsWith(base)) return route.fallback();
    const name = url.slice(base.length);
    requests.push(name);
    if (name === 'combined.mp4?sig=owned%2f+&x=&x=2' || name === 'unknown.mp4') {
      if (mode === 'progressive-redirect') return route.fulfill({ status: 302,
        headers: { location: 'https://unrelated.invalid/forbidden.mp4' } });
      return route.fulfill({ contentType: 'video/mp4', body: combined });
    }
    if (name === 'clear.json?base64_init=1') return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify(Object.fromEntries(['video', 'audio'].map(kind => [kind, [{
        id: kind, height: kind === 'video' ? 1080 : undefined, codecs: kind === 'video' ? 'avc1.42c00a' : 'mp4a.40.2',
        mime_type: `${kind}/mp4`, init_segment: kind === 'video' ? media[kind].init.toString('base64') : `${base}audio-init.mp4`,
        segments: media[kind].segments.map((_, index) => ({ url: `${base}${kind}-${index}.m4s` })),
      }]]))) });
    const part = /^(video|audio)-(\d+)\.m4s$/.exec(name);
    if (part) {
      const attempt = (attempts.get(name) ?? 0) + 1;
      attempts.set(name, attempt);
      if (recoveryHold === part[1] && part[2] === '0') {
        requested(); await held;
        if (recoveryFault === 'network') return route.abort('internetdisconnected');
        if (recoveryFault === 'http') return route.fulfill({ status: 403, body: 'owned failure' });
      }
      if (mode === 'retry' && name === 'video-0.m4s') {
        retryTimes.push(Date.now());
        if (attempt <= 3) return await route.fulfill({ status: 503, body: 'temporary' });
      }
      if (name === 'audio-0.m4s' && (mode === 'lifetime' || ['partial', 'cancel', 'timeout'].includes(mode))) {
        requested(); await held;
        if (mode === 'partial') return await route.fulfill({ status: 503, body: 'temporary' });
      }
      await delay(100 * (5 - Number(part[2]) % 5));
      completionOrder.push(name);
      return await route.fulfill({ body: media[part[1]].segments[Number(part[2])] });
    }
    if (name === 'protected.mpd') return route.fulfill({ body: '<MPD><ContentProtection schemeIdUri="owned"/></MPD>', contentType: 'application/dash+xml' });
    if (name === 'master.m3u8') return route.fulfill({ body: mode === 'missing' ? master.replace(',URI="audio.m3u8"', '') :
      mode === 'drm-audio' ? master.replace('URI="audio.m3u8"', 'URI="drm/cbcs,audio.m3u8"') :
      mode === 'drm-session' ? `${master}#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="skd://drm",KEYFORMAT="com.apple.streamingkeydelivery"\n` : master,
      contentType: 'application/vnd.apple.mpegurl' });
    const kind = name.startsWith('audio') ? 'audio' : 'video';
    if (mode === 'redirect' && name.endsWith('-init.mp4')) return route.fulfill({ status: 302, headers: { location: 'https://unrelated.invalid/forbidden' } });
    if (name === 'video.m3u8' || name === 'audio.m3u8') {
      const encryption = mode === 'encrypted' ? '#EXT-X-KEY:METHOD=AES-128,URI="forbidden.key"\n' :
        mode === 'drm-child' ? '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm",KEYFORMAT="com.apple.streamingkeydelivery"\n' : '';
      const playlist = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:2\n${encryption}#EXT-X-MAP:URI="${mode === 'origin' ? 'https://unrelated.invalid/forbidden' : `${kind}-init.mp4`}"\n${media[kind].segments.map((_, index) => `#EXTINF:1,\n${kind}-${index}.m4s\n`).join('')}#EXT-X-ENDLIST\n`;
      return route.fulfill({ body: playlist, contentType: 'application/vnd.apple.mpegurl' });
    }
    if (/^(video|audio)-init\.mp4$/.test(name)) return route.fulfill({ body: media[kind].init, contentType: `${kind}/mp4` });
    throw new Error(`Unowned download request: ${url}`);
  };
  await context.route('**/*', route);
  const native = () => bootstrap.evaluate(() => globalThis.chrome.downloads.search({}));
  // Xvfb has no window manager to focus GTK dialogs; click their actual Save button.
  function acceptNativeSave(cancel = false) {
    return JSON.parse(execFileSync('python3', ['-c', `import ctypes,json
x=ctypes.CDLL('libX11.so.6'); t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p; d=x.XOpenDisplay(None)
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p]; x.XDefaultRootWindow.restype=ctypes.c_ulong
r=ctypes.c_ulong(); p=ctypes.c_ulong(); windows=ctypes.POINTER(ctypes.c_ulong)(); n=ctypes.c_uint()
x.XQueryTree.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)),ctypes.POINTER(ctypes.c_uint)]
x.XQueryTree(d,x.XDefaultRootWindow(d),ctypes.byref(r),ctypes.byref(p),ctypes.byref(windows),ctypes.byref(n))
x.XFetchName.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_char_p)]
for window in windows[:n.value]:
 name=ctypes.c_char_p(); x.XFetchName(d,window,ctypes.byref(name))
 if name.value != b'Save File': continue
 gx=ctypes.c_int(); gy=ctypes.c_int(); w=ctypes.c_uint(); h=ctypes.c_uint(); b=ctypes.c_uint(); depth=ctypes.c_uint()
 x.XGetGeometry.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.c_uint)]
 x.XGetGeometry(d,window,ctypes.byref(r),ctypes.byref(gx),ctypes.byref(gy),ctypes.byref(w),ctypes.byref(h),ctypes.byref(b),ctypes.byref(depth))
 t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
 t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
 t.XTestFakeMotionEvent(d,-1,gx.value+w.value-${cancel ? 140 : 50},gy.value+h.value-23,0)
 t.XTestFakeButtonEvent(d,1,1,0); t.XTestFakeButtonEvent(d,1,0,0)
 x.XFlush.argtypes=[ctypes.c_void_p]; x.XFlush(d)
 print(json.dumps({'title':name.value.decode(),'width':w.value,'height':h.value}))
 break
else: ${cancel ? "print('null')" : "raise RuntimeError('Native Save File dialog not found')"}
`], { encoding: 'utf8' }));
  }
  async function prepare(next) {
    mode = next;
    config.video.title = next === 'empty' ? '' : next === 'long' ? '界'.repeat(300) :
      next === 'dash' ? `${hostileTitle} - video 1080p (1)` : next === 'retry' || next.startsWith('recovery-') ? `${hostileTitle} ${next}` : hostileTitle;
    segments.reset(); attempts = new Map(); completionOrder = [];
    heldStarted = new Promise(resolve => { requested = resolve; });
    held = new Promise(resolve => { release = resolve; });
    await active.goto('https://player.vimeo.com/video/91');
    await open(active);
    await waitText(next === 'empty' ? 'Vimeo video 91' : next === 'long' ? '界' : "Owned '");
    if (next === 'missing') await evaluate(`(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      const deadline = Date.now()+8000;
      while (Date.now()<deadline) {
        const state = await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id});
        if (!state.frames.some(frame=>frame.status==='pending') &&
          state.results.some(candidate=>candidate.videoId==='91' && candidate.tracks.some(track=>track.kind==='combined'))) return true;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw new Error('Missing-URI audio did not resolve');
    })()`);
    if (next !== 'missing') await waitText(next.startsWith('drm-') && next !== 'drm-child'
      ? 'Protected (DRM)' : 'Download 1080p');
    assert.equal(context.pages().filter(page => page.url().includes('/download.html')).length, 0, 'preparation must not start downloads');
  }
  async function start(label) {
    const page = context.waitForEvent('page', { predicate: page => page.url().includes('/download.html') });
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}); b.scrollIntoView(); b.focus(); return true; })()`);
    key('Return');
    const owner = await page;
    await owner.waitForLoadState();
    assert.equal(await bootstrap.evaluate(() => globalThis.chrome.extension.getViews({ type: 'popup' }).length), 0);
    return owner;
  }
  async function finish(owner, text, name, close = true) {
    try { await owner.getByText(text, { exact: true }).waitFor({ timeout: 40000 }); }
    catch (error) {
      await owner.screenshot({ path: resolve(artifacts, `download-${name}-failure.png`) });
      await writeFile(resolve(artifacts, `download-${name}-failure.txt`), await owner.locator('body').innerText());
      throw error;
    }
    await owner.waitForFunction(() => globalThis.document.querySelector('#cancel').disabled);
    const ready = text === 'Both files completed.';
    assert.equal(await owner.locator('#merge-command').count(), ready ? 1 : 0);
    assert.equal(await owner.getByRole('button', { name: 'Copy command', exact: true }).count(), ready ? 1 : 0);
    if (ready) {
      const command = await owner.locator('#merge-command').innerText();
      const paths = await owner.locator('#outcomes li').evaluateAll(rows => rows.map(row => row.dataset.path));
      await owner.bringToFront();
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await owner.getByRole('button', { name: 'Copy command', exact: true }).click();
      await owner.getByText('Command copied.', { exact: true }).waitFor();
      assert.equal(await owner.evaluate(() => globalThis.navigator.clipboard.readText()), command);
      await writeFile(resolve(artifacts, `merge-${name}.sh`), command + '\n');
      const before = await Promise.all(paths.map(path => readFile(path)));
      const merged = spawnSync('bash', ['-c', command], { cwd: artifacts, encoding: 'utf8' });
      assert.equal(merged.status, 0, merged.stderr);
      const log = merged.stderr;
      assert.match(log, /Stream #0:0 -> #0:0 \(copy\)/);
      assert.match(log, /Stream #1:0 -> #0:1 \(copy\)/);
      for (const [index, path] of paths.entries()) assert.deepEqual(await readFile(path), before[index], 'merge preserves source');
      await assert.rejects(access(resolve(artifacts, 'PWNED')), { code: 'ENOENT' });
      const output = resolve(directory, `${filenameStem(config.video.title, '91')}.mp4`);
      execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
      const outputBytes = await readFile(output);
      const existing = 'Owned existing output: must not be replaced';
      await writeFile(output, existing);
      const repeated = spawnSync('bash', ['-c', command], { cwd: artifacts, encoding: 'utf8' });
      assert.match(repeated.stderr, /already exists|Not overwriting/);
      assert.equal(await readFile(output, 'utf8'), existing, 'existing output bytes are not overwritten');
      await writeFile(output, outputBytes);
      await writeFile(resolve(artifacts, `merge-${name}.json`), JSON.stringify({ command, clipboard: command, paths, output, existingOutputRefused: true, refusal: repeated.stderr, sourcesUnchanged: true, noInjectedCommand: true, log }, null, 2));
      await owner.screenshot({ path: resolve(artifacts, `merge-${name}-copied.png`) });
      if (name === 'pair') {
        const copied = await owner.evaluate(() => globalThis.navigator.clipboard.readText());
        for (const value of [null, 'true', false]) {
          await bootstrap.evaluate(async value => {
            if (value === null) await globalThis.chrome.storage.local.remove('rightsAcknowledged');
            else await globalThis.chrome.storage.local.set({ rightsAcknowledged: value });
          }, value);
          // Dispatch bypasses disabled-button activation; the Copy boundary must still refuse.
          await owner.getByRole('button', { name: 'Copy command', exact: true }).dispatchEvent('click');
          await owner.getByText('Rights acknowledgement required. Reopen the popup to acknowledge.', { exact: true }).waitFor();
          assert.equal(await owner.evaluate(() => globalThis.navigator.clipboard.readText()), copied);
        }
        await bootstrap.evaluate(() => globalThis.chrome.storage.local.set({ rightsAcknowledged: true }));
        await owner.evaluate(() => {
          globalThis.originalRightsGet = globalThis.chrome.storage.local.get;
          globalThis.chrome.storage.local.get = async () => { throw new Error('owned unreadable storage'); };
        });
        await owner.getByRole('button', { name: 'Copy command', exact: true }).dispatchEvent('click');
        await owner.getByText('Rights acknowledgement required. Reopen the popup to acknowledge.', { exact: true }).waitFor();
        assert.equal(await owner.evaluate(() => globalThis.navigator.clipboard.readText()), copied);
        await owner.evaluate(() => { globalThis.chrome.storage.local.get = globalThis.originalRightsGet; });
        await owner.screenshot({ path: resolve(artifacts, 'rights-open-page-copy-blocked.png') });
        report.rightsCopy = { missingInvalidFalseUnreadableRefused: true, clipboardUnchanged: true };
        await open(active);
        await bootstrap.evaluate(() => globalThis.chrome.storage.local.remove('rightsAcknowledged'));
        await acknowledge();
        await owner.bringToFront();
        await owner.getByRole('button', { name: 'Copy command', exact: true }).click();
        await owner.getByText('Command copied.', { exact: true }).waitFor();
      }
      await owner.evaluate(() => { globalThis.navigator.clipboard.writeText = async () => { throw new Error('owned clipboard failure'); }; });
      await owner.getByRole('button', { name: 'Copy command', exact: true }).click();
      await owner.getByText('Copy failed. Select and copy the command manually.', { exact: true }).waitFor();
      await owner.screenshot({ path: resolve(artifacts, `merge-${name}-copy-failed.png`) });
    }
    segments.check();
    await owner.screenshot({ path: resolve(artifacts, `download-${name}.png`) });
    const rows = await owner.locator('#outcomes li').evaluateAll(rows => rows.map(row => ({ text: row.textContent, state: row.dataset.state, path: row.dataset.path })));
    assert.equal(await owner.evaluate(async () => {
      const root = await globalThis.navigator.storage.getDirectory();
      try { await root.getDirectoryHandle('vimeo-download'); return false; }
      catch (error) { if (error.name === 'NotFoundError') return true; throw error; }
    }), true, 'owned temporary files removed');
    if (close) await owner.close();
    return rows;
  }
  const report = {};
  async function acknowledge() {
    await evaluate("document.querySelector('#acknowledge').focus(); true");
    key('Return');
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => [...document.querySelectorAll('button')].some(b => b.textContent === 'Download 1080p' && !b.disabled)
        ? resolve(true) : Date.now() > deadline ? reject(new Error('Acknowledgement did not enable downloads')) : setTimeout(check, 50);
      check();
    })`);
  }
  async function refusalProof() {
    await prepare('pair');
    const nativeBefore = (await native()).length;
    const requestBefore = requests.length;
    const worker = context.serviceWorkers()[0];
    const outcomes = [];
    for (const value of [null, false, 'true', 1, {}]) {
      await bootstrap.evaluate(async value => {
        if (value === null) await globalThis.chrome.storage.local.remove('rightsAcknowledged');
        else await globalThis.chrome.storage.local.set({ rightsAcknowledged: value });
      }, value);
      await open(active);
      await waitText('1 video detected.');
      const result = await evaluate(`(async () => {
        const list = document.querySelector('#streams');
        const buttons = [...list.querySelectorAll('button')];
        const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
        const state = await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id});
        const candidate = state.results.find(c => c.videoId === '91' && c.tracks.some(t => t.kind === 'video'));
        const replies = [];
        for (const track of candidate.tracks) replies.push(await chrome.runtime.sendMessage({
          type:'download-start',tabId:tab.id,candidateId:candidate.id,trackId:track.id,rightsAcknowledged:true
        }));
        return {hidden: list.hidden, cards: list.querySelectorAll('article').length, actions: buttons.length,
          count: document.querySelector('#status').textContent, replies};
      })()`);
      assert.equal(result.hidden, true);
      assert.equal(result.cards, 0);
      assert.equal(result.actions, 0);
      assert.match(result.count, /^1 video detected\./);
      assert.ok(result.replies.length > 0 && result.replies.every(value => value === false));
      assert.equal(context.pages().filter(page => page.url().includes('/download.html')).length, 0);
      outcomes.push({ value, ...result });
    }
    await capture('rights-actions-blocked');
    // A pending or failed read must not expose actions, even with valid stored consent.
    await worker.evaluate(() => {
      globalThis.originalRightsGet = globalThis.chrome.storage.local.get;
      globalThis.chrome.storage.local.get = async () => { throw new Error('owned unreadable storage'); };
    });
    await evaluate(`(() => {
      globalThis.originalRightsGet = chrome.storage.local.get;
      chrome.storage.local.get = () => new Promise(() => {});
      return chrome.storage.local.set({rightsAcknowledged:true});
    })()`);
    await evaluate(`new Promise(resolve => setTimeout(resolve,100))`);
    assert.deepEqual(await evaluate("({hidden: document.querySelector('#streams').hidden, cards: document.querySelectorAll('#streams article').length})"), {hidden: true, cards: 0});
    const unreadableReply = await evaluate(`(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      const state = await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id});
      const candidate = state.results.find(c => c.videoId === '91' && c.tracks.some(t => t.kind === 'video'));
      return chrome.runtime.sendMessage({type:'download-start',tabId:tab.id,candidateId:candidate.id,
        trackId:candidate.tracks.find(t=>t.kind==='video').id,rightsAcknowledged:true});
    })()`);
    assert.equal(unreadableReply, false);
    await evaluate("chrome.storage.local.get = async () => { throw new Error('owned unreadable storage'); }; chrome.storage.local.set({rightsAcknowledged:false})");
    await evaluate(`new Promise(resolve => setTimeout(resolve,100))`);
    assert.deepEqual(await evaluate("({hidden: document.querySelector('#streams').hidden, cards: document.querySelectorAll('#streams article').length})"), {hidden: true, cards: 0});
    await evaluate("chrome.storage.local.get = globalThis.originalRightsGet; true");
    await worker.evaluate(() => { globalThis.chrome.storage.local.get = globalThis.originalRightsGet; });
    await acknowledge();
    await capture('rights-actions-revealed');
    // Pause the first page storage read, then revoke the genuinely minted token's consent.
    await bootstrap.evaluate(() => globalThis.localStorage.setItem('rights-proof-pause', 'yes'));
    await context.addInitScript(() => {
      if (globalThis.location.pathname !== '/download.html' || globalThis.localStorage.getItem('rights-proof-pause') !== 'yes') return;
      globalThis.localStorage.removeItem('rights-proof-pause');
      const get = globalThis.chrome.storage.local.get;
      const gate = new Promise(resolve => { globalThis.releaseRightsRead = resolve; });
      globalThis.chrome.storage.local.get = async (...args) => {
        await gate;
        return get(...args);
      };
    });
    const owner = await start('Download 1080p');
    await owner.waitForFunction(() => typeof globalThis.releaseRightsRead === 'function');
    // A genuine token is not bearer authority: another tab with the same URL
    // must fail even while consent is valid and its original owner is paused.
    const admittedToken = new URL(owner.url()).hash.slice(1);
    const replay = await context.newPage();
    await replay.goto(owner.url());
    await replay.getByText('Download unavailable:', { exact: false }).waitFor();
    assert.equal(await replay.evaluate(token => globalThis.chrome.runtime.sendMessage({
      type: 'download-source', token,
    }), admittedToken), null);
    await replay.close();
    const wrongSender = await bootstrap.evaluate(async token => {
      const tabId = (await globalThis.chrome.tabs.query({ active: true, currentWindow: true }))[0].id;
      const replies = [];
      for (const message of [
        { type: 'popup-state', tabId },
        { type: 'popup-refresh', tabId },
        { type: 'download-start', tabId, candidateId: 'forged', trackId: 'forged' },
        { type: 'download-source', token },
      ]) {
        try { replies.push((await globalThis.chrome.runtime.sendMessage(message)) ?? null); }
        catch { replies.push(null); }
      }
      return replies;
    }, admittedToken);
    assert.deepEqual(wrongSender, [null, null, null, null]);
    await open(active);
    const invalidCandidate = await evaluate(`(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      return chrome.runtime.sendMessage({type:'download-start',tabId:tab.id,
        candidateId:'stale-document-candidate',trackId:'forged'});
    })()`);
    assert.equal(invalidCandidate, false);
    assert.deepEqual(requests.slice(requestBefore), []);
    assert.equal((await native()).length, nativeBefore);
    assert.equal(context.pages().filter(page => page.url().includes('/download.html')).length, 1);
    report.authorityRefusal = { wrongSender, invalidCandidate, replayedOwnerToken: 'refused',
      requests: requests.slice(requestBefore), nativeSaves: (await native()).length - nativeBefore,
      ownerPages: 1 };
    await bootstrap.evaluate(() => globalThis.chrome.storage.local.remove('rightsAcknowledged'));
    await owner.evaluate(() => globalThis.releaseRightsRead());
    await owner.getByText('Download unavailable:', { exact: false }).waitFor();
    const token = new URL(owner.url()).hash.slice(1);
    assert.equal(await owner.evaluate(token => globalThis.chrome.runtime.sendMessage({ type: 'download-source', token, rightsAcknowledged: true }), token), null);
    // The worker still refuses if the page lies about its own storage read.
    await owner.addInitScript(() => { globalThis.chrome.storage.local.get = async () => ({ rightsAcknowledged: true }); });
    await owner.reload();
    await owner.getByText('Download unavailable:', { exact: false }).waitFor();
    await owner.screenshot({ path: resolve(artifacts, 'rights-direct-token-blocked.png') });
    await owner.close();
    assert.deepEqual(requests.slice(requestBefore), [], 'refused actions must not even fetch child playlists or init');
    assert.equal((await native()).length, nativeBefore, 'refused actions must create no native saves');
    report.rightsRefusal = { outcomes, pendingAndUnreadablePopup: true, unreadableWorkerRefused: true,
      genuineTokenRevokedBeforeEntry: true, workerRefusedPageAssertion: true,
      requests: requests.slice(requestBefore), nativeSaves: (await native()).length - nativeBefore };
    await open(active);
    await acknowledge();
  }
  try {
    {
      const lifetime = [];
      for (const action of ['Download 1080p', 'Audio only']) {
        await prepare('lifetime');
        const before = (await native()).length;
        const owner = await start(action);
        await heldStarted;
        const entry = { action, popupClosed: true, nativeBefore: before };
        const other = await context.newPage();
        await other.goto('https://example.com/empty');
        await other.bringToFront();
        entry.afterSwitch = await owner.locator('body').innerText();
        await open(active);
        await waitText('audio segments: 0/6');
        entry.reopened = await evaluate('document.body.innerText');
        await capture(`lifetime-${action === 'Audio only' ? 'audio' : 'pair'}-reopen`);
        await active.close();
        await delay(1500);
        await open(other);
        await waitText('audio segments: 0/6');
        entry.afterSourceClosedPopup = await evaluate('document.body.innerText');
        await capture(`lifetime-${action === 'Audio only' ? 'audio' : 'pair'}-source-closed`);
        release();
        await owner.waitForFunction(() => globalThis.document.querySelector('#cancel').disabled);
        entry.result = await owner.locator('body').innerText();
        await open(other);
        await waitText('audio segments: 6/6 — complete');
        entry.completedPopup = await evaluate('document.body.innerText');
        await capture(`lifetime-${action === 'Audio only' ? 'audio' : 'pair'}-completed-popup`);
        entry.rows = await owner.locator('#outcomes li').evaluateAll(rows => rows.map(row => ({ state: row.dataset.state, path: row.dataset.path })));
        entry.nativeAdded = (await native()).length - before;
        entry.exactBytes = await Promise.all(entry.rows.map(async (row, index) => row.path
          ? (await readFile(row.path)).equals(media[action === 'Audio only' || index === 1 ? 'audio' : 'video'].bytes) : false));
        assert.equal(entry.nativeAdded, action === 'Audio only' ? 1 : 2);
        assert.ok(entry.rows.every(row => row.state === 'complete'));
        assert.ok(entry.exactBytes.every(Boolean));
        await owner.screenshot({ path: resolve(artifacts, `lifetime-${action === 'Audio only' ? 'audio' : 'pair'}-result.png`) });
        lifetime.push(entry);
        await writeFile(resolve(artifacts, 'lifetime-proof.json'), JSON.stringify(lifetime, null, 2));
        await owner.close();
        active = other;
      }
      report.lifetime = lifetime;
      if (process.env.SMOKE_LIFETIME_ONLY) return report;
    }
    {
      const recovery = [];
      for (const stage of ['fetch', 'native', 'network', 'http', 'quota']) {
        for (const target of stage === 'fetch' || stage === 'native' ? ['video', 'audio', 'audio-only'] : ['audio']) {
          await prepare(`recovery-${stage}-${target}`);
          recoveryHold = stage === 'native' ? undefined : target === 'video' ? 'video' : 'audio';
          recoveryFault = stage === 'network' || stage === 'http' ? stage : undefined;
          const before = await native();
          if (stage === 'native') {
            const filenames = (target === 'audio-only' ? ['audio'] : ['video', 'audio'])
              .map(kind => trackFilename(filenameStem(config.video.title, '91'), kind, 1080));
            const targetIndex = target === 'audio' ? 1 : 0;
            await writeFile(resolve(directory, filenames[targetIndex]), 'owned filename collision for native prompt');
            await automatic();
            await bootstrap.evaluate(({ filenames, targetIndex }) => {
              let count = 0;
              globalThis.recoveryPending = undefined;
              globalThis.recoveryPrompt = (item, suggest) => {
                const index = count++;
                if (index === targetIndex) globalThis.recoveryPending = item.id;
                suggest({ filename: filenames[index], conflictAction: index === targetIndex ? 'prompt' : 'uniquify' });
              };
              globalThis.chrome.downloads.onDeterminingFilename.addListener(globalThis.recoveryPrompt);
            }, { filenames, targetIndex });
          }
          const owner = await start(target === 'audio-only' ? 'Audio only' : 'Download 1080p');
          const kind = target === 'video' ? 'video' : 'audio';
          const row = owner.locator('#outcomes li').filter({ has: owner.getByRole('progressbar', { name: `${kind} segments`, exact: true }) });
          if (stage === 'native') {
            await row.locator('[aria-label="Cancel ' + kind + '"]').waitFor();
            await owner.waitForFunction(kind => [...globalThis.document.querySelectorAll('#outcomes li')]
              .some(row => row.dataset.state === 'saving' && row.querySelector('progress').getAttribute('aria-label') === `${kind} segments`), kind);
            await bootstrap.evaluate(async () => {
              const deadline = Date.now() + 10000;
              while (Date.now() < deadline) {
                const items = await globalThis.chrome.downloads.search({});
                if (items.some(item => item.id === globalThis.recoveryPending && item.state === 'in_progress')) return;
                await new Promise(resolve => globalThis.setTimeout(resolve, 50));
              }
              throw new Error('Native recovery save did not become pending');
            });
            execFileSync('ffmpeg', ['-v', 'error', '-f', 'x11grab', '-i', process.env.DISPLAY,
              '-frames:v', '1', '-y', resolve(artifacts, `recovery-native-${target}-pending.png`)]);
          } else await heldStarted;
          if (stage === 'quota') {
            await owner.evaluate(() => {
              const write = globalThis.FileSystemWritableFileStream.prototype.write;
              globalThis.FileSystemWritableFileStream.prototype.write = function () {
                globalThis.FileSystemWritableFileStream.prototype.write = write;
                return Promise.reject(new globalThis.DOMException('owned quota injection', 'QuotaExceededError'));
              };
            });
          }
          if (stage === 'fetch') await row.getByRole('button', { name: `Cancel ${kind}`, exact: true }).click();
          // GTK is modal: activate the production owner handler in its DOM, not a Chrome API mock.
          if (stage === 'native') await row.getByRole('button', { name: `Cancel ${kind}`, exact: true }).evaluate(button => button.click());
          if (stage === 'native') acceptNativeSave(true); // Dismiss GTK if Chromium retained its cancelled dialog.
          release();
          const text = target === 'audio-only' ? 'Download failed. No files completed.' : 'Partial failure. The completed file is kept; the companion failed.';
          const failed = await finish(owner, text, `recovery-${stage}-${target}-stopped`, false);
          const expectedReason = { fetch: 'Cancelled', native: 'Cancelled', network: 'Media network lost', http: 'Media HTTP 403', quota: 'temporary storage quota exceeded' }[stage];
          assert.ok(failed.some(row => row.text.includes(expectedReason)), expectedReason);
          assert.equal(await owner.locator('#merge-command').count(), 0);
          if (stage === 'native') await bootstrap.evaluate(() => globalThis.chrome.downloads.onDeterminingFilename.removeListener(globalThis.recoveryPrompt));
          const companion = failed.find(row => row.state === 'complete');
          const counts = new Map(attempts);
          if (stage === 'http') {
            const requestCount = requests.length;
            const nativeCount = (await native()).length;
            await bootstrap.evaluate(() => globalThis.chrome.storage.local.remove('rightsAcknowledged'));
            await row.getByRole('button', { name: `Retry ${kind}`, exact: true }).click();
            await owner.waitForFunction(() => globalThis.document.querySelector('#cancel').disabled);
            assert.equal(requests.length, requestCount, 'retry without consent fetches nothing');
            assert.equal((await native()).length, nativeCount, 'retry without consent saves nothing');
            assert.match(await row.innerText(), /Source rights acknowledgement required/);
            await bootstrap.evaluate(() => globalThis.chrome.storage.local.set({ rightsAcknowledged: true }));
          }
          if (stage === 'network') {
            await active.close();
            active = await context.newPage();
            await active.goto('https://example.com/empty');
            await open(active);
            await waitText('— failed');
            await capture('recovery-source-closed-failure');
          }
          recoveryHold = undefined; recoveryFault = undefined;
          await row.getByRole('button', { name: `Retry ${kind}`, exact: true }).click();
          // A synthetic second event challenges the disabled-button guard while the first attempt runs.
          await row.getByRole('button', { name: `Retry ${kind}`, exact: true }).dispatchEvent('click');
          const success = await finish(owner, target === 'audio-only' ? 'Audio file completed.' : 'Both files completed.', `recovery-${stage}-${target}-retried`, stage !== 'network');
          if (stage === 'network') {
            await open(active);
            await waitText('audio segments: 6/6 — complete');
            await capture('recovery-source-closed-retried');
            await owner.close();
          }
          const items = (await native()).filter(item => !before.some(old => old.id === item.id));
          assert.equal(items.filter(item => item.state === 'complete').length, target === 'audio-only' ? 1 : 2);
          assert.equal(items.length, (target === 'audio-only' ? 1 : 2) + (stage === 'native' ? 1 : 0));
          for (const saved of success) {
            const savedKind = saved.path.endsWith('.m4a') ? 'audio' : 'video';
            assert.deepEqual(await readFile(saved.path), media[savedKind].bytes, 'retry starts with exactly one initialization');
          }
          if (companion) {
            assert.equal(success.find(row => row.path === companion.path)?.state, 'complete');
            for (const [name, count] of counts) if (name.startsWith(kind === 'video' ? 'audio-' : 'video-')) assert.equal(attempts.get(name), count, 'completed companion never requested again');
          }
          recovery.push({ stage, target, faultInjection: stage === 'quota' ? 'one owned OPFS write rejects QuotaExceededError; not real quota exhaustion' :
            stage === 'network' || stage === 'http' ? 'owned Chromium route failure' : null, failed, success, native: items, exactBytes: true, companionPreserved: Boolean(companion) });
        }
      }
      report.recovery = recovery;
      await writeFile(resolve(artifacts, 'recovery-proof.json'), JSON.stringify(recovery, null, 2));
      if (process.env.SMOKE_RECOVERY_ONLY) return report;
    }
    await bootstrap.evaluate(async () => {
      const root = await globalThis.navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('vimeo-download', { create: true });
      const file = await directory.getFileHandle('orphan', { create: true });
      const writer = await file.createWritable(); await writer.write('owned orphan'); await writer.close();
    });
    await refusalProof();
    let before;
    let owner;
    for (const scenario of ['pair', 'dash', 'retry', 'empty', 'long']) {
      await prepare(scenario);
      if (scenario === 'dash') {
        for (const kind of ['video', 'audio']) {
          await writeFile(resolve(directory, trackFilename(filenameStem(config.video.title, '91'), kind, 1080)), 'owned collision');
        }
      }
      if (scenario === 'pair') {
        await capture('download-hls-ready');
        // Force actual Save As dialogs with owned collisions, without replacing APIs.
        const filenames = ['video', 'audio'].map(kind => trackFilename(filenameStem(config.video.title, '91'), kind, 1080));
        for (const filename of filenames) await writeFile(resolve(directory, filename), 'owned collision');
        await bootstrap.evaluate(filenames => {
          globalThis.pendingSaves = [];
          globalThis.promptSave = (item, suggest) => {
            const filename = filenames[globalThis.pendingSaves.length];
            globalThis.pendingSaves.push(item.id);
            suggest({ filename, conflictAction: 'prompt' });
          };
          globalThis.chrome.downloads.onDeterminingFilename.addListener(globalThis.promptSave);
        }, filenames);
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
      }
      before = (await native()).length;
      owner = await start('Download 1080p');
      if (scenario === 'pair') {
        report.pendingSave = [];
        for (const [index, kind] of ['video', 'audio'].entries()) {
          await bootstrap.waitForFunction(index => globalThis.pendingSaves.length > index, index);
          const id = await bootstrap.evaluate(index => globalThis.pendingSaves[index], index);
          const started = Date.now();
          await delay(32000);
          const [pending] = await bootstrap.evaluate(id => globalThis.chrome.downloads.search({ id }), id);
          assert.equal(pending.state, 'in_progress');
          assert.equal(await owner.locator('#cancel').isEnabled(), true);
          assert.equal(await owner.locator('#outcomes li[data-state="failed"]').count(), 0);
          assert.equal(await owner.locator('#outcomes li[data-state="complete"]').count(), index);
          assert.equal(await owner.locator('#merge-command').count(), 0);
          execFileSync('ffmpeg', ['-v', 'error', '-f', 'x11grab', '-i', process.env.DISPLAY,
            '-frames:v', '1', '-y', resolve(artifacts, `native-save-${kind}-pending.png`)]);
          report.pendingSave.push({ kind, pendingMs: Date.now() - started, pending, dialog: acceptNativeSave() });
          await owner.locator('#outcomes li[data-state="complete"]').nth(index).waitFor();
        }
        await bootstrap.evaluate(() => globalThis.chrome.downloads.onDeterminingFilename.removeListener(globalThis.promptSave));
        await automatic();
      }
      if (scenario === 'retry') {
        await owner.getByText(/Retry 1\/3/).waitFor();
        await owner.screenshot({ path: resolve(artifacts, 'download-retry-running.png') });
      }
      assert.match(owner.url(), /download\.html#[a-f0-9-]+$/);
      report[scenario] = await finish(owner, 'Both files completed.', scenario);
      report[scenario + 'NativeCount'] = (await native()).length - before;
      assert.equal(report[scenario + 'NativeCount'], 2);
      for (const [index, kind] of ['video', 'audio'].entries()) {
        const row = report[scenario][index];
        assert.equal(row.state, 'complete');
        assert.ok(row.path.startsWith(directory + '/'));
        const stem = filenameStem(config.video.title, '91');
        const requestedName = kind === 'video' ? `${stem} - video 1080p.mp4` : `${stem} - audio.m4a`;
        const savedName = row.path.split('/').at(-1);
        assert.equal(savedName.replace(/ \(\d+\)(\.[^.]+)$/, '$1'), requestedName);
        if (scenario === 'dash') assert.notEqual(savedName, requestedName, 'Chrome collision suffix retained');
        assert.deepEqual(await readFile(row.path), media[kind].bytes);
        if (scenario === 'pair') report.pendingSave[index].completedBytes = media[kind].bytes.length;
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', row.path, '-f', 'null', '-']);
        if (kind === 'video') {
          const frame = resolve(artifacts, `decoded-${scenario}.png`);
          execFileSync('ffmpeg', ['-v', 'error', '-i', row.path, '-frames:v', '1', '-y', frame]);
          const png = await readFile(frame);
          assert.equal(png.readUInt32BE(16), 1920); assert.equal(png.readUInt32BE(20), 1080);
          report[scenario][index].decoded = { width: 1920, height: 1080, frame };
        }
      }
      assert.notEqual(report[scenario][0].path, report[scenario][1].path);
      assert.equal(segments.peak, 5);
      assert.notEqual(completionOrder[0], 'video-0.m4s', 'responses complete out of source order');
      report[scenario + 'Ordering'] = { peak: segments.peak, completionOrder, attempts: Object.fromEntries(attempts) };
      if (scenario === 'retry') {
        assert.equal(attempts.get('video-0.m4s'), 4);
        assert.equal(retryTimes.length, 4);
        retryTimes.slice(1).forEach((time, index) => assert.ok(time - retryTimes[index] >= 180 * (index + 1)));
        report.retryTimes = retryTimes;
      }
    }
    report.orphanRecovery = true;
    for (const scenario of ['drm-master', 'drm-audio', 'drm-session', 'drm-config']) {
      const start = requests.length;
      before = (await native()).length;
      await prepare(scenario);
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b => /^(Download |Audio only)/.test(b.textContent))"), false);
      await capture(`download-${scenario}`);
      assert.equal((await native()).length, before);
      assert.ok(requests.slice(start).every(name => name === 'master.m3u8' || name === 'protected.mpd'));
      report[scenario] = { protected: true, noButtons: true, metadataOnly: true };
    }
    await prepare('drm-child');
    before = (await native()).length;
    owner = await start('Download 1080p');
    report.drmChild = await finish(owner, 'Download failed. No files completed.', 'drm-child');
    assert.ok(report.drmChild.every(row => row.text.includes('Protected (DRM), cannot download')));
    assert.equal((await native()).length, before);
    for (const scenario of ['empty', 'long']) {
      await prepare(scenario); before = (await native()).length;
      owner = await start('Audio only');
      const rows = await finish(owner, 'Audio file completed.', `audio-${scenario}`);
      report[`audio-${scenario}`] = rows;
      assert.equal((await native()).length - before, 1);
      assert.deepEqual(await readFile(rows[0].path), media.audio.bytes);
      const expected = `${filenameStem(config.video.title, '91')} - audio.m4a`;
      assert.equal(rows[0].path.split('/').at(-1).replace(/ \(\d+\)(\.[^.]+)$/, '$1'), expected);
    }
    await prepare('native-cancel'); before = (await native()).length;
    await bootstrap.evaluate(() => {
      let count = 0;
      const cancelCompanion = item => {
        if (++count === 2) { globalThis.chrome.downloads.onCreated.removeListener(cancelCompanion); void globalThis.chrome.downloads.cancel(item.id); }
      };
      globalThis.chrome.downloads.onCreated.addListener(cancelCompanion);
    });
    owner = await start('Download 1080p');
    report.nativeCancel = await finish(owner, 'Partial failure. The completed file is kept; the companion failed.', 'native-cancel');
    assert.deepEqual(report.nativeCancel.map(row => row.state), ['complete', 'cancelled']);
    assert.deepEqual(await readFile(report.nativeCancel[0].path), media.video.bytes);
    assert.match(report.nativeCancel[1].text, /Save cancelled/);
    const cancelled = (await native()).filter(item => item.state === 'interrupted' && !report.recovery.some(entry => entry.native.some(old => old.id === item.id)));
    assert.equal((await native()).length - before, 2);
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].error, 'USER_CANCELED');
    await prepare('native-error'); before = (await native()).length;
    const existingIds = new Set((await native()).map(item => item.id));
    const blocked = resolve(artifacts, 'blocked-download-directory');
    await writeFile(blocked, 'A file, not a writable directory');
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: blocked, eventsEnabled: true });
    owner = await start('Audio only');
    report.nativeError = await finish(owner, 'Download failed. No files completed.', 'native-error');
    const failedItems = (await native()).filter(item => !existingIds.has(item.id));
    assert.equal(failedItems.length, 1);
    assert.equal(failedItems[0].state, 'interrupted');
    assert.notEqual(failedItems[0].error, 'USER_CANCELED');
    assert.match(report.nativeError[0].text, new RegExp(`Native download ${failedItems[0].error}`));
    await automatic();
    for (const scenario of ['partial', 'cancel', 'timeout']) {
      await prepare(scenario); before = (await native()).length;
      owner = await start('Download 1080p');
      await heldStarted;
      assert.equal(await owner.locator('#outcomes li[data-state="complete"]').count(), 1);
      assert.equal(await owner.locator('#merge-command').count(), 0, 'no command for pending companion');
      assert.equal(await owner.getByRole('button', { name: 'Copy command', exact: true }).count(), 0);
      assert.match(await owner.locator('#status').innerText(), /in progress/);
      await owner.screenshot({ path: resolve(artifacts, `download-${scenario}-running.png`) });
      if (scenario === 'cancel') await owner.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (scenario !== 'timeout') release();
      report[scenario] = await finish(owner, 'Partial failure. The completed file is kept; the companion failed.', scenario);
      if (scenario === 'partial') {
        assert.equal(attempts.get('audio-0.m4s'), 4);
        report.exhaustionAttempts = Object.fromEntries(attempts);
      }
      release();
      if (scenario === 'timeout') assert.match(report[scenario][1].text, /Timed out after 30 seconds/);
      assert.equal((await native()).length - before, 1);
      assert.deepEqual(report[scenario].map(row => row.state), ['complete', scenario === 'cancel' ? 'cancelled' : 'failed']);
      assert.deepEqual(await readFile(report[scenario][0].path), media.video.bytes);
    }
    for (const scenario of ['progressive', 'progressive-mixed', 'progressive-unknown', 'progressive-redirect']) {
      await prepare(scenario);
      const labels = await evaluate("[...document.querySelectorAll('#streams button')].map(button=>button.textContent)");
      assert.equal(await evaluate("document.querySelectorAll('#streams article').length"), 1);
      assert.match(labels[0], /MP4 · video \+ audio/);
      assert.ok(labels[0].includes(`${combined.length.toLocaleString('en-US')} bytes`));
      assert.match(labels[1], /size unknown/);
      assert.equal(labels.filter(label => label.includes('MP4 · video + audio')).length, 2,
        'the same direct file from inline and fetched config has only one action');
      assert.equal(labels.includes('Audio only'), scenario === 'progressive-mixed');
      if (scenario === 'progressive-mixed') assert.ok(labels.indexOf('Download 1080p') > 1);
      await capture(`download-${scenario}-choices`);
      before = (await native()).length;
      const requestBefore = requests.length;
      owner = await start(labels[scenario === 'progressive-unknown' ? 1 : 0]);
      if (scenario === 'progressive-redirect') {
        report[scenario] = await finish(owner, 'Download failed. No files completed.', scenario);
        assert.equal((await native()).length, before);
        assert.deepEqual(requests.slice(requestBefore), ['combined.mp4?sig=owned%2f+&x=&x=2']);
        continue;
      }
      report[scenario] = await finish(owner, 'MP4 file completed.', scenario);
      assert.equal((await native()).length - before, 1);
      assert.deepEqual(requests.slice(requestBefore), [scenario === 'progressive-unknown' ? 'unknown.mp4' : 'combined.mp4?sig=owned%2f+&x=&x=2']);
      assert.equal(report[scenario].length, 1);
      const saved = report[scenario][0].path;
      assert.deepEqual(await readFile(saved), combined);
      assert.ok(saved.endsWith(`${filenameStem(config.video.title, '91')} [${scenario === 'progressive-unknown' ? 720 : 1080}p]${scenario === 'progressive-mixed' ? ' (1)' : ''}.mp4`));
      const decoded = spawnSync('ffmpeg', ['-hide_banner', '-i', saved, '-map', '0:v:0',
        '-map', '0:a:0', '-f', 'null', '-'], { encoding: 'utf8' });
      await writeFile(resolve(artifacts, `${scenario}-decode.txt`), decoded.stderr ?? String(decoded.error));
      assert.equal(decoded.status, 0, decoded.stderr);
      assert.match(decoded.stderr, /Video:/);
      assert.match(decoded.stderr, /Audio:/);
    }
    await prepare('progressive-limit');
    before = (await native()).length;
    const limitRequestBefore = requests.length;
    const limitLabel = await evaluate("document.querySelector('#streams button').textContent");
    owner = await start(limitLabel);
    report.progressiveLimit = await finish(owner, 'Download failed. No files completed.', 'progressive-limit');
    assert.match(report.progressiveLimit[0].text, /File exceeds 4 GiB limit/);
    assert.equal((await native()).length, before);
    assert.equal(requests.length, limitRequestBefore);
    for (const scenario of ['encrypted', 'redirect', 'origin']) {
      await prepare(scenario); before = (await native()).length;
      owner = await start('Download 1080p');
      report[scenario] = await finish(owner, 'Download failed. No files completed.', scenario);
      assert.equal((await native()).length, before);
    }
    await prepare('missing');
    assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.startsWith('Download ')).length"), 0);
    report.missingSeparateAudio = true;
    assert.equal(requests.some(name => /unrelated|forbidden|license/.test(name)), false);
    report.requests = requests;
    segments.check();
    report.segmentLifetimes = segments.events;
    report.nativeItems = await native();
    await writeFile(resolve(artifacts, 'download-proof.json'), JSON.stringify(report, null, 2));
    return report;
  } finally { release?.(); segments.dispose(); await context.unroute('**/*', route); await cdp.detach(); }
}
