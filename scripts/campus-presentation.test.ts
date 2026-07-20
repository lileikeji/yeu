import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  campusFallbackMessages,
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

test('campus fallback message covers error, static, empty and ready states', () => {
  assert.equal(campusFallbackMessages.serviceUnavailable, '地图、学校官网和下方已有介绍仍然可以使用。')
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
