import { createHash } from 'node:crypto'
import type { DatabaseClient } from '../../database/client'
import { recordAssistantFailure, recordAssistantSuccess } from '../assistant/analytics'
import { answerCampusQuestion } from '../assistant/service'
import { containsCredentialSeeking, containsPromptInjection } from '../../../shared/utils/assistant-query'
import type { ApiAssistantCitation } from '../../../shared/types/server'
import type { NormalizedBotQuestion } from './events'

export interface BotAssistantConfig {
  siteUrl: string
  maxReplyChars: number
  gatewayBaseUrl: string
  gatewayApiKey: string
  gatewayModel: string
  gatewayTimeoutMs: number
  mcpSearchUrl: string
  mcpSearchBearerToken: string
  mcpAllowedHosts: string
  mcpToolName: string
  mcpTimeoutMs: number
  amapWebServiceKey?: string
}

const acceptedMessages = new Map<string, number>()
const DEDUPE_TTL_MS = 30 * 60 * 1000

function canonicalSiteUrl(value: string): string {
  try {
    const url = new URL(value || 'https://yx.huiliyill.cn/')
    return `${url.origin}/`
  } catch {
    return 'https://yx.huiliyill.cn/'
  }
}

function botCitationLines(citations: ApiAssistantCitation[], siteUrl: string): string[] {
  const siteRoot = new URL(canonicalSiteUrl(siteUrl))
  const seen = new Set<string>()
  return citations.flatMap((citation) => {
    let url: URL
    try {
      url = citation.source === 'site' ? new URL(citation.url, siteRoot) : new URL(citation.url)
    } catch {
      return []
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return []
    if (citation.source === 'site' && url.origin !== siteRoot.origin) return []
    if (url.href.length > 500 || seen.has(url.href)) return []
    seen.add(url.href)
    const title = citation.title.replace(/\s+/g, ' ').trim().slice(0, 40) || '查看内容'
    return [`- ${title}：${url.href}`]
  }).slice(0, 3)
}

export function formatBotReply(
  answer: string,
  siteUrl: string,
  maxReplyChars = 1800,
  citations: ApiAssistantCitation[] = []
): string {
  const footer = `官网：${canonicalSiteUrl(siteUrl)}`
  const normalized = answer.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || '暂时无法整理这个问题。'
  const safeLimit = Math.max(200, Math.min(6000, Math.floor(maxReplyChars)))
  const citationLines: string[] = []
  for (const line of botCitationLines(citations, siteUrl)) {
    const candidate = [...citationLines, line]
    const candidateBlock = `相关入口：\n${candidate.join('\n')}`
    if (candidateBlock.length + footer.length + 86 > safeLimit) break
    citationLines.push(line)
  }
  const suffix = [citationLines.length ? `相关入口：\n${citationLines.join('\n')}` : '', footer].filter(Boolean).join('\n\n')
  const answerLimit = Math.max(80, safeLimit - suffix.length - 2)
  const clipped = normalized.length > answerLimit ? `${normalized.slice(0, answerLimit - 1).trimEnd()}…` : normalized
  return `${clipped}\n\n${suffix}`
}

export function reserveBotMessage(platform: string, messageId: string, now = Date.now()): boolean {
  const key = `${platform}:${messageId}`
  const expiresAt = acceptedMessages.get(key)
  if (expiresAt && expiresAt > now) return false
  acceptedMessages.set(key, now + DEDUPE_TTL_MS)
  if (acceptedMessages.size > 2000) {
    for (const [messageKey, expiry] of acceptedMessages) {
      if (expiry <= now) acceptedMessages.delete(messageKey)
    }
  }
  return true
}

export function releaseBotMessage(platform: string, messageId: string): void {
  acceptedMessages.delete(`${platform}:${messageId}`)
}

export function clearBotMessageReservationsForTests(): void {
  acceptedMessages.clear()
}

function logBotFailure(question: NormalizedBotQuestion, code: string): void {
  const messageHash = createHash('sha256').update(`${question.platform}:${question.messageId}`).digest('hex').slice(0, 16)
  process.stderr.write(`${JSON.stringify({ event: 'bot_reply_failed', platform: question.platform, messageHash, code })}\n`)
}

export async function answerAndSendBotQuestion(input: {
  client: DatabaseClient
  question: NormalizedBotQuestion
  config: BotAssistantConfig
  send: (message: string) => Promise<void>
}): Promise<void> {
  const startedAt = Date.now()
  const requestId = `bot:${input.question.platform}:${input.question.messageId}`.slice(0, 200)
  const context = { requestId, query: input.question.question, ipAddress: null }

  if (containsPromptInjection(input.question.question) || containsCredentialSeeking(input.question.question)) {
    try {
      recordAssistantFailure(input.client, context, 'UNSAFE_QUERY', Date.now() - startedAt)
    } catch {
      // Analytics remains optional during migrations.
    }
    await input.send(formatBotReply('禁止回答', input.config.siteUrl, input.config.maxReplyChars))
    return
  }

  try {
    const response = await answerCampusQuestion(input.client, input.question.question, {
      gatewayBaseUrl: input.config.gatewayBaseUrl,
      gatewayApiKey: input.config.gatewayApiKey,
      gatewayModel: input.config.gatewayModel,
      gatewayTimeoutMs: input.config.gatewayTimeoutMs,
      mcpSearchUrl: input.config.mcpSearchUrl,
      mcpSearchBearerToken: input.config.mcpSearchBearerToken,
      mcpAllowedHosts: input.config.mcpAllowedHosts,
      mcpToolName: input.config.mcpToolName,
      mcpTimeoutMs: input.config.mcpTimeoutMs,
      amapWebServiceKey: input.config.amapWebServiceKey
    })
    await input.send(formatBotReply(
      response.answer,
      input.config.siteUrl,
      input.config.maxReplyChars,
      response.citations
    ))
    try {
      recordAssistantSuccess(input.client, context, response)
    } catch {
      // Analytics remains optional during migrations.
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE'
    try {
      recordAssistantFailure(input.client, context, code, Date.now() - startedAt)
    } catch {
      // Analytics remains optional during migrations.
    }
    logBotFailure(input.question, code)
    await input.send(formatBotReply('暂时无法整理这个问题，请稍后再试。', input.config.siteUrl, input.config.maxReplyChars))
  }
}
