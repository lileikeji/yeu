import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { procedureSeeds } from '../data/seeds/procedures'
import {
  describeProcedureWindow,
  procedureWindowBadgeColor,
  procedureWindowStateLabels,
  resolveProcedureWindowBySlug,
  type ProcedureWindow
} from '../app/utils/procedure-window'

// 固定窗口：11 月 1 日开放、11 月 20 日截止
const autumnWindow: ProcedureWindow = {
  opensAt: '2026-11-01',
  closesAt: '2026-11-20',
  label: '秋季办理窗口',
  sourceUrl: 'https://bgs.yeu.edu.cn/2026/0710/c1102a57503/page.htm'
}

const unknownDescription = { state: 'unknown', days: null, text: '', tone: 'neutral' } as const

test('describeProcedureWindow covers open, closing-soon, closed, upcoming and unknown', () => {
  // 还有 10 天：正常开放
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-11-10T09:00:00+08:00')), {
    state: 'open',
    days: 10,
    text: '还剩 10 天',
    tone: 'neutral'
  })

  // 截止当天，从零点到 23:59 都算「今天截止」
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-11-20T00:00:00+08:00')), {
    state: 'closing-soon',
    days: 0,
    text: '今天截止',
    tone: 'warning'
  })
  assert.equal(
    describeProcedureWindow(autumnWindow, new Date('2026-11-20T23:59:00+08:00')).text,
    '今天截止'
  )

  // 还剩 3 天算快截止；还剩 4 天仍然算开放，卡住 3 天这条线
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-11-17T08:00:00+08:00')), {
    state: 'closing-soon',
    days: 3,
    text: '还剩 3 天',
    tone: 'warning'
  })
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-11-16T08:00:00+08:00')), {
    state: 'open',
    days: 4,
    text: '还剩 4 天',
    tone: 'neutral'
  })

  // 过了截止日
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-11-21T00:00:00+08:00')), {
    state: 'closed',
    days: null,
    text: '已于11月20日截止',
    tone: 'danger'
  })
  assert.equal(
    describeProcedureWindow(autumnWindow, new Date('2026-12-31T12:00:00+08:00')).text,
    '已于11月20日截止'
  )

  // 还没开放
  assert.deepEqual(describeProcedureWindow(autumnWindow, new Date('2026-10-25T08:00:00+08:00')), {
    state: 'upcoming',
    days: 7,
    text: '11月1日开放',
    tone: 'neutral'
  })

  // 没加 window、或日期写坏，都算 unknown 且不给文案
  assert.deepEqual(
    describeProcedureWindow(undefined, new Date('2026-11-10T09:00:00+08:00')),
    unknownDescription
  )
  assert.deepEqual(
    describeProcedureWindow(null, new Date('2026-11-10T09:00:00+08:00')),
    unknownDescription
  )
  assert.deepEqual(
    describeProcedureWindow(
      { ...autumnWindow, closesAt: '2026-11-31' },
      new Date('2026-11-10T09:00:00+08:00')
    ),
    unknownDescription
  )
})

