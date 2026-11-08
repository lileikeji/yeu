/**
 * 学生账号入口已于 2026-11-08 重新开放（开放注册 + 楼栋群聊）。
 *
 * 现在的语义：
 * - /login 恢复公开（登录/注册页），只加防缓存头；
 * - /chat、/me 仍是登录后私页：无会话 cookie 的 GET 直接 302 到
 *   /login?redirect=<原路径>（比渲染白壳再由客户端中间件踢走体验好）；
 *   有 cookie 则放行（SSR 不验会话真伪，API 层 401 是第二道门）。
 * 未登录重定向必须在服务端做：Nuxt route middleware 在客户端才跑，SSR 会
 * 先渲染出页面壳（旧书签/直链会闪一下再跳）。
 */
import { getCookie, getMethod, getRequestURL, sendRedirect, setHeader } from 'h3'
import { readUserSessionCookie } from '../utils/user-security'

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path
}

function isPrivateUserPage(pathname: string): boolean {
  const path = pathname
  return path === '/chat'
    || path.startsWith('/chat/')
    || path === '/me'
    || path.startsWith('/me/')
}

function isLoginPage(pathname: string): boolean {
  const path = pathname
  return path === '/login' || path.startsWith('/login/')
}

function applyPrivatePageHeaders(event: Parameters<typeof setHeader>[0]): void {
  // Never let CDN/browser cache private HTML or the guest login redirect.
  setHeader(event, 'Cache-Control', 'private, no-store, no-cache, must-revalidate')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Pragma', 'no-cache')
}

export default defineEventHandler((event) => {
  const method = getMethod(event).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return

  const url = getRequestURL(event)
  const path = normalizePath(url.pathname)
  if (path.startsWith('/api') || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) return

  if (isLoginPage(path)) {
    applyPrivatePageHeaders(event)
    return
  }

  if (isPrivateUserPage(path)) {
    applyPrivatePageHeaders(event)
    // 只判断会话 cookie 是否存在（真伪由 API 401 兜底），避免 SSR 里做数据库验证。
    if (!readUserSessionCookie(event)) {
      return sendRedirect(event, `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`, 302)
    }
  }
})
