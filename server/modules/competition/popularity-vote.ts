import { and, eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getHeader, setHeader } from 'h3'
import { competitionPopularityVoteSchema } from '../../../shared/schemas/server'
import { competitionPopularityBallots } from '../../database/schema'
import { recordBlockedPopularityAttempt } from './popularity-guard'
import {
  inspectorConfigFromValues,
  maybeTriggerAutoPopularityInspection
} from './popularity-inspector'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularitySettings,
  recordPopularityBallot
} from './service'
import { useAppDatabase } from '../../utils/database'
import {
  detectAutomatedPopularityAgent,
  hasBrowserFetchMetadata,
  hasMatchingPopularityDeviceCookie,
  hasPopularityDeviceCookie,
  issuePopularityPageTicket,
  POPULARITY_MIN_DWELL_MS,
  popularityEnvHash,
  popularityIpHash,
  resolvePopularityDevice,
  summarizePopularityUserAgent,
  verifyPopularityPageTicket,
  verifyPopularityToken,
  verifyPopularityWechatTicket
} from '../../utils/competition-popularity'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { getSecurityConfig, assertTrustedOrigin } from '../../utils/security'
import { parseBody } from '../../utils/validation'

export interface PopularityVoteOptions {
  /** 小程序原生请求没有 Origin/Referer，由路由层保证来源白名单。 */
  requireBrowserOrigin?: boolean
  /** 小程序没有 Cookie 罐，服务端签发的 d 令牌可代替会话 Cookie。 */
  allowSessionTokenIdentity?: boolean
}

/**
 * 投票写入的唯一入口：网页 H5 与小程序共用同一套前置拦截、评分与落库逻辑。
 * 两道门（pageTicket、停留时长）与微信身份票据都在这里校验，路由层不得绕过。
 */
