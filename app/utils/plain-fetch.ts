/**
 * 与 `$fetch` 行为一致的转调，但不参与 Nuxt 类型化路由的重载推断。
 *
 * 站点路由增多后，部分调用点的泛型实例化会撞到 TS2589（instantiation is excessively
 * deep）。这些调用都是「路径已知、响应类型已知」的内部接口，用字符串入口转调即可，
 * 运行时仍然走 `$fetch`（SSR 期间依然继承请求上下文）。
 */
export function plainFetch<T>(url: string, options?: Record<string, unknown>): Promise<T> {
  return ($fetch as unknown as (u: string, o?: Record<string, unknown>) => Promise<T>)(url, options)
}
