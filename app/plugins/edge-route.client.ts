import { EDGE_ROUTE_HOSTS } from '~/utils/edge-route'

export default defineNuxtPlugin(() => {
  const currentHost = window.location.hostname.toLowerCase()
  if (!EDGE_ROUTE_HOSTS.includes(currentHost as typeof EDGE_ROUTE_HOSTS[number])) return

  // Fallback cleanup when an older cached document did not run the current
  // bootstrap. Never move an active session between independent CDN origins.
  document.cookie = 'yeu_fast_edge=; Max-Age=0; Path=/; Domain=.huiliyill.cn; SameSite=Lax; Secure'
})
