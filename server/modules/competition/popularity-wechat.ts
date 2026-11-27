import type { DatabaseClient } from '../../database/client'
import {
  issuePopularityWechatTicket,
  popularityOpenIdHash,
  verifyPopularityWechatPasscode
} from '../../utils/competition-popularity'
import {
  ensureCompetitionEvent,
  findMusicAssociationContent,
  getPopularitySettings,
  getPopularityAdminState
} from './service'
import { recordPopularityFollow } from './popularity-visits'

const VOTE_COMMAND_PATTERN = /^(?:人气奖?投票|歌手投票|投票|人气|tp)(?:[\s:：+-]*(\d{2,4}))?$/i

export interface WechatMpPopularityReplyInput {
  fromUserName: string
  content: string
  siteOrigin: string
  secret: string
  now?: number
}

function popularityTicketSummary(settings: ReturnType<typeof getPopularitySettings>): string {
  if (settings.authMode === 'hybrid') {
    const base = Math.max(1, Number(settings.votesPerVoter) || 1)
    const bonus = Math.max(0, Number(settings.wechatBonusVotes ?? 2))
    const total = base + bonus
    const repeat = settings.allowRepeatVote !== false ? '可全投同一位选手' : '每位选手限 1 票'
    return `关注公众号共可投 ${total} 票（含免关注 ${base} 票 + 关注额外 ${bonus} 票，${repeat}；45 分钟内有效，请勿转发他人）。`
  }
  return '一人一微信号一票（45 分钟内有效，请勿转发他人）。'
}

/**
 * 解析公众号内的人气奖口令领票消息：
 * - 非投票口令返回 null，交还原本的 AI 校园助手；
 * - 命中口令时按 60 秒轮换的 2 位数字核验，为该微信 OpenID 签发唯一一次性专属链接 `vt`。
 */
export function handleWechatMpPopularityMessage(
  client: DatabaseClient,
  input: WechatMpPopularityReplyInput
): string | null {
  const text = input.content.trim()
  const match = VOTE_COMMAND_PATTERN.exec(text)
  if (!match) return null

  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  if (!settings.enabled) {
    return '当前新声歌手大赛「人气奖投票」尚未开启，请留意现场主持人通知。'
  }

  const now = input.now ?? Date.now()
  const adminState = getPopularityAdminState(client, eventRow.id)
  if (adminState.status === 'scheduled') {
    return '「人气奖投票」尚未到开始时间，请留意现场大屏倒计时。'
  }
  if (adminState.status === 'closed') {
    return '本场「人气奖投票」已截止，感谢参与！'
  }

  const code = (match[1] || '').trim()
  if (settings.passcodeRotate && (!code || !verifyPopularityWechatPasscode(input.secret, eventRow.id, code, now))) {
    return '口令不正确或已过期。\n请查看现场大屏当前显示的 2 位数字口令，回复「投票 + 两位数」（例如：投票 58）领取专属投票链接。'
  }

  const openIdHash = popularityOpenIdHash(input.secret, eventRow.id, input.fromUserName)
  const issued = issuePopularityWechatTicket(input.secret, eventRow.id, openIdHash, 45 * 60_000, now)
  const origin = input.siteOrigin.replace(/\/+$/, '')
  const link = `${origin}/singer/popularity?vt=${encodeURIComponent(issued.ticket)}`

  return [
    settings.passcodeRotate ? '身份核验通过，请点击下方你的专属链接投票：' : '请点击下方你的专属链接投票：',
    link,
    popularityTicketSummary(settings)
  ].join('\n')
}

export interface WechatMpPopularityEventInput {
  fromUserName: string
  siteOrigin: string
  secret: string
  /** 关注事件发生在微信服务器回源请求里，这里带上回源 IP 与 UA 便于后台核验。 */
  ip?: string
  userAgent?: string
  now?: number
}

/**
 * 关注即领票：扫码关注后直接回一条带专属链接的消息，观众不用再打字。
 * 窗口未开/已截止时只回提示，仍然欢迎关注。
 */
export function handleWechatMpPopularityFollow(
  client: DatabaseClient,
  input: WechatMpPopularityEventInput
): string {
  const contentId = findMusicAssociationContent(client).id
  const eventRow = ensureCompetitionEvent(client, contentId)
  const settings = getPopularitySettings(client, eventRow.id)
  const accountName = settings.wechatAccountName || '仰大音乐馆'
  const welcome = `欢迎关注「${accountName}」！`
  recordPopularityFollow(client, {
    eventId: eventRow.id,
    voterOpenidHash: popularityOpenIdHash(input.secret, eventRow.id, input.fromUserName),
    ip: input.ip,
    userAgent: input.userAgent,
    now: input.now
  })
  if (!settings.enabled) {
    return `${welcome}\n本场「人气奖投票」尚未开启，请留意现场主持人通知。`
  }

  const adminState = getPopularityAdminState(client, eventRow.id)
  if (adminState.status === 'scheduled') {
    return `${welcome}\n「人气奖投票」尚未开始，请留意现场大屏倒计时。`
  }
  if (adminState.status === 'closed') {
    return `${welcome}\n本场「人气奖投票」已截止，感谢参与！`
  }

  const now = input.now ?? Date.now()
  const openIdHash = popularityOpenIdHash(input.secret, eventRow.id, input.fromUserName)
  const issued = issuePopularityWechatTicket(input.secret, eventRow.id, openIdHash, 45 * 60_000, now)
  const origin = input.siteOrigin.replace(/\/+$/, '')
  const link = `${origin}/singer/popularity?vt=${encodeURIComponent(issued.ticket)}`

  return [
    welcome,
    '点击下方专属链接，为喜欢的歌手投票：',
    link,
    popularityTicketSummary(settings)
  ].join('\n')
}