test('describeProcedureWindow keeps the same answer in every time zone', () => {
  // 每组三个写法指向同一时刻：北京时间、UTC、以及负时区
  const sameInstants = [
    ['2026-11-17T08:00:00+08:00', '2026-11-17T00:00:00Z', '2026-11-16T19:00:00-05:00'],
    ['2026-11-20T00:30:00+08:00', '2026-11-19T16:30:00Z', '2026-11-19T11:30:00-05:00'],
    ['2026-10-31T23:30:00+08:00', '2026-10-31T15:30:00Z', '2026-10-31T11:30:00-04:00']
  ]

  for (const [beijing, utc, otherZone] of sameInstants) {
    const expected = describeProcedureWindow(autumnWindow, new Date(beijing))
    assert.deepEqual(describeProcedureWindow(autumnWindow, new Date(utc)), expected)
    assert.deepEqual(describeProcedureWindow(autumnWindow, new Date(otherZone)), expected)
    assert.deepEqual(
      describeProcedureWindow(autumnWindow, Date.parse(utc)),
      describeProcedureWindow(autumnWindow, Date.parse(beijing))
    )
  }

  // 北京时间已是 11 月 20 日凌晨，UTC 还在 11 月 19 日：必须按北京时间的日历日算成「今天截止」
  const closingDay = describeProcedureWindow(autumnWindow, new Date('2026-11-20T00:30:00+08:00'))
  assert.equal(closingDay.state, 'closing-soon')
  assert.equal(closingDay.text, '今天截止')

  // 实现里不能出现按字符串解析的 new Date('YYYY-MM-DD')，那条路会按 UTC 解释并错一天
  const utilSource = readFileSync(resolve('app/utils/procedure-window.ts'), 'utf8')
  assert.doesNotMatch(utilSource, /new Date\(\s*['"`]\d{4}-/)
  assert.match(utilSource, /Date\.UTC\(/)
})

test('procedure seed windows stay inside verifiable dates', () => {
  for (const seed of procedureSeeds) {
    const window = seed.window
    if (!window) continue
    assert.match(window.opensAt, /^\d{4}-\d{2}-\d{2}$/, `${seed.slug} opensAt 必须是 YYYY-MM-DD`)
    assert.match(window.closesAt, /^\d{4}-\d{2}-\d{2}$/, `${seed.slug} closesAt 必须是 YYYY-MM-DD`)
    assert.ok(window.opensAt <= window.closesAt, `${seed.slug} opensAt 不能晚于 closesAt`)
    assert.ok(window.sourceUrl.startsWith('https://'), `${seed.slug} sourceUrl 必须是 https`)
    assert.ok(window.label.trim().length > 0, `${seed.slug} window.label 不能为空`)
  }

  // 只给仓库里核实到日期的流程加 window，没依据的一条都不加
  assert.deepEqual(
    procedureSeeds.filter(seed => seed.window).map(seed => seed.slug),
    ['arrival']
  )
  assert.equal(
    resolveProcedureWindowBySlug('arrival')?.sourceUrl,
    'https://bgs.yeu.edu.cn/2026/0710/c1102a57503/page.htm'
  )
  assert.equal(resolveProcedureWindowBySlug('dorm-repair'), null)
  assert.equal(resolveProcedureWindowBySlug('not-a-procedure'), null)

  // 报到窗口在真实日期上的表现：9 月 4 日还没开放、9 月 5 日还剩 1 天、9 月 6 日今天截止、9 月 7 日已截止
  const arrivalWindow = resolveProcedureWindowBySlug('arrival')
  assert.ok(arrivalWindow)
  assert.equal(describeProcedureWindow(arrivalWindow, new Date('2026-09-04T12:00:00+08:00')).state, 'upcoming')
  assert.equal(describeProcedureWindow(arrivalWindow, new Date('2026-09-05T12:00:00+08:00')).text, '还剩 1 天')
  assert.equal(describeProcedureWindow(arrivalWindow, new Date('2026-09-06T12:00:00+08:00')).text, '今天截止')
  assert.deepEqual(describeProcedureWindow(arrivalWindow, new Date('2026-09-07T00:00:00+08:00')), {
    state: 'closed',
    days: null,
    text: '已于9月6日截止',
    tone: 'danger'
  })
})

test('window badges reuse the existing badge colors', () => {
  assert.equal(procedureWindowBadgeColor('neutral'), 'neutral')
  assert.equal(procedureWindowBadgeColor('warning'), 'warning')
  assert.equal(procedureWindowBadgeColor('danger'), 'error')
  assert.equal(procedureWindowStateLabels.open, '现在可以办')
  assert.equal(procedureWindowStateLabels['closing-soon'], '快截止了')
  assert.equal(procedureWindowStateLabels.closed, '已经截止')
  assert.equal(procedureWindowStateLabels.upcoming, '还没开放')
})
