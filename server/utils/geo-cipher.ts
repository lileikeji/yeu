import { resolveGeoCipherKey } from '../../shared/utils/geo-obfuscation'

/**
 * 坐标混淆 key：nuxt.config 构建期生成，经 nitro replace 落为常量 __GEO_CIPHER_KEY__。
 * 与 client 端（vite define）同源同值；纯函数/测试上下文如需固定 key 可显式传参覆盖。
 */
export function tryRuntimeGeoCipherKey(): string | null {
  return resolveGeoCipherKey()
}
