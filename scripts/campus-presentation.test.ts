import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  campusFallbackMessages,
  campusFreshmanDates,
  campusFeaturedDepartmentSlugs,
  campusStats,
  resolveCampusFallbackMessage,
  selectFeaturedClubs,
  selectFeaturedDepartments
} from '../app/utils/campus-presentation'

const pageSource = readFileSync(resolve('app/pages/campus.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/campus-presentation.ts'), 'utf8')

test('campus page is a thin shell over campus-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/campus-presentation['"]/)
  assert.match(pageSource, /campusStats/)
  assert.match(pageSource, /campusFreshmanDates/)
  assert.match(pageSource, /resolveCampusFallbackMessage/)
  assert.match(pageSource, /selectFeaturedDepartments/)
  assert.match(pageSource, /selectFeaturedClubs/)
  assert.doesNotMatch(pageSource, /const campusStats = \[/)
  assert.doesNotMatch(pageSource, /校园内容服务暂时不可用/)
  assert.doesNotMatch(pageSource, /旧口径|有公开来源的学生社团条目|干部线索|已发布社团资料/)
  assert.match(utilSource, /export const campusStats/)
  assert.match(utilSource, /export function resolveCampusFallbackMessage/)
})

test('campus department website icons keep a comfortable touch size', () => {
  assert.match(pageSource, /class="grid size-11 place-items-center rounded-md text-zinc-400 hover:bg-green-50 hover:text-green-700"/)
})

test('campus stats keep student-facing overview labels', () => {
  assert.match(pageSource, /class="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-3"/)
  assert.match(
    pageSource,
    /class="mt-2 whitespace-nowrap text-lg font-bold text-zinc-950 sm:text-xl md:text-2xl"/
  )
  assert.equal(campusStats.length, 3)
  assert.equal(campusStats[0]?.label, '校园占地')
  assert.equal(campusStats[0]?.value, '2000+')
  assert.equal(campusStats[0]?.unit, '亩')
  assert.equal(campusStats[1]?.label, '全日制学生')
  assert.equal(campusStats[1]?.value, '1.3万+')
  assert.equal(campusStats[2]?.label, '学院')
  assert.equal(campusStats[2]?.value, '12')
  assert.match(campusStats[0]?.icon ?? '', /lucide-map/)
  assert.match(campusStats[1]?.icon ?? '', /graduation-cap/)
  assert.match(campusStats[2]?.icon ?? '', /school/)
})

test('campus page surfaces the 2026 freshman dates in ordinary language', () => {
  assert.equal(campusFreshmanDates.length, 4)
  assert.deepEqual(
    campusFreshmanDates.map(item => item.title),
    ['注册报到', '入学教育', '开始上课', '军训（暂定）']
  )
  assert.equal(campusFreshmanDates[0]?.date, '9 月 5—6 日')
  assert.equal(campusFreshmanDates[2]?.date, '9 月 10 日')
  assert.equal(campusFreshmanDates[3]?.date, '12 月 13—26 日')
  assert.match(campusFreshmanDates[3]?.description ?? '', /可能调整/)
  assert.equal(campusFreshmanDates[0]?.to, '/procedures/arrival')
  assert.equal(campusFreshmanDates[3]?.to, '/guides/study-library#guide-section-0')
  assert.equal(campusFreshmanDates.every(item => item.to.startsWith('/')), true)
  assert.doesNotMatch(campusFreshmanDates.map(item => item.description).join(' '), /核验|数据状态|发布状态|系统接口/)
  assert.match(pageSource, /id="freshman-dates"/)
  assert.match(pageSource, /officialSources\.academicCalendar2026Fall\.url/)
  assert.match(pageSource, />\s*学校校历\s*<UIcon/)
  assert.match(pageSource, /:to="item\.to"/)
  assert.match(pageSource, /min-h-32 p-4/)
  assert.ok(pageSource.indexOf('freshman-dates') < pageSource.indexOf('id="departments"'))
})

test('campus fallback message covers error, static, empty and ready states', () => {
  assert.equal(campusFallbackMessages.serviceUnavailable, '地图、学校官网和下方已有介绍仍然可以使用。')
  assert.equal(campusFallbackMessages.staticDepartmentFallback, '这里先列出学校官网中的常用信息，部分联系方式还在整理。')
  assert.equal(resolveCampusFallbackMessage({
    hasError: true,
    response: { items: [] },
    allowStaticDepartmentFallback: false
  }), campusFallbackMessages.serviceUnavailable)

  assert.equal(resolveCampusFallbackMessage({
    hasError: false,
    response: null,
    allowStaticDepartmentFallback: false
  }), null)

  assert.equal(resolveCampusFallbackMessage({
    hasError: false,
    response: { items: [] },
    allowStaticDepartmentFallback: true
  }), campusFallbackMessages.staticDepartmentFallback)

  assert.equal(resolveCampusFallbackMessage({
    hasError: false,
    response: { items: [] },
    allowStaticDepartmentFallback: false
  }), campusFallbackMessages.emptyCatalog)

  assert.equal(resolveCampusFallbackMessage({
    hasError: false,
    response: { items: [{ id: '1' }] },
    allowStaticDepartmentFallback: false
  }), null)

  assert.match(pageSource, /校园里的部分内容还没更新出来/)
  assert.match(pageSource, /label="重新试一次"/)
  assert.match(pageSource, /@click="refresh\(\)"/)
})

test('campus notice links use reader-facing labels', () => {
  assert.match(pageSource, /查看学校原文/)
  assert.doesNotMatch(pageSource, />查看来源</)
})

test('campus overview keeps short, useful previews and links to complete lists', () => {
  const departments = [
    { slug: 'library' },
    { slug: 'school-of-management' },
    { slug: 'student-affairs' },
    { slug: 'campus-clinic' }
  ]
  assert.deepEqual(
    selectFeaturedDepartments(departments).map(item => item.slug),
    ['student-affairs', 'campus-clinic', 'library']
  )
  assert.ok(campusFeaturedDepartmentSlugs.length <= 6)
  assert.ok(campusFeaturedDepartmentSlugs.includes('library'))
  assert.deepEqual(selectFeaturedClubs([1, 2, 3, 4], 3), [1, 2, 3])
  assert.match(pageSource, /to="\/departments"/)
  assert.match(pageSource, /to="\/clubs"/)
})

test('campus overview lets mobile visitors jump to departments and clubs', () => {
  assert.match(pageSource, /aria-label="校园概览快速入口"/)
  assert.match(pageSource, /href="#departments"/)
  assert.match(pageSource, /href="#clubs"/)
  assert.match(pageSource, /id="departments"[\s\S]*scroll-mt-20/)
  assert.match(pageSource, /id="clubs"[\s\S]*scroll-mt-20/)
  assert.match(pageSource, />找常用部门</)
  assert.match(pageSource, />看学生社团</)
})
