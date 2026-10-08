import { assistantConfigFromValues } from '../../utils/assistant-config'

/**
 * 机器人（QQ / 微信 / 微信服务号）渠道的 AI 配置。
 *
 * 检索通道字段（embedding / rerank / rewrite 等）直接复用网页与小程序的共用映射，
 * 只在这里补上机器人特有的站点地址与回复长度限制。过去这里手写了一份字段子集，
 * 漏掉 11 个检索字段，导致同一问题在机器人里只走关键词通道。
 */
export function botAssistantConfig(runtime: Record<string, unknown>) {
  return {
    siteUrl: String(runtime.botSiteUrl || 'https://yx.huiliyill.cn/'),
    maxReplyChars: Number(runtime.botMaxReplyChars || 1800),
    ...assistantConfigFromValues(runtime)
  }
}

export function botIntegrationDisabled(): never {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

export function botRateLimited(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429)
}
