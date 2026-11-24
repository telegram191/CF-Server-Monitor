# Unified monitoring dashboard

The user selected a combined dashboard on monitor.mmtv.asia: existing server metrics plus website status from UptimeFlare. Show Up/Down, HTTP latency, the check timestamp and a link to detailed history. Website checks stay at five-minute intervals; server probes and realtime updates keep their current behavior.

## Approach

A compact Website uptime panel fits the chosen single-screen workflow. A separate UptimeFlare tab was offered and not selected. An iframe would duplicate navigation and impose cross-origin presentation constraints. Use an authenticated same-origin read-only API proxy instead, preserving the dashboard's existing public/private and Turnstile rules.

The proxy reads the public UptimeFlare JSON endpoint configured by UPTIMEFLARE_API_URL. It never forwards dashboard cookies or credentials. It normalizes public fields only, caches source snapshots for 60 seconds and times out after five seconds. Data older than ten minutes is marked stale; source failure cannot display fresh UP status. Known monitor IDs receive the three requested domain names; future IDs fall back to their ID.

The Vue panel reuses the incumbent dark/light tokens and English/Chinese localization, pauses polling in hidden tabs, refreshes snapshots every 60 seconds and isolates failures from server monitoring. No database migration, server credential change, extra website probe, or cron change is required.
