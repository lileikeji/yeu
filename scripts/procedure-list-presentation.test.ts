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
  procedureMethodLabel,
  readLooseProcedureChecklistFromStorageText,
  resolveProcedureListCardCounts,
  resolveProcedureListCardProgress
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

test('procedure search keeps a comfortable mobile touch height', () => {
  assert.match(pageSource, /aria-label="搜索办事流程"\s+class="min-h-11 w-full"\s+:ui="\{ base: 'min-h-11' \}"/)
})

test('procedure introduction stays direct and balanced on narrow phones', () => {
  assert.match(pageSource, /先找你要办的事，再按步骤准备时间、材料和地点/)
  assert.match(pageSource, /尚未公布的安排会直接标明/)
  assert.doesNotMatch(pageSource, /页面会告诉你现在能做什么、还要等什么/)
})

test('procedure audience controls update the selected audience directly', () => {
  assert.match(pageSource, /function selectProcedureAudience\(value: typeof audience\.value\): void/)
  assert.match(pageSource, /@click="selectProcedureAudience\(option\.value\)"/)
  assert.doesNotMatch(pageSource, /@click="\(\) => \{ audience = option\.value \}"/)
})

test('procedure cards scan quickly on mobile without hiding decision details', () => {
  assert.match(pageSource, /class="surface-panel group flex min-h-0 flex-col p-4[^"]*md:min-h-64 md:p-5"/)
  assert.match(pageSource, /line-clamp-2[^"]*md:line-clamp-none/)
  assert.match(pageSource, /class="mt-2 line-clamp-1[^"]*md:line-clamp-none[^"]*"/)
  assert.match(pageSource, /procedureListStatusText\(item\.statusText\)/)
  assert.match(pageSource, /procedureMethodLabel\(item\.method\)/)
  assert.match(pageSource, /cardProgressFor\(item\)\.stepLabel/)
  assert.match(pageSource, /cardProgressFor\(item\)\.materialLabel/)
  assert.match(pageSource, /cardProgressFor\(item\)\.progressHint/)
  assert.match(pageSource, /readLooseProcedureChecklistFromStorageText/)
  assert.match(pageSource, /查看详情/)
  assert.match(pageSource, /v-if="item\.deadlineText"\s+class="mt-1 line-clamp-1[^"]*md:line-clamp-2"/)
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
  assert.equal(procedureListMessages.serviceUnavailable, '可以稍后再试，也可以先查看入学指南。')
  assert.equal(procedureListMessages.emptyMatch, '没有找到符合当前条件的事项')
  assert.equal(procedureListMessages.emptyList, '目前还没有可以查看的办事事项')
  assert.match(pageSource, /clearProcedureFilters/)
  assert.match(pageSource, /label="清除条件"/)
  assert.match(pageSource, /label="重新试一次"/)
  assert.doesNotMatch(pageSource, /border-red-200|text-red-900/)
  assert.equal(procedureListStatePresentation('confirmed').label, '可以照着办理')
  assert.equal(procedureListStatePresentation('partial').label, '先看能准备的')
  assert.equal(procedureListStatePresentation('awaiting-notice').label, '等学校通知')
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

test('procedure list puts shared newcomer tasks first until an audience is selected', () => {
  const sharedAudience = ['undergraduate', 'transfer']
  const items = [
    {
      title: '专升本学生档案邮寄',
      summary: '专升本事项',
      statusText: '可以办理',
      audience: ['transfer']
    },
    {
      title: '图书馆借阅证与微信绑定',
      summary: '全部新生事项',
      statusText: '可以办理',
      audience: sharedAudience
    },
    {
      title: '宿舍维修报修',
      summary: '全部新生事项',
      statusText: '可以办理',
      audience: sharedAudience
    },
    {
      title: '校园网与账号登录问题',
      summary: '全部新生事项',
      statusText: '可以办理',
      audience: sharedAudience
    },
    {
      title: '2026级新生报到',
      summary: '全部新生事项',
      statusText: '等待通知',
      audience: sharedAudience
    }
  ]

  assert.deepEqual(
    filterProcedureListItems(items, { query: '', audience: 'all' }).map(item => item.title),
    [
      '2026级新生报到',
      '校园网与账号登录问题',
      '图书馆借阅证与微信绑定',
      '宿舍维修报修',
      '专升本学生档案邮寄'
    ]
  )
  assert.deepEqual(
    filterProcedureListItems(items, { query: '', audience: 'transfer' }).map(item => item.title),
    [
      '专升本学生档案邮寄',
      '2026级新生报到',
      '校园网与账号登录问题',
      '图书馆借阅证与微信绑定',
      '宿舍维修报修'
    ]
  )
  assert.deepEqual(
    filterProcedureListItems(items, { query: '可以办理', audience: 'all' }).map(item => item.title),
    [
      '专升本学生档案邮寄',
      '图书馆借阅证与微信绑定',
      '宿舍维修报修',
      '校园网与账号登录问题'
    ]
  )
})


test('procedure list cards expose step/material counts and local progress hints', () => {
  const item = {
    slug: 'demo',
    steps: [{ id: 's1' }, { id: 's2' }],
    materials: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]
  }

  assert.deepEqual(resolveProcedureListCardCounts(item), {
    stepTotal: 2,
    materialTotal: 3,
    stepLabel: '2 个步骤',
    materialLabel: '3 项材料'
  })

  assert.equal(
    resolveProcedureListCardProgress(item, { stepIds: ['s1'], materialIds: ['m1', 'm2'] }).progressHint,
    '材料已备 2/3'
  )
  assert.equal(
    resolveProcedureListCardProgress(item, { stepIds: ['s1', 's2'], materialIds: ['m1', 'm2', 'm3'] }).progressHint,
    '材料已备齐'
  )
  assert.equal(
    resolveProcedureListCardProgress(
      { ...item, materials: [] },
      { stepIds: ['s1'], materialIds: [] }
    ).progressHint,
    '步骤已勾 1/2'
  )
  assert.equal(
    resolveProcedureListCardProgress(
      { slug: 'empty', steps: [], materials: [] },
      null
    ).materialLabel,
    '材料暂未公布'
  )

  const loose = readLooseProcedureChecklistFromStorageText(
    JSON.stringify({ version: 'any-version', stepIds: ['s1', 'ghost'], materialIds: ['m2'] }),
    ['s1', 's2'],
    ['m1', 'm2', 'm3']
  )
  assert.deepEqual(loose, { stepIds: ['s1'], materialIds: ['m2'] })
})
