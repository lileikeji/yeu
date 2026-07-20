import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildSourcePreview,
  collectActiveLinkedSources,
  dateOnly,
  filterSourceList,
  sourcePreviewLimit,
  sourceListMessages,
  sourcePlatformLabel,
  sourceLevelGuides,
  sourceLevelLabels,
  studentFacingSourcePublisher,
  studentFacingSourceTitle
} from '../app/utils/sources-presentation'

const pageSource = readFileSync(resolve('app/pages/sources.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/sources-presentation.ts'), 'utf8')
const sourceDetailsSource = readFileSync(resolve('app/components/public/PublicSourceDetails.vue'), 'utf8')

function sampleSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    title: '学校官网通知',
    url: 'https://example.test/notice',
    platform: '学校官网',
    publisherName: '仰恩大学',
    sourceLevel: 'A' as const,
    isOfficial: true,
    publishedAt: '2026-07-01',
    accessedAt: '2026-07-10T12:00:00Z',
    status: 'active' as const,
    ...overrides
  }
}

test('sources page is a thin shell over sources-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/sources-presentation['"]/)
  assert.match(pageSource, /collectActiveLinkedSources/)
  assert.match(pageSource, /buildSourcePreview/)
  assert.match(pageSource, /filterSourceList/)
  assert.match(pageSource, /sourceLevelGuides/)
  assert.match(pageSource, /sourceLevelLabels/)
  assert.match(pageSource, /sourceListMessages/)
  assert.match(pageSource, /dateOnly/)
  assert.doesNotMatch(pageSource, /function dateOnly/)
  assert.doesNotMatch(pageSource, /const levelLabels/)
  assert.doesNotMatch(pageSource, /const sourceLevels =/)
  assert.match(utilSource, /export function collectActiveLinkedSources/)
  assert.match(utilSource, /export const sourceLevelGuides/)
  assert.match(utilSource, /export const sourceLevelLabels/)
})

test('source search keeps a comfortable mobile touch height', () => {
  assert.match(pageSource, /class="min-h-11 w-full sm:max-w-md"\s+:ui="\{ base: 'min-h-11' \}"/)
})

test('source page offers a direct path from the introduction to source search', () => {
  assert.match(pageSource, /href="#source-list"/)
  assert.match(pageSource, />\s*查找具体出处\s*<\/a>/)
  assert.match(pageSource, /id="source-list"/)
  assert.match(pageSource, /class="page-shell page-section scroll-mt-20"/)
  assert.match(pageSource, /id="source-list"[\s\S]*查看页面引用的信息出处/)
})

test('source level guides use ordinary decision wording', () => {
  assert.equal(sourceLevelLabels.A, '学校或主管部门')
  assert.equal(sourceLevelLabels.D, '地图或同学分享')
  assert.equal(sourceLevelGuides[0]?.level, '优先看')
  assert.equal(sourceLevelGuides.at(-1)?.level, '到现场再看')
  assert.match(sourceLevelGuides.at(-1)?.description ?? '', /营业情况、收费和办事要求/)
  assert.doesNotMatch(pageSource, /确认范围|判断可信度|按有效期复核|地图数据|已发布内容关联来源/)
  assert.match(pageSource, /sm:grid-cols-\[10rem_minmax\(0,1fr\)\]/)
  assert.equal(dateOnly('2026-07-10T12:00:00Z'), '2026-07-10')
  assert.equal(dateOnly('2025-12-01'), '2025-12-01')
  assert.equal(sourceListMessages.serviceUnavailable, '可以稍后再试，各篇指南仍然可以正常查看。')
  assert.equal(sourceListMessages.emptyMatch, '没有找到匹配的信息出处')
  assert.equal(sourceListMessages.emptyList, '目前还没有可以查看的信息出处')
  assert.match(pageSource, /clearSourceSearch/)
  assert.match(pageSource, /refreshSources/)
  assert.match(pageSource, /label="清空搜索"/)
  assert.match(pageSource, /label="重新试一次"/)
})

test('source platform values are translated for ordinary readers', () => {
  assert.equal(sourcePlatformLabel('official-website'), '学校官网')
  assert.equal(sourcePlatformLabel('amap-workmap'), '高德地图资料')
  assert.equal(sourcePlatformLabel('social-platform'), '社交平台资料')
  assert.equal(sourcePlatformLabel('future-platform'), 'future platform')
  assert.equal(sourcePlatformLabel(null), '公开资料')
})

test('internal map source labels are rewritten for students', () => {
  assert.equal(
    studentFacingSourceTitle('用户授权高德工作地图导入（业主标记）'),
    '高德地图位置参考'
  )
  assert.equal(studentFacingSourceTitle('仰恩大学官网通知'), '仰恩大学官网通知')
  assert.equal(studentFacingSourcePublisher('业主授权导入'), '地图位置提供者')
  assert.equal(studentFacingSourcePublisher('仰恩大学'), '仰恩大学')
  assert.match(pageSource, /studentFacingSourceTitle\(source\.title\)/)
  assert.match(pageSource, /studentFacingSourcePublisher\(source\.publisherName\)/)
  assert.equal((sourceDetailsSource.match(/studentFacingSourceTitle\(source\.title\)/g) || []).length, 2)
})

test('collectActiveLinkedSources dedupes by url, keeps newer access, and sorts', () => {
  const older = sampleSource({
    id: 'old',
    url: 'https://example.test/shared',
    accessedAt: '2026-01-01T00:00:00Z',
    title: '旧访问'
  })
  const newer = sampleSource({
    id: 'new',
    url: 'https://example.test/shared',
    accessedAt: '2026-07-10T00:00:00Z',
    title: '新访问'
  })
  const inactive = sampleSource({
    id: 'off',
    url: 'https://example.test/inactive',
    status: 'unavailable',
    title: '停用'
  })
  const unofficial = sampleSource({
    id: 'u1',
    url: 'https://example.test/clue',
    isOfficial: false,
    sourceLevel: 'D',
    title: '线索来源'
  })
  const officialB = sampleSource({
    id: 'b1',
    url: 'https://example.test/b',
    isOfficial: true,
    sourceLevel: 'B',
    title: '权威来源'
  })

  const collected = collectActiveLinkedSources(
    [{ sources: [older, inactive, officialB] }],
    [{ sources: [newer, unofficial] }]
  )

  assert.deepEqual(collected.map(item => item.id), ['new', 'b1', 'u1'])
  assert.equal(collected.find(item => item.url === 'https://example.test/shared')?.title, '新访问')
  assert.deepEqual(collectActiveLinkedSources(null, undefined), [])
  assert.deepEqual(collectActiveLinkedSources([], []), [])
})

test('source search and preview keep long lists manageable', () => {
  const sources = Array.from({ length: 12 }, (_, index) => sampleSource({
    id: `s${index}`,
    title: index === 9 ? '学生事务部通知' : `学校通知 ${index}`,
    publisherName: index === 9 ? '学生事务部' : '仰恩大学'
  }))

  assert.equal(filterSourceList(sources, '学生事务').length, 1)
  assert.equal(filterSourceList(sources, '学校或主管部门').length, 12)
  const collapsed = buildSourcePreview(sources, { expanded: false, filterActive: false })
  assert.equal(collapsed.items.length, sourcePreviewLimit)
  assert.equal(collapsed.hiddenCount, sources.length - sourcePreviewLimit)
  assert.equal(buildSourcePreview(sources, { expanded: true, filterActive: false }).items.length, 12)
  assert.equal(buildSourcePreview(filterSourceList(sources, '学生事务'), {
    expanded: false,
    filterActive: true
  }).items.length, 1)
})
