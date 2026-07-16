/**
 * Escape user search input for SQL LIKE patterns.
 * Strips wildcard metacharacters so % / _ cannot expand the match set (DoS / over-match).
 * Drizzle still parameterizes the pattern; this is not string-concat SQL injection protection
 * (already handled by the ORM) but LIKE semantics hardening.
 */

export function cleanSearchTerm(value: string): string {
  return value.replace(/[%_]/g, '').trim()
}

/** Build a contains pattern for LIKE after cleaning; returns null if empty. */
export function likeContainsPattern(value: string): string | null {
  const cleaned = cleanSearchTerm(value)
  if (!cleaned) return null
  return `%${cleaned}%`
}
