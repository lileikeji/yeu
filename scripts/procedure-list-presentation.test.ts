import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  filterProcedureListItems,
  procedureListAudienceOptions,
  procedureListDetailQuery,
  procedureListMessages,
  procedureListStatePresentation,
  procedureListStatusText,
  procedureMethodLabel
} from '../app/utils/procedure-list-presentation'
import { procedureMethodLabels } from '../app/utils/procedure-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/procedures/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/procedure-list-presentation.ts'), 'utf8')

test('procedure list page is a thin shell over procedure-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/procedure-list-presentation['"]/)
  assert.match(pageSource, /filterProcedureListItems/)
  assert.match(pageSource, /procedureListAudienceOptions/)
  assert.match(pageSource, /procedureMethodLabel/)
  assert.match(pageSource, /procedureListDetailQuery/)
  assert.match(pageSource, /procedureListMessages/)
  assert.doesNotMatch(pageSource, /const audienceOptions = \[/)
  assert.doesNotMatch(pageSource, /const methodLabel = \{/)
  assert.doesNotMatch(pageSource, /const keyword = query\.value\.trim/)
  assert.match(utilSource, /export function filterProcedureListItems/)
  assert.match(utilSource, /export const procedureListAudienceOptions/)
  assert.match(utilSource, /procedureMethodLabels/)
  assert.match(utilSource, /from '\.\/procedure-detail-presentation'/)
})

test('procedure list audience and method labels stay student-facing', () => {
  assert.equal(procedureListAudienceOptions[0]?.value, 'all')
  assert.equal(procedureListAudienceOptions.length, 3)
  assert.ok(procedureListAudienceOptions.some(item => item.value === 'undergraduate' && item.label === '普通本科'))
  assert.ok(procedureListAudienceOptions.some(item => item.value === 'transfer' && item.label === '专升本'))
  assert.equal(procedureMethodLabels.online, '线上办理')
  assert.equal(procedureMethodLabels.offline, '到校办理')
  assert.equal(procedureMethodLabels.mixed, '网上确认 + 到校办理')
  assert.equal(procedureMethodLabel('mixed'), '网上确认 + 到校办理')
  assert.equal(procedureListMessages.serviceUnavailable, '暂时没能打开办事信息，请检查网络后再试。')
  assert.equal(procedureListMessages.emptyMatch, '没有找到相关事项，换个关键词试试。')
  assert.equal(procedureListStatePresentation('confirmed').label, '可以照着办理')
  assert.equal(procedureListStatePresentation('partial').label, '先看已知部分')
  assert.equal(procedureListStatePresentation('awaiting-notice').label, '等待学校通知')
  assert.equal(
    procedureListStatusText('报修制度有官方来源，工单状态待通知'),
    '报修制度有学校说明，处理进度还要等学校通知'
  )
})

test('procedure list filter and detail query helpers', () => {
  const items = [
    {
      title: '报到注册',
      summary: '核对材料和时间',
      statusText: '已确认',
      audience: ['undergraduate']
    },
    {
      title: '档案转入',
      summary: '专升本档案',
      statusText: '待通知',
      audience: ['transfer']
    }
  ]

  assert.deepEqual(
    filterProcedureListItems(items, { query: '', audience: 'all' }).map(item => item.title),
    ['报到注册', '档案转入']
  )
  assert.deepEqual(
    filterProcedureListItems(items, { query: '档案', audience: 'all' }).map(item => item.title),
    ['档案转入']
  )
  assert.deepEqual(
    filterProcedureListItems(items, { query: '', audience: 'undergraduate' }).map(item => item.title),
    ['报到注册']
  )
  assert.deepEqual(
    filterProcedureListItems(items, { query: '报到', audience: 'transfer' }),
    []
  )

  assert.equal(procedureListDetailQuery('all'), undefined)
  assert.deepEqual(procedureListDetailQuery('transfer'), { audience: 'transfer' })
})
