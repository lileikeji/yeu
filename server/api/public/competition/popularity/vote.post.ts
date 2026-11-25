import { and, eq, or } from 'drizzle-orm'
import { competitionPopularityVoteSchema } from '../../../../../shared/schemas/server'
import { competitionPopularityBallots } from '../../../../database/schema'
import { recordBlockedPopularityAttempt } from '../../../../modules/competition/popularity-guard'
import {
  inspectorConfigFromValues,
  maybeTriggerAutoPopularityInspection
} from '../../../../modules/competition/popularity-inspector'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularitySettings,
  recordPopularityBallot
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
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
} from '../../../../utils/competition-popularity'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { getSecurityConfig, assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'
import { getHeader, setHeader } from 'h3'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionPopularityVoteSchema)
  const security = getSecurityConfig(event)

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  const isWechatMode = settings.authMode === 'wechat_mp'

  const ip = getClientIpAddress(event)
  const ipHash = ip === 'unknown' ? null : popularityIpHash(security.secret, ip)
  const cookiePresent = hasPopularityDeviceCookie(event)
  const userAgent = getHeader(event, 'user-agent') || ''
  const uaSummary = summarizePopularityUserAgent(userAgent)
  const envHash = popularityEnvHash(security.secret, event, input.env)
  const now = Date.now()

  assertRateLimit(event, `popularity-vote-ip:${ip}`, isWechatMode ? 20 : 6, 60_000, client)
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
    assertRateLimit(event, `popularity-vote-device:${voterHash}`, 15, 60_000, client)
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
    assertRateLimit(event, `popularity-vote-device:${voterHash}`, 15, 60_000, client)
  }

  const botReason = detectAutomatedPopularityAgent(userAgent)
  if (botReason) {
    rejectScript(botReason, '请在微信或手机浏览器中打开投票页面')
  }

  if (isWechatMode) {
    if (!cookiePresent) {
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

  const ballotRow = client.db.select({ quarantined: competitionPopularityBallots.quarantined })
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
    .get()
  const hasNewQuarantined = Number(ballotRow?.quarantined ?? 0) === 1

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
    state.myBallot?.version ?? 0
  )
  return { ...state, deviceToken: deviceTokenToReturn, pageTicket: nextTicket }
})
