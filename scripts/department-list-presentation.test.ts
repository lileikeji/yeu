import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  departmentListContactPreview,
  departmentListMessages,
  filterDepartmentListItems
} from '../app/utils/department-list-presentation'

const pageSource = readFileSync(resolve('app/pages/departments/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/department-list-presentation.ts'), 'utf8')

test('department list page is a thin shell over department-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/department-list-presentation['"]/)
  assert.match(pageSource, /filterDepartmentListItems/)
  assert.match(pageSource, /departmentListMessages/)
  assert.match(pageSource, /departmentListContactPreview/)
  assert.doesNotMatch(pageSource, /function filterDepartmentListItems/)
  assert.doesNotMatch(pageSource, /const filteredDepartments = computed\(\(\) => \{[\s\S]*toLocaleLowerCase\('zh-CN'\)/)
  assert.match(utilSource, /export function filterDepartmentListItems/)
  assert.match(utilSource, /export function departmentListContactPreview/)
  assert.match(utilSource, /export const departmentListMessages/)
})

test('department list messages stay student-facing', () => {
  assert.equal(departmentListMessages.serviceUnavailable, '部门资料暂时不可用，请稍后重试。')
  assert.equal(departmentListMessages.emptyMatch, '没有匹配的部门')
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
  assert.equal(departmentListContactPreview(departments[2]!), '查看官方入口')
})
