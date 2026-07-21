import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildGuideDetailSources,
  guideStatePresentation,
  guideFallbackMessages,
  resolveGuideFallbackMessage,
  resolveGuideRelatedAction,
  studentFacingGuideStatusText
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

test('long guide pages expose every section in a compact mobile jump menu', () => {
  assert.match(pageSource, /<details[\s\S]*v-if="guide\.sections\.length > 1"/)
  assert.match(pageSource, /id="guide-contents"/)
  assert.match(pageSource, /<summary[\s\S]*快速跳到/)
  assert.match(pageSource, /共 \{\{ guide\.sections\.length \}\} 个部分/)
  assert.match(pageSource, /class="grid grid-cols-2[^"]*sm:grid-cols-3"/)
  assert.match(pageSource, /aria-label="本页内容"/)
  assert.match(pageSource, /:href="`#guide-section-\$\{index\}`"/)
  assert.match(pageSource, /class="inline-flex min-h-11/)
  assert.doesNotMatch(pageSource, /scrollbar-none mt-5 flex gap-2 overflow-x-auto/)
})

test('guide sections use a connected reading rail instead of repeated cards', () => {
  assert.match(pageSource, /class="group relative scroll-mt-24[^"]*pl-12[^"]*last:border-b-0"/)
  assert.match(pageSource, /v-if="index < guide\.sections\.length - 1"/)
  assert.match(pageSource, /aria-hidden="true"/)
  assert.match(pageSource, /class="absolute -bottom-7 left-4 top-16 w-px bg-zinc-200"/)
  assert.match(pageSource, /group-hover:border-green-300 group-hover:bg-green-50/)
  assert.doesNotMatch(pageSource, /<UCard[\s\S]*v-for="\(section, index\) in guide\.sections"/)
})

test('long guide pages offer a mobile return to contents without covering the sources', () => {
  assert.match(pageSource, /guide\.value\.sections\.length < 5/)
  assert.match(pageSource, /sourceOverlapsShortcut/)
  assert.match(pageSource, /!sourceDetails\?\.open/)
  assert.match(pageSource, /mobileNav\?\.getBoundingClientRect\(\)\.height \|\| 72/)
  assert.match(pageSource, /@toggle\.capture="updateContentsShortcut"/)
  assert.match(pageSource, /ref="sourceArea"[\s\S]*<PublicSourceDetails[\s\S]*label="返回全部指南"/)
  assert.match(pageSource, /aria-label="返回本页目录"/)
  assert.match(pageSource, /href="#guide-contents"/)
  assert.match(pageSource, />\s*查看目录\s*</)
  assert.match(pageSource, /md:hidden/)
  assert.match(pageSource, /contentsDetails\.value\.open = true/)
  assert.match(pageSource, /window\.removeEventListener\('scroll', updateContentsShortcut\)/)
})

test('guide related actions map known slugs and fall back to the guides index', () => {
  assert.deepEqual(resolveGuideRelatedAction('arrival'), {
    label: '去完成报到步骤',
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
    label: '查看全部指南',
    to: '/guides',
    icon: 'i-lucide-layout-grid'
  })
})

test('guide fallback message and detail source mapping stay student-facing', () => {
  assert.equal(resolveGuideFallbackMessage(true), null)
  assert.equal(resolveGuideFallbackMessage(false), guideFallbackMessages.staticGuide)
  assert.match(guideFallbackMessages.staticGuide, /学校最新通知/)
  assert.equal(guideStatePresentation('verified').label, '主要内容明确')
  assert.equal(guideStatePresentation('partial').label, '部分信息待确认')
  assert.equal(guideStatePresentation('awaiting-notice').label, '等学校通知')
  assert.equal(
    studentFacingGuideStatusText('官方求助入口已确认，医务室电话待确认，招新安排待发布'),
    '学校求助入口已经明确，医务室电话还要确认，招新安排还没公布'
  )

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
      meta: '学校 · 查阅于 2026-07-01',
      note: '报到入口',
      unavailable: false
    },
    {
      key: 'https://example.test/b',
      title: '节内来源',
      url: 'https://example.test/b',
      meta: '部门 · 查阅于 2026-07-03',
      note: '材料说明',
      unavailable: true
    }
  ])
})
