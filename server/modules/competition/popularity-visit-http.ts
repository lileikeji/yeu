import type { H3Event } from 'h3'
import { getCookie, getHeader, setCookie } from 'h3'
import { competitionPopularityVisitSchema, competitionPopularityVisitQuerySchema } from '../../../shared/schemas/server'
import type { DatabaseClient } from '../../database/client'
import {
  POPULARITY_VISIT_COOKIE,
  getPopularityVisitReport,
  recordPopularityVisit,
  resolvePopularityVisitorKey,
  type PopularityVisitRange
} from './popularity-visits'
import { ensureCompetitionEvent, findMusicAssociationContent, getPopularitySettings } from './service'
import { verifyPopularityWechatTicket } from '../../utils/competition-popularity'
import { getClientIpAddress } from '../../utils/client-ip'
import { useAppDatabase } from '../../utils/database'
import { resolveGeoLocation } from '../../utils/geoip'
import { assertRateLimit } from '../../utils/rate-limit'
import { assertTrustedOrigin, getSecurityConfig } from '../../utils/security'
import { parseBody, parseQuery } from '../../utils/validation'

function currentEvent(client: DatabaseClient) {
  const contentId = findMusicAssociationContent(client).id
  return ensureCompetitionEvent(client, contentId)
}

/**
 * 页面埋点：打开投票页/大屏/小程序时打一发，服务端把 UA 拆成设备、系统、浏览器并判定来源。
 * 这是后台访问日志的唯一写入口，投票与刷新接口不接受这类数据。
 */
export async function handlePopularityVisit(event: H3Event, options: { requireBrowserOrigin?: boolean } = {}) {
  if (options.requireBrowserOrigin !== false) assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionPopularityVisitSchema)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-visit:${ip}`, 90, 60_000, client)

  const eventRow = currentEvent(client)
  const settings = getPopularitySettings(client, eventRow.id)
  if (!settings.enabled) return { ok: true, skipped: 'disabled' }

  const security = getSecurityConfig(event)
  const hasTicket = Boolean(input.vt && verifyPopularityWechatTicket(security.secret, input.vt))
  const visitorKey = resolvePopularityVisitorKey(getCookie(event, POPULARITY_VISIT_COOKIE), (key) => {
    setCookie(event, POPULARITY_VISIT_COOKIE, key, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax'
    })
  })
  const geo = resolveGeoLocation(event, ip)

  recordPopularityVisit(client, {
    eventId: eventRow.id,
    page: input.page,
    source: input.page === 'miniapp' ? 'miniapp' : hasTicket ? 'wechat' : 'direct',
    hasTicket,
    ip,
    country: geo.country ?? '',
    region: geo.region ?? '',
    city: geo.city ?? '',
    userAgent: getHeader(event, 'user-agent') || '',
    referer: getHeader(event, 'referer') || '',
    visitorKey
  })

  return { ok: true }
}

/** 后台报表：累计口径 + 区间明细一次拉齐。 */
export function readPopularityVisits(event: H3Event, client: DatabaseClient) {
  const eventRow = currentEvent(client)
  const query = parseQuery(event, competitionPopularityVisitQuerySchema)
  return getPopularityVisitReport(client, eventRow.id, {
    range: query.range as PopularityVisitRange | undefined,
    source: query.source,
    onlyWechat: query.onlyWechat,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize
  })
}
