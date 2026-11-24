import { checkAuth, simpleAuthResponse } from '../middleware/auth.js';
import { AppError, createErrorResponse, createSuccessResponse } from '../utils/errors.js';

const MONITOR_METADATA = {
  'myreview-asia': { name: 'myreview.asia', url: 'https://myreview.asia/' },
  'sing4u-asia': { name: 'sing4u.asia', url: 'https://sing4u.asia/' },
  'vidioo-metfone': { name: 'vidioo.metfone.com.kh', url: 'https://vidioo.metfone.com.kh/' }
};
const STALE_SECONDS = 600;
const TIMEOUT_MS = 5000;

function safeLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function normalizeUptimeSnapshot(payload, sourceUrl, now = Math.floor(Date.now() / 1000)) {
  if (!payload || !Number.isFinite(payload.updatedAt) || payload.updatedAt <= 0 || payload.updatedAt > now + 60 ||
      !payload.monitors || typeof payload.monitors !== 'object' || Array.isArray(payload.monitors)) {
    throw new Error('Invalid uptime snapshot');
  }
  const monitors = Object.entries(payload.monitors).slice(0, 100).map(([id, value]) => {
    const raw = value && typeof value === 'object' ? value : {};
    const metadata = MONITOR_METADATA[id];
    return {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 200) : metadata?.name || id,
      url: safeLink(raw.statusPageLink) || metadata?.url || null,
      up: typeof raw.up === 'boolean' ? raw.up : null,
      latency: Number.isFinite(raw.latency) && raw.latency >= 0 ? raw.latency : null,
      location: typeof raw.location === 'string' ? raw.location.slice(0, 24) : '',
      message: typeof raw.message === 'string' ? raw.message.slice(0, 300) : ''
    };
  });
  const summary = { up: 0, down: 0, unknown: 0 };
  for (const monitor of monitors) summary[monitor.up === true ? 'up' : monitor.up === false ? 'down' : 'unknown']++;
  return {
    enabled: true,
    updatedAt: payload.updatedAt,
    stale: now - payload.updatedAt > STALE_SECONDS,
    checkIntervalSeconds: 300,
    statusPageUrl: new URL('/', sourceUrl).href,
    monitors,
    summary
  };
}

export async function handleUptimeAPI(request, env, sys, ctx) {
  if (sys.is_public !== 'true' && !await checkAuth(request, env, sys)) return simpleAuthResponse();
  if (!env.UPTIMEFLARE_API_URL) return createSuccessResponse({ enabled: false }, { 'Cache-Control': 'private, no-store' });

  let timer;
  try {
    const source = new URL(env.UPTIMEFLARE_API_URL);
    if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash || source.pathname !== '/api/data') {
      throw new Error('Invalid uptime source configuration');
    }
    const cache = globalThis.caches?.default;
    const key = new Request(new URL('/__internal/uptimeflare-snapshot', request.url));
    let snapshot;
    const cached = await cache?.match(key);
    if (cached) {
      const stored = await cached.json();
      // Recompute age when serving a cached snapshot, rather than caching freshness.
      snapshot = { ...stored, stale: Math.floor(Date.now() / 1000) - stored.updatedAt > STALE_SECONDS };
    } else {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(source.href, {
        method: 'GET', credentials: 'omit', redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Uptime source returned HTTP ${response.status}`);
      snapshot = normalizeUptimeSnapshot(await response.json(), source.href);
      if (cache) {
        const write = cache.put(key, createSuccessResponse(snapshot, { 'Cache-Control': 'public, max-age=60' }));
        if (ctx?.waitUntil) ctx.waitUntil(write.catch(() => {}));
        else await write;
      }
    }
    return createSuccessResponse(snapshot, { 'Cache-Control': 'private, no-store' });
  } catch (error) {
    console.warn('Uptime snapshot unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return createErrorResponse(new AppError('Website status is temporarily unavailable', 502), false);
  } finally {
    clearTimeout(timer);
  }
}
