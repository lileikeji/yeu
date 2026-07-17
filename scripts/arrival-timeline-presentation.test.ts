import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARRIVAL_REPORT_START,
  buildArrivalCountdown,
  buildHomeArrivalSummary,
  buildTodayFocus,
  calendarDaysBetween,
  resolveArrivalPhase,
  toShanghaiDateKey
} from '../app/utils/arrival-timeline-presentation'

function atShanghaiNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+08:00`)
}

test('shanghai date key and day math stay calendar-stable', () => {
  assert.equal(toShanghaiDateKey(atShanghaiNoon('2026-07-17')), '2026-07-17')
  assert.equal(calendarDaysBetween('2026-07-17', ARRIVAL_REPORT_START), 50)
  assert.equal(calendarDaysBetween('2026-09-05', '2026-09-05'), 0)
  assert.equal(calendarDaysBetween('2026-09-06', '2026-09-05'), -1)
})

test('arrival phases follow confirmed 2026 windows', () => {
  assert.equal(resolveArrivalPhase(atShanghaiNoon('2026-07-17')), 'before-report')
  assert.equal(resolveArrivalPhase(atShanghaiNoon('2026-09-05')), 'report-window')
  assert.equal(resolveArrivalPhase(atShanghaiNoon('2026-09-06')), 'report-window')
  assert.equal(resolveArrivalPhase(atShanghaiNoon('2026-09-08')), 'orientation')
  assert.equal(resolveArrivalPhase(atShanghaiNoon('2026-09-10')), 'class-started')
})

test('countdown copy stays honest and actionable before report', () => {
  const view = buildArrivalCountdown(atShanghaiNoon('2026-07-17'))
  assert.equal(view.phase, 'before-report')
  assert.equal(view.daysNumber, 50)
  assert.match(view.headline, /50/)
  assert.equal(view.primaryCtaTo, '/checklist')
  assert.equal(view.secondaryCtaTo, '/procedures/arrival')
  assert.ok(view.honestyNote.includes('以录取通知书'))
  assert.deepEqual(view.focusStageIds, ['before-arrival', 'packing'])
  assert.ok(view.milestones.some(item => item.id === 'report'))
})

test('today focus prefers phase stages and skips completed items', () => {
  const focus = buildTodayFocus([], 'all', atShanghaiNoon('2026-07-17'), 3)
  assert.equal(focus.title, '到校前优先做')
  assert.ok(focus.items.length > 0)
  assert.ok(focus.items.length <= 3)
  assert.ok(focus.items.every(item => item.stageId === 'before-arrival' || item.stageId === 'packing'))

  const firstId = focus.items[0]!.id
  const after = buildTodayFocus([firstId], 'all', atShanghaiNoon('2026-07-17'), 3)
  assert.ok(after.items.every(item => item.id !== firstId))

  const summary = buildHomeArrivalSummary(atShanghaiNoon('2026-07-17'))
  assert.equal(summary.kicker, '报到倒计时')
  assert.match(summary.title, /50/)
  assert.equal(summary.to, '/checklist')
})

test('report-window and class-started surfaces stay useful', () => {
  const report = buildArrivalCountdown(atShanghaiNoon('2026-09-05'))
  assert.equal(report.phase, 'report-window')
  assert.equal(report.primaryCtaTo, '/map')

  const started = buildArrivalCountdown(atShanghaiNoon('2026-09-15'))
  assert.equal(started.phase, 'class-started')
  assert.equal(started.daysNumber, null)
  assert.equal(started.primaryCtaTo, '/discover')
})