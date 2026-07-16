import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildGuideDetailSources,
  guideFallbackMessages,
  resolveGuideFallbackMessage,
  resolveGuideRelatedAction
} from '../app/utils/guide-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/guides/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/guide-detail-presentation.ts'), 'utf8')

test('guide detail page is a thin shell over guide-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/guide-detail-presentation['"]/)
  assert.match(pageSource, /resolveGuideFallbackMessage/)
  assert.match(pageSource, /resolveGuideRelatedAction/)
  assert.match(pageSource, /buildGuideDetailSources/)
  assert.match(pageSource, /publicResponseErrorCode/)
  assert.match(pageSource, /throwPublicDetailError/)
  assert.doesNotMatch(pageSource, /function isObject/)
  assert.doesNotMatch(pageSource, /function responseErrorCode/)
  assert.doesNotMatch(pageSource, /function responseStatusCode/)
  assert.doesNotMatch(pageSource, /当前显示已整理的新生指南/)
  assert.doesNotMatch(pageSource, /打开可勾选报到流程/)
  assert.match(utilSource, /export function resolveGuideFallbackMessage/)
  assert.match(utilSource, /export function resolveGuideRelatedAction/)
  assert.match(utilSource, /export function buildGuideDetailSources/)
})

test('guide related actions map known slugs and fall back to the guides index', () => {
  assert.deepEqual(resolveGuideRelatedAction('arrival'), {
    label: '打开可勾选报到流程',
    to: '/procedures/arrival',
    icon: 'i-lucide-list-checks'
  })
  assert.deepEqual(resolveGuideRelatedAction('find-campus'), {
    label: '打开校园地图',
    to: '/map',
    icon: 'i-lucide-map'
  })
  assert.deepEqual(resolveGuideRelatedAction('clubs'), {
    label: '查看校园与社团',
    to: '/campus#clubs',
    icon: 'i-lucide-users-round'
  })
  assert.deepEqual(resolveGuideRelatedAction('unknown-guide'), {
    label: '返回全部指南',
    to: '/guides',
    icon: 'i-lucide-layout-grid'
  })
})

test('guide fallback message and detail source mapping stay student-facing', () => {
  assert.equal(resolveGuideFallbackMessage(true), null)
  assert.equal(resolveGuideFallbackMessage(false), guideFallbackMessages.staticGuide)
  assert.match(guideFallbackMessages.staticGuide, /学校最新通知/)

  const sources = buildGuideDetailSources(
    [
      {
        title: '招生网',
        url: 'https://example.test/a',
        publisher: '学校',
        accessedAt: '2026-07-01',
        context: '报到入口',
        status: 'active'
      },
      {
        title: '重复来源',
        url: 'https://example.test/a',
        publisher: '学校',
        accessedAt: '2026-07-02',
        status: 'active'
      }
    ],
    [
      {
        sources: [
          {
            title: '节内来源',
            url: 'https://example.test/b',
            publisher: '部门',
            accessedAt: '2026-07-03',
            context: '材料说明',
            status: 'disputed'
          }
        ]
      }
    ]
  )

  assert.deepEqual(sources, [
    {
      key: 'https://example.test/a',
      title: '招生网',
      url: 'https://example.test/a',
      meta: '学校 · 访问于 2026-07-01',
      note: '报到入口',
      unavailable: false
    },
    {
      key: 'https://example.test/b',
      title: '节内来源',
      url: 'https://example.test/b',
      meta: '部门 · 访问于 2026-07-03',
      note: '材料说明',
      unavailable: true
    }
  ])
})
