import { and, eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getHeader, setHeader } from 'h3'
import { competitionPopularityVoteSchema, competitionPopularityWithdrawSchema } from '../../../shared/schemas/server'
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
  recordPopularityBallot,
  withdrawPopularityBallot
} from './service'
import { useAppDatabase } from '../../utils/database'
import {
  detectAutomatedPopularityAgent,
  hasBrowserFetchMetadata,
  hasCrossSiteFetchMetadata,
  hasMatchingPopularityDeviceCookie,
  hasPopularityDeviceCookie,
  HYBRID_FIRST_VOTE_MIN_DWELL_MS,
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
import { verifyPopularityVotePow } from '../../../shared/utils/popularity-pow'
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
  const isWechatOnlyMode = settings.authMode === 'wechat_mp'
  const isHybridMode = settings.authMode === 'hybrid'
  const maxQuota = settings.authMode === 'hybrid'
    ? Math.max(1, Number(settings.votesPerVoter) || 1) + Math.max(0, Number(settings.wechatBonusVotes ?? 2))
    : Math.max(1, Math.min(20, Number(settings.votesPerVoter) || 1))

  const ip = getClientIpAddress(event)
  const ipHash = ip === 'unknown' ? null : popularityIpHash(security.secret, ip)
  const cookiePresent = hasPopularityDeviceCookie(event)
  const userAgent = getHeader(event, 'user-agent') || ''
  const uaSummary = summarizePopularityUserAgent(userAgent)
  const envHash = popularityEnvHash(security.secret, event, input.env)
  const clientFp = input.env?.fp ? input.env.fp.trim().toLowerCase() : null
  const now = Date.now()

  const verifiedWechatTicket = input.vt ? verifyPopularityWechatTicket(security.secret, input.vt, now) : null
  const hasValidWechatTicket = Boolean(verifiedWechatTicket && verifiedWechatTicket.eventId === eventRow.id)

  // 免关注通道与公众号通道隔离限流，防止公共 Wi-Fi 下免关注严格限流误伤持 vt 加票观众。
  if (hasValidWechatTicket) {
    assertRateLimit(event, `popularity-vote-wx-ip:${ip}`, Math.max(25, maxQuota + 15), 60_000, client)
    assertRateLimit(event, `popularity-vote-wx-ip-10m:${ip}`, 90, 600_000, client)
  } else {
    assertRateLimit(event, `popularity-vote-ip:${ip}`, isHybridMode ? 5 : 6, 60_000, client)
    assertRateLimit(event, `popularity-vote-ip-10m:${ip}`, isHybridMode ? 12 : 15, 600_000, client)
  }

  let voterHash: string
  let pageTicketIdentity: string
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

  if (isWechatOnlyMode) {
    if (!hasValidWechatTicket) {
      rejectScript(
        'WECHAT_TICKET_REQUIRED',
        '请先查看大屏数字口令，向公众号发送「投票 口令」领取专属投票链接'
      )
    }
    voterOpenidHash = verifiedWechatTicket!.openIdHash
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      input.d
    )
    voterHash = identity.deviceHash
    pageTicketIdentity = verifiedWechatTicket!.openIdHash
    deviceTokenToReturn = identity.token
    assertRateLimit(event, `popularity-vote-device:${voterOpenidHash}`, Math.max(15, maxQuota + 5), 60_000, client)
  } else if (isHybridMode) {
    if (input.vt && !hasValidWechatTicket) {
      rejectScript(
        'POPULARITY_WECHAT_TICKET_INVALID',
        '你的专属投票链接已过期或无效，请回公众号重新发送「投票」领取'
      )
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
    if (hasValidWechatTicket) {
      voterOpenidHash = verifiedWechatTicket!.openIdHash
      pageTicketIdentity = verifiedWechatTicket!.openIdHash
      assertRateLimit(event, `popularity-vote-device:${voterOpenidHash}`, Math.max(15, maxQuota + 5), 60_000, client)
    } else {
      pageTicketIdentity = identity.deviceHash
      assertRateLimit(event, `popularity-vote-device:${voterHash}`, 10, 60_000, client)
    }
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
    pageTicketIdentity = identity.deviceHash
    deviceTokenToReturn = identity.token
    qrNonce = token.nonce || null
    qrAgeMs = token.issuedAt != null ? Math.max(0, now - token.issuedAt) : null
    assertRateLimit(event, `popularity-vote-device:${voterHash}`, Math.max(15, maxQuota + 5), 60_000, client)
  }

  const botReason = detectAutomatedPopularityAgent(userAgent)
  if (botReason) {
    rejectScript(botReason, '请在微信或手机浏览器中打开投票页面')
  }

  if (options.requireBrowserOrigin !== false && hasCrossSiteFetchMetadata(event)) {
    rejectScript('CROSS_SITE_FETCH', '非法跨站投票请求，请直接在页面内点击投票')
  }

  if (isWechatOnlyMode) {
    const hasSessionToken = options.allowSessionTokenIdentity === true && Boolean(input.d)
    if (!cookiePresent && !hasSessionToken) {
      rejectScript('MISSING_DEVICE_COOKIE', '浏览器未保留投票会话 Cookie，请确认开启 Cookie 后刷新重试')
    }
  } else if (isHybridMode && hasValidWechatTicket) {
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
    pageTicketIdentity,
    input.revision,
    now
  )
  if (!pageTicket) {
    rejectScript('MISSING_OR_INVALID_PAGE_TICKET', '页面投票凭证已过期，请刷新页面后重试')
  }

  const isGuestFirstVote = !hasValidWechatTicket && options.requireBrowserOrigin !== false
  if (isGuestFirstVote && !verifyPopularityVotePow(input.pageTicket!, input.singerId, input.pow)) {
    rejectScript('INVALID_VOTE_PROOF', '投票安全校验未通过，请刷新页面后重新点击投票')
  }

  const dwellMs = Math.max(0, now - pageTicket!.issuedAt)
  const minDwellMs = isGuestFirstVote && isHybridMode ? HYBRID_FIRST_VOTE_MIN_DWELL_MS : POPULARITY_MIN_DWELL_MS
  if (dwellMs < minDwellMs) {
    rejectScript('TOO_FAST_SUBMIT', '操作过快，请确认选手后重新点击投票', dwellMs)
  }

  const state = recordPopularityBallot(
    client,
    eventRow.id,
    isWechatOnlyMode ? (voterOpenidHash ?? voterHash) : voterHash,
    input.singerId,
    input.revision,
    ipHash,
    {
      uaSummary,
      envHash,
      clientFp,
      dwellMs,
      cookiePresent,
      qrNonce,
      qrAgeMs,
      qrRotateSeconds: settings.qrRotateSeconds,
      missingFetchMeta: !hasBrowserFetchMetadata(event),
      voterOpenidHash,
      webdriver: input.env?.wd === true,
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
    pageTicketIdentity,
    state.revision
  )
  return { ...state, deviceToken: deviceTokenToReturn, pageTicket: nextTicket }
}

/**
 * 撤回自己刚投出的选票：只要设备/微信身份，不需要页面票据与停留时长；
 * 撤回后可以重新投票，改票次数不返还。多票模式必须指明 singerId。
 */
export async function handlePopularityWithdraw(
  event: H3Event,
  options: PopularityVoteOptions = {}
): Promise<Record<string, unknown>> {
  setHeader(event, 'Cache-Control', 'no-store')
  if (options.requireBrowserOrigin !== false) assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionPopularityWithdrawSchema)
  const security = getSecurityConfig(event)

  const eventRow = ensureCompetitionEvent(client, findMusicAssociationContent(client).id)
  const settings = getPopularitySettings(client, eventRow.id)
  const isWechatOnlyMode = settings.authMode === 'wechat_mp'
  const isHybridMode = settings.authMode === 'hybrid'
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `popularity-withdraw-ip:${ip}`, 30, 60_000, client)

  const now = Date.now()
  let voterHash: string
  let pageTicketIdentity: string
  let voterOpenidHash: string | null = null
  let deviceTokenToReturn: string | undefined

  if (isWechatOnlyMode) {
    const wechatTicket = input.vt ? verifyPopularityWechatTicket(security.secret, input.vt, now) : null
    if (!wechatTicket || wechatTicket.eventId !== eventRow.id) {
      throw createError({
        statusCode: 403,
        message: '请从公众号专属链接进入后再取消投票',
        data: {
          code: 'WECHAT_TICKET_REQUIRED',
          message: '请从公众号专属链接进入后再取消投票'
        }
      })
    }
    voterHash = wechatTicket.openIdHash
    pageTicketIdentity = wechatTicket.openIdHash
    voterOpenidHash = wechatTicket.openIdHash
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      input.d
    )
    deviceTokenToReturn = identity.token
  } else if (isHybridMode) {
    const identity = resolvePopularityDevice(
      event,
      security.secret,
      security.secureCookies,
      eventRow.id,
      input.d
    )
    voterHash = identity.deviceHash
    deviceTokenToReturn = identity.token
    const wechatTicket = input.vt ? verifyPopularityWechatTicket(security.secret, input.vt, now) : null
    if (wechatTicket && wechatTicket.eventId === eventRow.id) {
      voterOpenidHash = wechatTicket.openIdHash
      pageTicketIdentity = wechatTicket.openIdHash
    } else {
      pageTicketIdentity = identity.deviceHash
    }
  } else {
    const token = input.token ? verifyPopularityToken(security.secret, input.token) : null
    if (!token || token.eventId !== eventRow.id) {
      throw createError({
        statusCode: 403,
        message: '二维码已过期，请扫大屏上的新码',
        data: { code: 'POPULARITY_TOKEN_INVALID', message: '二维码已过期，请扫大屏上的新码' }
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
    pageTicketIdentity = identity.deviceHash
    deviceTokenToReturn = identity.token
  }

  const state = withdrawPopularityBallot(client, eventRow.id, voterHash, {
    singerId: input.singerId ?? null,
    voterOpenidHash,
    now
  })
  // 取消后版本号会变，旧 pageTicket 立即失效；这里直接补一张新的，页面才能接着重投。
  const nextTicket = issuePopularityPageTicket(
    security.secret,
    eventRow.id,
    pageTicketIdentity,
    state.revision
  )
  return { ...state, deviceToken: deviceTokenToReturn, pageTicket: nextTicket }
}
