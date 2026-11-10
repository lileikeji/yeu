import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

/**
 * F2「来源与核验时间」的回归：
 *
 * 1. 组件必须能用；没有来源时必须原样显示空态，并给纠错入口；
 * 2. 组件只展示调用方交进来的来源：不拿第一条顶替、不写兜底来源、不从
 *    fetchedAt 推 verifiedAt —— 这三条都是「假装有来源」；
 * 3. 地点详情页接的是它自己的 place.sources，不另调证据链接口拼假 claimId。
 *
 * 本仓库既有风格：读源码做轻量断言，不渲染组件。
 */

const componentSource = readFileSync(resolve('app/components/SourceCitationBlock.vue'), 'utf8')
const placePageSource = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')

test('source citation block renders an honest empty state with a report link', () => {
  assert.match(componentSource, /这条信息还没有可核验来源/)
  assert.match(componentSource, /说明是哪条信息不对/)
  assert.match(componentSource, /path: '\/feedback'/)
  assert.match(componentSource, /targetType: 'place'/)
  assert.match(componentSource, /targetId: props\.targetId/)
  // 核验时间缺失时直说缺失，不用抓取时间顶替。
  assert.match(componentSource, /未标注核验时间/)
  assert.match(componentSource, /核验时间：/)
})

test('source citation block lists sources with a safe external link and clamped quote', () => {
  assert.match(componentSource, /level\?: string \| null/)
  assert.match(componentSource, /official\?: boolean \| null/)
  assert.match(componentSource, /verifiedAt\?: string \| null/)
  assert.match(componentSource, /fetchedAt\?: string \| null/)
  assert.match(componentSource, /safeExternalHref\(source\.url\)/)
  assert.match(componentSource, /target="_blank"/)
  assert.match(componentSource, /rel="noopener noreferrer"/)
  assert.match(componentSource, /line-clamp-2/)
  assert.match(componentSource, /surface-panel/)
  assert.match(componentSource, /section-kicker/)
  assert.match(componentSource, /dark:/)
})

test('source citation block never back-fills a source', () => {
  // 第一条顶替 / fallback 兜底 / ?? 兜底数组，都会把「没有来源」伪装成「有来源」。
  assert.doesNotMatch(componentSource, /sources\s*\[\s*0\s*\]/)
  assert.doesNotMatch(componentSource, /fallback/i)
  assert.doesNotMatch(componentSource, /sources\s*\?\?/)
  assert.doesNotMatch(componentSource, /\?\?\s*sources/)
  // 组件自己不发请求去补来源。
  assert.doesNotMatch(componentSource, /\$fetch\(|useFetch\(/)
})

test('places detail page mounts SourceCitationBlock with the real place sources', () => {
  assert.match(placePageSource, /<SourceCitationBlock\b/)
  assert.match(placePageSource, /:sources="placeCitationSources"/)
  assert.match(placePageSource, /:target-id="place\.id"/)
  // 来源来自地点接口已有的 place.sources，字段改名后逐条搬运。
  assert.match(placePageSource, /place\.value\?\.sources/)
  assert.match(placePageSource, /level: source\.sourceLevel/)
  assert.match(placePageSource, /official: source\.isOfficial/)
})

test('places detail page never passes fetchedAt as verifiedAt and fakes no claim id', () => {
  assert.match(placePageSource, /verifiedAt: source\.accessedAt/)
  assert.doesNotMatch(placePageSource, /verifiedAt:\s*[\w.]*fetchedAt/)
  assert.doesNotMatch(placePageSource, /fetchedAt:\s*source\./)
  assert.doesNotMatch(placePageSource, /claim-id=/)
  // 详情页不为这块另发请求拼来源。
  assert.doesNotMatch(placePageSource, /\$fetch\(|useFetch\(/)
})
