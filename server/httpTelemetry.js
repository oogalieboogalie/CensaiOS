// server/httpTelemetry.js — in-process HTTP counters for triage.
//
// WHAT: every response increments a capped ring buffer {t, class, ms, area}.
// WHY: when the UI "seizes", one look at /api/system/status -> http shows
// whether the server is actually erroring (and where) or the client is
// choking on its own storm. Zero behavior change: observe-only middleware.
//
// PRIVACY: areas are the first TWO path segments only (/api/projects), so
// IDs/emails in deeper segments never land here. Buffer capped at 5000
// entries (~a few hundred KB worst case), oldest evicted first.

const CAP = 5000
const SLOW_MS = 2000

const ring = []
let total = 0
const startedAt = Date.now()

function areaOf(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean).slice(0, 2)
  return parts.length ? '/' + parts.join('/') : '/'
}

export function recordHttp(area, res, startMs) {
  const status = res.statusCode || 0
  total += 1
  ring.push({
    t: Date.now(),
    cls: `${Math.floor(status / 100)}xx`,
    status,
    ms: Date.now() - startMs,
    area,
  })
  if (ring.length > CAP) ring.splice(0, ring.length - CAP)
}

export function httpMiddleware(req, res, next) {
  const start = Date.now()
  // Capture the path NOW: express strips mount points off req.url/req.path
  // as the request descends into routers, so by 'finish' time it reads '/'.
  const area = areaOf(req.path || req.url)
  res.on('finish', () => {
    try {
      recordHttp(area, res, start)
    } catch {
      // telemetry must never break responses
    }
  })
  next()
}

export function getHttpSummary() {
  const since = Date.now() - 60_000
  const byClass = {}
  const recent = { total: 0, byClass: {}, slowGt2s: 0 }
  const errAreas = {}
  for (const e of ring) {
    byClass[e.cls] = (byClass[e.cls] || 0) + 1
    if (e.t < since) continue
    recent.total += 1
    recent.byClass[e.cls] = (recent.byClass[e.cls] || 0) + 1
    if (e.ms >= SLOW_MS) recent.slowGt2s += 1
    if (e.cls === '4xx' || e.cls === '5xx' || e.cls === '0xx') {
      errAreas[e.area] = errAreas[e.area] || { area: e.area, count: 0 }
      errAreas[e.area].count += 1
    }
  }
  recent.topErrorAreas = Object.values(errAreas)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  return {
    serverUptimeS: Math.floor((Date.now() - startedAt) / 1000),
    total,
    byClass,
    last60s: recent,
  }
}

// Test-only: reset counters between cases.
export function __resetHttpTelemetry() {
  ring.length = 0
  total = 0
}
