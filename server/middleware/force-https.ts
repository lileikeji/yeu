import { getRequestHeader, getRequestURL, sendRedirect } from 'h3'
import { forceHttpsEnabled, shouldRedirectToHttps } from '../utils/force-https'

/**
 * Optional app-level HTTP -> HTTPS redirect (defense in depth).
 * Prefer terminating TLS and redirecting at Nginx; enable this when the edge
 * still forwards cleartext with X-Forwarded-Proto: http.
 *
 * Set NUXT_FORCE_HTTPS=true (or FORCE_HTTPS=true) in production .env.
 */
export default defineEventHandler((event) => {
  if (!forceHttpsEnabled()) return

  const url = getRequestURL(event)
  const decision = shouldRedirectToHttps({
    forceHttps: true,
    forwardedProto: getRequestHeader(event, 'x-forwarded-proto'),
    requestProtocol: url.protocol.replace(/:$/, ''),
    host: getRequestHeader(event, 'host'),
    pathname: url.pathname,
    search: url.search
  })

  if (decision.redirect) {
    return sendRedirect(event, decision.location, 301)
  }
})
