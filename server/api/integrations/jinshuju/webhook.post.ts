/**
 * 金数据「数据推送」回调：表单有人提交时把条目推进来。
 *
 * 金数据的推送体形态不完全固定（可能是裸条目、也可能包一层 entry/data），
 * 所以这里把候选对象都交给归一化函数，认不出来的自然被丢掉。
 */

import { getHeader, readBody } from 'h3'
import { verifyBearerToken } from '../../../modules/bots/security'
import { ingestJinshujuEntries, recordThirdPartySyncState, resolveIngestContext } from '../../../modules/vote-sync/ingest'
import { readJinshujuConfig } from '../../../utils/jinshuju'

const NESTED_KEYS = ['entry', 'entries', 'data', 'record', 'records', 'list'] as const

function collectCandidateEntries(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (typeof body !== 'object' || body === null) return []
  const record = body as Record<string, unknown>
  const nested: unknown[] = []
  for (const key of NESTED_KEYS) {
    const value = record[key]
    if (Array.isArray(value)) nested.push(...value)
    else if (value !== null && typeof value === 'object') nested.push(value)
  }
  return nested.length > 0 ? nested : [record]
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as Record<string, unknown>
  const secret = typeof runtimeConfig.jinshujuWebhookSecret === 'string'
    ? runtimeConfig.jinshujuWebhookSecret.trim()
    : ''
  if (secret.length < 16) {
    setResponseStatus(event, 503)
    return { ok: false, reason: 'webhook_secret_not_configured' }
  }

  const headerToken = getHeader(event, 'x-jinshuju-token')
  // 金数据的数据推送只给一个 URL，没有自定义头的入口，所以 query 里的 token 也算数。
  const queryToken = getQuery(event).token
  const authorization = getHeader(event, 'authorization')
    ?? (headerToken ? `Bearer ${headerToken}` : undefined)
    ?? (typeof queryToken === 'string' && queryToken ? `Bearer ${queryToken}` : undefined)
  if (!verifyBearerToken(authorization, secret)) {
    setResponseStatus(event, 401)
    return { ok: false, reason: 'unauthorized' }
  }

  const config = readJinshujuConfig(event)
  if (!config) {
    setResponseStatus(event, 503)
    return { ok: false, reason: 'jinshuju_not_configured' }
  }

  const ingestContext = resolveIngestContext(event)
  const body = await readBody(event).catch(() => null)
  const candidates = collectCandidateEntries(body)
  if (candidates.length === 0) {
    setResponseStatus(event, 400)
    return { ok: false, reason: 'empty_payload' }
  }

  const outcome = ingestJinshujuEntries(ingestContext, candidates, {
    formToken: config.formToken,
    optionField: config.optionField
  })

  if (outcome.inserted > 0) {
    recordThirdPartySyncState(ingestContext, {
      formToken: config.formToken,
      added: outcome.inserted
    })
  }

  return { ok: true, ...outcome }
})
