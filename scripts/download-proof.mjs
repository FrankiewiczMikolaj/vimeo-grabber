import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  let mode = 'pair';
  let release;
  let requested;
  let held;
  let heldStarted;
  const requests = [];
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
  const route = async route => {
    const url = route.request().url();
    const selectedConfig = mode === 'dash' ? dashConfig : mode === 'drm-config' ?
      { ...config, request: { ...config.request, drm: { hls: { fairplay: true } } } } : mode === 'drm-master' ?
        { ...config, request: { ...config.request, files: { hls: { cdns: { owned: { url: `${base}drm/cbcs,master.m3u8` } } } } } } : config;
    if (url === 'https://player.vimeo.com/video/91') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script type="application/json">${JSON.stringify(selectedConfig)}</script>` });
    if (url === 'https://player.vimeo.com/video/91/config') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(selectedConfig) });
    if (!url.startsWith(base)) return route.fallback();
    const name = url.slice(base.length);
    requests.push(name);
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
      if (mode === 'retry' && name === 'video-0.m4s') {
        retryTimes.push(Date.now());
        if (attempt <= 3) return await route.fulfill({ status: 503, body: 'temporary' });
      }
      if (name === 'audio-0.m4s' && ['partial', 'cancel', 'timeout', 'revoke', 'invalidate'].includes(mode)) {
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
    if (mode === 'redirect' && name.endsWith('-init.mp4')) return route.fulfill({ status: 302, headers: { location: 'https://unseen.vimeocdn.com/forbidden' } });
    if (name === 'video.m3u8' || name === 'audio.m3u8') {
      const encryption = mode === 'encrypted' ? '#EXT-X-KEY:METHOD=AES-128,URI="forbidden.key"\n' :
        mode === 'drm-child' ? '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm",KEYFORMAT="com.apple.streamingkeydelivery"\n' : '';
      const playlist = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:2\n${encryption}#EXT-X-MAP:URI="${mode === 'origin' ? 'https://unseen.vimeocdn.com/forbidden' : `${kind}-init.mp4`}"\n${media[kind].segments.map((_, index) => `#EXTINF:1,\n${kind}-${index}.m4s\n`).join('')}#EXT-X-ENDLIST\n`;
      return route.fulfill({ body: playlist, contentType: 'application/vnd.apple.mpegurl' });
    }
    if (/^(video|audio)-init\.mp4$/.test(name)) return route.fulfill({ body: media[kind].init, contentType: `${kind}/mp4` });
    throw new Error(`Unowned download request: ${url}`);
  };
  await context.route('**/*', route);
  const native = () => bootstrap.evaluate(() => globalThis.chrome.downloads.search({}));
  // Xvfb has no window manager to focus GTK dialogs; click their actual Save button.
  function acceptNativeSave() {
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
 t.XTestFakeMotionEvent(d,-1,gx.value+w.value-50,gy.value+h.value-23,0)
 t.XTestFakeButtonEvent(d,1,1,0); t.XTestFakeButtonEvent(d,1,0,0)
 x.XFlush.argtypes=[ctypes.c_void_p]; x.XFlush(d)
 print(json.dumps({'title':name.value.decode(),'width':w.value,'height':h.value}))
 break
else: raise RuntimeError('Native Save File dialog not found')
`], { encoding: 'utf8' }));
  }
  async function prepare(next) {
    mode = next;
    config.video.title = next === 'empty' ? '' : next === 'long' ? '界'.repeat(300) :
      next === 'dash' ? `${hostileTitle} - video 1080p (1)` : next === 'retry' ? `${hostileTitle} retry` : hostileTitle;
    segments.reset(); attempts = new Map(); completionOrder = [];
    heldStarted = new Promise(resolve => { requested = resolve; });
    held = new Promise(resolve => { release = resolve; });
    await active.goto('https://player.vimeo.com/video/91');
    await open();
    await waitText(next === 'empty' ? 'Vimeo video 91' : next === 'long' ? '界' : "Owned '");
    if (!await evaluate("chrome.permissions.contains({origins:['https://owned.vimeocdn.com/*']})")) {
      await evaluate("document.querySelector('.permission button').focus(); true"); key('Return');
      await delay(700);
      if (!await bootstrap.evaluate(() => globalThis.chrome.permissions.contains({ origins: ['https://owned.vimeocdn.com/*'] }))) {
        key('Tab'); key('Return');
      }
      await open();
    }
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
  async function finish(owner, text, name) {
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
      assert.ok(command.endsWith(`'${output.replace(/'/g, "'\\''")}'`), 'output uses original title, not native collision paths');
      execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
      const outputBytes = await readFile(output);
      const repeated = spawnSync('bash', ['-c', command], { cwd: artifacts, encoding: 'utf8' });
      assert.notEqual(repeated.status, 0, 'existing output is refused');
      assert.match(repeated.stderr, /already exists|Not overwriting/);
      assert.deepEqual(await readFile(output), outputBytes);
      await writeFile(resolve(artifacts, `merge-${name}.json`), JSON.stringify({ command, clipboard: command, paths, output, sourcesUnchanged: true, noInjectedCommand: true, log }, null, 2));
      await owner.screenshot({ path: resolve(artifacts, `merge-${name}-copied.png`) });
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
    await owner.close();
    return rows;
  }
  const report = {};
  try {
    await bootstrap.evaluate(async () => {
      const root = await globalThis.navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('vimeo-download', { create: true });
      const file = await directory.getFileHandle('orphan', { create: true });
      const writer = await file.createWritable(); await writer.write('owned orphan'); await writer.close();
    });
    let before;
    let owner;
    for (const scenario of ['pair', 'dash', 'retry', 'empty', 'long']) {
      await prepare(scenario);
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
        if (scenario === 'pair') assert.notEqual(savedName, requestedName, 'native collision suffix retained');
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
    for (const scenario of ['audio', 'empty', 'long']) {
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
    assert.deepEqual(report.nativeCancel.map(row => row.state), ['complete', 'failed']);
    assert.deepEqual(await readFile(report.nativeCancel[0].path), media.video.bytes);
    assert.match(report.nativeCancel[1].text, /Save cancelled/);
    const cancelled = (await native()).filter(item => item.state === 'interrupted');
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
    for (const scenario of ['partial', 'cancel', 'timeout', 'revoke', 'invalidate']) {
      await prepare(scenario); before = (await native()).length;
      owner = await start('Download 1080p');
      await heldStarted;
      assert.equal(await owner.locator('#outcomes li[data-state="complete"]').count(), 1);
      assert.equal(await owner.locator('#merge-command').count(), 0, 'no command for pending companion');
      assert.equal(await owner.getByRole('button', { name: 'Copy command', exact: true }).count(), 0);
      assert.match(await owner.locator('#status').innerText(), /in progress/);
      await owner.screenshot({ path: resolve(artifacts, `download-${scenario}-running.png`) });
      if (scenario === 'cancel') await owner.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (scenario === 'revoke') await bootstrap.evaluate(() => globalThis.chrome.permissions.remove({ origins: ['https://owned.vimeocdn.com/*'] }));
      if (scenario === 'invalidate') await active.goto('https://example.com/empty');
      if (scenario !== 'timeout') release();
      report[scenario] = await finish(owner, 'Partial failure. The completed file is kept; the companion failed.', scenario);
      if (scenario === 'partial') {
        assert.equal(attempts.get('audio-0.m4s'), 4);
        report.exhaustionAttempts = Object.fromEntries(attempts);
      }
      release();
      if (scenario === 'timeout') assert.match(report[scenario][1].text, /Timed out after 30 seconds/);
      assert.equal((await native()).length - before, 1);
      assert.deepEqual(report[scenario].map(row => row.state), ['complete', 'failed']);
      assert.deepEqual(await readFile(report[scenario][0].path), media.video.bytes);
    }
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
