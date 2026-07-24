export function botAssistantConfig(runtime: Record<string, unknown>) {
  return {
    siteUrl: String(runtime.botSiteUrl || 'https://yeu.huiliyill.cn/'),
    maxReplyChars: Number(runtime.botMaxReplyChars || 1800),
    gatewayBaseUrl: String(runtime.aiGatewayBaseUrl || ''),
    gatewayApiKey: String(runtime.aiGatewayApiKey || ''),
    gatewayModel: String(runtime.aiGatewayModel || 'gpt-5.4'),
    gatewayTimeoutMs: Number(runtime.aiGatewayTimeoutMs || 25_000),
    mcpSearchUrl: String(runtime.aiMcpSearchUrl || ''),
    mcpSearchBearerToken: String(runtime.aiMcpSearchBearerToken || ''),
    mcpAllowedHosts: String(runtime.aiMcpAllowedHosts || 'mcp.firecrawl.dev'),
    mcpToolName: String(runtime.aiMcpToolName || 'firecrawl_search'),
    mcpTimeoutMs: Number(runtime.aiMcpTimeoutMs || 12_000)
  }
}

export function botIntegrationDisabled(): never {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

export function botRateLimited(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429)
}
