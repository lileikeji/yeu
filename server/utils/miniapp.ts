export const MINIAPP_API_PREFIX = '/api/miniapp/v1/'

const MINIAPP_READ_ROUTES = [
  /^\/api\/miniapp\/v1\/home$/,
  /^\/api\/miniapp\/v1\/places(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/guides(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/procedures(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/notices(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/departments(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/clubs(?:\/[^/]+)?$/,
  /^\/api\/miniapp\/v1\/search$/,
  /^\/api\/miniapp\/v1\/nearby$/,
  /^\/api\/miniapp\/v1\/directions\/walking$/,
  /^\/api\/miniapp\/v1\/popularity\/state$/
]

/** 小程序唯一允许的写入型路径：只读的埋点上报、AI 问答查询与投票登录/投票。 */
const MINIAPP_POST_ROUTES = new Set([
  '/api/miniapp/v1/track',
  '/api/miniapp/v1/assistant',
  '/api/miniapp/v1/popularity/login',
  '/api/miniapp/v1/popularity/vote',
  '/api/miniapp/v1/popularity/withdraw',
  '/api/miniapp/v1/popularity/visit'
])

function normalizeMiniAppPath(pathname: string): string {
  const [path = '/'] = pathname.split('?')
  return path.replace(/\/+$/, '') || '/'
}

export function isMiniAppReadRoute(pathname: string, method: string): boolean {
  if (method.toUpperCase() !== 'GET') return false
  const normalizedPath = normalizeMiniAppPath(pathname)
  return MINIAPP_READ_ROUTES.some(route => route.test(normalizedPath))
}

/** 来源豁免用的 POST 白名单判定。 */
export function isMiniAppPostRoute(pathname: string, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false
  return MINIAPP_POST_ROUTES.has(normalizeMiniAppPath(pathname))
}
