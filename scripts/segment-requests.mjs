import assert from 'node:assert/strict';

export function segmentRequests(context, matches) {
  const live = new Set();
  const events = [];
  let peak = 0;
  const start = request => {
    if (!matches(request)) return;
    live.add(request);
    peak = Math.max(peak, live.size);
    events.push({ event: 'request', url: request.url(), outstanding: live.size });
  };
  const end = event => request => {
    if (!live.delete(request)) return;
    events.push({ event, url: request.url(), outstanding: live.size });
  };
  const finished = end('requestfinished');
  const failed = end('requestfailed');
  context.on('request', start);
  context.on('requestfinished', finished);
  context.on('requestfailed', failed);
  return {
    get peak() { return peak; },
    get outstanding() { return live.size; },
    events,
    check() { assert.ok(peak <= 5, `at most five segment requests (observed ${peak})`); },
    reset() {
      this.check();
      assert.equal(live.size, 0, 'previous scenario has no outstanding segment requests');
      peak = 0;
    },
    dispose() {
      context.off('request', start);
      context.off('requestfinished', finished);
      context.off('requestfailed', failed);
    },
  };
}
