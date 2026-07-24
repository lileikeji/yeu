import {
  buildEdgeUrl,
  chooseEdgeHost,
  EDGE_ENTRY_HOST,
  EDGE_PROBE_TIMEOUT_MS,
  EDGE_TARGET_HOSTS,
  shouldProbeEdgeRoute,
  type EdgeProbeResult
} from '~/utils/edge-route'

async function probeHost(host: string): Promise<EdgeProbeResult> {
  const startedAt = performance.now()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), EDGE_PROBE_TIMEOUT_MS)

  try {
    await fetch(`https://${host}/api/health?edge_probe=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'no-cors',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    })

    return {
      host,
      reachable: true,
      durationMs: performance.now() - startedAt
    }
  } catch {
    return {
      host,
      reachable: false,
      durationMs: Number.POSITIVE_INFINITY
    }
  } finally {
    window.clearTimeout(timer)
  }
}

export default defineNuxtPlugin(() => {
  const currentHost = window.location.hostname.toLowerCase()
  if (currentHost !== EDGE_ENTRY_HOST) return
  if (!shouldProbeEdgeRoute(window.location.pathname)) return

  void Promise.all(EDGE_TARGET_HOSTS.map(probeHost)).then((results) => {
    const targetHost = chooseEdgeHost(currentHost, results)

    if (targetHost !== currentHost) {
      window.location.replace(buildEdgeUrl(targetHost, new URL(window.location.href)))
    }
  }).catch(() => undefined)
})
