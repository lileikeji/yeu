import type { H3Event } from 'h3'
import {
  ALL_USER_CSRF_COOKIE_NAMES,
  ALL_USER_SESSION_COOKIE_NAMES,
  HOST_USER_CSRF_COOKIE_NAME,
  HOST_USER_SESSION_COOKIE_NAME,
  USER_CSRF_COOKIE_NAME,
  USER_CSRF_HEADER_NAME,
  USER_SESSION_COOKIE_NAME,
  userAuthCookieNames
} from '../../shared/constants/security'
import {
  createOpaqueToken,
  getSecurityConfig,
  hashOpaqueToken,
  safeEqual
} from './security'

export {
  ALL_USER_CSRF_COOKIE_NAMES,
  ALL_USER_SESSION_COOKIE_NAMES,
  HOST_USER_CSRF_COOKIE_NAME,
  HOST_USER_SESSION_COOKIE_NAME,
  USER_CSRF_COOKIE_NAME,
  USER_CSRF_HEADER_NAME,
  USER_SESSION_COOKIE_NAME,
  userAuthCookieNames,
  createOpaqueToken,
  getSecurityConfig,
  hashOpaqueToken,
  safeEqual
}

function clearUserAuthCookieNames(
  event: H3Event,
  names: readonly string[],
  preferSecure: boolean
): void {
  const base = {
    path: '/' as const,
    sameSite: 'lax' as const
  }
  for (const name of names) {
    deleteCookie(event, name, { ...base, secure: true })
    deleteCookie(event, name, { ...base, secure: false })
    if (preferSecure) {
      deleteCookie(event, name, { ...base, secure: true })
    }
  }
}

export function setUserAuthCookies(
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
  expiresAt: number,
  secure: boolean
): void {
  const names = userAuthCookieNames(secure)
  const common = {
    path: '/' as const,
    sameSite: 'lax' as const,
    secure,
    expires: new Date(expiresAt)
  }

  clearUserAuthCookieNames(event, secure
    ? [USER_SESSION_COOKIE_NAME, USER_CSRF_COOKIE_NAME]
    : [HOST_USER_SESSION_COOKIE_NAME, HOST_USER_CSRF_COOKIE_NAME], !secure)

  setCookie(event, names.session, sessionToken, {
    ...common,
    httpOnly: true
  })
  setCookie(event, names.csrf, csrfToken, {
    ...common,
    httpOnly: false
  })
}

export function readUserSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_USER_SESSION_COOKIE_NAME)
    || getCookie(event, USER_SESSION_COOKIE_NAME)
    || undefined
}

export function readUserCsrfCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_USER_CSRF_COOKIE_NAME)
    || getCookie(event, USER_CSRF_COOKIE_NAME)
    || undefined
}

export function clearUserAuthCookies(event: H3Event): void {
  clearUserAuthCookieNames(event, [
    ...ALL_USER_SESSION_COOKIE_NAMES,
    ...ALL_USER_CSRF_COOKIE_NAMES
  ], true)
}
