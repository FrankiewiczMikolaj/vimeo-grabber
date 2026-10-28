import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { segmentRequests } from './segment-requests.mjs';

export async function requestLifetimeProof(context, artifacts) {
  const page = await context.newPage();
  const base = 'https://owned.vimeocdn.com/lifetime/';
  const counter = segmentRequests(context, request => request.url().startsWith(`${base}segment/`));
  let handlers = 0;
  let release;
  let cancelledRelease;
  let ready;
  let held;
  let target;
  const pending = new Set();
  let acknowledge = Promise.resolve();
  let acknowledgeResponse;
  const route = async route => {
    if (route.request().url() === base) return route.fulfill({ body: 'owned lifetime proof' });
    handlers++;
    if (handlers === target) ready();
    const delivered = acknowledge;
    const job = (async () => {
      try { await held; await route.fulfill({ body: 'segment' }); await delivered; }
      finally { handlers--; }
    })();
    pending.add(job);
    try { await job; } finally { pending.delete(job); }
  };
  const report = {};
  async function begin(count) {
    target = count;
    held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { ready = resolve; });
    await page.evaluate(count => {
      globalThis.abort = new globalThis.AbortController();
      globalThis.jobs = Promise.allSettled(Array.from({ length: count }, (_, i) =>
        globalThis.fetch(`segment/${i}`, { signal: globalThis.abort.signal }).then(response => response.text())));
    }, count);
    await started;
    assert.equal(counter.outstanding, count);
  }
  async function terminal(action) {
    const ended = new Promise(resolve => {
      const done = () => {
        if (counter.outstanding) return;
        context.off('requestfinished', done); context.off('requestfailed', done); resolve();
      };
      context.on('requestfinished', done); context.on('requestfailed', done);
    });
    await action();
    await ended;
  }
  try {
    await context.route(`${base}**`, route);
    await page.goto(base);
    acknowledge = new Promise(resolve => { acknowledgeResponse = resolve; });
    await begin(5);
    await terminal(async () => { release(); await page.evaluate(() => globalThis.jobs); });
    assert.equal(handlers, 5, 'browser completion need not settle fixture handlers');
    counter.check();
    report.delivered = { outstanding: counter.outstanding, handlers };
    acknowledgeResponse();
    await Promise.all(pending);
    acknowledge = Promise.resolve();
    counter.reset();
    await begin(1);
    counter.check();
    await terminal(() => page.evaluate(async () => { globalThis.abort.abort(); await globalThis.jobs; }));
    assert.equal(handlers, 1, 'an aborted browser request does not settle its held fixture handler');
    report.cancelled = { outstanding: counter.outstanding, handlers };
    // Keep the cancelled handler alive while five new real requests start.
    cancelledRelease = release;
    counter.reset();
    target = 6;
    held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { ready = resolve; });
    await page.evaluate(() => {
      globalThis.jobs = Promise.all(Array.from({ length: 5 }, (_, i) => globalThis.fetch(`segment/next-${i}`).then(response => response.text())));
    });
    await started;
    assert.equal(counter.outstanding, 5);
    assert.equal(handlers, 6);
    counter.check();
    report.nextFive = { outstanding: counter.outstanding, handlers, oldCounterWouldReject: handlers > 5 };
    cancelledRelease();
    await terminal(async () => { release(); await page.evaluate(() => globalThis.jobs); });
    await Promise.all(pending);
    counter.reset();
    await begin(6);
    assert.throws(() => counter.check(), /at most five segment requests \(observed 6\)/);
    report.sixRejected = { outstanding: counter.outstanding, peak: counter.peak };
    await terminal(() => page.evaluate(async () => { globalThis.abort.abort(); await globalThis.jobs; }));
    release();
    await Promise.all(pending);
    report.events = counter.events;
    await writeFile(resolve(artifacts, 'request-lifetime-proof.json'), JSON.stringify(report, null, 2));
  } finally {
    release?.();
    cancelledRelease?.();
    await page.close();
    acknowledgeResponse?.();
    await Promise.allSettled(pending);
    await context.unroute(`${base}**`, route);
    counter.dispose();
  }
}