export async function handlePopularityVote(
  event: H3Event,
  options: PopularityVoteOptions = {}
): Promise<Record<string, unknown>> {
  setHeader(event, 'Cache-Control', 'no-store')
  if (options.requireBrowserOrigin !== false) assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionPopularityVoteSchema)
  const security = getSecurityConfig(event)

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  const isWechatMode = settings.authMode === 'wechat_mp'
  const votesPerVoter = Math.max(1, Math.min(20, Number(settings.votesPerVoter) || 1))

  const ip = getClientIpAddress(event)
  const ipHash = ip === 'unknown' ? null : popularityIpHash(security.secret, ip)
  const cookiePresent = hasPopularityDeviceCookie(event)
  const userAgent = getHeader(event, 'user-agent') || ''
  const uaSummary = summarizePopularityUserAgent(userAgent)
  const envHash = popularityEnvHash(security.secret, event, input.env)
  const now = Date.now()

  assertRateLimit(event, `popularity-vote-ip:${ip}`, isWechatMode ? Math.max(20, votesPerVoter + 10) : 6, 60_000, client)
  assertRateLimit(event, `popularity-vote-ip-10m:${ip}`, isWechatMode ? 60 : 15, 600_000, client)

  let voterHash = ''
  let voterOpenidHash: string | null = null
  let deviceTokenToReturn: string | undefined
  let qrNonce: string | null = null
  let qrAgeMs: number | null = null

  const rejectScript = (
    blockCode: string,
    message: string,
    dwellMs: number | null = null,
    logDeviceHash = voterHash || ipHash || 'anon-device'
  ): never => {
    recordBlockedPopularityAttempt(client, eventRow.id, {
      blockCode,
      deviceHash: logDeviceHash,
      ipHash,
      envHash,
      qrNonce,
      singerId: input.singerId,
      uaSummary,
      cookiePresent,
      dwellMs
    })
    throw createError({
      statusCode: 403,
      message,
      data: { code: 'POPULARITY_SCRIPT_BLOCKED', blockCode, message }
    })
  }

  if (isWechatMode) {
    const wechatTicket = input.vt ? verifyPopularityWechatTicket(security.secret, input.vt, now) : null
    if (!wechatTicket || wechatTicket.eventId !== eventRow.id) {
      rejectScript(
        'WECHAT_TICKET_REQUIRED',
        '请先查看大屏数字口令，向公众号发送「投票 口令」领取专属投票链接'
      )
    }
    voterHash = wechatTicket!.openIdHash
    voterOpenidHash = wechatTicket!.openIdHash
    assertRateLimit(event, `popularity-vote-device:${voterHash}`, Math.max(15, votesPerVoter + 5), 60_000, client)
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      input.d
    )
    deviceTokenToReturn = identity.token
  } else {
    const token = input.token ? verifyPopularityToken(security.secret, input.token) : null
    if (!token) {
      throw createError({
        statusCode: 403,
        message: '二维码已过期，请扫大屏上的新码',
        data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
      })
    }
    if (token.eventId !== eventRow.id) {
      throw createError({
        statusCode: 403,
        message: '二维码不属于当前赛事',
        data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码不属于当前赛事' }
      })
    }
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      input.d
    )
    voterHash = identity.deviceHash
    deviceTokenToReturn = identity.token
    qrNonce = token.nonce || null
    qrAgeMs = token.issuedAt != null ? Math.max(0, now - token.issuedAt) : null
    assertRateLimit(event, `popularity-vote-device:${voterHash}`, Math.max(15, votesPerVoter + 5), 60_000, client)
  }

  const botReason = detectAutomatedPopularityAgent(userAgent)
  if (botReason) {
    rejectScript(botReason, '请在微信或手机浏览器中打开投票页面')
  }

  if (isWechatMode) {
    const hasSessionToken = options.allowSessionTokenIdentity === true && Boolean(input.d)
    if (!cookiePresent && !hasSessionToken) {
      rejectScript('MISSING_DEVICE_COOKIE', '浏览器未保留投票会话 Cookie，请确认开启 Cookie 后刷新重试')
    }
  } else if (!hasMatchingPopularityDeviceCookie(event, security.secret, voterHash)) {
    rejectScript('MISSING_DEVICE_COOKIE', '浏览器未保留投票会话 Cookie，请确认开启 Cookie 后刷新重试')
  }

  const pageTicket = verifyPopularityPageTicket(
    security.secret,
    input.pageTicket,
    eventRow.id,
    voterHash,
    input.revision,
    now
  )
  if (!pageTicket) {
    rejectScript('MISSING_OR_INVALID_PAGE_TICKET', '页面投票凭证已过期，请刷新页面后重试')
  }

  const dwellMs = Math.max(0, now - pageTicket!.issuedAt)
  if (dwellMs < POPULARITY_MIN_DWELL_MS) {
    rejectScript('TOO_FAST_SUBMIT', '操作过快，请确认选手后重新点击投票', dwellMs)
  }

  const state = recordPopularityBallot(
    client,
    eventRow.id,
    voterHash,
    input.singerId,
    input.revision,
    ipHash,
    {
      uaSummary,
      envHash,
      dwellMs,
      cookiePresent,
      qrNonce,
      qrAgeMs,
      qrRotateSeconds: settings.qrRotateSeconds,
      missingFetchMeta: !hasBrowserFetchMetadata(event),
      voterOpenidHash,
      now
    }
  )

  const ballotRows = client.db.select({
    quarantined: competitionPopularityBallots.quarantined,
    voided: competitionPopularityBallots.voided
  })
    .from(competitionPopularityBallots)
    .where(and(
      eq(competitionPopularityBallots.eventId, eventRow.id),
      voterOpenidHash
        ? or(
            eq(competitionPopularityBallots.voterOpenidHash, voterOpenidHash),
            eq(competitionPopularityBallots.deviceHash, voterHash)
          )
        : eq(competitionPopularityBallots.deviceHash, voterHash)
    ))
    .all()
  const hasNewQuarantined = ballotRows.some(row => (
    Number(row.quarantined) === 1 && Number(row.voided) === 0
  ))

  const aiConfig = inspectorConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>)
  const autoTask = maybeTriggerAutoPopularityInspection(client, eventRow.id, aiConfig, {
    hasNewQuarantined
  })
  if (autoTask) {
    event.waitUntil(autoTask)
  }

  const nextTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    voterHash,
    state.revision
  )
  return { ...state, deviceToken: deviceTokenToReturn, pageTicket: nextTicket }
}
