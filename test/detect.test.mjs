import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { detectStreams } from '../src/detect/index.ts';

const html = await readFile(new URL('./fixtures/synthetic-vimeo.html', import.meta.url), 'utf8');
const config = JSON.parse(html.match(/<script id="synthetic-vimeo-player" type="application\/json">\s*([\s\S]*?)<\/script>/)[1]);
// A minimal document boundary; real DOM selection is exercised in Chromium.
const page = (value, URL = 'https://vimeo.com/fixture') => ({
  URL,
  querySelector: () => value === undefined ? null : { textContent: value },
});
const detect = (value, url) => detectStreams(page(JSON.stringify(value), url));

test('the owned fixture exposes its declared single plain-text stream', () => {
  assert.deepEqual(detect(config), [config.stream]);
  assert.equal(decodeURIComponent(config.stream.downloadUrl.split(',')[1]),
    'Vimeo Grabber owned synthetic fixture.\n');
});

test('changed embedded identity, title and URL are returned, not fixture constants', () => {
  const stream = { id: 'another-dummy', title: 'Changed dummy title',
    downloadUrl: 'data:text/plain;charset=utf-8,Changed%20owned%20payload%0A' };
  assert.deepEqual(detect({ version: 1, stream }), [stream]);
});

test('only HTTPS Vimeo page origins accept the synthetic contract', () => {
  for (const host of ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']) {
    assert.deepEqual(detect(config, `https://${host}/fixture`), [config.stream]);
  }
  for (const url of ['https://example.com', 'https://vimeo.com.example.com',
    'https://fakevimeo.com', 'http://vimeo.com/fixture', 'not a URL']) {
    assert.deepEqual(detect(config, url), [], url);
  }
});

test('missing, malformed and unsupported configs produce no stream', () => {
  for (const text of [undefined, '', '{broken']) assert.deepEqual(detectStreams(page(text)), []);
  for (const value of [null, [], {}, { version: 2, stream: config.stream },
    { version: 1 }, { version: 1, stream: null }, { version: 1, stream: [] }]) {
    assert.deepEqual(detect(value), []);
  }
  for (const [field, values] of Object.entries({
    id: ['', ' ', 7, null], title: ['', ' ', 7, null],
    downloadUrl: ['', 7, 'javascript:alert(1)', 'https://example.com/file',
      'data:text/html,unsafe', 'data:text/plain;charset=utf-8,',
      'data:text/plain;charset=utf-8,%ZZ'],
  })) {
    for (const value of values) {
      assert.deepEqual(detect({ version: 1, stream: { ...config.stream, [field]: value } }), []);
    }
  }
});
