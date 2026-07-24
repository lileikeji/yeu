import {
  buildEdgeUrl,
  chooseEdgeHost,
  EDGE_HOSTS,
  EDGE_PROBE_TIMEOUT_MS,
  EDGE_STICKY_SECONDS,
  shouldProbeEdgeRoute,
  type EdgeProbeResult
} from '~/utils/edge-route'

const STICKY_COOKIE = 'yeu_edge_route'

function readStickyHost() {
  const prefix = `${STICKY_COOKIE}=`
  const value = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length)

  return value ? decodeURIComponent(value) : ''
}

function rememberHost(host: string) {
  document.cookie = `${STICKY_COOKIE}=${encodeURIComponent(host)}; Max-Age=${EDGE_STICKY_SECONDS}; Path=/; Domain=.huiliyill.cn; Secure; SameSite=Lax`
}

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
  if (!EDGE_HOSTS.includes(currentHost as typeof EDGE_HOSTS[number])) return
  if (!shouldProbeEdgeRoute(window.location.pathname)) return

  const stickyHost = readStickyHost()
  if (stickyHost && EDGE_HOSTS.includes(stickyHost as typeof EDGE_HOSTS[number])) return

  void Promise.all(EDGE_HOSTS.map(probeHost)).then((results) => {
    const targetHost = chooseEdgeHost(currentHost, results)
    rememberHost(targetHost)

    if (targetHost !== currentHost) {
      window.location.replace(buildEdgeUrl(targetHost, new URL(window.location.href)))
    }
  }).catch(() => {
    rememberHost(currentHost)
  })
})
