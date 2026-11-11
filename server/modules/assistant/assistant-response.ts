import type { ApiAssistantCitation, ApiAssistantResponse } from '../../../shared/types/server'

/**
 * 引用状态。`none` 表示「模型没指向任何证据」——这时 citations 必须为空，
 * 不允许退回「证据列表前 N 条」充当引用。
 */
export type AssistantCitationStatus = 'cited' | 'none'

/**
 * 对外响应只加字段、不删字段：shared/types 里的 ApiAssistantResponse 是公开契约
 * （API 与前端都在用），本次不扩它，改在 assistant 模块内声明扩展类型。
 */
export interface AssistantAnswerResponse extends ApiAssistantResponse {
  citationStatus?: AssistantCitationStatus
  /** 内容安全拦截：既不是答案也不是证据不足，两级缓存都不该收它。 */
  blocked?: boolean
}

/**
 * 把模型的引用下标解析成引用列表。
 *
 * 原实现是 `selectedCitations.length > 0 ? selectedCitations : evidence.slice(0, 1)`：
 * 模型一条引用都没给时，硬塞证据列表第一条，前端「参考内容」下面就出现一条
 * 模型从未引用过的来源——这是造假，不是兜底。改为空就是空，并显式标记 none。
 */
export function resolveAssistantCitations(
  evidence: readonly ApiAssistantCitation[],
  citationIndexes: readonly number[]
): { citations: ApiAssistantCitation[], citationStatus: AssistantCitationStatus } {
  const seen = new Set<number>()
  const citations: ApiAssistantCitation[] = []
  for (const index of citationIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= evidence.length || seen.has(index)) continue
    seen.add(index)
    const item = evidence[index]
    if (item) citations.push(item)
  }
  return citations.length > 0
    ? { citations, citationStatus: 'cited' }
    : { citations: [], citationStatus: 'none' }
}

export function isBlockedAssistantResponse(
  response: Pick<ApiAssistantResponse, 'answer'> & { blocked?: boolean }
): boolean {
  return response.blocked === true
}

/** 拦截回答的固定文案，调用方与测试共用。 */
export const BLOCKED_ASSISTANT_ANSWER = '禁止回答'
