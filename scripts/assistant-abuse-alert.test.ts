import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { scheduleAssistantRateAlert, shouldAlert } from '../server/utils/abuse-alert'

test('shouldAlert 在冷却窗口内只放行一次', () => {
  const store = new Map<string, number>()
  const now = 1_000_000
  assert.equal(shouldAlert('1.2.3.4', now, store), true)
  assert.equal(shouldAlert('1.2.3.4', now + 60_000, store), false, '15 分钟内重复触发不放行')
  assert.equal(shouldAlert('5.6.7.8', now + 60_000, store), true, '不同 IP 不受影响')
  assert.equal(shouldAlert('1.2.3.4', now + 15 * 60_000, store), true, '冷却期满后重新放行')
})

test('shouldAlert 存储超限时清理过期条目且不无界增长', () => {
  const store = new Map<string, number>()
  const now = 10_000_000
  for (let i = 0; i < 600; i++) {
    shouldAlert(`10.0.0.${i}`, now - 30 * 60_000, store) // 全部已过期
  }
  assert.ok(store.size <= 1000, `store should stay bounded, got ${store.size}`)
})

test('未配置收件箱或发件凭据时静默禁用且不抛错', () => {
  // 空 env：mailer 缺 QQ_EMAIL/AUTH_CODE、缺 ALERT_TO_EMAIL —— 双缺省路径。
  scheduleAssistantRateAlert({
    ip: '1.2.3.4',
    endpoint: '/api/public/assistant',
    userAgent: 'test-agent',
    env: {}
  })
  // 只配收件箱、缺发件凭据：同样静默。
  scheduleAssistantRateAlert({
    ip: '1.2.3.4',
    endpoint: '/api/public/assistant',
    userAgent: 'test-agent',
    env: { ALERT_TO_EMAIL: 'ops@example.com' }
  })
  // 到达这里即通过：无异常、无未处理 rejection。
})

test('两个问答端点接入统一限流入口且 429 路径发告警', () => {
  const route = readFileSync(resolve('server/api/public/assistant.post.ts'), 'utf8')
  const streamRoute = readFileSync(resolve('server/api/public/assistant/stream.post.ts'), 'utf8')
  const abuse = readFileSync(resolve('server/utils/abuse-alert.ts'), 'utf8')
  for (const source of [route, streamRoute]) {
    assert.match(source, /assertAssistantRateLimit\(event, client, ipAddress\)/)
    assert.doesNotMatch(source, /assertRateLimit\(/, 'handler 不再直接调通用限流，统一走告警入口')
  }
  assert.match(abuse, /statusCode === 429/)
  assert.match(abuse, /scheduleAssistantRateAlert\(/)
  assert.match(abuse, /ALERT_TO_EMAIL/)
})
