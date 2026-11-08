/**
 * AI 问答接口滥用告警：限流触发时给维护者发邮件（QQ 邮箱 SMTP）。
 *
 * 信号：assistant 双桶限流（20/IP/min、200 全局/min）触发 429 = 有人在疯狂调用。
 * 防邮件风暴：同一 IP 15 分钟内只告警一次（进程内存冷却，重启后最坏多发一封）。
 * 未配置即静默禁用：缺 QQ_EMAIL/QQ_EMAIL_AUTH_CODE（mailer）或 ALERT_TO_EMAIL。
 */
import { getHeader, getRequestURL, type H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import { mailerConfigFromEnv, sendMailMessage } from './mailer'
import { assertRateLimit } from './rate-limit'

const ALERT_COOLDOWN_MS = 15 * 60 * 1000
const COOLDOWN_STORE_LIMIT = 500

const alertedAt = new Map<string, number>()

/** 纯决策：冷却窗口内重复触发返回 false 并记账。 */
export function shouldAlert(
  key: string,
  now: number,
  store: Map<string, number> = alertedAt,
  cooldownMs: number = ALERT_COOLDOWN_MS
): boolean {
  const last = store.get(key) ?? 0
  if (now - last < cooldownMs) return false
  store.set(key, now)
  if (store.size > COOLDOWN_STORE_LIMIT) {
    for (const [k, v] of store) {
      if (now - v >= cooldownMs) store.delete(k)
    }
    // 清不掉（全是新鲜条目）时整体重置，极端场景下宁可多发一封也不留无界内存。
    if (store.size > COOLDOWN_STORE_LIMIT * 2) store.clear()
  }
  return true
}

/**
 * assistant 双桶限流的统一入口：触发 429 时先发告警再原样抛出。
 * 两个问答端点（JSON / SSE）共用，参数与历史行为完全一致（20/IP/min、200 全局/min）。
 */
export function assertAssistantRateLimit(event: H3Event, client: DatabaseClient, ipAddress: string): void {
  try {
    assertRateLimit(event, `assistant:${ipAddress}`, 20, 60 * 1000, client)
    assertRateLimit(event, 'assistant:global', 200, 60 * 1000, client)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) {
      scheduleAssistantRateAlert({
        ip: ipAddress,
        endpoint: getRequestURL(event).pathname,
        userAgent: String(getHeader(event, 'user-agent') || 'unknown')
      })
    }
    throw error
  }
}

export interface AssistantAbuseAlertInput {
  ip: string
  endpoint: string
  userAgent: string
  env?: NodeJS.ProcessEnv
}

/**
 * 触发即发（调用方已确认 429）；不抛错、不阻塞请求路径。
 * sendMailMessage 失败只吞掉——告警通道故障不能影响问答服务。
 */
export function scheduleAssistantRateAlert(input: AssistantAbuseAlertInput): void {
  const env = input.env ?? process.env
  const config = mailerConfigFromEnv(env)
  const to = String(env.ALERT_TO_EMAIL || '').trim()
  if (!config || !to) return
  if (!shouldAlert(input.ip, Date.now())) return

  const at = new Date().toISOString()
  const subject = `[告警] AI 问答接口被频繁调用 · ${input.ip}`
  const text = [
    `时间（UTC）：${at}`,
    `来源 IP：${input.ip}`,
    `接口：${input.endpoint}`,
    `User-Agent：${input.userAgent.slice(0, 200)}`,
    '',
    '该 IP 已触发 assistant 限流（20 次/分钟/IP），疑似恶意刷接口。',
    '如非本人操作：可在服务器封禁该 IP，或调低 server/api/public/assistant*.post.ts 的限流参数。',
    '冷却期内同一 IP 不会重复告警（15 分钟）。'
  ].join('\n')
  void sendMailMessage(config, {
    to,
    subject,
    text,
    html: `<pre style="font-family:monospace">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  }).catch(() => {
    // 告警发送失败静默；问答服务不受影响。
  })
}
