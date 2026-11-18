import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { resolveGeoLocation } from '../../../utils/geoip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { applyYeucaCors, assertYeucaPostOrigin } from '../../../utils/yeuca-cors'
import {
  recordYeucaVisit,
  resolveYeucaVisitorId
} from '../../../modules/yeuca/visit-service'

/**
 * 官网页面浏览埋点。站点是静态页，nginx 直出，只有这个接口能拿到真实来源 IP，
 * 所以 PV/UV 靠它记，反爬的线索也主要来自这里。
 * 只收三个字段，多传的一律忽略，避免被当成写库跳板。
 */
export default defineEventHandler(async (event) => {
  applyYeucaCors(event)
  assertYeucaPostOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `public-yeuca-track:${ip}`, 240, 60 * 1000, client)

  // sendBeacon 只能发简单请求，前端用 text/plain 把 JSON 塞成字符串，
  // 这里两种形态都收，字段仍然是白名单里的两个。
  const raw = await readBody(event).catch(() => null)
  const body = typeof raw === 'string'
    ? safeParseJson(raw)
    : (raw as { path?: unknown; referer?: unknown } | null)

  const path = typeof body?.path === 'string' ? body.path : '/'
  const referer = typeof body?.referer === 'string' ? body.referer : ''
  const geo = resolveGeoLocation(event, ip)

  recordYeucaVisit(client, {
    action: 'page_view',
    path,
    method: 'GET',
    status: 200,
    referer,
    origin: getHeader(event, 'origin') || '',
    userAgent: getHeader(event, 'user-agent') || '',
    ip,
    visitorId: resolveYeucaVisitorId(event),
    country: geo.country,
    region: geo.region,
    city: geo.city
  })

  return { ok: true }
})

function safeParseJson(raw: string): { path?: unknown; referer?: unknown } | null {
  if (!raw || raw.length > 2048) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as { path?: unknown; referer?: unknown } : null
  } catch {
    return null
  }
}
