import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildClubDetailSources,
  clubSectionLabels,
  clubSignupQuestionChecklist,
  clubSourceStatusMessages,
  resolveClubSourceStatusText
} from '../app/utils/club-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/club-detail-presentation.ts'), 'utf8')

test('club detail page is a thin shell over club-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/club-detail-presentation['"]/)
  assert.match(pageSource, /resolveClubSourceStatusText/)
  assert.match(pageSource, /buildClubDetailSources/)
  assert.match(pageSource, /clubSignupQuestionChecklist/)
  assert.match(pageSource, /clubSectionLabels/)
  assert.doesNotMatch(pageSource, /const signupQuestionChecklist = \[/)
  assert.doesNotMatch(pageSource, /function resolveClubSourceStatusText/)
  assert.doesNotMatch(pageSource, /function buildClubDetailSources/)
  assert.match(utilSource, /export function resolveClubSourceStatusText/)
  assert.match(utilSource, /export function buildClubDetailSources/)
  assert.match(utilSource, /export const clubSignupQuestionChecklist/)
})

test('club decision aids keep freshman signup questions and status copy', () => {
  assert.equal(clubSectionLabels.signupChecklist, '入群或报名之前先问清楚')
  assert.equal(clubSourceStatusMessages.recentActivity, '近期活动可确认')
  assert.equal(clubSourceStatusMessages.namePending, '名称线索待确认')
  assert.ok(clubSignupQuestionChecklist.some(item => item.includes('是否适合零基础新生')))
  assert.ok(clubSignupQuestionChecklist.some(item => item.includes('是否收费，是否需要自备器材、服装或材料')))
  assert.equal(clubSignupQuestionChecklist.length, 4)
})

test('club source status and detail source mapping', () => {
  assert.equal(
    resolveClubSourceStatusText([{ url: 'https://example.test/2026/0606/activity' }]),
    '近期活动可确认'
  )
  assert.equal(
    resolveClubSourceStatusText([{ url: 'https://example.test/other' }]),
    '名称线索待确认'
  )
  assert.equal(resolveClubSourceStatusText([]), '名称线索待确认')
  assert.equal(resolveClubSourceStatusText(null), '名称线索待确认')

  assert.deepEqual(
    buildClubDetailSources([
      {
        title: '活动报道',
        url: 'https://example.test/a',
        publisher: '校团委',
        accessedAt: '2026-06-06',
        context: '活动名单',
        status: 'active'
      },
      {
        title: '失效链接',
        url: 'https://example.test/b',
        publisher: '未知',
        accessedAt: '2025-01-01',
        context: null,
        status: 'unavailable'
      }
    ]),
    [
      {
        key: 'https://example.test/a',
        title: '活动报道',
        url: 'https://example.test/a',
        meta: '校团委 · 访问于 2026-06-06',
        note: '活动名单',
        unavailable: false
      },
      {
        key: 'https://example.test/b',
        title: '失效链接',
        url: 'https://example.test/b',
        meta: '未知 · 访问于 2025-01-01',
        note: null,
        unavailable: true
      }
    ]
  )
  assert.deepEqual(buildClubDetailSources(null), [])
})
