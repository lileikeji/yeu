import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  collectActiveLinkedSources,
  dateOnly,
  sourcePlatformLabel,
  sourceLevelGuides,
  sourceLevelLabels
} from '../app/utils/sources-presentation'

const pageSource = readFileSync(resolve('app/pages/sources.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/sources-presentation.ts'), 'utf8')

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
  assert.match(pageSource, /sourceLevelGuides/)
  assert.match(pageSource, /sourceLevelLabels/)
  assert.match(pageSource, /dateOnly/)
  assert.doesNotMatch(pageSource, /function dateOnly/)
  assert.doesNotMatch(pageSource, /const levelLabels/)
  assert.doesNotMatch(pageSource, /const sourceLevels =/)
  assert.match(utilSource, /export function collectActiveLinkedSources/)
  assert.match(utilSource, /export const sourceLevelGuides/)
  assert.match(utilSource, /export const sourceLevelLabels/)
})

test('source level guides keep student-facing credibility wording', () => {
  assert.equal(sourceLevelLabels.A, '官方一手')
  assert.equal(sourceLevelLabels.D, '公开线索')
  assert.equal(sourceLevelGuides[0]?.level, '最优先')
  assert.match(sourceLevelGuides.at(-1)?.description ?? '', /这类资料用于发现地点和问题/)
  assert.equal(dateOnly('2026-07-10T12:00:00Z'), '2026-07-10')
  assert.equal(dateOnly('2025-12-01'), '2025-12-01')
})

test('source platform values are translated for ordinary readers', () => {
  assert.equal(sourcePlatformLabel('official-website'), '学校官网')
  assert.equal(sourcePlatformLabel('amap-workmap'), '授权地图资料')
  assert.equal(sourcePlatformLabel('social-platform'), '社交平台资料')
  assert.equal(sourcePlatformLabel('future-platform'), 'future platform')
  assert.equal(sourcePlatformLabel(null), '公开资料')
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
