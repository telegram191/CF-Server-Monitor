# Combined server and website dashboard

The dashboard reads UptimeFlare snapshots through `GET /api/uptime`. It displays website health above the existing server views. Server metrics, agents, authentication, database and schedules are unchanged.

Set Worker variable `UPTIMEFLARE_API_URL` to the HTTPS `/api/data` endpoint of your UptimeFlare installation. Without this optional variable the panel is hidden. The proxy applies the dashboard's existing public/private and Turnstile access rules, sends no dashboard cookies or tokens upstream, times out after 5 seconds and caches sanitized snapshots for 60 seconds.

The panel refreshes snapshots every minute while visible. This does not trigger website checks. UptimeFlare continues checking every 5 minutes. Snapshots older than 10 minutes, or failed refreshes, show unknown status rather than healthy indicators. History opens the source status page.

## monitor.mmtv.asia deployment

The actual production Worker is `cf-server-monitor`. The upstream GitHub deployment template targets a different Worker (`server-monitor-pro`) and is currently inactive in this fork because its deployment secrets are unset. For this installation use the explicit production config:

```sh
npm ci
npm run test:all
npm run build:frontend
npx wrangler deploy --config wrangler.production.jsonc
```

`keep_vars: true` preserves existing remote variables including `API_SECRET`. Do not copy credentials into the repository. Production configuration reuses the existing D1 database, MetricsBroadcaster namespace, custom domain and server schedules (`*/1 * * * *`, `0 * * * *`). It does not run database migrations.

Website checks remain in the separate `uptimeflare_worker` (`*/5 * * * *`).
