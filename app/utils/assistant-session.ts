/**
 * Anonymous, persistent assistant session id (client-side only).
 *
 * The server never stores the raw id: `server/modules/assistant/memory.ts` hashes
 * it (sha256) into a `session_key`, so the backend cannot recover the browser's
 * session identity. The id is only used to scope per-session memory, follow-up
 * composition and future personalization — keep it free of any personal data.
 */

export const ASSISTANT_SESSION_STORAGE_KEY = 'yeu-assistant-session-v1'

const ASSISTANT_SESSION_ID_PATTERN = /^[A-Za-z0-9._~-]{8,128}$/

function randomSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the next generator.
  }
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // Last-resort generator below.
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Read the persisted anonymous session id, or create and persist one. Returns
 * null only outside a browser or when storage is unavailable (callers then
 * simply omit sessionId and the server behaves exactly as before).
 */
export function getOrCreateAssistantSessionId(): string | null {
  if (import.meta.server || typeof localStorage === 'undefined') return null
  try {
    const existing = localStorage.getItem(ASSISTANT_SESSION_STORAGE_KEY)
    if (existing && ASSISTANT_SESSION_ID_PATTERN.test(existing)) return existing
    const created = randomSessionId()
    if (!ASSISTANT_SESSION_ID_PATTERN.test(created)) return null
    localStorage.setItem(ASSISTANT_SESSION_STORAGE_KEY, created)
    return created
  } catch {
    return null
  }
}

/** Drop the persisted session id (privacy: forget everything session-scoped). */
export function clearAssistantSessionId(): void {
  if (import.meta.server || typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(ASSISTANT_SESSION_STORAGE_KEY)
  } catch {
    // Best-effort only.
  }
}
