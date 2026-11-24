<template>
  <article v-if="view.state !== 'disabled'" class="website-uptime" aria-labelledby="website-uptime-title" :aria-busy="busy">
    <header class="uptime-header">
      <h2 id="website-uptime-title">{{ trans.websiteUptime }}</h2>
      <div class="uptime-summary" role="status">
        <span class="state-up">{{ view.summary.up }} UP</span>
        <span class="state-down">{{ view.summary.down }} DOWN</span>
        <span v-if="view.summary.unknown">{{ view.summary.unknown }} {{ trans.websiteUnknown }}</span>
      </div>
      <div class="uptime-actions">
        <a v-if="snapshot?.statusPageUrl" :href="snapshot.statusPageUrl" target="_blank" rel="noopener noreferrer">{{ trans.websiteHistory }} <span aria-hidden="true">↗</span></a>
        <button type="button" :disabled="busy" @click="refresh">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>
          {{ trans.websiteRefresh }}
        </button>
      </div>
    </header>
    <div class="uptime-meta">
      <span>{{ trans.websiteInterval }}</span>
      <span v-if="snapshot?.updatedAt">{{ trans.websiteChecked }} <time :datetime="checkedDate.toISOString()" :title="checkedDate.toLocaleString(locale)">{{ checkedDate.toLocaleTimeString(locale) }}</time></span>
    </div>
    <p v-if="view.state === 'loading'" class="uptime-notice" role="status">{{ trans.loading }}</p>
    <p v-else-if="view.state === 'unavailable'" class="uptime-notice state-down" role="status">{{ trans.websiteUnavailable }}</p>
    <p v-else-if="view.state === 'stale'" class="uptime-notice" role="status">{{ trans.websiteStale }}</p>
    <p v-else-if="!view.monitors.length" class="uptime-notice">{{ trans.noData }}</p>
    <ul v-if="view.monitors.length" class="uptime-sites">
      <li v-for="monitor in view.monitors" :key="monitor.id">
        <div class="uptime-site-heading">
          <a v-if="monitor.url" :href="monitor.url" target="_blank" rel="noopener noreferrer" :title="monitor.name">{{ monitor.name }}</a>
          <span v-else class="uptime-name" :title="monitor.name">{{ monitor.name }}</span>
          <span class="uptime-state" :class="`state-${monitor.state}`"><span class="uptime-dot" aria-hidden="true"></span>{{ monitor.state === 'unknown' ? trans.websiteUnknown : monitor.state.toUpperCase() }}</span>
        </div>
        <div class="uptime-site-details">
          <span class="uptime-latency">{{ monitor.state === 'unknown' || monitor.latency == null ? '—' : `${Math.round(monitor.latency).toLocaleString(locale)} ms` }}</span>
          <span v-if="monitor.state === 'down'" class="uptime-message" :title="monitor.message">{{ monitor.message }}</span>
          <span v-else-if="monitor.state !== 'unknown'" :title="monitor.location">{{ monitor.location }}</span>
        </div>
      </li>
    </ul>
  </article>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchUptimeStatus } from '../utils/api.js'
import { getUptimeViewState } from '../utils/uptime.js'
import { currentLang, useTranslation } from '../utils/i18n.js'

const trans = useTranslation()
const locale = computed(() => currentLang.value === 'zh' ? 'zh-CN' : 'en-US')
const snapshot = ref(null)
const busy = ref(false)
const failed = ref(false)
const now = ref(Math.floor(Date.now() / 1000))
const view = computed(() => getUptimeViewState(snapshot.value, failed.value, now.value))
const checkedDate = computed(() => new Date(snapshot.value.updatedAt * 1000))
let timer
let controller
let disposed = false

async function refresh() {
  if (busy.value || disposed || document.hidden) return
  clearTimeout(timer)
  busy.value = true
  const activeController = new AbortController()
  controller = activeController
  try {
    const result = await fetchUptimeStatus(activeController.signal)
    if (disposed || activeController.signal.aborted) return
    snapshot.value = result
    failed.value = false
  } catch {
    if (!disposed && !activeController.signal.aborted) failed.value = true
  } finally {
    busy.value = false
    controller = null
    now.value = Math.floor(Date.now() / 1000)
    if (!disposed && !document.hidden && snapshot.value?.enabled !== false) timer = setTimeout(refresh, 60000)
  }
}

function onVisibilityChange() {
  clearTimeout(timer)
  now.value = Math.floor(Date.now() / 1000)
  if (document.hidden) controller?.abort()
  else if (busy.value) controller?.abort()
  else refresh()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  refresh()
})
onUnmounted(() => {
  disposed = true
  clearTimeout(timer)
  controller?.abort()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
.website-uptime { margin-bottom: 24px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); font-size: 12px; font-variant-numeric: tabular-nums; }
.uptime-header { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 16px 0; }
h2 { margin: 0; font-size: 14px; font-weight: 600; }
.uptime-summary, .uptime-actions { display: flex; align-items: center; gap: 12px; }
.uptime-summary, .uptime-meta, .uptime-site-details { color: var(--text-secondary); }
.uptime-actions { margin-left: auto; }
a { color: var(--text-primary); text-decoration: none; text-underline-offset: 3px; }
a:hover { color: var(--accent-blue); text-decoration: underline; }
button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
button:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--text-secondary); }
button:disabled { opacity: .6; cursor: wait; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 3px; }
.uptime-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 4px 16px 12px; font-size: 11px; }
.uptime-notice { margin: 0; padding: 0 16px 12px; }
.uptime-sites { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border-color); }
.uptime-sites li { min-width: 0; padding: 12px 16px; }
.uptime-sites li + li { border-left: 1px solid var(--border-color); }
.uptime-site-heading, .uptime-site-details { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.uptime-site-heading > a, .uptime-name, .uptime-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uptime-site-details { margin-top: 8px; min-height: 18px; }
.uptime-latency { color: var(--text-primary); white-space: nowrap; }
.uptime-state { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 11px; }
.uptime-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.state-up { color: var(--accent-green); }
.state-down { color: var(--accent-red); }
.state-unknown { color: var(--text-secondary); }
@media (max-width: 850px) {
  .uptime-sites { grid-template-columns: 1fr; }
  .uptime-sites li + li { border-left: 0; border-top: 1px solid var(--border-color); }
}
@media (max-width: 480px) {
  .uptime-header { gap: 8px 12px; }
  .uptime-actions { width: 100%; justify-content: flex-end; }
}
</style>
