import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript') as { transpileModule: (source: string, options: Record<string, unknown>) => { outputText: string } }

const componentSource = readFileSync(resolve('app/components/MapTransitPanel.vue'), 'utf8')
const scriptMarker = '<script setup lang="ts">'
const scriptTag = componentSource.indexOf(scriptMarker)
const scriptEnd = componentSource.indexOf('</script>')
assert.ok(scriptTag >= 0 && scriptEnd > scriptTag, 'MapTransitPanel.vue 必须有 script setup 块')
const script = componentSource.slice(scriptTag + scriptMarker.length, scriptEnd)
const template = componentSource.slice(componentSource.indexOf('<template>'))

/** 从组件真源码里按名字取顶层函数体，转译后执行：守的就是运行时那份实现。 */
function takeFunction(name: string): string {
  const start = script.indexOf('function ' + name + '(')
  assert.ok(start >= 0, '组件里找不到 ' + name)
  const end = script.indexOf('\n}\n', start)
  assert.ok(end > start, name + ' 的收尾花括号没找到')
  return script.slice(start, end + 2)
}

const names = ['resolveTransitSheetTitle', 'normalizeDepartureTime', 'groupDeparturesByHalfDay', 'resolveDepartureChipState']
const body = names.map(takeFunction).join('\n')
const transpiled = ts.transpileModule(body, { compilerOptions: { target: 9, module: 0 }, reportDiagnostics: false }).outputText
const factory = new Function(transpiled + '\nreturn { ' + names.join(', ') + ' }') as () => {
  resolveTransitSheetTitle: (line: string) => string
  normalizeDepartureTime: (value: string) => string | null
  groupDeparturesByHalfDay: (times: string[]) => { am: string[], pm: string[] }
  resolveDepartureChipState: (time: string, options: { next: string, past: boolean }) => 'past' | 'next' | 'future'
}
const fn = factory()

test('标题带线号，空串退回「校外公交」', () => {
  assert.equal(fn.resolveTransitSheetTitle('K2'), '校外公交 · K2')
  assert.equal(fn.resolveTransitSheetTitle(' K6 '), '校外公交 · K6')
  assert.equal(fn.resolveTransitSheetTitle(''), '校外公交')
})

test('时刻串只认 HH:mm，脏数据丢弃', () => {
  assert.equal(fn.normalizeDepartureTime('6:30'), '06:30')
  assert.equal(fn.normalizeDepartureTime(' 18:10 '), '18:10')
  assert.equal(fn.normalizeDepartureTime('25:00'), null)
  assert.equal(fn.normalizeDepartureTime('09:60'), null)
  assert.equal(fn.normalizeDepartureTime('稍后'), null)
})

test('上午 / 下午按 12:00 切段，升序去重', () => {
  assert.deepEqual(fn.groupDeparturesByHalfDay(['06:30', '11:50', '12:00', '18:10']), {
    am: ['06:30', '11:50'],
    pm: ['12:00', '18:10']
  })
  assert.deepEqual(fn.groupDeparturesByHalfDay(['12:00', '06:30', '06:30', 'xx', '25:00', '11:50']), {
    am: ['06:30', '11:50'],
    pm: ['12:00']
  })
  assert.deepEqual(fn.groupDeparturesByHalfDay([]), { am: [], pm: [] })
})

test('下一班只高亮一格，已过置灰，其余为未来', () => {
  const times = ['06:30', '09:50', '12:00', '18:10']
  const states = times.map(time => fn.resolveDepartureChipState(time, { next: '09:50', past: false }))
  assert.equal(states.filter(state => state === 'next').length, 1, '下一班必须唯一')
  assert.equal(states[1], 'next')
  assert.equal(fn.resolveDepartureChipState('06:30', { next: '09:50', past: true }), 'past')
  assert.equal(fn.resolveDepartureChipState('18:10', { next: '09:50', past: false }), 'future')
  assert.equal(fn.resolveDepartureChipState('06:30', { next: '', past: false }), 'future')
})

test('抽屉头走当前方向的线名与首末班', () => {
  assert.match(script, /sheetDirectionLabel = computed\(/)
  assert.match(script, /sheetTimetableSections = computed\(/)
  assert.match(script, /\{ key: 'am', label: '上午', times: sheetTimetable\.value\.am \}/)
  assert.match(script, /\{ key: 'pm', label: '下午', times: sheetTimetable\.value\.pm \}/)
  assert.match(script, /function chipStateOf\(time: string\): 'past' \| 'next' \| 'future' \{/)
  assert.match(script, /const color = lineColor\(sheetActiveGroup\.value\.name\)/)
  assert.match(script, /backgroundColor: color,/)
  assert.match(script, /color: '#ffffff',/)
  assert.match(script, /boxShadow: `0 0 0 2px color-mix\(in srgb, \$\{color\} 30%, transparent\)`/)
})

test('F5 下一班同源：底栏与抽屉头都读 sheetNextChipTime，实时 next 已过就留空', () => {
  assert.match(script, /const sheetNextChipTime = computed\(/)
  assert.match(script, /const upcoming = times\.find\(time => !isPastByClock\(time\)\) \?\? ''/)
  assert.match(script, /return live && !isPastByClock\(live\) \? live : ''/)
  assert.match(script, /return normalized < sheetNowHHmm\.value/)
  assert.match(template, /下一班 \{\{ sheetNextChipTime \|\| '—' \}\}/)
  assert.equal((template.match(/sheetNextBus/g) ?? []).length, 0, 'sheet 模板不再直接读实时 next')
})

test('F4 抽屉一打开自动滚到下一班，三态拉出可辨差', () => {
  assert.match(script, /function setChipRef\(time: string, element: unknown\): void \{/)
  assert.match(script, /function scrollNextChipIntoView\(\): void \{/)
  assert.match(script, /watch\(\[\(\) => props\.drawerOpen, \(\) => sheetNextChipTime\.value\]/)
  assert.match(template, /:ref="\(element: unknown\) => setChipRef\(time, element\)"/)
  assert.match(template, /'font-semibold text-white'/)
  assert.match(template, /'bg-zinc-100\/70 text-zinc-400 line-through decoration-zinc-300 dark:bg-zinc-800\/50 dark:text-zinc-500 dark:decoration-zinc-600'/, '已过＝灰底 + 删除线，不再用 60% 透明糊成一片')
  assert.match(template, /bg-white\/90 [^"]*dark:border-zinc-800 dark:bg-zinc-950\/90/, '抽屉自带实底，避免贴着玻璃面板读不清')
  assert.match(template, /sticky top-0 z-10 -mx-3/, '表头吸附在抽屉顶，自动滚到下一班时不会被滚走')
  assert.match(template, /'bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'/)
  assert.match(template, /下一班 \$\{sheetNextChipTime \|\| '—'\}/)
})

test('时钟 30s 刷一次，卸载清定时器', () => {
  assert.match(script, /sheetClockTimer = setInterval\(\(\) => \{/)
  assert.match(script, /\}, 30_000\)/)
  assert.match(script, /onBeforeUnmount\(\(\) => \{/)
  assert.match(script, /clearInterval\(sheetClockTimer\)/)
})
