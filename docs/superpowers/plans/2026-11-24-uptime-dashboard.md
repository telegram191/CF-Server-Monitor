# UptimeFlare dashboard integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Combine server metrics and website health on monitor.mmtv.asia.
**Architecture:** A read-only same-origin Worker proxy normalizes UptimeFlare snapshots. A self-contained Vue panel renders the snapshot above server views without changing server metrics or probe behavior.
**Tech Stack:** Cloudflare Workers, Vue 3, native fetch/cache, node:test, Vite.
**Spec:** docs/superpowers/specs/2026-11-24-uptime-dashboard-design.md

## Global Constraints

- Keep website cron at five minutes and existing server cron/realtime behavior unchanged.
- Reuse site auth, Turnstile, and design tokens; never forward credentials upstream.
- Source timeout 5000ms, cache TTL 60s, stale threshold 600s.
- Work in the fresh cloned checkout on codex/uptime-dashboard; production secrets and databases remain intact.

## Review Focus

- Stale snapshots and upstream failure must not appear freshly healthy.
- Private dashboards must deny requests before fetching or reading cached snapshots.
- Hostile names/links must remain text and safe HTTP(S) links.
- Hidden/unmounted panels must not keep spawning polls.
- Missing integration config must gracefully hide this optional panel.

### Task 1: Proxy and snapshot normalization

Files: create src/handlers/uptime.js, src/frontend/utils/uptime.js; modify src/index.js; add test/uptime.test.js.
Interface: handleUptimeAPI(request, env, sys, ctx) returns JSON {enabled, updatedAt, stale, statusPageUrl, monitors, summary}; normalizeUptimeSnapshot(payload, statusPageUrl, nowSeconds) validates and maps public fields; getUptimeViewState(snapshot, failed, nowSeconds) determines availability/staleness without false UP states.
- [x] Write failing tests for normalization, stale data, unknown status, unsafe URLs, invalid/future timestamps, disabled config, private auth and failed/timeout fetches.
- [x] Implement bounded fetch, 60s snapshot cache, existing auth gating and GET /api/uptime routing.
- [x] Run node --test test/uptime.test.js; commit tested proxy.

### Task 2: Combined dashboard panel

Files: create src/frontend/components/WebsiteUptimePanel.vue; modify Dashboard.vue, utils/api.js, utils/i18n.js, package.json.
- [x] Add localized compact status rows, summary, check time, latency, refresh and history action using existing tokens.
- [x] Poll the same-origin proxy every 60s, pause hidden tabs, deduplicate requests and clean up timers on unmount.
- [x] Test state helpers and run npm test plus npm run build:frontend; inspect desktop/mobile, light/dark and error/stale states.

### Task 3: Deployment and verification

Files: modify wrangler.toml, CI keep_vars setting and API.md deployment notes.
- [x] Read existing Cloudflare Worker binding names/types and configuration without printing secret values; preserve D1, Durable Objects, routes and schedules.
- [x] Set only UPTIMEFLARE_API_URL, preserve existing vars/secrets and deploy validated assets/code.
- [x] Verify /api/uptime and existing /api/servers; inspect the live combined UI and JS errors.
- [x] Review the whole diff, fix material findings, push the finished integration and report live URL plus limitations.
