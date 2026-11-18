// 快照同步与校验共用的一套规则。
//
// 主仓的 TS 用打包器解析（相对导入不写扩展名），而 atlas 的构建是直接 `node build.mts`
// 跑类型擦除，Node 要求相对导入必须带扩展名。所以把主仓文件拷进 `src/map-source/` 时，
// 要统一给相对导入补 `.ts`——这一步必须由同步脚本与守卫脚本共用同一份实现，
// 否则校验会因为「同一份文件两种写法」永远对不上。
import { createHash } from 'node:crypto'

/** 给相对导入补上 `.ts`；已经带扩展名、包名、别名（`~/`、`#`）一律不动。 */
export function rewriteImportsForNode(source: string): string {
  return source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g,
    (whole, lead: string, quote: string, specifier: string) => {
      if (/\.[a-z]+$/i.test(specifier)) return whole
      return `${lead}${quote}${specifier}.ts${quote}`
    }
  )
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
