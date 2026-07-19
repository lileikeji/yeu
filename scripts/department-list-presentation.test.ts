import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  departmentListContactPreview,
  departmentListPrioritySlugs,
  departmentListMessages,
  filterDepartmentListItems,
  prioritizeDepartmentListItems
} from '../app/utils/department-list-presentation'

const pageSource = readFileSync(resolve('app/pages/departments/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/department-list-presentation.ts'), 'utf8')

test('department list page is a thin shell over department-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/department-list-presentation['"]/)
  assert.match(pageSource, /filterDepartmentListItems/)
  assert.match(pageSource, /departmentListMessages/)
  assert.match(pageSource, /departmentListContactPreview/)
  assert.match(pageSource, /prioritizeDepartmentListItems/)
  assert.match(pageSource, /directory-list-presentation/)
  assert.match(pageSource, /previewDirectoryItems/)
  assert.match(pageSource, /v-for="department in visibleDepartments"/)
  assert.doesNotMatch(pageSource, /function filterDepartmentListItems/)
  assert.doesNotMatch(pageSource, /const filteredDepartments = computed\(\(\) => \{[\s\S]*toLocaleLowerCase\('zh-CN'\)/)
  assert.match(utilSource, /export function filterDepartmentListItems/)
  assert.match(utilSource, /export function departmentListContactPreview/)
  assert.match(utilSource, /export const departmentListMessages/)
})

test('department search keeps a comfortable mobile touch height', () => {
  assert.match(pageSource, /class="mt-6 min-h-11 max-w-2xl"\s+:ui="\{ base: 'min-h-11' \}"/)
})

test('department list messages stay student-facing', () => {
  assert.equal(departmentListMessages.serviceUnavailable, '下方仍可查看学校公开的常用部门；办公地点和联系方式请以学校最新信息为准。')
  assert.equal(departmentListMessages.emptyMatch, '没有匹配的部门')
  assert.match(pageSource, /部分部门信息还没更新出来/)
  assert.match(pageSource, /label="重新试一次"/)
  assert.match(pageSource, /@click="refresh\(\)"/)
  assert.doesNotMatch(pageSource, /border-red-500|bg-red-50|text-red-800/)
})

test('department list pure helpers filter and preview contacts', () => {
  const departments = [
    { name: '教务处', summary: '学籍与选课', phone: '0595-11111111', email: null },
    { name: '学生处', summary: '奖助贷', phone: null, email: 'stu@example.com' },
    { name: '图书馆', summary: '借阅服务', phone: null, email: null }
  ]

  assert.equal(filterDepartmentListItems(departments, '').length, 3)
  assert.equal(filterDepartmentListItems(departments, '学籍').map(item => item.name).join(','), '教务处')
  assert.equal(filterDepartmentListItems(departments, 'stu@').map(item => item.name).join(','), '学生处')
  assert.equal(filterDepartmentListItems(departments, '没有这个').length, 0)
  assert.equal(departmentListContactPreview(departments[0]!), '0595-11111111')
  assert.equal(departmentListContactPreview(departments[1]!), 'stu@example.com')
  assert.equal(departmentListContactPreview(departments[2]!), '查看部门介绍')
})

test('department list puts freshman essentials before the full school catalog', () => {
  const departments = [
    { slug: 'school-of-economics', name: '经济学院' },
    { slug: 'library', name: '图书馆' },
    { slug: 'student-affairs', name: '学生事务部' },
    { slug: 'admissions-office', name: '招生办公室' },
    { slug: 'other', name: '其他部门' }
  ]
  assert.equal(departmentListPrioritySlugs[0], 'admissions-office')
  assert.deepEqual(
    prioritizeDepartmentListItems(departments).map(item => item.slug),
    ['admissions-office', 'student-affairs', 'library', 'school-of-economics', 'other']
  )
})
