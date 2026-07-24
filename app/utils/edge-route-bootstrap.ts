export const EDGE_ROUTE_BOOTSTRAP_SCRIPT = String.raw`
(() => {
  const hosts = ['yeu.huiliyill.cn', 'cn.yeu.huiliyill.cn', 'global.yeu.huiliyill.cn']
  const excluded = ['/admin', '/api', '/chat', '/feedback', '/login', '/me']
  const current = location.hostname.toLowerCase()
  window.__YEU_EDGE_ROUTED__ = true

  if (!hosts.includes(current)) return
  if (excluded.some(prefix => location.pathname === prefix || location.pathname.startsWith(prefix + '/'))) return

  const marker = '_yeu_edge_routed'
  const url = new URL(location.href)
  if (url.searchParams.has(marker)) {
    url.searchParams.delete(marker)
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    return
  }

  const cookieName = 'yeu_fast_edge'
  const cached = document.cookie.split('; ').find(item => item.startsWith(cookieName + '='))
  const cachedHost = cached ? decodeURIComponent(cached.slice(cookieName.length + 1)) : ''
  if (hosts.includes(cachedHost) && cachedHost !== current) {
    url.hostname = cachedHost
    url.protocol = 'https:'
    url.port = ''
    url.searchParams.set(marker, '1')
    location.replace(url.toString())
    return
  }

  const timeoutMs = 650
  const probe = host => new Promise(resolve => {
    const started = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      resolve({ host, reachable: false, durationMs: Infinity })
    }, timeoutMs)

    fetch('https://' + host + '/api/health?edge_probe=' + Date.now(), {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'no-cors',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    }).then(() => {
      clearTimeout(timer)
      resolve({ host, reachable: true, durationMs: performance.now() - started })
    }).catch(() => {
      clearTimeout(timer)
      resolve({ host, reachable: false, durationMs: Infinity })
    })
  })

  Promise.all(hosts.map(probe)).then(results => {
    const reachable = results
      .filter(result => result.reachable)
      .sort((left, right) => left.durationMs - right.durationMs)
    const best = reachable[0] && reachable[0].host
    if (!best) return

    document.cookie = cookieName + '=' + encodeURIComponent(best)
      + '; Max-Age=180; Path=/; Domain=.huiliyill.cn; SameSite=Lax; Secure'
    if (best === current) return

    url.hostname = best
    url.protocol = 'https:'
    url.port = ''
    url.searchParams.set(marker, '1')
    location.replace(url.toString())
  }).catch(() => undefined)
})()
`
