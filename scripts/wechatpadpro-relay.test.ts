import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import { normalizeWechatPadProEvent, verifySignature } from './wechatpadpro-relay.mjs'

test('verifies WeChatPadPro and YEU signature formats', () => {
  const secret = 'w'.repeat(32)
  const timestamp = String(Date.now())
  const rawBody = '{"msgType":1}'
  const webhookSignature = createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('hex')
  const yeuSignature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')

  assert.equal(verifySignature({ secret, timestamp, signature: webhookSignature, rawBody }), true)
  assert.equal(verifySignature({ secret, timestamp, signature: `sha256=${yeuSignature}`, rawBody, separator: '.' }), true)
  assert.equal(verifySignature({ secret, timestamp, signature: webhookSignature, rawBody: '{}' }), false)
})

test('normalizes a mentioned group text message', () => {
  const result = normalizeWechatPadProEvent({
    msgType: 1,
    newMsgId: '987654321',
    fromUser: 'group-id@chatroom',
    content: 'wxid_sender:\n@仰恩小助手\u2005什么时候开学',
    msgSource: '<msgsource><atuserlist><![CDATA[wxid_bot]]></atuserlist></msgsource>'
  }, { botId: 'wxid_bot', botName: '仰恩小助手' })

  assert.deepEqual(result, {
    event: 'message',
    messageId: '987654321',
    roomId: 'group-id@chatroom',
    senderId: 'wxid_sender',
    botId: 'wxid_bot',
    text: '@仰恩小助手\u2005什么时候开学',
    cleanText: '什么时候开学',
    isAt: true,
    mentionedIds: ['wxid_bot']
  })
})

test('rejects private and non-text events before forwarding', () => {
  const config = { botId: 'wxid_bot', botName: '仰恩小助手' }
  assert.equal(normalizeWechatPadProEvent({
    msgType: 1,
    newMsgId: '1',
    fromUser: 'wxid_friend',
    content: '@仰恩小助手 hi'
  }, config), null)
  assert.equal(normalizeWechatPadProEvent({
    msgType: 3,
    newMsgId: '2',
    fromUser: 'group-id@chatroom',
    content: 'image'
  }, config), null)
})
