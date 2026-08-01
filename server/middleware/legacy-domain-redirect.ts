import { getRequestHeader, getRequestURL, sendRedirect } from 'h3'

const LEGACY_HOST = 'yeu.huiliyill.cn'
const CANONICAL_ORIGIN = 'https://yx.huiliyill.cn'

/** Retire the old public hostname before Nuxt renders any page or API response. */
export default defineEventHandler((event) => {
  const host = String(getRequestHeader(event, 'host') || '').split(':')[0]?.toLocaleLowerCase('en-US') || ''
  if (host !== LEGACY_HOST) return

  const url = getRequestURL(event)
  return sendRedirect(event, `${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301)
})
