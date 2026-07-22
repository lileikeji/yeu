import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildDepartmentDetailSources,
  buildDepartmentWebsiteSourceTitle,
  departmentBodyPrefixes,
  departmentSectionLabels,
  extractDepartmentUseCases,
  extractPrefixedParagraph,
  hasDepartmentPublicContact,
  resolveDepartmentContactPreparation,
  resolveDepartmentContactSectionState,
  resolveDepartmentUsageSuggestion,
  resolveDepartmentVerificationSummary,
  resolveDepartmentVerifiedDate
} from '../app/utils/department-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/department-detail-presentation.ts'), 'utf8')

test('department detail page is a thin shell over department-detail-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/department-detail-presentation['"]/)
  assert.match(pageSource, /extractDepartmentUseCases/)
  assert.match(pageSource, /buildDepartmentDetailSources/)
  assert.match(pageSource, /resolveDepartmentVerifiedDate/)
  assert.match(pageSource, /resolveDepartmentContactPreparation/)
  assert.match(pageSource, /resolveDepartmentContactSectionState/)
  assert.match(pageSource, /departmentSectionLabels/)
  assert.doesNotMatch(pageSource, /function extractDepartmentUseCases/)
  assert.doesNotMatch(pageSource, /function extractPrefixedParagraph/)
  assert.match(utilSource, /export function extractDepartmentUseCases/)
  assert.match(utilSource, /export function buildDepartmentDetailSources/)
  assert.match(utilSource, /export const departmentSectionLabels/)
})

test('department website action keeps a comfortable mobile touch height', () => {
  assert.match(pageSource, /label="部门官网"\s+size="lg"\s+class="min-h-11"/)
})

test('department body extractors keep student-facing section markers', () => {
  assert.equal(departmentBodyPrefixes.useCases, '新生什么时候该看这里：')
  assert.equal(departmentSectionLabels.firstLook, '新生先看这几件事')
  assert.equal(departmentSectionLabels.contactPrep, '咨询前准备')
  assert.equal(
    departmentSectionLabels.emptyContact,
    '暂时没有找到电话、邮箱或服务时间，可以先打开上方部门官网。'
  )
  assert.equal(departmentSectionLabels.contactPending, '联系方式待公布')
  assert.equal(
    departmentSectionLabels.contactPendingNotice,
    '目前还没有公开的电话或邮箱。可以先打开上方部门官网，或开学后以学校和部门最新通知为准。'
  )
  assert.equal(departmentSectionLabels.contactPendingAction, '知道新的联系方式？告诉我们')
  assert.equal(hasDepartmentPublicContact({ phone: null, email: ' ' }), false)
  assert.equal(hasDepartmentPublicContact({ phone: '0595-1', email: null }), true)
  assert.equal(resolveDepartmentContactSectionState(true).kind, 'ready')
  assert.equal(resolveDepartmentContactSectionState(false).kind, 'pending')
  assert.equal(resolveDepartmentContactSectionState(false).title, '联系方式待公布')

  const body = [
    '开头说明',
    '新生什么时候该看这里：',
    '- 办校园卡',
    '- 查宿舍安排',
    '联系前先确认：先准备学生证和问题清单',
    '使用建议：优先走部门官网入口',
    '资料核对：联系方式来自学校公开页'
  ].join('\n')

  assert.deepEqual(extractDepartmentUseCases(body), ['办校园卡', '查宿舍安排'])
  assert.equal(resolveDepartmentContactPreparation(body), '先准备学生证和问题清单')
  assert.equal(resolveDepartmentUsageSuggestion(body), '优先走部门官网入口')
  assert.equal(resolveDepartmentVerificationSummary(body), '联系方式来自学校公开页')
  assert.equal(extractPrefixedParagraph(body, '不存在：'), '')
  assert.deepEqual(extractDepartmentUseCases('没有用例块'), [])
})

test('department sources and verified date prefer API then seed fallbacks', () => {
  assert.equal(buildDepartmentWebsiteSourceTitle('教务处'), '教务处官网入口')
  assert.equal(
    resolveDepartmentVerifiedDate('2026-07-10T12:00:00Z', '2026-01-01', '2025-12-01'),
    '2026-07-10'
  )
  assert.equal(resolveDepartmentVerifiedDate(null, '2026-03-05T00:00:00Z', '2025-12-01'), '2026-03-05')
  assert.equal(resolveDepartmentVerifiedDate(null, null, '2025-12-01'), '2025-12-01')

  assert.deepEqual(
    buildDepartmentDetailSources(
      [{ id: 's1', title: 'API 来源', url: 'https://example.test/api' }],
      {
        organizationsTitle: '组织机构',
        organizationsUrl: 'https://example.test/org',
        departmentName: '教务处',
        website: 'https://example.test/jw'
      }
    ),
    [{ key: 's1', title: 'API 来源', url: 'https://example.test/api' }]
  )

  assert.deepEqual(
    buildDepartmentDetailSources([], {
      organizationsTitle: '组织机构',
      organizationsUrl: 'https://example.test/org',
      departmentName: '教务处',
      website: 'https://example.test/jw'
    }),
    [
      { key: 'organizations', title: '组织机构', url: 'https://example.test/org' },
      { key: 'department-website', title: '教务处官网入口', url: 'https://example.test/jw' }
    ]
  )

  assert.deepEqual(
    buildDepartmentDetailSources(null, {
      organizationsTitle: '组织机构',
      organizationsUrl: 'https://example.test/org',
      departmentName: '教务处',
      website: null
    }),
    [{ key: 'organizations', title: '组织机构', url: 'https://example.test/org' }]
  )
})


test('department detail pending contact UI stays student-facing', () => {
  assert.match(pageSource, /contactSection\.kind === 'pending'/)
  assert.match(pageSource, /contactSection\.notice/)
  assert.match(pageSource, /contactSection\.actionLabel/)
  assert.match(pageSource, /i-lucide-phone-off/)
  assert.match(pageSource, /知道新的联系方式？告诉我们|contactSection\.actionLabel/)
  assert.match(pageSource, /departmentSectionLabels\.publicContact/)
})
