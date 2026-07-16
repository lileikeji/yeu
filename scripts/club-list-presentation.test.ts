import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  clubListMessages,
  clubListRecentActivityUrlMarker,
  countLeadClubs,
  countRecentClubs,
  filterClubListItems,
  joinClubNames
} from '../app/utils/club-list-presentation'

const pageSource = readFileSync(resolve('app/pages/clubs/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/club-list-presentation.ts'), 'utf8')

test('club list page is a thin shell over club-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/club-list-presentation['"]/)
  assert.match(pageSource, /countRecentClubs/)
  assert.match(pageSource, /countLeadClubs/)
  assert.match(pageSource, /joinClubNames/)
  assert.match(pageSource, /filterClubListItems/)
  assert.match(pageSource, /clubListMessages/)
  assert.doesNotMatch(pageSource, /function countRecentClubs/)
  assert.doesNotMatch(pageSource, /function filterClubListItems/)
  assert.doesNotMatch(pageSource, /const filteredClubs = computed\(\(\) => \{[\s\S]*toLocaleLowerCase\('zh-CN'\)/)
  assert.match(utilSource, /export function countRecentClubs/)
  assert.match(utilSource, /export function filterClubListItems/)
  assert.match(utilSource, /export const clubListMessages/)
})

test('club list stats and messages stay student-facing', () => {
  assert.equal(clubListRecentActivityUrlMarker, '/2026/0606/')
  assert.equal(clubListMessages.serviceUnavailable, '社团资料暂时不可用，请稍后重试。')
  assert.equal(clubListMessages.emptyMatch, '没有匹配的社团')
  assert.equal(clubListMessages.defaultCategory, '招新待发布')
})

test('club list pure helpers filter and summarize catalogs', () => {
  const clubs = [
    {
      name: '摄影协会',
      summary: '记录校园',
      body: '摄影活动',
      category: '兴趣',
      sources: [{ url: 'https://example.com/2026/0606/report.html' }]
    },
    {
      name: '读书会',
      summary: '分享书单',
      body: '每周读书',
      category: '文化',
      sources: [{ url: 'https://example.com/attachment.pdf' }]
    }
  ]

  assert.equal(countRecentClubs(clubs), 1)
  assert.equal(countLeadClubs(clubs.length, 1), 1)
  assert.equal(joinClubNames(clubs), '摄影协会、读书会')
  assert.equal(filterClubListItems(clubs, '').length, 2)
  assert.equal(filterClubListItems(clubs, '摄影').map(item => item.name).join(','), '摄影协会')
  assert.equal(filterClubListItems(clubs, '文化').map(item => item.name).join(','), '读书会')
  assert.equal(filterClubListItems(clubs, '没有这个').length, 0)
})
