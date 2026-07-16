import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiContent, ApiPlace, ApiSource } from '../shared/types/server'
import {
  adminProcedureAudienceOptions,
  adminProcedureInformationStateOptions,
  adminProcedureMethodOptions,
  adminProcedureRequiredOptions,
  adminProcedureStatusOptions,
  buildProcedureDepartmentOptions,
  buildProcedureGuideOptions,
  buildProcedurePlaceOptions,
  buildProcedureSourceOptions,
  formatAdminProcedureDate,
  getProcedureAudienceLabel,
  getProcedureInformationStateColor,
  getProcedureInformationStateLabel,
  getProcedureMethodLabel,
  getProcedurePublicationLabel,
  getProcedureSourceStatusLabel
} from '../app/utils/admin-procedure-presentation'

test('editor option constants preserve every supported value and label', () => {
  assert.deepEqual(adminProcedureAudienceOptions, [
    { label: '普通本科', value: 'undergraduate' },
    { label: '专升本', value: 'transfer' }
  ])
  assert.deepEqual(adminProcedureMethodOptions.map(item => item.value), ['online', 'offline', 'mixed'])
  assert.deepEqual(
    adminProcedureInformationStateOptions.map(item => item.value),
    ['confirmed', 'partial', 'awaiting-notice']
  )
  assert.deepEqual(adminProcedureStatusOptions.map(item => item.value), [
    'all', 'draft', 'published', 'archived'
  ])
  assert.deepEqual(adminProcedureRequiredOptions.map(item => item.value), [
    'unknown', 'required', 'optional'
  ])
})

test('audience labels use unique values instead of raw array length', () => {
  assert.equal(getProcedureAudienceLabel([]), '未设置')
  assert.equal(getProcedureAudienceLabel(['undergraduate']), '普通本科')
  assert.equal(getProcedureAudienceLabel(['transfer']), '专升本')
  assert.equal(getProcedureAudienceLabel(['undergraduate', 'transfer']), '本科、专升本')
  assert.equal(getProcedureAudienceLabel(['undergraduate', 'undergraduate']), '普通本科')
  assert.equal(getProcedureAudienceLabel(['transfer', 'transfer']), '专升本')
})

test('method, information, publication and source status labels stay centralized', () => {
  assert.equal(getProcedureMethodLabel('online'), '线上办理')
  assert.equal(getProcedureMethodLabel('offline'), '到校办理')
  assert.equal(getProcedureMethodLabel('mixed'), '线上 + 到校')
  assert.equal(getProcedureInformationStateLabel('confirmed'), '已确认')
  assert.equal(getProcedureInformationStateLabel('partial'), '部分确认')
  assert.equal(getProcedureInformationStateLabel('awaiting-notice'), '等待通知')
  assert.equal(getProcedureInformationStateColor('confirmed'), 'success')
  assert.equal(getProcedureInformationStateColor('partial'), 'warning')
  assert.equal(getProcedureInformationStateColor('awaiting-notice'), 'neutral')
  assert.equal(getProcedurePublicationLabel('draft'), '草稿')
  assert.equal(getProcedurePublicationLabel('published'), '已发布')
  assert.equal(getProcedurePublicationLabel('archived'), '已下架')
  assert.equal(getProcedureSourceStatusLabel('active'), '有效')
  assert.equal(getProcedureSourceStatusLabel('unavailable'), '不可用')
  assert.equal(getProcedureSourceStatusLabel('disputed'), '存在争议')
})

test('date presentation distinguishes missing, invalid and valid timestamps', () => {
  assert.equal(formatAdminProcedureDate(null), '未设置')
  assert.equal(formatAdminProcedureDate(''), '未设置')
  assert.equal(formatAdminProcedureDate('invalid'), '日期无效')

  const value = '2026-07-16T08:30:00.000Z'
  const expected = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value))
  assert.equal(formatAdminProcedureDate(value), expected)
})

test('department and guide options include explicit empty choices and publication status', () => {
  const items = [
    { id: 'draft-id', title: '招生办公室', status: 'draft' },
    { id: 'published-id', title: '新生指南', status: 'published' }
  ] as ApiContent[]
  assert.deepEqual(buildProcedureDepartmentOptions(items), [
    { label: '不关联负责部门', value: '' },
    { label: '招生办公室', value: 'draft-id', description: '草稿' },
    { label: '新生指南', value: 'published-id', description: '已发布' }
  ])
  assert.equal(buildProcedureGuideOptions(items)[0]?.label, '不关联指南')
})

test('place and source options preserve address, level and status context', () => {
  const places = [{
    id: 'place-id',
    name: '图书馆',
    address: '新校区',
    status: 'published'
  }, {
    id: 'no-address',
    name: '临时服务点',
    address: null,
    status: 'draft'
  }] as ApiPlace[]
  assert.deepEqual(buildProcedurePlaceOptions(places), [
    { label: '图书馆', value: 'place-id', description: '新校区 · 已发布' },
    { label: '临时服务点', value: 'no-address', description: '草稿' }
  ])
  assert.equal(buildProcedurePlaceOptions(places, true)[0]?.label, '不关联地点')

  const sources = [{
    id: 'source-id',
    title: '学校官网',
    sourceLevel: 'A',
    status: 'active'
  }] as ApiSource[]
  assert.deepEqual(buildProcedureSourceOptions(sources), [{
    label: '学校官网',
    value: 'source-id',
    description: 'A 级 · 有效'
  }])
})

test('procedure page delegates presentation rules to the pure utility', () => {
  const page = readFileSync(resolve('app/pages/admin/procedures.vue'), 'utf8')
  const presentation = readFileSync(
    resolve('app/utils/admin-procedure-presentation.ts'),
    'utf8'
  )

  assert.match(page, /from '~\/utils\/admin-procedure-presentation'/)
  assert.doesNotMatch(page, /function (publicationLabel|sourceStatusLabel|methodLabel|audienceLabel|formatDate)/)
  assert.doesNotMatch(presentation, /\$fetch|useRoute|useRouter|ref\(|reactive\(|computed\(/)
})
