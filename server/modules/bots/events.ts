export interface NormalizedBotQuestion {
  platform: 'qq' | 'wechat'
  messageId: string
  conversationId: string
  senderId: string
  question: string
}

interface OneBotSegment {
  type?: unknown
  data?: Record<string, unknown>
}

interface OneBotEvent {
  post_type?: unknown
  message_type?: unknown
  message_id?: unknown
  self_id?: unknown
  group_id?: unknown
  user_id?: unknown
  message?: unknown
  raw_message?: unknown
}

interface WechatRelayEvent {
  event?: unknown
  messageId?: unknown
  roomId?: unknown
  senderId?: unknown
  botId?: unknown
  text?: unknown
  cleanText?: unknown
  isAt?: unknown
  mentionedIds?: unknown
}

function requiredId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized ? normalized.slice(0, 160) : null
}

function oneBotSegments(value: unknown): OneBotSegment[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as OneBotSegment[] : []
}

export function oneBotGroupAllowed(payload: unknown, configuredGroupIds = ''): boolean {
  const allowed = new Set(configuredGroupIds.split(/[\s,]+/).map(value => value.trim()).filter(Boolean))
  if (allowed.size === 0) return true
  if (!payload || typeof payload !== 'object') return false
  return allowed.has(requiredId((payload as OneBotEvent).group_id) || '')
}

function oneBotText(event: OneBotEvent, selfId: string): { mentioned: boolean, text: string } {
  const segments = oneBotSegments(event.message)
  if (segments.length > 0) {
    let mentioned = false
    const text = segments.flatMap((segment) => {
      if (segment.type === 'at') {
        const target = requiredId(segment.data?.qq)
        if (target === selfId) mentioned = true
        return []
      }
      return segment.type === 'text' && typeof segment.data?.text === 'string'
        ? [segment.data.text]
        : []
    }).join(' ').replace(/\s+/g, ' ').trim()
    return { mentioned, text }
  }

  const raw = typeof event.raw_message === 'string'
    ? event.raw_message
    : typeof event.message === 'string' ? event.message : ''
  const mentionPattern = new RegExp(`\\[CQ:at,qq=${selfId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:,[^\\]]*)?\\]`, 'g')
  return {
    mentioned: mentionPattern.test(raw),
    text: raw.replace(mentionPattern, ' ').replace(/\s+/g, ' ').trim()
  }
}

export function normalizeOneBotQuestion(payload: unknown, configuredSelfId = ''): NormalizedBotQuestion | null {
  if (!payload || typeof payload !== 'object') return null
  const event = payload as OneBotEvent
  if (event.post_type !== 'message' || event.message_type !== 'group') return null
  const expectedSelfId = configuredSelfId.trim()
  const selfId = expectedSelfId || requiredId(event.self_id)
  const messageId = requiredId(event.message_id)
  const conversationId = requiredId(event.group_id)
  const senderId = requiredId(event.user_id)
  if (!selfId || !messageId || !conversationId || !senderId) return null
  if (expectedSelfId && requiredId(event.self_id) !== expectedSelfId) return null
  const content = oneBotText(event, selfId)
  if (!content.mentioned || !content.text) return null
  return { platform: 'qq', messageId, conversationId, senderId, question: content.text.slice(0, 300) }
}

export function normalizeWechatQuestion(
  payload: unknown,
  configuredBotId = '',
  configuredBotName = ''
): NormalizedBotQuestion | null {
  if (!payload || typeof payload !== 'object') return null
  const event = payload as WechatRelayEvent
  if (event.event !== 'message') return null
  const messageId = requiredId(event.messageId)
  const conversationId = requiredId(event.roomId)
  const senderId = requiredId(event.senderId)
  const botId = configuredBotId.trim() || requiredId(event.botId) || ''
  const mentionedIds = Array.isArray(event.mentionedIds)
    ? event.mentionedIds.map(requiredId).filter(Boolean) as string[]
    : []
  const mentioned = event.isAt === true || Boolean(botId && mentionedIds.includes(botId))
  if (!messageId || !conversationId || !senderId || !mentioned) return null

  let text = typeof event.cleanText === 'string'
    ? event.cleanText
    : typeof event.text === 'string' ? event.text : ''
  if (configuredBotName.trim()) {
    const escaped = configuredBotName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`@${escaped}(?:\\s|\u2005)*`, 'g'), ' ')
  }
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { platform: 'wechat', messageId, conversationId, senderId, question: text.slice(0, 300) }
}
