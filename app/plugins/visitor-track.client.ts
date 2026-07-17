export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return

  const router = useRouter()
  let lastKey = ''
  let lastAt = 0
  let queue: Promise<void> = Promise.resolve()

  async function sendTrack(action: string, path: string, meta?: Record<string, unknown>) {
    try {
      await $fetch('/api/public/track', {
        method: 'POST',
        body: {
          action,
          path,
          meta
        },
        credentials: 'include'
      })
    } catch {
      // non-fatal
    }
  }

  function trackPage(path: string) {
    const now = Date.now()
    const key = path
    if (key === lastKey && now - lastAt < 2500) return
    lastKey = key
    lastAt = now
    queue = queue.then(() => sendTrack('page_view', path)).catch(() => undefined)
  }

  router.isReady().then(() => {
    trackPage(router.currentRoute.value.fullPath)
  }).catch(() => undefined)

  nuxtApp.hook('page:finish', () => {
    trackPage(router.currentRoute.value.fullPath)
  })
})
