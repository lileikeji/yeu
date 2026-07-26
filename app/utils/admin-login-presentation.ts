/** Admin login presentation helpers — pure, testable without Nuxt runtime. */

export const adminLoginMessages = {
  missingCredentials: '请输入管理员账号和密码。',
  genericFailure: '登录失败，请稍后重试。',
  invalidCredentials: '账号或密码不正确。'
} as const

export function isAdminLoginPayloadObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when a session/login payload indicates an authenticated admin. */
export function isAdminSessionAuthenticated(payload: unknown): boolean {
  if (!isAdminLoginPayloadObject(payload)) return false
  if (
    payload.authenticated === true
    || payload.isAuthenticated === true
    || payload.loggedIn === true
  ) {
    return true
  }
  if (isAdminLoginPayloadObject(payload.user) || isAdminLoginPayloadObject(payload.admin)) {
    return true
  }
  return isAdminLoginPayloadObject(payload.session)
    && isAdminLoginPayloadObject(payload.session.user)
}

/** Map login request failures to student-facing Chinese error copy. */
export function adminLoginRequestMessage(error: unknown): string {
  if (!isAdminLoginPayloadObject(error)) return adminLoginMessages.genericFailure
  if (isAdminLoginPayloadObject(error.data) && typeof error.data.message === 'string') {
    return error.data.message
  }
  if (typeof error.statusMessage === 'string') return error.statusMessage
  return adminLoginMessages.invalidCredentials
}

/**
 * Resolve post-login redirect. Only same-origin admin paths are allowed;
 * login itself and non-admin targets fall back to /admin.
 */
export function resolveAdminLoginRedirectTarget(redirectQuery: unknown): string {
  const value = typeof redirectQuery === 'string' ? redirectQuery : '/admin'
  // Same-origin path only: /admin or /admin/... without traversal, protocol-relative, or /adminfoo prefix tricks.
  if (value === '/admin') return '/admin'
  if (!value.startsWith('/admin/')) return '/admin'
  if (value.startsWith('/admin/login')) return '/admin'
  if (value.includes('//') || value.includes('\\') || value.includes('..')) return '/admin'
  if (!/^\/admin(?:\/[\w.-]+)*\/?$/.test(value)) return '/admin'
  return value.replace(/\/+$/, '') || '/admin'
}

/**
 * Organization accounts always enter their isolated workspace. This avoids
 * mounting the super-admin dashboard before the layout has loaded the session.
 */
export function resolveAdminPostLoginTarget(
  payload: unknown,
  redirectQuery: unknown
): string | { path: string, query?: Record<string, string> } {
  if (!isAdminLoginPayloadObject(payload)) {
    return resolveAdminLoginRedirectTarget(redirectQuery)
  }
  const admin = isAdminLoginPayloadObject(payload.admin) ? payload.admin : null
  if (admin?.role !== 'organization') {
    return resolveAdminLoginRedirectTarget(redirectQuery)
  }
  return admin.mustChangePassword === true
    ? { path: '/admin/organization', query: { password: 'required' } }
    : '/admin/organization'
}
