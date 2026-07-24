export const EDGE_ROUTE_HOSTS = [
  'yeu.huiliyill.cn',
  'cn.yeu.huiliyill.cn',
  'global.yeu.huiliyill.cn'
] as const

export const EDGE_PROBE_TIMEOUT_MS = 700

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
  results: EdgeProbeResult[]
) {
  const reachableTargets = results
    .filter(result => EDGE_ROUTE_HOSTS.includes(result.host as typeof EDGE_ROUTE_HOSTS[number]))
    .filter(result => result.reachable)
    .sort((left, right) => left.durationMs - right.durationMs)

  return reachableTargets[0]?.host ?? currentHost
}

export function buildEdgeUrl(targetHost: string, currentUrl: URL) {
  const next = new URL(currentUrl.toString())
  next.hostname = targetHost
  next.port = ''
  next.protocol = 'https:'
  return next.toString()
}
