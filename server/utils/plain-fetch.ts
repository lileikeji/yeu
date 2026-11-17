/** 服务端侧的 `plainFetch`，用途与 `app/utils/plain-fetch.ts` 相同（规避 TS2589）。 */
export function plainFetch<T>(url: string, options?: Record<string, unknown>): Promise<T> {
  return ($fetch as unknown as (u: string, o?: Record<string, unknown>) => Promise<T>)(url, options)
}
