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

const VOTE_COMMAND_PATTERN = /^(?:人气奖?投票|歌手投票|投票|人气|tp)(?:[\s:：+-]*(\d{2,4}))?$/i

export interface WechatMpPopularityReplyInput {
  fromUserName: string
  content: string
  siteOrigin: string
  secret: string
  now?: number
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
  const fixedPasscode = settings.passcodeRotate ? null : settings.fixedPasscode
  if (!code || !verifyPopularityWechatPasscode(input.secret, eventRow.id, code, now, fixedPasscode)) {
    return '口令不正确或已过期。\n请查看现场大屏当前显示的 2 位数字口令，回复「投票 + 两位数」（例如：投票 58）领取专属投票链接。'
  }

  const openIdHash = popularityOpenIdHash(input.secret, eventRow.id, input.fromUserName)
  const issued = issuePopularityWechatTicket(input.secret, eventRow.id, openIdHash, 45 * 60_000, now)
  const origin = input.siteOrigin.replace(/\/+$/, '')
  const link = `${origin}/singer/popularity?vt=${encodeURIComponent(issued.ticket)}`

  return [
    '身份核验通过，请点击下方你的专属链接投票：',
    link,
    '一人一微信号一票（45 分钟内有效，请勿转发他人）。'
  ].join('\n')
}
