/**
 * AI 检索渠道共用配置（web / 小程序 / 机器人）。
 *
 * 这里是唯一的字段映射来源：三个渠道过去各自手写一份，机器人那份漏掉了
 * embedding / rerank / rewrite 共 11 个字段，于是同一个问题在 QQ/微信里只走
 * 关键词通道，召回明显差于网页与小程雪（"答非所问" 的渠道版本）。
 */
export interface AssistantChannelConfig {
  gatewayBaseUrl: string
  gatewayApiKey: string
  gatewayModel: string
  gatewayTimeoutMs: number
  mcpSearchUrl: string
  mcpSearchBearerToken: string
  mcpAllowedHosts: string
  mcpToolName: string
  mcpTimeoutMs: number
  amapWebServiceKey: string
  embeddingBaseUrl: string
  embeddingApiKey: string
  embeddingModel: string
  embeddingTimeoutMs: number
  rerankBaseUrl: string
  rerankApiKey: string
  rerankModel: string
  rerankTimeoutMs: number
  rewriteEnabled: boolean
  rewriteModel: string
  rewriteMaxVariants: number
  rewriteTimeoutMs: number
  rerankLocalEnabled: boolean
  rerankLocalModel: string
}

/**
 * 纯配置读取，不含任何业务分支，也不依赖 H3 —— 机器人入口只有一个普通 runtime
 * 对象，网页/小程序入口有 H3Event，两者都从这里取值。
 */
export function assistantConfigFromValues(runtime: Record<string, unknown>): AssistantChannelConfig {
  return {
    gatewayBaseUrl: String(runtime.aiGatewayBaseUrl || ''),
    gatewayApiKey: String(runtime.aiGatewayApiKey || ''),
    gatewayModel: String(runtime.aiGatewayModel || 'gpt-5.4'),
    gatewayTimeoutMs: Math.max(60_000, Number(runtime.aiGatewayTimeoutMs) || 60_000),
    mcpSearchUrl: String(runtime.aiMcpSearchUrl || ''),
    mcpSearchBearerToken: String(runtime.aiMcpSearchBearerToken || ''),
    mcpAllowedHosts: String(runtime.aiMcpAllowedHosts || 'mcp.firecrawl.dev'),
    mcpToolName: String(runtime.aiMcpToolName || 'firecrawl_search'),
    // 下限与服务层的 MIN_MCP_TIMEOUT_MS 保持一致：网页兜底是最后手段，一次卡死的
    // 外部搜索不该主导整个回复的等待时间。
    mcpTimeoutMs: Math.max(10_000, Number(runtime.aiMcpTimeoutMs) || 15_000),
    amapWebServiceKey: String(runtime.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''),
    embeddingBaseUrl: String(runtime.aiEmbeddingBaseUrl || ''),
    embeddingApiKey: String(runtime.aiEmbeddingApiKey || ''),
    embeddingModel: String(runtime.aiEmbeddingModel || 'text-embedding-v3'),
    embeddingTimeoutMs: Math.max(5_000, Number(runtime.aiEmbeddingTimeoutMs) || 15_000),
    rerankBaseUrl: String(runtime.aiRerankBaseUrl || ''),
    rerankApiKey: String(runtime.aiRerankApiKey || ''),
    rerankModel: String(runtime.aiRerankModel || 'BAAI/bge-reranker-v2-m3'),
    rerankTimeoutMs: Math.max(5_000, Number(runtime.aiRerankTimeoutMs) || 15_000),
    rewriteEnabled: runtime.aiRewriteEnabled === true || String(runtime.aiRewriteEnabled) === 'true',
    rewriteModel: String(runtime.aiRewriteModel || ''),
    rewriteMaxVariants: Math.max(1, Math.min(3, Number(runtime.aiRewriteMaxVariants) || 2)),
    rewriteTimeoutMs: Math.max(5_000, Number(runtime.aiRewriteTimeoutMs) || 12_000),
    rerankLocalEnabled: runtime.aiRerankLocalEnabled === true || String(runtime.aiRerankLocalEnabled) === 'true',
    rerankLocalModel: String(runtime.aiRerankLocalModel || '')
  }
}

export function assistantConfigFromRuntime(event: import('h3').H3Event): AssistantChannelConfig {
  return assistantConfigFromValues(useRuntimeConfig(event) as Record<string, unknown>)
}
