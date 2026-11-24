export function getUptimeViewState(snapshot, failed = false, now = Math.floor(Date.now() / 1000)) {
  if (snapshot?.enabled === false) return { state: 'disabled', monitors: [], summary: { up: 0, down: 0, unknown: 0 } };
  const valid = snapshot && Array.isArray(snapshot.monitors) && Number.isFinite(snapshot.updatedAt);
  const stale = valid && (snapshot.stale || now - snapshot.updatedAt > 600);
  const state = failed ? 'unavailable' : !valid ? 'loading' : stale ? 'stale' : 'ready';
  const summary = { up: 0, down: 0, unknown: 0 };
  const monitors = (valid ? snapshot.monitors : []).map(monitor => {
    const state = failed || stale ? 'unknown' : monitor.up === true ? 'up' : monitor.up === false ? 'down' : 'unknown';
    summary[state]++;
    return { ...monitor, state };
  });
  return { state, monitors, summary };
}
