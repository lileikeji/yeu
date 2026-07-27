export const EDGE_ROUTE_BOOTSTRAP_SCRIPT = String.raw`
(() => {
  const hosts = ['yeu.huiliyill.cn', 'cn.yeu.huiliyill.cn', 'global.yeu.huiliyill.cn']
  const current = location.hostname.toLowerCase()
  window.__YEU_EDGE_ROUTED__ = true

  if (!hosts.includes(current)) return

  // Each CDN hostname is an independent, stable entry point. Remove the old
  // shared preference so a transient edge result cannot move a later visit to
  // another provider for several minutes.
  document.cookie = 'yeu_fast_edge=; Max-Age=0; Path=/; Domain=.huiliyill.cn; SameSite=Lax; Secure'

  const url = new URL(location.href)
  if (url.searchParams.delete('_yeu_edge_routed')) {
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
})()
`
