const AUTOMATION_USER_AGENT_PATTERN = /(?:headlesschrome|playwright|puppeteer|selenium|phantomjs|scrapy|python-(?:requests|httpx)|aiohttp|go-http-client|bytespider|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|ccbot|perplexitybot|google-extended|coze)/i

/**
 * Known automation clients are blocked at the edge when Nginx is configured,
 * and at the application as a fallback for direct-origin requests.
 * Generic browser UAs are intentionally not treated as bots.
 */
export function isAutomationUserAgent(value: string | null | undefined): boolean {
  return AUTOMATION_USER_AGENT_PATTERN.test(String(value || ''))
}

export const CRAWL_TRAP_PATH = '/__yeu_crawl_trap__'
export const CRAWL_TRAP_ACTION = 'crawler_honeypot'
export const CRAWL_TRAP_TTL_MS = 30 * 60 * 1000

export function isCrawlerProtectedPath(pathname: string): boolean {
  return pathname === '/'
    || pathname.startsWith('/api/public')
    || (!pathname.startsWith('/api') && !pathname.startsWith('/_') && !pathname.includes('.'))
}
