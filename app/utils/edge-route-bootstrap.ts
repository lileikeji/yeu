export const EDGE_ROUTE_BOOTSTRAP_SCRIPT = String.raw`
(() => {
  const hosts = ['yx.huiliyill.cn']
  const current = location.hostname.toLowerCase()
  window.__YEU_EDGE_ROUTED__ = true

  if (!hosts.includes(current)) return

  // Clear routing state left by the retired multi-CDN setup. The site now has
  // one canonical public hostname and never probes or redirects to alternates.
  document.cookie = 'yeu_fast_edge=; Max-Age=0; Path=/; Domain=.huiliyill.cn; SameSite=Lax; Secure'

  const url = new URL(location.href)
  if (url.searchParams.delete('_yeu_edge_routed')) {
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
})()
`
