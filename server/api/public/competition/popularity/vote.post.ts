import { competitionPopularityVoteSchema } from '../../../../../shared/schemas/server'
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
  hasMatchingPopularityDeviceCookie,
  hasPopularityDeviceCookie,
  issuePopularityPageTicket,
  POPULARITY_MIN_DWELL_MS,
  popularityEnvHash,
  popularityIpHash,
  resolvePopularityDevice,
  summarizePopularityUserAgent,
  verifyPopularityPageTicket,
  verifyPopularityToken
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
  const token = verifyPopularityToken(security.secret, input.token)
  if (!token) {
    throw createError({
      statusCode: 403,
      message: '二维码已过期，请扫大屏上的新码',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
    })
  }

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  if (token.eventId !== eventRow.id) {
    throw createError({
      statusCode: 403,
      message: '二维码不属于当前赛事',
      data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码不属于当前赛事' }
    })
  }

  const ip = getClientIpAddress(event)
  const ipHash = ip === 'unknown' ? null : popularityIpHash(security.secret, ip)
  const cookiePresent = hasPopularityDeviceCookie(event)
  const identity = resolvePopularityDevice(
    event,
    security.secret,
    security.secureCookies,
    eventRow.id,
    input.d
  )
  assertRateLimit(event, `popularity-vote-ip:${ip}`, 20, 60_000, client)
  assertRateLimit(event, `popularity-vote-ip-10m:${ip}`, 60, 600_000, client)
  assertRateLimit(event, `popularity-vote-device:${identity.deviceHash}`, 15, 60_000, client)

  const userAgent = getHeader(event, 'user-agent') || ''
  const uaSummary = summarizePopularityUserAgent(userAgent)
  const envHash = popularityEnvHash(security.secret, event, input.env)
  const now = Date.now()
  const qrNonce = token.nonce || null
  const qrAgeMs = token.issuedAt != null ? Math.max(0, now - token.issuedAt) : null

  const rejectScript = (blockCode: string, message: string, dwellMs: number | null = null): never => {
    recordBlockedPopularityAttempt(client, eventRow.id, {
      blockCode,
      deviceHash: identity.deviceHash,
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

  const botReason = detectAutomatedPopularityAgent(userAgent)
  if (botReason) {
    rejectScript(botReason, '请在微信或手机浏览器中打开投票页面')
  }

  if (!hasMatchingPopularityDeviceCookie(event, security.secret, identity.deviceHash)) {
    rejectScript('MISSING_DEVICE_COOKIE', '浏览器未保留投票会话 Cookie，请确认开启 Cookie 后刷新重试')
  }

  const pageTicket = verifyPopularityPageTicket(
    security.secret,
    input.pageTicket,
    eventRow.id,
    identity.deviceHash,
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

  const settings = getPopularitySettings(client, eventRow.id)
  const state = recordPopularityBallot(
    client,
    eventRow.id,
    identity.deviceHash,
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
      qrRotateSeconds: settings.qrRotateSeconds
    }
  )

  const aiConfig = inspectorConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>)
  const autoTask = maybeTriggerAutoPopularityInspection(client, eventRow.id, aiConfig)
  if (autoTask) {
    event.waitUntil(autoTask)
  }

  const nextTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    identity.deviceHash,
    state.myBallot?.version ?? 0
  )
  return { ...state, deviceToken: identity.token, pageTicket: nextTicket }
})
