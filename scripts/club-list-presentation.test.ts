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
  hasRecentClubActivity,
  listClubGroups,
  resolveClubDirection,
  resolveClubGroup,
  joinClubNames
} from '../app/utils/club-list-presentation'

const pageSource = readFileSync(resolve('app/pages/clubs/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/club-list-presentation.ts'), 'utf8')

test('club list page is a thin shell over club-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/club-list-presentation['"]/)
  assert.match(pageSource, /countRecentClubs/)
  assert.match(pageSource, /filterClubListItems/)
  assert.match(pageSource, /listClubGroups/)
  assert.match(pageSource, /resolveClubDirection/)
  assert.match(pageSource, /resolveClubGroup/)
  assert.match(pageSource, /clubListMessages/)
  assert.match(pageSource, /directory-list-presentation/)
  assert.match(pageSource, /previewDirectoryItems/)
  assert.match(pageSource, /v-for="club in visibleClubs"/)
  assert.doesNotMatch(pageSource, /function countRecentClubs/)
  assert.doesNotMatch(pageSource, /function filterClubListItems/)
  assert.doesNotMatch(pageSource, /const filteredClubs = computed\(\(\) => \{[\s\S]*toLocaleLowerCase\('zh-CN'\)/)
  assert.match(utilSource, /export function countRecentClubs/)
  assert.match(utilSource, /export function filterClubListItems/)
  assert.match(utilSource, /export const clubListMessages/)
})

test('club list stats and messages stay student-facing', () => {
  assert.equal(clubListRecentActivityUrlMarker, '/2026/')
  assert.equal(clubListMessages.serviceUnavailable, '暂时没能打开社团列表，请检查网络后再试。')
  assert.equal(clubListMessages.emptyMatch, '没有匹配的社团')
  assert.equal(clubListMessages.defaultCategory, '校园社团')
  assert.equal(clubListMessages.recentActivity, '近期有活动')
  assert.equal(clubListMessages.recruitmentPending, '等待本学期招新消息')
  assert.doesNotMatch(pageSource, /社团条目|干部线索|名称线索待确认|当前 23 个条目完整清单/)
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
  assert.equal(hasRecentClubActivity(clubs[0]!), true)
  assert.equal(hasRecentClubActivity(clubs[1]!), false)
  assert.deepEqual(listClubGroups(clubs), ['兴趣', '文化'])
  assert.equal(resolveClubGroup('文化艺术 · 名称线索待确认'), '文化艺术')
  assert.equal(resolveClubGroup('近期活动可确认'), '校园社团')
  assert.equal(resolveClubDirection('资料说明', '声乐、器乐和校园演出'), '声乐、器乐和校园演出')
  assert.equal(resolveClubDirection('官方报道中出现。适合想了解“摄影、影像记录”的新生先收藏；招新待发布。'), '摄影、影像记录')
  assert.equal(filterClubListItems(clubs, '').length, 2)
  assert.equal(filterClubListItems(clubs, '摄影').map(item => item.name).join(','), '摄影协会')
  assert.equal(filterClubListItems(clubs, '文化').map(item => item.name).join(','), '读书会')
  assert.equal(filterClubListItems(clubs, '', '兴趣').map(item => item.name).join(','), '摄影协会')
  assert.equal(filterClubListItems(clubs, '没有这个').length, 0)
})
