import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUptimeSnapshot, handleUptimeAPI } from '../src/handlers/uptime.js';
import { getUptimeViewState } from '../src/frontend/utils/uptime.js';

const source = 'https://uptimeflare-telegram191.pages.dev/api/data';
const now = Math.floor(Date.now() / 1000);
const payload = (updatedAt = now) => ({ updatedAt, monitors: {
  'myreview-asia': { up: true, latency: 1103, location: 'LIS', message: 'OK', headers: { Authorization: 'private' } },
  'sing4u-asia': { up: false, latency: -1, location: 'LIS', message: 'HTTP 503' },
  future: { up: 'true', latency: 'invalid', name: '<img src=x>', statusPageLink: 'javascript:alert(1)' }
} });

test('normalizes public metadata, counts and safe links without leaking upstream fields', () => {
  const snapshot = normalizeUptimeSnapshot(payload(), source, now);
  assert.equal(snapshot.monitors[0].name, 'myreview.asia');
  assert.equal(snapshot.monitors[0].url, 'https://myreview.asia/');
  assert.equal(snapshot.monitors[1].latency, null);
  assert.equal(snapshot.monitors[2].up, null);
  assert.equal(snapshot.monitors[2].url, null);
  assert.equal(snapshot.monitors[2].name, '<img src=x>');
  assert.equal(JSON.stringify(snapshot).includes('Authorization'), false);
  assert.deepEqual(snapshot.summary, { up: 1, down: 1, unknown: 1 });
});

test('rejects malformed and future-dated snapshots instead of manufacturing healthy data', () => {
  for (const value of [null, {}, { updatedAt: now, monitors: [] }, payload(now + 61), payload(-1)]) {
    assert.throws(() => normalizeUptimeSnapshot(value, source, now));
  }
});

test('stale and failed refreshes make all displayed statuses unknown', () => {
  const snapshot = normalizeUptimeSnapshot(payload(), source, now);
  assert.equal(getUptimeViewState(snapshot, false, now + 600).state, 'ready');
  for (const view of [getUptimeViewState(snapshot, false, now + 601), getUptimeViewState(snapshot, true, now)]) {
    assert.deepEqual(view.summary, { up: 0, down: 0, unknown: 3 });
    assert(view.monitors.every(monitor => monitor.state === 'unknown'));
  }
});

test('empty and disabled integrations have explicit states', () => {
  assert.equal(getUptimeViewState(null, false, now).state, 'loading');
  assert.equal(getUptimeViewState(null, true, now).state, 'unavailable');
  assert.equal(getUptimeViewState({ enabled: false }, false, now).state, 'disabled');
  const snapshot = normalizeUptimeSnapshot({ updatedAt: now, monitors: {} }, source, now);
  assert.deepEqual(getUptimeViewState(snapshot, false, now).summary, { up: 0, down: 0, unknown: 0 });
});

test('proxy denies unauthenticated private-dashboard access before fetching upstream', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not fetch'); });
  const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime'), { UPTIMEFLARE_API_URL: source }, { is_public: 'false' });
  assert.equal(response.status, 401);
  assert.equal(mock.mock.callCount(), 0);
});

test('missing configuration disables integration without fetching', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not fetch'); });
  const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime'), {}, { is_public: 'true' });
  assert.equal((await response.json()).enabled, false);
  assert.equal(mock.mock.callCount(), 0);
});

test('proxy uses only configured URL and never forwards dashboard credentials', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload())));
  const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime?url=https://attacker.example', {
    headers: { Authorization: 'Bearer private-dashboard-token', Cookie: 'session=private-cookie' }
  }), { UPTIMEFLARE_API_URL: source }, { is_public: 'true' });
  assert.equal(response.status, 200);
  const [url, options] = mock.mock.calls[0].arguments;
  assert.equal(url, source);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'manual');
  const headers = new Headers(options.headers);
  assert.equal(headers.get('Authorization'), null);
  assert.equal(headers.get('Cookie'), null);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('source errors and malformed bodies return a bounded generic failure', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('private source details', { status: 500 }));
  const request = new Request('https://monitor.example/api/uptime');
  let response = await handleUptimeAPI(request, { UPTIMEFLARE_API_URL: source }, { is_public: 'true' });
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('private source details'), false);
  mock.mock.mockImplementation(async () => new Response('<not-json>'));
  response = await handleUptimeAPI(request, { UPTIMEFLARE_API_URL: source }, { is_public: 'true' });
  assert.equal(response.status, 502);
});

test('source redirects are rejected without following their destination', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }));
  const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime'), { UPTIMEFLARE_API_URL: source }, { is_public: 'true' });
  assert.equal(response.status, 502);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(mock.mock.calls[0].arguments[1].redirect, 'manual');
});

test('source cache stores public snapshots and is still gated by private auth', async t => {
  const oldCaches = globalThis.caches;
  let cached = null;
  let reads = 0;
  globalThis.caches = { default: {
    match: async () => { reads++; return cached?.clone(); },
    put: async (key, value) => { cached = value.clone(); }
  } };
  t.after(() => { if (oldCaches === undefined) delete globalThis.caches; else globalThis.caches = oldCaches; });
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload())));
  const request = new Request('https://monitor.example/api/uptime');
  const env = { UPTIMEFLARE_API_URL: source };
  await handleUptimeAPI(request, env, { is_public: 'true' });
  await handleUptimeAPI(request, env, { is_public: 'true' });
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(cached.headers.get('Cache-Control'), 'public, max-age=60');
  const before = reads;
  const response = await handleUptimeAPI(request, env, { is_public: 'false' });
  assert.equal(response.status, 401);
  assert.equal(reads, before);
});

test('proxy aborts a stalled source and returns a generic error', async t => {
  t.mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  let signal;
  t.mock.method(globalThis, 'fetch', (_, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(new Error('Aborted source')), { once: true });
  }));
  const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime'), { UPTIMEFLARE_API_URL: source }, { is_public: 'true' });
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 502);
});

test('proxy rejects unsafe source configuration before making a request', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not fetch'); });
  for (const url of ['http://example.com/api/data', 'https://user:password@example.com/api/data', 'https://example.com/api/data?token=private', 'https://example.com/login']) {
    const response = await handleUptimeAPI(new Request('https://monitor.example/api/uptime'), { UPTIMEFLARE_API_URL: url }, { is_public: 'true' });
    assert.equal(response.status, 502);
  }
  assert.equal(mock.mock.callCount(), 0);
});
