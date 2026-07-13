const LOCAL_ORIGIN = 'https://local.invalid'

export function safeLocalPath(value: unknown): string | null {
  const candidate = (Array.isArray(value) ? value[0] : value)
  if (typeof candidate !== 'string' || !candidate.trim()) return null

  try {
    const parsed = new URL(candidate.trim(), LOCAL_ORIGIN)
    if (parsed.origin !== LOCAL_ORIGIN) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}
