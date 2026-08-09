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
  const isRepeatedAttempt = isRepeatedRecoveryAttempt(current, requested, previousAttempt, now)

  // An explicit action from the error page is a user choice and should be
  // honored even after a failed recovery. Only the implicit retry falls back
  // to the stable home route.
  const target = isRepeatedAttempt && !destination ? new URL('/', current.origin) : requested
  target.searchParams.delete('_recovered')
  // A second recovery must land on a stable URL. Appending another recovery
  // token here makes the error page navigate back into itself indefinitely.
  if (isRepeatedAttempt) target.searchParams.delete(RECOVERY_QUERY_KEY)
  else target.searchParams.set(RECOVERY_QUERY_KEY, String(now))
  return target
}

function isRepeatedRecoveryAttempt(
  current: URL,
  requested: URL,
  previousAttempt: RecoveryAttempt | null,
  now: number
): boolean {
  return current.searchParams.has(RECOVERY_QUERY_KEY)
    || Boolean(
      previousAttempt
      && now - previousAttempt.at < RECOVERY_WINDOW_MS
      && previousAttempt.pathname === requested.pathname
    )
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
  const current = new URL(window.location.href)
  const requested = new URL(
    options.destination || `${current.pathname}${current.search}${current.hash}`,
    current.origin
  )
  const repeatedAttempt = isRepeatedRecoveryAttempt(current, requested, previousAttempt, now)
  const target = resolveRecoveryUrl(window.location.href, options.destination, previousAttempt, now)

  try {
    window.sessionStorage.setItem(RECOVERY_SESSION_KEY, JSON.stringify({
      at: now,
      pathname: target.pathname
    } satisfies RecoveryAttempt))
  } catch {
    // Recovery still works when private browsing blocks session storage.
  }

  // Cache and service-worker cleanup is expensive. Once recovery has already
  // been attempted, keep the browser responsive and let the user choose a
  // stable route instead of repeating the same cleanup/navigation cycle.
  if (!repeatedAttempt) await removeStaleApplicationCaches()

  try {
    void Promise.resolve(options.clearNuxtError?.()).catch(() => undefined)
  } catch {
    // A full document navigation below also clears Nuxt's in-memory error state.
  }

  window.location.replace(target.toString())
}
