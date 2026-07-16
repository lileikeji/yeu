export const SESSION_COOKIE_NAME = 'yeu_admin_session'
export const CSRF_COOKIE_NAME = 'yeu_admin_csrf'
/** Used when Secure cookies are enabled (HTTPS / production). */
export const HOST_SESSION_COOKIE_NAME = '__Host-yeu_admin_session'
export const HOST_CSRF_COOKIE_NAME = '__Host-yeu_admin_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

export function authCookieNames(secure: boolean): {
  session: string
  csrf: string
} {
  if (secure) {
    return {
      session: HOST_SESSION_COOKIE_NAME,
      csrf: HOST_CSRF_COOKIE_NAME
    }
  }
  return {
    session: SESSION_COOKIE_NAME,
    csrf: CSRF_COOKIE_NAME
  }
}

/** Cookie names the browser may still hold during secure/non-secure transitions. */
export const ALL_SESSION_COOKIE_NAMES = [
  HOST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME
] as const

export const ALL_CSRF_COOKIE_NAMES = [
  HOST_CSRF_COOKIE_NAME,
  CSRF_COOKIE_NAME
] as const
