import { createHash } from 'node:crypto'

/**
 * 无会话记忆的请求共用这个域。
 *
 * 答案缓存原来是「版本:变体:修订:问题」四段式，key 里没有任何会话信息，而 prompt
 * 会把 session_context 拼进去（service.ts 的 askGateway）——两个会话问同一句话，
 * 后问的那个直接拿到前一个会话的答案。加一段会话域就能把两者拆开。
 */
export const ANONYMOUS_SESSION_SCOPE = 'anon'

export interface AssistantCacheKeyInput {
  version: string
  variant: string
  knowledgeRevision: number
  sessionKey?: string | null
  sessionContext?: readonly string[] | null
  query: string
}

/**
 * 会话域标识。
 *
 * 用 sessionKey + 注入 prompt 的记忆行做哈希：只取 sessionKey 不够——同一会话的记忆
 * 会被后续问答追加，记忆变了答案就该重算，否则会话里「刚说过」的上下文永远拿不到。
 * 无 sessionKey 的匿名请求返回固定值，保持跨请求共享缓存（那条路径没有会话记忆可串）。
 */
export function assistantSessionScope(
  sessionKey?: string | null,
  sessionContext?: readonly string[] | null
): string {
  const trimmed = sessionKey?.trim()
  if (!trimmed) return ANONYMOUS_SESSION_SCOPE
  const digest = createHash('sha256')
    .update(trimmed)
    .update('\u0000')
    .update((sessionContext ?? []).join('\u0000'))
    .digest('hex')
  return `s${digest.slice(0, 16)}`
}

export function buildAssistantCacheKey(input: AssistantCacheKeyInput): string {
  return [
    input.version,
    input.variant,
    String(input.knowledgeRevision),
    assistantSessionScope(input.sessionKey, input.sessionContext),
    input.query.toLocaleLowerCase('zh-CN')
  ].join(':')
}
