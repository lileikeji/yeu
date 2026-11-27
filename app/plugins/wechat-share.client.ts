import { DEFAULT_SHARE_ICON_PATH, stripEphemeralShareParams } from '~~/shared/config/brand'
import { captureWechatEntryUrl, useWechatShareCard } from '~/composables/useWechatShareCard'

function metaContent(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || ''
}

export default defineNuxtPlugin((nuxtApp) => {
  captureWechatEntryUrl()
  const route = useRoute()
  const { configureWechatShare } = useWechatShareCard()
  let scheduleVersion = 0
  let lastScheduledRouteKey: string | null = null

  function scheduleShareConfiguration(): void {
    const routeKey = route.fullPath
    if (lastScheduledRouteKey === routeKey) return
    lastScheduledRouteKey = routeKey
    const version = ++scheduleVersion
    void nextTick(async () => {
      // Head tags can be updated one tick after a route transition.
      await nextTick()
      if (version !== scheduleVersion) return

      const title = metaContent('meta[property="og:title"]') || document.title
      const description = metaContent('meta[property="og:description"]')
        || metaContent('meta[name="description"]')
      const image = metaContent('meta[property="og:image"]')
        || metaContent('meta[itemprop="image"]')
        || DEFAULT_SHARE_ICON_PATH
      await configureWechatShare({
        title,
        description,
        imageUrl: image,
        link: stripEphemeralShareParams(`${window.location.origin}${route.fullPath}`, window.location.origin)
      })
    })
  }

  nuxtApp.hook('app:mounted', scheduleShareConfiguration)
  nuxtApp.hook('page:finish', scheduleShareConfiguration)
})
