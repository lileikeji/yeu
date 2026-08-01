export function botAssistantConfig(runtime: Record<string, unknown>) {
  return {
    siteUrl: String(runtime.botSiteUrl || 'https://yx.huiliyill.cn/'),
    maxReplyChars: Number(runtime.botMaxReplyChars || 1800),
    gatewayBaseUrl: String(runtime.aiGatewayBaseUrl || ''),
    gatewayApiKey: String(runtime.aiGatewayApiKey || ''),
    gatewayModel: String(runtime.aiGatewayModel || 'gpt-5.4'),
    gatewayTimeoutMs: Math.max(60_000, Number(runtime.aiGatewayTimeoutMs) || 60_000),
    mcpSearchUrl: String(runtime.aiMcpSearchUrl || ''),
    mcpSearchBearerToken: String(runtime.aiMcpSearchBearerToken || ''),
    mcpAllowedHosts: String(runtime.aiMcpAllowedHosts || 'mcp.firecrawl.dev'),
    mcpToolName: String(runtime.aiMcpToolName || 'firecrawl_search'),
    mcpTimeoutMs: Math.max(25_000, Number(runtime.aiMcpTimeoutMs) || 25_000),
    amapWebServiceKey: String(runtime.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '')
  }
}

export function botIntegrationDisabled(): never {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

export function botRateLimited(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 429)
}
