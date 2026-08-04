const RECOVERY_QUERY_KEY = '_recover'
const RECOVERY_SESSION_KEY = 'yeu:client-recovery'
const RECOVERY_WINDOW_MS = 5 * 60 * 1000
const CACHE_CLEANUP_TIMEOUT_MS = 1800

interface RecoveryAttempt {
  at: number
  pathname: string
}

interface RecoverClientPageOptions {
  destination?: string
  clearNuxtError?: () => unknown
}

function readRecoveryAttempt(storage: Storage): RecoveryAttempt | null {
  try {
    const value = JSON.parse(storage.getItem(RECOVERY_SESSION_KEY) || 'null') as Partial<RecoveryAttempt> | null
    if (!value || typeof value.at !== 'number' || typeof value.pathname !== 'string') return null
    return { at: value.at, pathname: value.pathname }
  } catch {
    return null
  }
}

export function resolveRecoveryUrl(
  currentHref: string,
  destination: string | undefined,
  previousAttempt: RecoveryAttempt | null,
  now = Date.now()
): URL {
  const current = new URL(currentHref)
  const requested = new URL(destination || `${current.pathname}${current.search}${current.hash}`, current.origin)
  const isRepeatedAttempt = current.searchParams.has(RECOVERY_QUERY_KEY)
    || Boolean(
      previousAttempt
      && now - previousAttempt.at < RECOVERY_WINDOW_MS
      && previousAttempt.pathname === requested.pathname
    )

  const target = isRepeatedAttempt ? new URL('/', current.origin) : requested
  target.searchParams.delete('_recovered')
  target.searchParams.set(RECOVERY_QUERY_KEY, String(now))
  return target
}

async function removeStaleApplicationCaches(): Promise<void> {
  const tasks: Promise<unknown>[] = []

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(
          registrations
            .filter(registration => new URL(registration.scope).origin === window.location.origin)
            .map(registration => registration.unregister())
        ))
    )
  }

  if ('caches' in window) {
    tasks.push(
      caches.keys().then(cacheNames => Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      ))
    )
  }

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise(resolve => window.setTimeout(resolve, CACHE_CLEANUP_TIMEOUT_MS))
  ])
}

export async function recoverClientPage(options: RecoverClientPageOptions = {}): Promise<void> {
  if (!import.meta.client) return

  const now = Date.now()
  const previousAttempt = readRecoveryAttempt(window.sessionStorage)
  const target = resolveRecoveryUrl(window.location.href, options.destination, previousAttempt, now)

  try {
    window.sessionStorage.setItem(RECOVERY_SESSION_KEY, JSON.stringify({
      at: now,
      pathname: target.pathname
    } satisfies RecoveryAttempt))
  } catch {
    // Recovery still works when private browsing blocks session storage.
  }

  await removeStaleApplicationCaches()

  try {
    void Promise.resolve(options.clearNuxtError?.()).catch(() => undefined)
  } catch {
    // A full document navigation below also clears Nuxt's in-memory error state.
  }

  window.location.replace(target.toString())
}
