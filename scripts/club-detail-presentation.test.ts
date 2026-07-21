import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildClubDetailSources,
  buildClubOverviewItems,
  clubSectionLabels,
  clubSignupQuestionChecklist,
  clubSourceStatusMessages,
  resolveClubContactSectionState,
  resolveClubSourceStatusText
} from '../app/utils/club-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/club-detail-presentation.ts'), 'utf8')

test('club detail page is a thin shell over club-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/club-detail-presentation['"]/)
  assert.match(pageSource, /resolveClubSourceStatusText/)
  assert.match(pageSource, /buildClubDetailSources/)
  assert.match(pageSource, /buildClubOverviewItems/)
  assert.match(pageSource, /clubSignupQuestionChecklist/)
  assert.match(pageSource, /clubSectionLabels/)
  assert.match(pageSource, /resolvePublicContactActions/)
  assert.match(pageSource, /contactActions/)
  assert.match(pageSource, /resolveClubContactSectionState/)
  assert.match(pageSource, /contactSection/)
  assert.match(pageSource, /contactSection\.kind === 'pending'/) 
  assert.doesNotMatch(pageSource, /\{\{\s*club\.contactMethod\s*\}\}/)
  assert.doesNotMatch(pageSource, /const signupQuestionChecklist = \[/)
  assert.doesNotMatch(pageSource, /function resolveClubSourceStatusText/)
  assert.doesNotMatch(pageSource, /function buildClubDetailSources/)
  assert.match(utilSource, /export function resolveClubSourceStatusText/)
  assert.match(utilSource, /export function buildClubDetailSources/)
  assert.match(utilSource, /export const clubSignupQuestionChecklist/)
})

test('club decision aids use ordinary signup and activity language', () => {
  assert.equal(clubSectionLabels.overview, '先了解这个社团')
  assert.equal(clubSectionLabels.signupChecklist, '报名之前问清楚')
  assert.equal(clubSectionLabels.sourceDetails, '看看这些信息从哪里来')
  assert.equal(clubSectionLabels.contactMethod, '联系方式')
  assert.equal(clubSectionLabels.copyContact, '复制联系方式')
  assert.equal(clubSectionLabels.contactPending, '联系方式待公布')
  assert.match(clubSectionLabels.contactPendingNotice, /电话、邮箱或群入口/)
  assert.equal(clubSectionLabels.contactPendingAction, '知道新的联系方式？告诉我们')
  assert.deepEqual(resolveClubContactSectionState(true), { kind: 'ready' })
  assert.equal(resolveClubContactSectionState(false).kind, 'pending')
  assert.equal(resolveClubContactSectionState(false).title, '联系方式待公布')
  assert.equal(clubSourceStatusMessages.recentActivity, '近期有活动')
  assert.equal(clubSourceStatusMessages.namePending, '等待本学期招新消息')
  assert.ok(clubSignupQuestionChecklist.some(item => item.includes('是否适合零基础新生')))
  assert.ok(clubSignupQuestionChecklist.some(item => item.includes('是否收费，是否需要自备器材、服装或材料')))
  assert.equal(clubSignupQuestionChecklist.length, 4)
  assert.doesNotMatch(pageSource, /资料状态|可信度|系统不会|当前可确认信息|目前能确认|有效来源|信息出处与更新时间/)

  assert.deepEqual(buildClubOverviewItems('声乐、器乐和校园演出').map(item => item.title), [
    '主要活动',
    '适合谁',
    '开学后怎么找'
  ])
  assert.match(buildClubOverviewItems('声乐、器乐和校园演出')[0]?.text ?? '', /声乐、器乐和校园演出/)
})

test('club source status and detail source mapping', () => {
  assert.equal(
    resolveClubSourceStatusText([{ url: 'https://example.test/2026/0606/activity' }]),
    '近期有活动'
  )
  assert.equal(
    resolveClubSourceStatusText([{ url: 'https://example.test/other' }]),
    '等待本学期招新消息'
  )
  assert.equal(resolveClubSourceStatusText([]), '等待本学期招新消息')
  assert.equal(resolveClubSourceStatusText(null), '等待本学期招新消息')

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
        meta: '校团委 · 查阅于 2026-06-06',
        note: '活动名单',
        unavailable: false
      },
      {
        key: 'https://example.test/b',
        title: '失效链接',
        url: 'https://example.test/b',
        meta: '未知 · 查阅于 2025-01-01',
        note: null,
        unavailable: true
      }
    ]
  )
  assert.deepEqual(buildClubDetailSources(null), [])
})
