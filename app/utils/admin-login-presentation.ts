/** Admin login presentation helpers — pure, testable without Nuxt runtime. */

export const adminLoginMessages = {
  missingCredentials: '请输入管理员账号和密码。',
  genericFailure: '登录失败，请稍后重试。',
  invalidCredentials: '账号或密码不正确。'
} as const

export const adminDeviceLoginMessages = {
  disabled: '当前环境未启用设备密钥，请使用密码登录。',
  keyMismatch: '本机保存的设备密钥与当前站点不匹配，请重新导入。',
  rateLimited: '设备密钥尝试过于频繁，请稍后再试或使用密码登录。',
  rejected: '设备密钥未通过验证，请重新导入密钥或使用密码登录。',
  unavailable: '设备密钥服务暂时不可用，请使用密码登录。'
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

function findErrorCode(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isAdminLoginPayloadObject(current)) return null
    if (typeof current.code === 'string') return current.code
    current = current.data
  }
  return null
}

function findStatusCode(error: unknown): number | null {
  let current = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isAdminLoginPayloadObject(current)) return null
    if (typeof current.statusCode === 'number') return current.statusCode
    if (typeof current.status === 'number') return current.status
    current = current.data
  }
  return null
}

/** Keep device-login failures actionable without exposing verification details. */
export function adminDeviceLoginRequestMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const code = findErrorCode(error)
  const status = findStatusCode(error)

  if (code === 'ADMIN_DEVICE_LOGIN_DISABLED' || status === 404) {
    return adminDeviceLoginMessages.disabled
  }
  if (message === 'ADMIN_DEVICE_KEY_NOT_FOUND') {
    return adminDeviceLoginMessages.keyMismatch
  }
  if (status === 429) return adminDeviceLoginMessages.rateLimited
  if (code === 'ADMIN_DEVICE_AUTH_FAILED' || status === 401) {
    return adminDeviceLoginMessages.rejected
  }
  return adminDeviceLoginMessages.unavailable
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
