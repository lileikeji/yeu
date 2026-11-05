/**
 * 抓取出口中继。
 *
 * 学校主站的通知栏目（`www.yeu.edu.cn/tzgg/list.psp` 等）对机房 IP 一律返回
 * 「No Permission」，只有校园网出口能取到。这里留一个出口开关：配好
 * `CRAWL_FETCH_PROXY` 之后，所有抓取请求先过中继，规则、解析、打分都不用改。
 *
 *   CRAWL_FETCH_PROXY='https://relay.example/fetch?url={url}'
 *   CRAWL_FETCH_PROXY='http://10.0.0.9:8080/'   # 没有 {url} 时按前缀拼接
 *
 * 中继可以是校园网里的一台 nginx 反代、内网 HTTP 代理的转发入口，
 * 或者任何能出校园网的转发服务；本项目只负责把 URL 交给它。
 */

/** 把目标 URL 包成中继地址；没配中继时原样返回。 */
export function relayFetchUrl(target: string, template: string = process.env.CRAWL_FETCH_PROXY ?? ''): string {
  const trimmed = template.trim()
  if (!trimmed) return target
  if (trimmed.includes('{url}')) return trimmed.replace('{url}', encodeURIComponent(target))
  return `${trimmed.replace(/\/+$/u, '/')}${target.replace(/^\/+/u, '')}`
}

/** 当前是否配置了中继出口。 */
export function hasFetchRelay(template: string = process.env.CRAWL_FETCH_PROXY ?? ''): boolean {
  return template.trim().length > 0
}
