import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { userFetch, withUserRequestOptions } from '~~/app/utils/user-request'

export type AppUser = {
  id: string
  username: string
  displayName: string
  major: string | null
  dormBuilding: string | null
  status: string
}

export type UserSessionPayload = {
  authenticated: boolean
  user?: AppUser
  csrfToken?: string
  expiresAt?: string
}

const userState = () => useState<AppUser | null>('yeu-user', () => null)
const checkedState = () => useState<boolean>('yeu-user-checked', () => false)
const loadingState = () => useState<boolean>('yeu-user-loading', () => false)

async function fetchSessionPayload(): Promise<UserSessionPayload> {
  // SSR must forward the browser cookies; bare $fetch does not.
  if (import.meta.server) {
    const requestFetch = useRequestFetch()
    return await requestFetch<UserSessionPayload>(
      '/api/auth/session',
      withUserRequestOptions() as never
    )
  }
  return await userFetch<UserSessionPayload>('/api/auth/session')
}

export function useUserSession() {
  const user = userState()
  const checked = checkedState()
  const loading = loadingState()

  const isAuthenticated = computed(() => Boolean(user.value))

  async function refreshSession(force = false): Promise<AppUser | null> {
    if (loading.value) return user.value
    if (checked.value && !force) return user.value

    loading.value = true
    try {
      const payload = await fetchSessionPayload()
      if (payload.authenticated && payload.user) {
        user.value = payload.user
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      checked.value = true
      loading.value = false
    }
    return user.value
  }

  async function login(username: string, password: string): Promise<AppUser> {
    const payload = await userFetch<UserSessionPayload>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    if (!payload.authenticated || !payload.user) {
      throw new Error('登录失败')
    }
    user.value = payload.user
    checked.value = true
    return payload.user
  }

  async function logout(): Promise<void> {
    try {
      await userFetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (!isAuthorizationError(error)) {
        throw new Error(getRequestMessage(error, '退出登录失败'))
      }
    } finally {
      user.value = null
      checked.value = true
    }
  }

  function setUser(next: AppUser | null): void {
    user.value = next
    checked.value = true
  }

  return {
    user,
    checked,
    loading,
    isAuthenticated,
    refreshSession,
    login,
    logout,
    setUser
  }
}
