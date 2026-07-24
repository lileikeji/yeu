export const EDGE_HOSTS = [
  'yeu.huiliyill.cn',
  'cn.yeu.huiliyill.cn'
] as const

export const EDGE_PROBE_TIMEOUT_MS = 2_800
export const EDGE_SWITCH_ADVANTAGE_MS = 250
export const EDGE_STICKY_SECONDS = 300

const EDGE_EXCLUDED_PREFIXES = [
  '/admin',
  '/api',
  '/chat',
  '/feedback',
  '/login',
  '/me'
]

export type EdgeProbeResult = {
  host: string
  reachable: boolean
  durationMs: number
}

export function shouldProbeEdgeRoute(pathname: string) {
  return !EDGE_EXCLUDED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function chooseEdgeHost(
  currentHost: string,
  results: EdgeProbeResult[],
  minimumAdvantageMs = EDGE_SWITCH_ADVANTAGE_MS
) {
  const current = results.find(result => result.host === currentHost)
  const reachable = results
    .filter(result => result.reachable)
    .sort((left, right) => left.durationMs - right.durationMs)

  const fastest = reachable[0]
  if (!fastest) return currentHost
  if (!current?.reachable) return fastest.host
  if (fastest.host === currentHost) return currentHost

  return fastest.durationMs + minimumAdvantageMs < current.durationMs
    ? fastest.host
    : currentHost
}

export function buildEdgeUrl(targetHost: string, currentUrl: URL) {
  const next = new URL(currentUrl.toString())
  next.hostname = targetHost
  next.port = ''
  next.protocol = 'https:'
  return next.toString()
}
