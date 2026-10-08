import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { assistantConfigFromValues } from '../server/utils/assistant-config'
import { botAssistantConfig } from '../server/modules/bots/runtime'
import {
  normalizeOneBotQuestion,
  normalizeWechatQuestion,
  oneBotGroupAllowed,
  wechatRoomAllowed
} from '../server/modules/bots/events'
import {
  clearBotMessageReservationsForTests,
  formatBotReply,
  reserveBotMessage
} from '../server/modules/bots/service'
import {
  createBotWebhookSignature,
  createOneBotWebhookSignature,
  safeOutboundBotUrl,
  verifyBearerToken,
  verifyBotWebhookSignature,
  verifyOneBotWebhookSignature
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

test('OneBot group allowlists reject every non-target group', () => {
  assert.equal(oneBotGroupAllowed({ group_id: 873029727 }, '873029727'), true)
  assert.equal(oneBotGroupAllowed({ group_id: '873029727' }, '1, 873029727'), true)
  assert.equal(oneBotGroupAllowed({ group_id: 123 }, '873029727'), false)
  assert.equal(oneBotGroupAllowed({ message_type: 'private' }, '873029727'), false)
  assert.equal(oneBotGroupAllowed({ group_id: 123 }, ''), true)
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
  assert.equal(normalizeWechatQuestion({ ...base, roomId: '', isAt: true }, 'bot-1', '新生指南'), null)
})

test('WeChat room allowlist is deny-by-default and exact-match only', () => {
  assert.equal(wechatRoomAllowed({ roomId: 'room-1' }, ''), false)
  assert.equal(wechatRoomAllowed({ roomId: 'room-1' }, 'room-1'), true)
  assert.equal(wechatRoomAllowed({ roomId: 'room-1' }, 'room-2, room-1'), true)
  assert.equal(wechatRoomAllowed({ roomId: 'room-10' }, 'room-1'), false)
  assert.equal(wechatRoomAllowed({ roomId: '' }, 'room-1'), false)
})

test('bot replies always retain the canonical website footer', () => {
  const short = formatBotReply('答案内容', 'https://yx.huiliyill.cn/path', 300)
  assert.equal(short, '答案内容\n\n官网：https://yx.huiliyill.cn/')
  const clipped = formatBotReply('很长的答案'.repeat(100), 'https://yx.huiliyill.cn/', 220)
  assert.ok(clipped.length <= 220)
  assert.ok(clipped.endsWith('官网：https://yx.huiliyill.cn/'))
})

test('bot replies expose safe assistant result links within the reply limit', () => {
  const reply = formatBotReply('答案内容', 'https://yx.huiliyill.cn/path', 500, [
    { title: '绩点计算器', url: '/student-rules#gpa-calculator', snippet: '', source: 'site' },
    { title: '学校通知', url: 'https://www.yeu.edu.cn/news/1', snippet: '', source: 'web' },
    { title: '重复入口', url: '/student-rules#gpa-calculator', snippet: '', source: 'site' },
    { title: '伪造站内入口', url: 'https://example.com/phishing', snippet: '', source: 'site' },
    { title: '危险协议', url: 'javascript:alert(1)', snippet: '', source: 'web' }
  ])
  assert.match(reply, /相关入口：/)
  assert.match(reply, /https:\/\/yx\.huiliyill\.cn\/student-rules#gpa-calculator/)
  assert.match(reply, /https:\/\/www\.yeu\.edu\.cn\/news\/1/)
  assert.equal(reply.match(/gpa-calculator/g)?.length, 1)
  assert.doesNotMatch(reply, /example\.com|javascript:/)
  assert.ok(reply.length <= 500)
  assert.ok(reply.endsWith('官网：https://yx.huiliyill.cn/'))
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

test('OneBot HTTP signatures authenticate the exact raw request body', () => {
  const secret = 'onebot-shared-secret'
  const rawBody = '{"post_type":"message","message_id":1001}'
  const signature = createOneBotWebhookSignature(secret, rawBody)
  assert.equal(verifyOneBotWebhookSignature({
    secret,
    signature: `sha1=${signature}`,
    rawBody
  }), true)
  assert.equal(verifyOneBotWebhookSignature({
    secret,
    signature: `sha1=${signature}`,
    rawBody: `${rawBody} `
  }), false)
  assert.equal(verifyOneBotWebhookSignature({
    secret,
    signature: 'sha1=invalid',
    rawBody
  }), false)
})

test('outbound bot URLs require HTTPS unless they are loopback', () => {
  assert.equal(safeOutboundBotUrl('https://relay.example.com/send').hostname, 'relay.example.com')
  assert.equal(safeOutboundBotUrl('http://127.0.0.1:3005/').port, '3005')
  assert.throws(() => safeOutboundBotUrl('http://192.168.1.20:3005/'), /BOT_OUTBOUND_URL_UNSAFE/)
})

test('bot channels receive the same retrieval configuration as web and miniapp', () => {
  // 回归：机器人配置过去手写了一份字段子集，漏掉 embedding / rerank / rewrite
  // 共 11 个检索字段，导致同一个问题在 QQ/微信里只走关键词通道（答非所问）。
  const runtime = {
    aiGatewayBaseUrl: 'https://gateway.example.com',
    aiGatewayApiKey: 'gateway-key',
    aiGatewayModel: 'test-model',
    aiGatewayTimeoutMs: '90000',
    aiMcpSearchUrl: 'https://mcp.example.com/search',
    aiMcpSearchBearerToken: 'mcp-token',
    aiMcpAllowedHosts: 'mcp.example.com',
    aiMcpToolName: 'firecrawl_search',
    aiMcpTimeoutMs: '30000',
    amapWebServiceKey: 'amap-key',
    aiEmbeddingBaseUrl: 'https://embedding.example.com/v1',
    aiEmbeddingApiKey: 'embedding-key',
    aiEmbeddingModel: 'BAAI/bge-m3',
    aiEmbeddingTimeoutMs: '15000',
    aiRerankBaseUrl: 'https://rerank.example.com/v1',
    aiRerankApiKey: 'rerank-key',
    aiRerankModel: 'BAAI/bge-reranker-v2-m3',
    aiRerankTimeoutMs: '15000',
    aiRewriteEnabled: 'true',
    aiRewriteModel: 'rewrite-model',
    aiRewriteMaxVariants: '2',
    aiRewriteTimeoutMs: '8000',
    aiRerankLocalEnabled: 'true',
    aiRerankLocalModel: 'local-reranker',
    botSiteUrl: 'https://yx.huiliyill.cn/',
    botMaxReplyChars: '1800'
  }

  const bot = botAssistantConfig(runtime)
  const shared = assistantConfigFromValues(runtime)

  // 机器人的检索字段必须与 web/小程序逐一同值（不是「有就行」，是取值一致）。
  for (const [key, expected] of Object.entries(shared)) {
    assert.deepEqual(
      (bot as unknown as Record<string, unknown>)[key],
      expected,
      `botAssistantConfig 的 ${key} 与共用渠道配置不一致`
    )
  }
  // 语义召回与改写确实被带上（历史上正是这三个字段缺失）。
  assert.equal(bot.embeddingBaseUrl, 'https://embedding.example.com/v1')
  assert.equal(bot.rerankBaseUrl, 'https://rerank.example.com/v1')
  assert.equal(bot.rewriteEnabled, true)
  // 机器人特有的字段仍然独立存在。
  assert.equal(bot.siteUrl, 'https://yx.huiliyill.cn/')
  assert.equal(bot.maxReplyChars, 1800)

  // 服务层必须整份透传通道配置，而不是逐字段抄一遍。
  const serviceSource = readFileSync(resolve('server/modules/bots/service.ts'), 'utf8')
  assert.match(serviceSource, /\.\.\.channelConfig/)
  assert.match(serviceSource, /answerCampusQuestion\(input\.client, input\.question\.question, channelConfig\)/)
})
