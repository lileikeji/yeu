import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOneBotQuestion, normalizeWechatQuestion } from '../server/modules/bots/events'
import {
  clearBotMessageReservationsForTests,
  formatBotReply,
  reserveBotMessage
} from '../server/modules/bots/service'
import {
  createBotWebhookSignature,
  safeOutboundBotUrl,
  verifyBearerToken,
  verifyBotWebhookSignature
} from '../server/modules/bots/security'

test('OneBot group messages require an explicit mention of this bot', () => {
  const base = {
    post_type: 'message',
    message_type: 'group',
    message_id: 1001,
    self_id: 9527,
    group_id: 2002,
    user_id: 3003
  }
  assert.equal(normalizeOneBotQuestion({
    ...base,
    message: [{ type: 'text', data: { text: '什么时候开学？' } }]
  }, '9527'), null)

  assert.deepEqual(normalizeOneBotQuestion({
    ...base,
    message: [
      { type: 'at', data: { qq: '9527' } },
      { type: 'text', data: { text: ' 什么时候开学？ ' } }
    ]
  }, '9527'), {
    platform: 'qq',
    messageId: '1001',
    conversationId: '2002',
    senderId: '3003',
    question: '什么时候开学？'
  })

  assert.equal(normalizeOneBotQuestion({
    ...base,
    message_type: 'private',
    message: [{ type: 'at', data: { qq: '9527' } }, { type: 'text', data: { text: '问题' } }]
  }, '9527'), null)
})

test('OneBot CQ strings remove only the matching bot mention', () => {
  const result = normalizeOneBotQuestion({
    post_type: 'message',
    message_type: 'group',
    message_id: 'm-1',
    self_id: '9527',
    group_id: 'g-1',
    user_id: 'u-1',
    raw_message: '[CQ:at,qq=9527] 奖学金有什么要求？'
  }, '9527')
  assert.equal(result?.question, '奖学金有什么要求？')
})

test('WeChat relay requires a room mention and uses clean text', () => {
  const base = {
    event: 'message',
    messageId: 'wx-1',
    roomId: 'room-1',
    senderId: 'user-1',
    botId: 'bot-1',
    text: '@新生指南 校园网怎么办理？',
    cleanText: '校园网怎么办理？'
  }
  assert.equal(normalizeWechatQuestion(base, 'bot-1', '新生指南'), null)
  assert.equal(normalizeWechatQuestion({ ...base, isAt: true }, 'bot-1', '新生指南')?.question, '校园网怎么办理？')
  assert.equal(normalizeWechatQuestion({
    ...base,
    mentionedIds: ['bot-1']
  }, 'bot-1', '新生指南')?.conversationId, 'room-1')
  assert.equal(normalizeWechatQuestion({ ...base, roomId: '' , isAt: true }, 'bot-1', '新生指南'), null)
})

test('bot replies always retain the canonical website footer', () => {
  const short = formatBotReply('答案内容', 'https://yeu.huiliyill.cn/path', 300)
  assert.equal(short, '答案内容\n\n官网：https://yeu.huiliyill.cn/')
  const clipped = formatBotReply('很长的答案'.repeat(100), 'https://yeu.huiliyill.cn/', 220)
  assert.ok(clipped.length <= 220)
  assert.ok(clipped.endsWith('官网：https://yeu.huiliyill.cn/'))
})

test('bot message reservations suppress duplicate platform deliveries', () => {
  clearBotMessageReservationsForTests()
  assert.equal(reserveBotMessage('qq', 'same-id', 1_000), true)
  assert.equal(reserveBotMessage('qq', 'same-id', 2_000), false)
  assert.equal(reserveBotMessage('wechat', 'same-id', 2_000), true)
  assert.equal(reserveBotMessage('qq', 'same-id', 1_000 + 31 * 60 * 1000), true)
})

test('webhook authentication rejects invalid and stale credentials', () => {
  assert.equal(verifyBearerToken('Bearer expected-secret', 'expected-secret'), true)
  assert.equal(verifyBearerToken('Bearer wrong-secret', 'expected-secret'), false)
  const rawBody = '{"event":"message"}'
  const now = 1_800_000_000_000
  const timestamp = String(now)
  const signature = createBotWebhookSignature('shared-secret', timestamp, rawBody)
  assert.equal(verifyBotWebhookSignature({
    secret: 'shared-secret',
    timestamp,
    signature: `sha256=${signature}`,
    rawBody,
    now
  }), true)
  assert.equal(verifyBotWebhookSignature({
    secret: 'shared-secret',
    timestamp: String(now - 6 * 60 * 1000),
    signature,
    rawBody,
    now
  }), false)
})

test('outbound bot URLs require HTTPS unless they are loopback', () => {
  assert.equal(safeOutboundBotUrl('https://relay.example.com/send').hostname, 'relay.example.com')
  assert.equal(safeOutboundBotUrl('http://127.0.0.1:3005/').port, '3005')
  assert.throws(() => safeOutboundBotUrl('http://192.168.1.20:3005/'), /BOT_OUTBOUND_URL_UNSAFE/)
})
